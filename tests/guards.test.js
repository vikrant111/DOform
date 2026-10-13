import assert from 'node:assert/strict';
import test, {describe} from 'node:test';
import * as G from '../electron/guards.js';

const throws = (fn, re) => assert.throws(fn, e => e instanceof G.BadInput && re.test(e.message),
  `expected a BadInput matching ${re}`);

describe('text', () => {
  test('trims, and treats missing as empty', () => {
    assert.equal(G.str('  hi  ', {field: 'X'}), 'hi');
    assert.equal(G.str(undefined, {field: 'X'}), '');
    assert.equal(G.str(null, {field: 'X'}), '');
  });

  test('rejects non-text and over-long values', () => {
    throws(() => G.str({}, {field: 'Name'}), /Name must be text/);
    throws(() => G.str([], {field: 'Name'}), /Name must be text/);
    throws(() => G.str('x'.repeat(256), {field: 'Name'}), /256|255 characters or fewer/);
  });

  test('required means non-blank, not merely present', () => {
    throws(() => G.str('   ', {field: 'Purpose', required: true}), /Purpose is required/);
  });

  test('numbers are accepted as text, so a numeric field still works', () => {
    assert.equal(G.str(34, {field: 'Age'}), '34');
  });
});

describe('dates', () => {
  test('blank is allowed', () => {
    assert.equal(G.dateStr('', {field: 'D'}), '');
  });

  test('only real calendar dates pass', () => {
    assert.equal(G.dateStr('2026-10-09', {field: 'D'}), '2026-10-09');
    throws(() => G.dateStr('09/10/2026', {field: 'D'}), /must be a date/);
    throws(() => G.dateStr('2026-13-01', {field: 'D'}), /not a real date/);
    throws(() => G.dateStr('2026-02-30', {field: 'D'}), /not a real date/);
    throws(() => G.dateStr('1066-01-01', {field: 'D'}), /sensible range/);
  });

  test('leap days are judged correctly', () => {
    assert.equal(G.dateStr('2028-02-29', {field: 'D'}), '2028-02-29');
    throws(() => G.dateStr('2027-02-29', {field: 'D'}), /not a real date/);
  });
});

describe('times', () => {
  test('both 0930 and 09:30 are accepted', () => {
    assert.equal(G.timeStr('0930', {field: 'T'}), '0930');
    assert.equal(G.timeStr('09:30', {field: 'T'}), '09:30');
    assert.equal(G.timeStr('', {field: 'T'}), '');
  });

  test('impossible clock values are refused', () => {
    throws(() => G.timeStr('2560', {field: 'T'}), /24-hour time/);
    throws(() => G.timeStr('99:99', {field: 'T'}), /24-hour time/);
    throws(() => G.timeStr('2400', {field: 'T'}), /24-hour time/);
    throws(() => G.timeStr('1260', {field: 'T'}), /24-hour time/);
    throws(() => G.timeStr('noon', {field: 'T'}), /24-hour time/);
    // Anything longer is caught by the length ceiling before the pattern.
    throws(() => G.timeStr('half past nine', {field: 'T'}), /characters or fewer/);
  });
});

describe('id lists', () => {
  test('a clean list passes through', () => {
    assert.deepEqual(G.idList(['a', 'b']), ['a', 'b']);
    assert.deepEqual(G.idList([]), []);
  });

  test('non-lists, bad entries, duplicates and oversize are refused', () => {
    throws(() => G.idList('a'), /must be a list/);
    throws(() => G.idList([1, 2]), /invalid record id/);
    throws(() => G.idList(['', 'b']), /invalid record id/);
    throws(() => G.idList(['x'.repeat(65)]), /invalid record id/);
    throws(() => G.idList(['a', 'a']), /duplicates/);
    throws(() => G.idList(Array.from({length: G.LIMITS.ids + 1}, (_, i) => `id${i}`)), /too large/);
  });
});

describe('filters', () => {
  test('missing or junk input falls back to safe defaults', () => {
    const f = G.filters(undefined, {defaultPageSize: 25});
    assert.deepEqual(f, {q: '', status: 'all', from: '', to: '', page: 1, pageSize: 25});
    assert.equal(G.filters('nonsense').status, 'all');
  });

  test('page and page size are clamped, never trusted', () => {
    assert.equal(G.filters({page: 0}).page, 1);
    assert.equal(G.filters({page: -5}).page, 1);
    assert.equal(G.filters({pageSize: 99999}).pageSize, G.LIMITS.pageSize);
    assert.equal(G.filters({pageSize: 0}).pageSize, 1);
    throws(() => G.filters({page: 1.5}), /whole number/);
  });

  test('an unknown status is refused rather than silently ignored', () => {
    throws(() => G.filters({status: 'deleted'}), /Status must be one of/);
    assert.equal(G.filters({status: 'issued'}).status, 'issued');
  });

  test('a backwards date range is caught', () => {
    throws(() => G.filters({from: '2026-10-09', to: '2026-10-01'}), /must not be after/);
    assert.ok(G.filters({from: '2026-10-01', to: '2026-10-09'}));
  });

  test('an over-long search term is refused', () => {
    throws(() => G.filters({q: 'x'.repeat(200)}), /characters or fewer/);
  });
});

