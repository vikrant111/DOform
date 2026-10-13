import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test, {after, before, beforeEach, describe} from 'node:test';
import * as auth from '../electron/auth.js';
import * as db from '../electron/db.js';

/** MySQL is optional: these tests must pass with nothing installed. */
async function mysqlReachable() {
  try {
    await db.init({engine: 'mysql'});
    await db.ping();
    await db.closePool();
    return true;
  } catch {
    await db.closePool().catch(() => {});
    return false;
  }
}

const ENGINES = ['sqlite', ...((await mysqlReachable()) ? ['mysql'] : [])];
console.log(`# engines under test: ${ENGINES.join(', ')}`);

const sample = createdBy => ({
  id: '', department: 'Air Engineering Dept', visit_date: '2026-10-09',
  time_from: '0930', time_to: '1730', purpose: 'Servicing, urgent',
  place_of_visit: 'Hangar 2', file_no: 'UTK/SEC/CVP/2026/114',
  requisition_date: '2026-10-07', requested_by_rank_name: 'Lt Cdr A Singh',
  security_remarks: '', security_signature: '', pass_no: 'CVP-2026-0114',
  pass_issued_at: '0920', pass_issued_on: '2026-10-09', pass_signed_by: '',
  status: 'issued', created_by: createdBy,
  visitors: [
    {name: 'Rahul Kumar', sex: 'M', age: '34', nationality: 'Indian',
     id_proof_type: 'Aadhaar', id_proof_no: '4512 7788 1203', address: 'Sunrise Engg, Port Blair'},
    {name: 'S Meena', sex: 'F', age: '29', nationality: 'Indian',
     id_proof_type: 'PAN', id_proof_no: 'ABCPM1234K', address: 'Sunrise Engg, Port Blair'},
  ],
  vehicles: [{regn_no: 'AN01 AB 1234', vehicle_type: 'Van', driver_name: 'S Das',
              cdl_no: 'AN0120190099', purpose: 'Tools'}],
  escorts: [{name: 'PO K Nair', rank_desig: 'PO (AE)', p_no: '224477',
             i_card_no: 'IC-9981', dept: 'AED', mob_no: '9876543210', signed: 1}],
});

