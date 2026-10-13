import {randomUUID} from 'node:crypto';
import {CFG} from './config.js';

let driver = null;

/**
 * Opens the configured database. `dataDir` is where the embedded engine keeps
 * its file; the main process passes Electron's userData path, tests pass a
 * temporary directory.
 */
export async function init({engine = CFG.dbEngine, dataDir = CFG.dataDir} = {}) {
  if (driver) return driver;
  if (engine === 'mysql') {
    const {connect} = await import('./drivers/mysql.js');
    driver = await connect(CFG.mysql);
  } else {
    const {connect, defaultFile} = await import('./drivers/sqlite.js');
    driver = await connect({file: CFG.dbFile || defaultFile(dataDir)});
  }
  await migrate(driver);
  return driver;
}

/**
 * Columns added after the first release. Existing databases are upgraded in
 * place on open — the alternative is losing everyone's records on an update,
 * which is never acceptable.
 */
const ADDED_COLUMNS = [
  ['users', 'service_no', "VARCHAR(64) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''"],
  ['requisitions', 'created_by_service', "VARCHAR(64) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''"],
  /*
   * The pass photograph. One per requisition, because that is what a pass
   * carries — it briefly lived on the visitor, and `migrate` below moves any
   * picture taken then across rather than leaving it on a column nothing reads.
   *
   * There is deliberately no entry for `visitors.photo`: a database that has
   * that column already has it, and adding it to a new one would create a dead
   * column for the sake of a version nobody is running.
   */
  ['requisitions', 'photo', 'MEDIUMTEXT', "TEXT NOT NULL DEFAULT ''"],
  ['requisitions', 'created_by_name', "VARCHAR(255) NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''"],
];

async function migrate(d) {
  for (const [table, column, mysqlType, sqliteType] of ADDED_COLUMNS) {
    const existing = await d.columns(table);
    if (existing.includes(column)) continue;
    const type = d.name === 'mysql' ? mysqlType : sqliteType;
    await d.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    console.log(`[db] added ${table}.${column}`);
  }
  // Only once the column is certain to exist.
  await d.ensureIndex('idx_req_service', 'requisitions', ['created_by_service']);

  /*
   * Carry a photograph taken while it lived on the visitor onto the
   * requisition, once.
   *
   * Without this, upgrading loses a picture somebody took — it would still be
   * in the database, on a column nothing reads any more, which is the worst of
   * both. Only rows that have nothing of their own are touched, so this cannot
   * overwrite a newer photograph however many times it runs.
   */
  if ((await d.columns('visitors')).includes('photo')) {
    await d.run(
      `UPDATE requisitions SET photo = COALESCE((
         SELECT v.photo FROM visitors v
          WHERE v.requisition_id = requisitions.id AND v.photo <> '' AND v.photo IS NOT NULL
          ORDER BY v.ser LIMIT 1), '')
       WHERE photo = '' OR photo IS NULL`,
    );
  }
}

/**
 * Opens a database WITHOUT touching the app's own connection — schema created
 * and migrations applied, ready to read or write. Used by the migration tool
 * to hold a source and a target open at the same time.
 */
export async function openStandalone({engine = 'sqlite', file, mysql: mysqlCfg} = {}) {
  let d;
  if (engine === 'mysql') {
    const {connect} = await import('./drivers/mysql.js');
    d = await connect({...CFG.mysql, ...(mysqlCfg ?? {})});
  } else {
    const {connect, defaultFile} = await import('./drivers/sqlite.js');
    d = await connect({file: file || defaultFile(CFG.dataDir)});
  }
  await migrate(d);
  return d;
}

/** Every table the application owns, parents before children. */
export const TABLES = ['users', 'requisitions', 'visitors', 'vehicles', 'escorts'];

const D = () => {
  if (!driver) throw new Error('Database not opened — call init() first.');
  return driver;
};

export const engineName = () => D().name;
export const describeDb = () => D().describe();

export const uid = () => randomUUID();
export const STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'issued'];

const all = (sql, p = [], c = D()) => c.all(sql, p);
const run = (sql, p = [], c = D()) => c.run(sql, p);
const one = async (sql, p = [], c = D()) => (await c.all(sql, p))[0] ?? null;

/** '' -> NULL, so a blank date never reaches a DATE column. */
const date = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
const text = v => (v === null || v === undefined ? '' : String(v));

export async function ping() {
  await all('SELECT 1 AS ok');
}

