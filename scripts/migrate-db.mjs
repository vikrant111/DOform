#!/usr/bin/env node
/**
 * Copies everything from one database into another, so the storage can be
 * changed without losing a record.
 *
 *   npm run migrate-db -- --from sqlite --to mysql
 *   npm run migrate-db -- --from mysql  --to sqlite --to-file ./encrypted.db
 *   npm run migrate-db -- --from sqlite --from-file ./old.db --to sqlite --to-file ./new.db
 *
 * The source is only ever read. The target must be empty unless --replace is
 * given. Row counts are compared afterwards and a mismatch is an error.
 */
import {homedir} from 'node:os';
import {join} from 'node:path';
import {TABLES, openStandalone} from '../electron/db.js';

const argv = process.argv.slice(2);
const flag = name => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};
const has = name => argv.includes(`--${name}`);

const USER_DATA = {
  darwin: join(homedir(), 'Library', 'Application Support', 'CVP Requisition'),
  win32: join(process.env.APPDATA ?? homedir(), 'CVP Requisition'),
}[process.platform] ?? join(homedir(), '.config', 'CVP Requisition');

const spec = side => {
  const engine = (flag(side) ?? 'sqlite').toLowerCase();
  if (engine !== 'sqlite' && engine !== 'mysql') {
    console.error(`--${side} must be "sqlite" or "mysql".`);
    process.exit(1);
  }
  const file = flag(`${side}-file`) ?? join(USER_DATA, 'doform.db');
  return {engine, file: engine === 'sqlite' ? file : undefined};
};

const from = spec('from');
const to = spec('to');

if (from.engine === to.engine && (from.file ?? '') === (to.file ?? '')) {
  console.error('Source and target are the same database — nothing to do.');
  process.exit(1);
}

const BATCH = 500;

const count = async (d, table) =>
  Number((await d.all(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n ?? 0);

const describe = s => (s.engine === 'mysql' ? 'mysql' : `sqlite ${s.file}`);

console.log(`From : ${describe(from)}`);
console.log(`To   : ${describe(to)}\n`);

const src = await openStandalone(from);
const dst = await openStandalone(to);

try {
  const before = {};
  for (const t of TABLES) before[t] = await count(src, t);
  console.log('Source holds:', TABLES.map(t => `${t}=${before[t]}`).join('  '));

  const existing = {};
  let targetTotal = 0;
  for (const t of TABLES) {
    existing[t] = await count(dst, t);
    targetTotal += existing[t];
  }

  if (targetTotal > 0 && !has('replace')) {
    console.error(`\nThe target already holds ${targetTotal} row(s): ` +
      TABLES.map(t => `${t}=${existing[t]}`).join('  '));
    console.error('Refusing to write into it. Re-run with --replace to empty it first.');
    process.exit(1);
  }

  if (targetTotal > 0) {
    console.log('\nEmptying the target (--replace)…');
    // Children first: requisitions cascade, but users must go too.
    for (const t of [...TABLES].reverse()) await dst.run(`DELETE FROM ${t}`);
  }

  console.log('\nCopying…');
  for (const table of TABLES) {
    const columns = (await src.columns(table))
      .filter(c => (dst.columns ? true : true));
    const targetColumns = new Set(await dst.columns(table));
    const cols = columns.filter(c => targetColumns.has(c));
    const skipped = columns.filter(c => !targetColumns.has(c));
    if (skipped.length) console.log(`  (${table}: ignoring unknown column(s) ${skipped.join(', ')})`);

    let copied = 0;
    for (let offset = 0; ; offset += BATCH) {
      const rows = await src.all(
        `SELECT ${cols.map(c => `\`${c}\``).join(',')} FROM ${table} LIMIT ? OFFSET ?`,
        [BATCH, offset]);
      if (!rows.length) break;
      await dst.tx(async c => {
        for (const row of rows) {
          await c.run(
            `INSERT INTO ${table} (${cols.map(x => `\`${x}\``).join(',')})
             VALUES (${cols.map(() => '?').join(',')})`,
            cols.map(x => row[x] ?? null),
          );
        }
      });
      copied += rows.length;
      process.stdout.write(`  ${table}: ${copied}/${before[table]}\r`);
    }
    console.log(`  ${table}: ${copied}/${before[table]} ✓      `);
  }

  console.log('\nVerifying…');
  let bad = 0;
  for (const t of TABLES) {
    const after = await count(dst, t);
    const ok = after === before[t];
    if (!ok) bad++;
    console.log(`  ${t.padEnd(14)} ${String(before[t]).padStart(6)} → ${String(after).padStart(6)}  ${ok ? 'ok' : 'MISMATCH'}`);
  }

  if (bad) {
    console.error('\nRow counts do not match. The source has NOT been changed — investigate before switching.');
    process.exit(1);
  }

  console.log('\nEvery row copied and verified. The source is untouched.');
  console.log('Now set DB_ENGINE (and DB_FILE / MYSQL_* if needed) in .env, and restart the app.');
} finally {
  await src.close();
  await dst.close();
}
