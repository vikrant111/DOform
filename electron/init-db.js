#!/usr/bin/env node
/**
 * Creates the database, the application user and every table.
 * Run once with a MySQL account that may CREATE DATABASE:
 *
 *   MYSQL_ROOT_USER=root MYSQL_ROOT_PASSWORD=secret npm run init-db
 *
 * Falls back to the credentials in .env when no root override is given.
 */
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import {CFG, envPath} from './config.js';

if (CFG.dbEngine !== 'mysql') {
  console.log(
    'DB_ENGINE is "sqlite" — there is nothing to set up.\n' +
    'The app creates its data file on first launch. Just run: npm start\n' +
    '(Set DB_ENGINE=mysql in .env if you want a shared MySQL server instead.)',
  );
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, 'schema.mysql.sql'), 'utf8');

const admin = {
  host: CFG.mysql.host,
  port: CFG.mysql.port,
  user: process.env.MYSQL_ROOT_USER || CFG.mysql.user,
  password: process.env.MYSQL_ROOT_PASSWORD ?? CFG.mysql.password,
  multipleStatements: true,
};

console.log(`Using configuration from ${envPath ?? '(defaults)'}`);

const conn = await mysql.createConnection(admin);
await conn.query(
  `CREATE DATABASE IF NOT EXISTS \`${CFG.mysql.database}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
);

// Create the app user only when running as a different (root) account.
if (admin.user !== CFG.mysql.user) {
  await conn.query(
    `CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?`,
    [CFG.mysql.user, CFG.mysql.password],
  );
  await conn.query(
    `GRANT ALL PRIVILEGES ON \`${CFG.mysql.database}\`.* TO ?@'%'`,
    [CFG.mysql.user],
  );
  await conn.query('FLUSH PRIVILEGES');
  console.log(`User '${CFG.mysql.user}' created and granted on '${CFG.mysql.database}'.`);
}

await conn.changeUser({database: CFG.mysql.database});
await conn.query(schema);
await conn.end();
console.log(`Schema ready in '${CFG.mysql.database}'.`);