// ── users ────────────────────────────────────────────────────
export const countUsers = async () =>
  Number((await one('SELECT COUNT(*) AS n FROM users'))?.n ?? 0);

export const findUser = username =>
  one('SELECT * FROM users WHERE username = ?', [String(username).trim()]);

export async function insertUser(u) {
  await run(
    `INSERT INTO users (id, username, full_name, \`rank\`, service_no, role,
                        password_hash, salt, cost, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    [u.id, u.username, u.full_name, u.rank, u.service_no ?? '', u.role,
     u.password_hash, u.salt, u.cost],
  );
}

/** Service numbers identify a person, so no two live accounts may share one. */
export const findUserByService = service =>
  one('SELECT * FROM users WHERE service_no = ? AND service_no <> \'\'', [String(service).trim()]);

export const listUsers = () =>
  all(`SELECT id, username, full_name, \`rank\`, service_no, role, created_at
         FROM users ORDER BY created_at`);

export const findUserById = id => one('SELECT * FROM users WHERE id = ?', [id]);

export const countAdmins = async () =>
  Number((await one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"))?.n ?? 0);

export async function updatePassword(id, {password_hash, salt, cost}) {
  return (await run(
    'UPDATE users SET password_hash = ?, salt = ?, cost = ? WHERE id = ?',
    [password_hash, salt, cost, id],
  )).changes;
}

export async function updateRole(id, role) {
  return (await run('UPDATE users SET role = ? WHERE id = ?', [role, id])).changes;
}

export async function updateProfile(id, {full_name, rank, service_no}) {
  return (await run(
    'UPDATE users SET full_name = ?, `rank` = ?, service_no = ? WHERE id = ?',
    [full_name, rank, service_no ?? '', id],
  )).changes;
}

/**
 * Re-points every requisition written under a service number at the account
 * that now holds it. This is what makes a person's history survive their
 * account being deleted and recreated.
 */
export async function reclaimByService(serviceNo, userId, userName) {
  const service = String(serviceNo ?? '').trim();
  if (!service) return 0;
  return (await run(
    `UPDATE requisitions
        SET created_by = ?, created_by_name = ?
      WHERE created_by_service = ? AND created_by <> ?`,
    [userId, userName ?? '', service, userId],
  )).changes;
}

export const countRequisitionsByService = async service =>
  Number((await one(
    'SELECT COUNT(*) AS n FROM requisitions WHERE created_by_service = ?',
    [String(service ?? '').trim()],
  ))?.n ?? 0);

/**
 * How many requisitions an account created. `created_by` is a plain audit
 * column with no foreign key, so records are NEVER removed with an account —
 * this is here so the UI can say so with a real number.
 */
export const countRequisitionsBy = async userId =>
  Number((await one('SELECT COUNT(*) AS n FROM requisitions WHERE created_by = ?', [userId]))?.n ?? 0);

export async function deleteUser(id) {
  return (await run('DELETE FROM users WHERE id = ?', [id])).changes;
}

// ── filters shared by the list and the dashboard ─────────────
function whereFrom(f = {}) {
  const parts = ['1=1'];
  const params = [];
  if (f.status && f.status !== 'all') {
    parts.push('r.status = ?');
    params.push(f.status);
  }
  if (date(f.from)) {
    parts.push('r.visit_date >= ?');
    params.push(date(f.from));
  }
  if (date(f.to)) {
    parts.push('r.visit_date <= ?');
    params.push(date(f.to));
  }
  if (f.q && String(f.q).trim()) {
    // '%' and '_' are LIKE wildcards. Typing one is a literal search, not a
    // request to match everything, so escape them. '!' is the escape
    // character because a backslash means different things to the two engines.
    const like = '%' + String(f.q).trim().replace(/[!%_]/g, c => '!' + c) + '%';
    const L = 'LIKE ? ESCAPE \'!\'';
    parts.push(`(r.department ${L} OR r.purpose ${L} OR r.place_of_visit ${L}
      OR r.pass_no ${L} OR r.file_no ${L} OR r.requested_by_rank_name ${L}
      OR EXISTS (SELECT 1 FROM visitors v WHERE v.requisition_id = r.id
                 AND (v.name ${L} OR v.id_proof_no ${L})))`);
    params.push(like, like, like, like, like, like, like, like);
  }
  return {sql: parts.join(' AND '), params};
}

const ORDER = 'ORDER BY COALESCE(r.visit_date, date(r.created_at)) DESC, r.created_at DESC, r.id';

export const countRequisitions = async (f = {}) => {
  const w = whereFrom(f);
  return Number((await one(`SELECT COUNT(*) AS n FROM requisitions r WHERE ${w.sql}`, w.params))?.n ?? 0);
};

/**
 * One page of results plus the total, so the UI can show "41–60 of 317"
 * without a second round trip. `page` is 1-based and clamped to the last
 * page that actually exists, so deleting rows can never strand the user on
 * an empty page.
 */
export async function listRequisitions(f = {}) {
  const pageSize = Math.max(1, Number(f.pageSize) || CFG.recordsPageSize);
  const total = await countRequisitions(f);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(f.page) || 1), pages);
  const w = whereFrom(f);

  const rows = total === 0 ? [] : await all(
    `SELECT r.*,
            (SELECT COUNT(*) FROM visitors v WHERE v.requisition_id = r.id) AS visitor_count,
            COALESCE((SELECT v.name FROM visitors v WHERE v.requisition_id = r.id
                      ORDER BY v.ser LIMIT 1), '') AS first_visitor
       FROM requisitions r
      WHERE ${w.sql}
      ${ORDER}
      LIMIT ? OFFSET ?`,
    [...w.params, pageSize, (page - 1) * pageSize],
  );
  return {rows, total, page, pageSize, pages};
}

/** Every id matching the filter, for "act on everything, not just this page". */
export async function matchingIds(f = {}, cap = 5000) {
  const w = whereFrom(f);
  const rows = await all(
    `SELECT r.id FROM requisitions r WHERE ${w.sql} ${ORDER} LIMIT ?`,
    [...w.params, Number(cap)],
  );
  return rows.map(r => r.id);
}

export async function getFull(id) {
  const [r] = await getManyFull([id]);
  return r ?? null;
}

/** Loads any number of requisitions with their children in 4 queries, not 4×N. */
export async function getManyFull(ids) {
  if (!ids?.length) return [];
  const qs = ids.map(() => '?').join(',');
  const [reqs, visitors, vehicles, escorts] = await Promise.all([
    all(`SELECT * FROM requisitions WHERE id IN (${qs})
          ORDER BY COALESCE(visit_date, date(created_at)) DESC, created_at DESC`, ids),
    all(`SELECT * FROM visitors WHERE requisition_id IN (${qs}) ORDER BY ser`, ids),
    all(`SELECT * FROM vehicles WHERE requisition_id IN (${qs}) ORDER BY id`, ids),
    all(`SELECT * FROM escorts  WHERE requisition_id IN (${qs}) ORDER BY id`, ids),
  ]);
  const group = rows => {
    const m = new Map();
    for (const row of rows) {
      if (!m.has(row.requisition_id)) m.set(row.requisition_id, []);
      m.get(row.requisition_id).push(row);
    }
    return m;
  };
  const [gv, gc, ge] = [group(visitors), group(vehicles), group(escorts)];
  return reqs.map(r => ({
    ...r,
    visitors: gv.get(r.id) ?? [],
    vehicles: gc.get(r.id) ?? [],
    escorts: ge.get(r.id) ?? [],
  }));
}

const REQ_FIELDS = [
  'department', 'visit_date', 'time_from', 'time_to', 'purpose', 'place_of_visit',
  'file_no', 'requisition_date', 'requested_by_rank_name', 'security_remarks',
  'security_signature', 'pass_no', 'pass_issued_at', 'pass_issued_on',
  'pass_signed_by', 'status', 'created_by', 'created_by_service', 'created_by_name',
  'photo',
];
const DATE_FIELDS = new Set(['visit_date', 'requisition_date', 'pass_issued_on']);

/** Upserts a requisition and replaces all of its child rows, in one transaction. */
export async function saveFull(f) {
  const d = D();
  const id = f.id || uid();
  const values = REQ_FIELDS.map(k => (DATE_FIELDS.has(k) ? date(f[k]) : text(f[k])));

  // Timestamps are written by the database itself, so they are literals in the
  // statement rather than bound values.
  const sql =
    `INSERT INTO requisitions (id, ${REQ_FIELDS.join(',')}, created_at, updated_at)
     VALUES (${['?', ...REQ_FIELDS.map(() => '?')].join(',')}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ${d.onConflict('id', REQ_FIELDS, 'updated_at = CURRENT_TIMESTAMP')}`;

  await d.tx(async c => {
    await c.run(sql, [id, ...values]);

    for (const t of ['visitors', 'vehicles', 'escorts']) {
      await c.run(`DELETE FROM ${t} WHERE requisition_id = ?`, [id]);
    }
    let ser = 1;
    for (const v of f.visitors ?? []) {
      await c.run(
        `INSERT INTO visitors (id, requisition_id, ser, name, sex, age, nationality,
           id_proof_type, id_proof_no, address) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [uid(), id, ser++, text(v.name), text(v.sex), text(v.age), text(v.nationality),
         text(v.id_proof_type), text(v.id_proof_no), text(v.address)],
      );
    }
    for (const v of f.vehicles ?? []) {
      await c.run(
        `INSERT INTO vehicles (id, requisition_id, regn_no, vehicle_type, driver_name, cdl_no, purpose)
         VALUES (?,?,?,?,?,?,?)`,
        [uid(), id, text(v.regn_no), text(v.vehicle_type), text(v.driver_name),
         text(v.cdl_no), text(v.purpose)],
      );
    }
    for (const e of f.escorts ?? []) {
      await c.run(
        `INSERT INTO escorts (id, requisition_id, name, rank_desig, p_no, i_card_no, dept, mob_no, signed)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uid(), id, text(e.name), text(e.rank_desig), text(e.p_no), text(e.i_card_no),
         text(e.dept), text(e.mob_no), e.signed ? 1 : 0],
      );
    }
  });
  return id;
}

