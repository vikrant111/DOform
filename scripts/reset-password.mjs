#!/usr/bin/env node
/**
 * Last-resort password reset, for when the only administrator is locked out
 * and cannot use the Accounts screen.
 *
 *   npm run reset-password -- --list
 *   npm run reset-password -- <username> "<new password>"
 *
 * Run it on the machine holding the data (or, with DB_ENGINE=mysql, anywhere
 * that can reach the server). It touches only the users table — requisitions
 * are never affected.
 */
import {homedir} from 'node:os';
import {join} from 'node:path';
import * as auth from '../electron/auth.js';
import * as db from '../electron/db.js';

// Matches Electron's app.getPath('userData') for this product name.
const USER_DATA = {
  darwin: join(homedir(), 'Library', 'Application Support', 'CVP Requisition'),
  win32: join(process.env.APPDATA ?? homedir(), 'CVP Requisition'),
}[process.platform] ?? join(homedir(), '.config', 'CVP Requisition');

const [target, password] = process.argv.slice(2);

await db.init({dataDir: USER_DATA});
console.log(`Database: ${db.engineName()} — ${db.describeDb()}\n`);

const users = await db.listUsers();

if (!target || target === '--list') {
  if (!users.length) {
    console.log('There are no accounts yet. Start the app and create the first one.');
  } else {
    console.log('Accounts:');
    for (const u of users) {
      console.log(`  ${u.username.padEnd(20)} ${String(u.role).padEnd(9)} ${u.full_name}`);
    }
  }
  if (!target) {
    console.log('\nTo reset one:  npm run reset-password -- <username> "<new password>"');
  }
  await db.closePool();
  process.exit(0);
}

const user = users.find(u => u.username.toLowerCase() === target.toLowerCase());
if (!user) {
  console.error(`No account called "${target}". Use --list to see them.`);
  await db.closePool();
  process.exit(1);
}

if (!password) {
  console.error('Give the new password as the second argument, in quotes.');
  await db.closePool();
  process.exit(1);
}

const res = await auth.resetPassword(user.id, password);
if (res.error) {
  console.error(`Could not reset it: ${res.error}`);
  await db.closePool();
  process.exit(1);
}

const records = await db.countRequisitionsBy(user.id);
console.log(`Password reset for "${user.username}" (${user.role}).`);
console.log(`Their ${records} requisition(s) are untouched.`);
await db.closePool();