describe('requisition', () => {
  const base = {
    department: 'AED', visit_date: '2026-10-09', purpose: 'Servicing',
    time_from: '0930', time_to: '1730',
    visitors: [{name: 'R Kumar', id_proof_no: 'X1'}],
  };
  const opts = {maxVisitors: 10, maxVehicles: 5, maxEscorts: 5, isAdmin: false};

  test('a valid requisition is normalised', () => {
    const r = G.requisition(base, opts);
    assert.equal(r.department, 'AED');
    assert.equal(r.visitors.length, 1);
    assert.equal(r.status, 'draft', 'defaults when not supplied');
    assert.deepEqual(r.vehicles, []);
  });

  test('required fields are enforced here too, not only in the form', () => {
    throws(() => G.requisition({...base, department: ''}, opts), /Department/);
    throws(() => G.requisition({...base, purpose: '  '}, opts), /Purpose is required/);
    throws(() => G.requisition({...base, visit_date: ''}, opts), /Date of visit is required/);
    throws(() => G.requisition(null, opts), /Requisition data is missing/);
  });

  test('visitor rules', () => {
    throws(() => G.requisition({...base, visitors: []}, opts), /At least one visitor/);
    throws(() => G.requisition({...base, visitors: [{name: '  ', id_proof_no: 'X'}]}, opts),
      /At least one visitor/);
    throws(() => G.requisition({...base, visitors: [{name: 'A', id_proof_no: ''}]}, opts),
      /ID proof number is required/);
    throws(() => G.requisition({...base, visitors: 'lots'}, opts), /must be a list/);
  });

  test('row counts are capped at the configured maximum', () => {
    const many = Array.from({length: 11}, () => ({name: 'A', id_proof_no: 'X'}));
    throws(() => G.requisition({...base, visitors: many}, opts), /At most 10 visitors/);
    throws(() => G.requisition({...base, vehicles: Array(6).fill({})}, opts), /At most 5 vehicles/);
    throws(() => G.requisition({...base, escorts: Array(6).fill({})}, opts), /At most 5 escorts/);
  });

  test('the visit window must run forwards', () => {
    throws(() => G.requisition({...base, time_from: '1730', time_to: '0930'}, opts), /later than/);
    throws(() => G.requisition({...base, time_from: '0930', time_to: '0930'}, opts), /later than/);
  });

  test('a non-admin cannot write the Security Office block, whatever it sends', () => {
    const sneaky = {...base, pass_no: 'FORGED-1', security_remarks: 'approved by me',
                    pass_signed_by: 'Duty Chief'};
    const asOperator = G.requisition(sneaky, opts);
    assert.equal(asOperator.pass_no, '');
    assert.equal(asOperator.security_remarks, '');
    assert.equal(asOperator.pass_signed_by, '');

    const asAdmin = G.requisition(sneaky, {...opts, isAdmin: true});
    assert.equal(asAdmin.pass_no, 'FORGED-1');
    assert.equal(asAdmin.security_remarks, 'approved by me');
  });

  test('unknown fields are dropped rather than passed to the database', () => {
    const r = G.requisition({...base, id: "'; DROP TABLE users; --", evil: 1}, opts);
    assert.equal(r.evil, undefined);
    assert.equal(typeof r.id, 'string');
  });
});

describe('credentials', () => {
  test('username and password are required', () => {
    throws(() => G.credentials({}), /Username is required/);
    throws(() => G.credentials({username: 'bob'}), /Password is required/);
    assert.equal(G.credentials({username: ' bob ', password: 'x'}).username, 'bob');
  });

  test('absurdly long values are refused before hashing them', () => {
    throws(() => G.credentials({username: 'u'.repeat(40), password: 'p'}), /characters or fewer/);
    throws(() => G.credentials({username: 'u', password: 'p'.repeat(300)}), /characters or fewer/);
  });
});

describe('oneOf', () => {
  test('guards the print mode and status values', () => {
    assert.equal(G.oneOf('form', G.MODES, {field: 'Mode'}), 'form');
    throws(() => G.oneOf('../../etc/passwd', G.MODES, {field: 'Mode'}), /Mode must be one of/);
    throws(() => G.oneOf('', G.STATUSES, {field: 'Status'}), /Status must be one of/);
  });
});
