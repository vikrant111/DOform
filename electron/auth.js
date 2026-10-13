import {randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {CFG} from './config.js';
import {
  countAdmins, countRequisitionsByService, countUsers, deleteUser, findUser,
  findUserById, findUserByService, insertUser, reclaimByService, updatePassword,
  updateProfile, updateRole, uid,
} from './db.js';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

const hash = (password, salt, cost) =>
  scryptAsync(String(password).normalize('NFKC'), salt, KEY_LEN, {
    N: cost,
    // scrypt needs memory proportional to N; raise the ceiling to match.
    maxmem: 256 * cost * 8,
  }).then(buf => buf.toString('hex'));

export function validatePassword(pw) {
  const s = String(pw ?? '');
  if (s.length < CFG.minPasswordLength)
    return `Password must be at least ${CFG.minPasswordLength} characters.`;
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s))
    return 'Password must contain at least one letter and one number.';
  return null;
}

export function validateUsername(name) {
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(String(name ?? '').trim()))
    return 'Username must be 3–32 characters (letters, digits, . _ - only).';
  return null;
}

const publicUser = u => ({
  id: u.id,
  username: u.username,
  fullName: u.full_name,
  rank: u.rank,
  serviceNo: u.service_no ?? '',
  role: u.role,
});

export function validateServiceNo(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;                       // optional
  if (!/^[A-Za-z0-9/-]{3,32}$/.test(s))
    return 'Service number may use 3–32 letters, digits, / or - only.';
  return null;
}

/**
 * Hands a person back the requisitions they wrote before, matched on their
 * service number. Called whenever an account gains or changes one, so a
 * deleted-and-recreated account picks its history straight back up.
 */
async function reclaim(user) {
  if (!user.service_no) return 0;
  return reclaimByService(user.service_no, user.id, user.full_name);
}

/**
 * Failed-attempt tracking, in memory only. Enough to stop someone sitting at
 * the machine guessing passwords; it resets when the app restarts, which is
 * the right trade for a kiosk-style desktop app.
 */
const attempts = new Map();

const lockRemaining = key => {
  const rec = attempts.get(key);
  if (!rec?.until) return 0;
  const left = rec.until - Date.now();
  if (left <= 0) {
    attempts.delete(key);
    return 0;
  }
  return left;
};

function recordFailure(key) {
  const rec = attempts.get(key) ?? {fails: 0, until: 0};
  rec.fails += 1;
  if (rec.fails >= CFG.maxLoginAttempts) {
    rec.until = Date.now() + CFG.lockoutMinutes * 60_000;
    rec.fails = 0;
  }
  attempts.set(key, rec);
}

export const clearLockouts = () => attempts.clear();
const clearLockout = username => attempts.delete(String(username).trim().toLowerCase());

export async function login(username, password) {
  const key = String(username).trim().toLowerCase();
  const locked = lockRemaining(key);
  if (locked) {
    const mins = Math.ceil(locked / 60_000);
    return {error: `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`};
  }

  const u = await findUser(username);
  // Always spend the same work on a missing user as on a real one, so the
  // response time doesn't reveal which usernames exist.
  const salt = u?.salt ?? '00'.repeat(16);
  const cost = u?.cost ?? CFG.scryptCost;
  const candidate = await hash(password, salt, cost);
  if (!u) {
    recordFailure(key);
    return {error: 'Incorrect username or password.'};
  }

  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(u.password_hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    recordFailure(key);
    return {error: 'Incorrect username or password.'};
  }

  attempts.delete(key);
  return {user: publicUser(u), expiresAt: Date.now() + CFG.sessionHours * 3600_000};
}

export async function signup({username, password, fullName, rank, serviceNo}) {
  const name = String(username ?? '').trim();
  const nameError = validateUsername(name);
  if (nameError) return {error: nameError};
  if (!String(fullName ?? '').trim()) return {error: 'Full name is required.'};

  const pwError = validatePassword(password);
  if (pwError) return {error: pwError};

  const serviceError = validateServiceNo(serviceNo);
  if (serviceError) return {error: serviceError};
  const service = String(serviceNo ?? '').trim();
  if (service) {
    const holder = await findUserByService(service);
    if (holder)
      return {error: `Service number ${service} already belongs to "${holder.username}".`};
  }

  const isFirst = (await countUsers()) === 0;
  if (!isFirst && !CFG.allowSelfSignup)
    return {error: 'Self sign-up is disabled. Ask an administrator to create your account.'};
  if (await findUser(name)) return {error: 'That username is already taken.'};

  const user = {
    id: uid(),
    username: name,
    full_name: String(fullName).trim(),
    rank: String(rank ?? '').trim(),
    service_no: service,
    // The very first account must be an admin or nobody can administer anything.
    role: isFirst ? 'admin' : CFG.defaultRole,
    ...(await credential(password)),
  };
  await insertUser(user);
  const reclaimed = await reclaim(user);
  return {
    user: publicUser(user),
    reclaimed,
    expiresAt: Date.now() + CFG.sessionHours * 3600_000,
  };
}

