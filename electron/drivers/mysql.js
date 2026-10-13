import mysql from 'mysql2/promise';

/**
 * Shared server database, for offices that want every desktop writing to one
 * copy. Requires MySQL to be installed and reachable; nothing leaves the LAN.
 */
export async function connect(cfg) {
  const pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectionLimit: cfg.connectionLimit,
    waitForConnections: true,
    charset: 'utf8mb4_unicode_ci',
    // Dates as 'YYYY-MM-DD' strings, so both engines hand the UI the same
    // shape and no timezone conversion can shift a visit date.
    dateStrings: true,
    timezone: 'local',
  });

  const wrap = runner => ({
    async all(sql, params = []) {
      return (await runner.query(sql, params))[0];
    },
    async run(sql, params = []) {
      const [res] = await runner.query(sql, params);
      return {changes: res?.affectedRows ?? 0};
    },
  });

  return {
    name: 'mysql',
    describe: () => `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`,
    ...wrap(pool),
    async tx(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const out = await fn(wrap(conn));
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
      } finally {
        conn.release();
      }
    },
    async ensureIndex(name, table, cols) {
      const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.statistics
          WHERE table_schema = ? AND table_name = ? AND index_name = ? LIMIT 1`,
        [cfg.database, table, name]);
      if (!rows.length) {
        await pool.query(`CREATE INDEX ${name} ON ${table} (${cols.join(',')})`);
      }
    },

    async columns(table) {
      const [rows] = await pool.query(
        `SELECT COLUMN_NAME AS name FROM information_schema.columns
          WHERE table_schema = ? AND table_name = ?`, [cfg.database, table]);
      return rows.map(r => r.name);
    },

    /** The one piece of SQL the two engines spell differently. */
    onConflict: (_key, cols, extra) =>
      'ON DUPLICATE KEY UPDATE ' +
      [...cols.map(c => `${c}=VALUES(${c})`), extra].filter(Boolean).join(', '),
    async close() {
      await pool.end();
    },
  };
}
