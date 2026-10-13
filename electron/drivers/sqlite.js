import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));

/** node:sqlite returns null-prototype rows; IPC and spread operators want plain ones. */
const plain = rows => rows.map(r => ({...r}));

/**
 * Embedded single-file database. Needs no server, no native module and no
 * install — which is what makes the app runnable on any desktop out of the box.
 */
export async function connect({file}) {
  mkdirSync(dirname(file), {recursive: true});
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(readFileSync(join(here, '..', 'schema.sqlite.sql'), 'utf8'));

  const api = {
    name: 'sqlite',
    describe: () => file,
    async all(sql, params = []) {
      return plain(db.prepare(sql).all(...params));
    },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...params);
      return {changes: Number(r.changes ?? 0)};
    },
    /** SQLite is single-writer, so a plain BEGIN/COMMIT on the one handle is the transaction. */
    async tx(fn) {
      db.exec('BEGIN');
      try {
        const out = await fn(api);
        db.exec('COMMIT');
        return out;
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      }
    },
    async ensureIndex(name, table, cols) {
      db.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${cols.join(',')})`);
    },

    async columns(table) {
      return plain(db.prepare(`PRAGMA table_info(${table})`).all()).map(c => c.name);
    },

    /** The one piece of SQL the two engines spell differently. */
    onConflict: (key, cols, extra) =>
      `ON CONFLICT(${key}) DO UPDATE SET ` +
      [...cols.map(c => `${c}=excluded.${c}`), extra].filter(Boolean).join(', '),
    async close() {
      db.close();
    },
  };
  return api;
}

export const defaultFile = dataDir => join(dataDir, 'doform.db');
export const fileExists = existsSync;