for (const engine of ENGINES) {
  describe(`data layer — ${engine}`, () => {
    let dir;
    const wipe = async () => db.removeRequisitions(await db.matchingIds({}, 100000));
    const count = () => db.countRequisitions({});
    const listed = async f => (await db.listRequisitions(f)).rows;

    before(async () => {
      dir = mkdtempSync(join(tmpdir(), `doform-${engine}-`));
      await db.init({engine, dataDir: dir});
      await wipe();
    });

    // Every test starts from an empty table, so one failure cannot cascade
    // into the next by leaving rows behind.
    beforeEach(async () => {
      await wipe();
      for (const u of await db.listUsers()) await db.deleteUser(u.id);
      auth.clearLockouts();
    });

    after(async () => {
      if (engine === 'mysql') await wipe();
      await db.closePool();
      rmSync(dir, {recursive: true, force: true});
    });

    const uname = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    test('ping', async () => {
      await db.ping();
      assert.equal(db.engineName(), engine);
    });

    test('sign-up, sign-in, and wrong password', async () => {
      const u = uname();
      const up = await auth.signup({username: u, password: 'Utkrosh2026', fullName: 'T User', rank: 'Lt'});
      assert.ok(up.user, up.error);
      assert.equal((await auth.login(u, 'Utkrosh2027')).user, undefined);
      assert.equal((await auth.login(u, 'Utkrosh2026')).user.username, u);
      assert.ok((await auth.signup({username: u, password: 'Utkrosh2026', fullName: 'X'})).error,
        'duplicate username must be refused');
    });

    test('usernames are matched case-insensitively', async () => {
      const u = uname();
      await auth.signup({username: u, password: 'Utkrosh2026', fullName: 'T'});
      assert.ok((await auth.signup({username: u.toUpperCase(), password: 'Utkrosh2026', fullName: 'T'})).error);
      assert.ok((await auth.login(u.toUpperCase(), 'Utkrosh2026')).user);
    });

    test('save, read back, and replace children without duplicating', async () => {
      const id = await db.saveFull(sample('u1'));
      const full = await db.getFull(id);
      assert.equal(full.visitors.length, 2);
      assert.equal(full.visitors[0].ser, 1);
      assert.equal(full.visit_date, '2026-10-09', 'dates come back as plain strings');
      assert.equal(full.vehicles.length, 1);
      assert.equal(Number(full.escorts[0].signed), 1);

      await db.saveFull({...full, visitors: full.visitors.slice(0, 1)});
      assert.equal((await db.getFull(id)).visitors.length, 1);
      await db.removeRequisitions([id]);
    });

    test('blank dates are stored as NULL, not rejected', async () => {
      const id = await db.saveFull({
        ...sample('u1'), visit_date: '', requisition_date: '', pass_issued_on: '',
        vehicles: [], escorts: [],
      });
      const r = await db.getFull(id);
      assert.equal(r.visit_date, null);
      await db.removeRequisitions([id]);
    });

    test('search, status filter and date range', async () => {
      const id = await db.saveFull(sample('u1'));
      assert.equal((await listed({q: 'ABCPM1234K'})).length, 1, 'by ID proof');
      assert.equal((await listed({q: 'Rahul'})).length, 1, 'by visitor name');
      assert.equal((await listed({q: 'rahul'})).length, 1, 'search is case-insensitive');
      assert.equal((await listed({q: 'Air Engineering'})).length, 1, 'by department');
      assert.equal((await listed({q: 'UTK/SEC'})).length, 1, 'by file no.');
      assert.equal((await listed({q: 'CVP-2026-0114'})).length, 1, 'by pass no.');
      assert.equal((await listed({q: 'Servicing'})).length, 1, 'by purpose');
      assert.equal((await listed({q: 'zzz-nothing'})).length, 0);
      assert.equal((await listed({q: "' OR 1=1 --"})).length, 0, 'injection is just text');
      assert.equal((await listed({q: '%'})).length, 0, 'a bare wildcard is literal, not match-all');
      assert.equal((await listed({status: 'issued'})).length, 1);
      assert.equal((await listed({status: 'draft'})).length, 0);
      assert.equal((await listed({from: '2026-10-09', to: '2026-10-09'})).length, 1);
      assert.equal((await listed({from: '2026-10-10'})).length, 0, 'range excludes earlier');
      assert.equal((await listed({to: '2026-10-08'})).length, 0, 'range excludes later');
      assert.equal((await listed({from: '2027-01-01'})).length, 0);
      assert.equal((await listed({q: 'Rahul', status: 'draft'})).length, 0, 'filters combine');

      const [row] = await listed({q: 'Rahul'});
      assert.equal(Number(row.visitor_count), 2);
      assert.equal(row.first_visitor, 'Rahul Kumar');
      await db.removeRequisitions([id]);
    });

    test('stats aggregate correctly', async () => {
      const a = await db.saveFull(sample('u1'));
      const b = await db.saveFull({...sample('u1'), status: 'draft', department: 'Logistics'});
      const s = await db.stats({});
      assert.equal(s.total, 2);
      assert.equal(s.visitors, 4);
      assert.equal(s.vehicles, 2);
      assert.equal(s.pending, 1, 'only the draft awaits action');
      assert.equal(s.topDepartments.length, 2);
      assert.ok(s.byDay.length >= 1);
      await db.removeRequisitions([a, b]);
    });

    test('status changes, and an unknown status is refused', async () => {
      const id = await db.saveFull(sample('u1'));
      assert.equal(await db.setStatus([id], 'approved'), 1);
      assert.equal((await db.getFull(id)).status, 'approved');
      await assert.rejects(() => db.setStatus([id], 'bogus'), /Unknown status/);
      await db.removeRequisitions([id]);
    });

    test('the pass photograph round-trips, and an absent one stays empty', async () => {
      /* Big enough to pass a MySQL TEXT column, which tops out at 64 KB — the
         reason that column is MEDIUMTEXT. A real photo is around 30 KB. */
      const big = 'data:image/jpeg;base64,' + 'A'.repeat(80 * 1024);
      const rec = {...sample('u1'), photo: big};

      const id = await db.saveFull(rec);
      const back = await db.getFull(id);
      assert.equal(back.photo, big, 'stored whole, not truncated');
      /* One per requisition — a visitor does not carry one. (A database
         upgraded from the version that put it there still has the old column;
         what matters is that nothing is written to it.) */
      assert.ok(!back.visitors[0].photo, 'a visitor carries no photograph');

      /* Saving again must not lose it, nor resurrect it once removed. */
      rec.id = id;
      await db.saveFull(rec);
      assert.equal((await db.getFull(id)).photo, big, 'a second save keeps it');
      await db.saveFull({...rec, photo: ''});
      assert.equal((await db.getFull(id)).photo ?? '', '', 'removing it sticks');

      await db.removeRequisitions([id]);
    });

    test('the pass block is written on its own, without touching the children', async () => {
      const id = await db.saveFull(sample('u1'));
      const before = await db.getFull(id);

      const pass = {pass_no: 'CVP/UTK/12345A/13102026/210817', pass_issued_at: '2108', pass_issued_on: '2026-10-13'};
      assert.equal(await db.setPass(id, pass), 1);

      const after = await db.getFull(id);
      assert.equal(after.pass_no, pass.pass_no);
      assert.equal(after.pass_issued_at, pass.pass_issued_at);
      assert.equal(String(after.pass_issued_on).slice(0, 10), pass.pass_issued_on);

      /*
       * The reason this is not `saveFull`: that one deletes and rewrites every
       * visitor, vehicle and escort row. Recording a pass number must not be
       * able to lose a visitor.
       */
      assert.equal(after.visitors.length, before.visitors.length, 'visitors survived');
      assert.equal(after.vehicles.length, before.vehicles.length, 'vehicles survived');
      assert.equal(after.escorts.length, before.escorts.length, 'escorts survived');
      assert.equal(after.purpose, before.purpose, 'the rest of the record is untouched');

      assert.equal(await db.setPass('', pass), 0, 'no id writes nothing');
      await db.removeRequisitions([id]);
    });

    test('delete cascades to visitors, vehicles and escorts', async () => {
      const id = await db.saveFull(sample('u1'));
      assert.equal(await db.removeRequisitions([id]), 1);
      assert.equal(await db.getFull(id), null);
      assert.equal((await listed({q: 'Rahul'})).length, 0, 'children must be gone');
    });

    test('a rolled-back save leaves nothing behind', async () => {
      const before = await count();
      await assert.rejects(() =>
        db.saveFull({...sample('u1'), visitors: [{name: 'X', get id_proof_no() { throw new Error('boom'); }}]}));
      assert.equal(await count(), before, 'transaction must roll back');
    });

    test('pagination splits results and reports the true total', async () => {
      const ids = [];
      for (let i = 0; i < 7; i++) {
        ids.push(await db.saveFull({...sample('u1'), file_no: `F-${i}`,
          visit_date: `2026-09-${String(10 + i).padStart(2, '0')}`}));
      }
      const p1 = await db.listRequisitions({pageSize: 3, page: 1});
      assert.equal(p1.total, 7);
      assert.equal(p1.pages, 3);
      assert.equal(p1.rows.length, 3);

      const p3 = await db.listRequisitions({pageSize: 3, page: 3});
      assert.equal(p3.rows.length, 1, 'last page holds the remainder');

      // No row may appear on two pages, and together they must cover everything.
      const seen = [...p1.rows, ...(await db.listRequisitions({pageSize: 3, page: 2})).rows, ...p3.rows]
        .map(r => r.id);
      assert.equal(new Set(seen).size, 7, 'pages must not overlap or skip rows');

      const beyond = await db.listRequisitions({pageSize: 3, page: 99});
      assert.equal(beyond.page, 3, 'a page past the end clamps to the last real page');
      assert.ok(beyond.rows.length > 0, 'and is never blank');

      const filtered = await db.listRequisitions({pageSize: 3, q: 'F-2'});
      assert.equal(filtered.total, 1, 'the total respects the filter, not the page');

      await db.removeRequisitions(ids);
      const emptyPage = await db.listRequisitions({pageSize: 3, page: 1});
      assert.equal(emptyPage.total, 0);
      assert.equal(emptyPage.pages, 1);
      assert.deepEqual(emptyPage.rows, []);
    });

    test('matchingIds returns every match, not just one page', async () => {
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push(await db.saveFull({...sample('u1'), file_no: `M-${i}`}));
      assert.equal((await db.matchingIds({})).length, 5);
      assert.equal((await db.matchingIds({q: 'M-3'})).length, 1);
      assert.equal((await db.matchingIds({}, 2)).length, 2, 'the cap is honoured');
      assert.deepEqual(await db.matchingIds({q: 'nothing-here'}), []);
      await db.removeRequisitions(ids);
    });

    test('an administrator can create an account for someone else', async () => {
      const u = uname();
      const res = await auth.createAccount({username: u, password: 'Utkrosh2026',
        fullName: 'New Person', rank: 'LS', role: 'operator'});
      assert.ok(res.user, res.error);
      assert.equal(res.user.role, 'operator');
      assert.ok((await auth.login(u, 'Utkrosh2026')).user, 'the new account can sign in');
      assert.ok((await auth.createAccount({username: u, password: 'Utkrosh2026',
        fullName: 'X'})).error, 'duplicates are refused');
      assert.ok((await auth.createAccount({username: uname(), password: 'short',
        fullName: 'X'})).error, 'the password policy still applies');
    });

    test('an administrator can reset a forgotten password', async () => {
      const u = uname();
      const {user} = await auth.createAccount({username: u, password: 'Utkrosh2026', fullName: 'P'});
      const res = await auth.resetPassword(user.id, 'Replaced2026');
      assert.ok(!res.error, res.error);
      assert.ok((await auth.login(u, 'Utkrosh2026')).error, 'the old password stops working');
      assert.ok((await auth.login(u, 'Replaced2026')).user, 'the new one works');
      assert.ok((await auth.resetPassword(user.id, 'weak')).error, 'policy applies to resets');
      assert.ok((await auth.resetPassword('no-such-id', 'Replaced2026')).error);
    });

    test('a reset also lifts a lockout', async () => {
      const u = uname();
      const {user} = await auth.createAccount({username: u, password: 'Utkrosh2026', fullName: 'P'});
      for (let i = 0; i < 6; i++) await auth.login(u, 'Wrong1234');
      assert.match((await auth.login(u, 'Utkrosh2026')).error ?? '', /Too many failed attempts/);
      await auth.resetPassword(user.id, 'Replaced2026');
      assert.ok((await auth.login(u, 'Replaced2026')).user, 'signing in works again straight away');
    });

    test('a user can change their own password, with the current one', async () => {
      const u = uname();
      const {user} = await auth.createAccount({username: u, password: 'Utkrosh2026', fullName: 'P'});
      assert.match((await auth.changeOwnPassword(user.id, 'WrongOne1', 'Replaced2026')).error ?? '',
        /current password is not correct/);
      assert.match((await auth.changeOwnPassword(user.id, 'Utkrosh2026', 'Utkrosh2026')).error ?? '',
        /must be different/);
      assert.ok((await auth.changeOwnPassword(user.id, 'Utkrosh2026', 'short')).error,
        'the policy applies');
      assert.ok(!(await auth.changeOwnPassword(user.id, 'Utkrosh2026', 'Replaced2026')).error);
      assert.ok((await auth.login(u, 'Replaced2026')).user);
    });

    test('roles can be changed, but never below one administrator', async () => {
      const admin = uname();
      const {user: a} = await auth.createAccount({username: admin, password: 'Utkrosh2026',
        fullName: 'A', role: 'admin'});
      const op = uname();
      const {user: o} = await auth.createAccount({username: op, password: 'Utkrosh2026', fullName: 'O'});

      assert.equal((await auth.setRole(o.id, 'admin')).user.role, 'admin');
      assert.equal((await auth.setRole(o.id, 'operator')).user.role, 'operator');

      // Demote every other admin, then the last one must be refused.
      for (const other of (await db.listUsers()).filter(x => x.role === 'admin' && x.id !== a.id)) {
        await auth.setRole(other.id, 'operator');
      }
      assert.match((await auth.setRole(a.id, 'operator')).error ?? '', /only administrator/);
      assert.match((await auth.removeAccount(a.id)).error ?? '', /only administrator/);
    });

    test('removing an account does NOT remove the requisitions it created', async () => {
      const u = uname();
      const {user} = await auth.createAccount({username: u, password: 'Utkrosh2026',
        fullName: 'Leaver', role: 'admin'});

      const a = await db.saveFull({...sample(user.id), file_no: 'KEEP-1'});
      const b = await db.saveFull({...sample(user.id), file_no: 'KEEP-2'});
      assert.equal(await db.countRequisitionsBy(user.id), 2);

      // Another admin must exist, or removal is refused by the last-admin rule.
      const keeper = uname();
      await auth.createAccount({username: keeper, password: 'Utkrosh2026',
        fullName: 'K', role: 'admin'});

      assert.ok(!(await auth.removeAccount(user.id)).error);
      assert.equal(await db.findUserById(user.id), null, 'the sign-in account is gone');

      // The records survive, still readable, still with their children.
      assert.equal(await db.countRequisitions({}), 2, 'both requisitions remain');
      const kept = await db.getFull(a);
      assert.ok(kept, 'the record is still there');
      assert.equal(kept.visitors.length, 2, 'and still has its visitors');
      assert.equal(kept.created_by, user.id, 'the audit id is kept as written');
      assert.equal((await listed({q: 'KEEP-2'})).length, 1, 'and is still searchable');
      await db.removeRequisitions([a, b]);
    });

    test('records are shared, not owned — everyone sees the same list', async () => {
      const one = uname();
      const two = uname();
      const {user: u1} = await auth.createAccount({username: one, password: 'Utkrosh2026', fullName: '1'});
      const {user: u2} = await auth.createAccount({username: two, password: 'Utkrosh2026', fullName: '2'});
      const a = await db.saveFull({...sample(u1.id), file_no: 'MINE'});
      const b = await db.saveFull({...sample(u2.id), file_no: 'YOURS'});

      // Listing is not filtered by author; both are visible to anyone.
      assert.equal((await db.listRequisitions({})).total, 2);
      assert.equal(await db.countRequisitionsBy(u1.id), 1);
      assert.equal(await db.countRequisitionsBy(u2.id), 1);
      await db.removeRequisitions([a, b]);
    });

    test('a service number must be well formed and unique among accounts', async () => {
      const a = uname();
      assert.ok((await auth.createAccount({username: a, password: 'Utkrosh2026',
        fullName: 'A', serviceNo: 'no spaces here'})).error, 'malformed is refused');
      assert.ok(!(await auth.createAccount({username: a, password: 'Utkrosh2026',
        fullName: 'A', serviceNo: '224477'})).error);
      const dup = await auth.createAccount({username: uname(), password: 'Utkrosh2026',
        fullName: 'B', serviceNo: '224477'});
      assert.match(dup.error ?? '', /already belongs to/, 'two live accounts cannot share one');
      assert.ok(!(await auth.createAccount({username: uname(), password: 'Utkrosh2026',
        fullName: 'C'})).error, 'it stays optional');
    });

    test('a requisition remembers the service number that wrote it', async () => {
      const id = await db.saveFull({
        ...sample('u1'), created_by_service: '224477', created_by_name: 'Rahul Kumar',
      });
      const r = await db.getFull(id);
      assert.equal(r.created_by_service, '224477');
      assert.equal(r.created_by_name, 'Rahul Kumar');
      assert.equal(await db.countRequisitionsByService('224477'), 1);
    });

    test('a NEW account reclaims the records of the SAME service number', async () => {
      // Someone writes records, then their account is removed entirely.
      const gone = uname();
      const {user: before} = await auth.createAccount({username: gone, password: 'Utkrosh2026',
        fullName: 'Posted Out', serviceNo: '224477', role: 'admin'});
      const ids = [];
      for (let i = 0; i < 3; i++) {
        ids.push(await db.saveFull({...sample(before.id), file_no: `SVC-${i}`,
          created_by_service: '224477', created_by_name: 'Posted Out'}));
      }
      // Another admin so the last-admin rule allows removal.
      await auth.createAccount({username: uname(), password: 'Utkrosh2026',
        fullName: 'Keeper', role: 'admin'});
      assert.ok(!(await auth.removeAccount(before.id)).error);
      assert.equal(await db.countRequisitions({}), 3, 'records are untouched by the removal');

      // They come back with a brand-new account and the same service number.
      const res = await auth.createAccount({username: uname(), password: 'Utkrosh2026',
        fullName: 'Posted Back', serviceNo: '224477', role: 'operator'});
      assert.equal(res.reclaimed, 3, 'all three are reconnected');

      const r = await db.getFull(ids[0]);
      assert.equal(r.created_by, res.user.id, 'now owned by the new account');
      assert.equal(r.created_by_name, 'Posted Back', 'and shows the current name');
      assert.equal(r.created_by_service, '224477', 'the service number is unchanged');
      assert.equal(await db.countRequisitionsBy(res.user.id), 3);
    });

    test('adding a service number later also reclaims', async () => {
      const u = uname();
      const {user} = await auth.createAccount({username: u, password: 'Utkrosh2026', fullName: 'Late'});
      assert.equal(user.serviceNo, '');
      const id = await db.saveFull({...sample('someone-else'),
        created_by_service: '998877', created_by_name: 'Old Name'});

      const res = await auth.updateAccount(user.id, {fullName: 'Late', rank: '', serviceNo: '998877'});
      assert.equal(res.reclaimed, 1);
      assert.equal((await db.getFull(id)).created_by, user.id);
    });

    test('reclaiming never touches records of a different service number', async () => {
      const mine = await db.saveFull({...sample('x'), file_no: 'MINE',
        created_by_service: '111111', created_by_name: 'Me'});
      const theirs = await db.saveFull({...sample('y'), file_no: 'THEIRS',
        created_by_service: '222222', created_by_name: 'Them'});
      const {user} = await auth.createAccount({username: uname(), password: 'Utkrosh2026',
        fullName: 'Me', serviceNo: '111111'});

      assert.equal((await db.getFull(mine)).created_by, user.id);
      assert.equal((await db.getFull(theirs)).created_by, 'y', 'untouched');
      assert.equal((await db.getFull(theirs)).created_by_name, 'Them');
    });

    test('records with no service number are never swept up by a reclaim', async () => {
      const orphan = await db.saveFull({...sample('z'), file_no: 'NO-SERVICE'});
      assert.equal((await db.getFull(orphan)).created_by_service, '');
      await auth.createAccount({username: uname(), password: 'Utkrosh2026',
        fullName: 'Someone', serviceNo: '333333'});
      assert.equal((await db.getFull(orphan)).created_by, 'z', 'still as written');
      assert.equal(await db.countRequisitionsByService(''), 1,
        'a blank service number matches only blank ones');
    });

    test('empty id lists are no-ops', async () => {
      assert.equal(await db.removeRequisitions([]), 0);
      assert.equal(await db.setStatus([], 'issued'), 0);
      assert.deepEqual(await db.getManyFull([]), []);
    });
  });
}