export const isFirstRun = async () => (await countUsers()) === 0;

// ── account management ───────────────────────────────────────
/** Builds the stored credential for a new or reset password. */
async function credential(password) {
  const salt = randomBytes(16).toString('hex');
  return {
    salt,
    cost: CFG.scryptCost,
    password_hash: await hash(password, salt, CFG.scryptCost),
  };
}

export const listAccounts = async () =>
  (await import('./db.js')).listUsers();

/** An administrator creating an account for someone else. */
export async function createAccount({username, password, fullName, rank, role, serviceNo}) {
  const name = String(username ?? '').trim();
  const nameError = validateUsername(name);
  if (nameError) return {error: nameError};
  if (!String(fullName ?? '').trim()) return {error: 'Full name is required.'};
  const pwError = validatePassword(password);
  if (pwError) return {error: pwError};
  if (await findUser(name)) return {error: 'That username is already taken.'};

  const serviceError = validateServiceNo(serviceNo);
  if (serviceError) return {error: serviceError};
  const service = String(serviceNo ?? '').trim();
  if (service) {
    const holder = await findUserByService(service);
    if (holder)
      return {error: `Service number ${service} already belongs to "${holder.username}".`};
  }

  const user = {
    id: uid(),
    username: name,
    full_name: String(fullName).trim(),
    rank: String(rank ?? '').trim(),
    service_no: service,
    role: role === 'admin' ? 'admin' : 'operator',
    ...(await credential(password)),
  };
  await insertUser(user);
  const reclaimed = await reclaim(user);
  return {user: publicUser(user), reclaimed};
}

/** How many requisitions a service number would bring with it. */
export const recordsForService = service => countRequisitionsByService(service);

/** An administrator setting a new password for someone who has lost theirs. */
export async function resetPassword(userId, newPassword) {
  const target = await findUserById(userId);
  if (!target) return {error: 'That account no longer exists.'};
  const pwError = validatePassword(newPassword);
  if (pwError) return {error: pwError};

  await updatePassword(userId, await credential(newPassword));
  // A reset is also the remedy for being locked out, so lift that too.
  clearLockout(target.username);
  return {user: publicUser(target)};
}

/** Anyone changing their own password, which needs the current one. */
export async function changeOwnPassword(userId, currentPassword, newPassword) {
  const me = await findUserById(userId);
  if (!me) return {error: 'That account no longer exists.'};

  const candidate = await hash(currentPassword, me.salt, me.cost);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(me.password_hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return {error: 'Your current password is not correct.'};

  const pwError = validatePassword(newPassword);
  if (pwError) return {error: pwError};
  if (currentPassword === newPassword)
    return {error: 'The new password must be different from the current one.'};

  await updatePassword(userId, await credential(newPassword));
  clearLockout(me.username);
  return {user: publicUser(me)};
}

export async function setRole(userId, role) {
  const target = await findUserById(userId);
  if (!target) return {error: 'That account no longer exists.'};
  const next = role === 'admin' ? 'admin' : 'operator';
  // Removing the last administrator would lock everyone out of administration.
  if (target.role === 'admin' && next !== 'admin' && (await countAdmins()) <= 1)
    return {error: 'This is the only administrator — promote someone else first.'};
  await updateRole(userId, next);
  return {user: {...publicUser(target), role: next}};
}

export async function updateAccount(userId, {fullName, rank, serviceNo}) {
  const target = await findUserById(userId);
  if (!target) return {error: 'That account no longer exists.'};
  if (!String(fullName ?? '').trim()) return {error: 'Full name is required.'};

  const serviceError = validateServiceNo(serviceNo);
  if (serviceError) return {error: serviceError};
  const service = String(serviceNo ?? '').trim();
  if (service) {
    const holder = await findUserByService(service);
    if (holder && holder.id !== userId)
      return {error: `Service number ${service} already belongs to "${holder.username}".`};
  }

  const next = {
    full_name: String(fullName).trim(),
    rank: String(rank ?? '').trim(),
    service_no: service,
  };
  await updateProfile(userId, next);
  const reclaimed = await reclaim({...target, ...next, id: userId});
  return {user: publicUser({...target, ...next}), reclaimed};
}

export async function removeAccount(userId) {
  const target = await findUserById(userId);
  if (!target) return {error: 'That account no longer exists.'};
  if (target.role === 'admin' && (await countAdmins()) <= 1)
    return {error: 'This is the only administrator — the account cannot be removed.'};
  await deleteUser(userId);
  clearLockout(target.username);
  return {removed: publicUser(target)};
}