export async function removeRequisitions(ids) {
  if (!ids?.length) return 0;
  const qs = ids.map(() => '?').join(',');
  return (await run(`DELETE FROM requisitions WHERE id IN (${qs})`, ids)).changes;
}

export async function setStatus(ids, status) {
  if (!ids?.length) return 0;
  if (!STATUSES.includes(status)) throw new Error(`Unknown status: ${status}`);
  const qs = ids.map(() => '?').join(',');
  return (await run(
    `UPDATE requisitions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${qs})`,
    [status, ...ids],
  )).changes;
}

/**
 * Write just the pass block onto one record.
 *
 * Narrow on purpose. `saveFull` deletes and rewrites every visitor, vehicle and
 * escort row, which is far too much to do when the only thing being recorded is
 * a pass number — and it would need the whole record in hand to do it safely.
 */
export async function setPass(id, {pass_no, pass_issued_at, pass_issued_on}) {
  if (!id) return 0;
  return (await run(
    `UPDATE requisitions SET pass_no = ?, pass_issued_at = ?, pass_issued_on = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [text(pass_no), text(pass_issued_at), date(pass_issued_on), id],
  )).changes;
}

// ── dashboard aggregates ─────────────────────────────────────
export async function stats(f = {}) {
  const w = whereFrom(f);
  const p = w.params;
  const [tot, vis, veh, byStatus, byDay, topDept] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM requisitions r WHERE ${w.sql}`, p),
    one(`SELECT COUNT(*) AS n FROM visitors v JOIN requisitions r ON r.id = v.requisition_id WHERE ${w.sql}`, p),
    one(`SELECT COUNT(*) AS n FROM vehicles x JOIN requisitions r ON r.id = x.requisition_id WHERE ${w.sql}`, p),
    all(`SELECT r.status, COUNT(*) AS n FROM requisitions r WHERE ${w.sql} GROUP BY r.status`, p),
    all(`SELECT COALESCE(r.visit_date, date(r.created_at)) AS day, COUNT(*) AS n
           FROM requisitions r WHERE ${w.sql} GROUP BY day ORDER BY day DESC LIMIT 60`, p),
    all(`SELECT CASE WHEN TRIM(r.department) = '' THEN '(unspecified)' ELSE r.department END AS department,
                COUNT(*) AS n FROM requisitions r WHERE ${w.sql}
          GROUP BY department ORDER BY n DESC LIMIT 8`, p),
  ]);
  const statusRows = byStatus.map(s => ({status: s.status, n: Number(s.n)}));
  return {
    total: Number(tot?.n ?? 0),
    visitors: Number(vis?.n ?? 0),
    vehicles: Number(veh?.n ?? 0),
    pending: statusRows
      .filter(s => s.status === 'draft' || s.status === 'submitted')
      .reduce((a, b) => a + b.n, 0),
    byStatus: statusRows,
    byDay: byDay.map(d => ({day: String(d.day), n: Number(d.n)})).reverse(),
    topDepartments: topDept.map(d => ({department: d.department, n: Number(d.n)})),
  };
}

export async function closePool() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
