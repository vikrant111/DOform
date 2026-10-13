import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BrowserWindow, Menu, app, dialog, ipcMain, shell} from 'electron';
import {CFG, publicConfig} from './config.js';
import * as auth from './auth.js';
import * as db from './db.js';
import {toCsv, toHtml} from './export.js';
import * as G from './guards.js';

const here = dirname(fileURLToPath(import.meta.url));
const DEV = process.argv.includes('--dev');

let win = null;

/**
 * The authoritative session. The renderer keeps its own copy for drawing the
 * UI, but every privileged decision — who may delete, who may fill the pass
 * block — is taken from this one, which the page cannot reach or forge.
 */
let session = null;

const currentUser = () => {
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    session = null;
    return null;
  }
  return session.user;
};

const requireUser = () => currentUser() ?? G.fail('Please sign in first.');
const requireAdmin = () => {
  const u = requireUser();
  if (u.role !== 'admin') throw new G.BadInput('Only an administrator can do that.');
  return u;
};

function createWindow() {
  win = new BrowserWindow({
    // Windows and Linux take the window icon from here when running from
    // source; packaged builds use the one baked in by electron-builder.
    ...(process.platform === 'darwin' ? {} : {icon: join(here, '..', 'build', 'icon.png')}),
    width: CFG.window.width,
    height: CFG.window.height,
    minWidth: CFG.window.minWidth,
    minHeight: CFG.window.minHeight,
    title: `${CFG.appName} — ${CFG.unitName}`,
    backgroundColor: '#f4f6f8',
    show: false,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    if (CFG.window.maximized) win.maximize();
    win.show();
    if (DEV) win.webContents.openDevTools({mode: 'detach'});
  });

  // Nothing in this app should ever navigate away or open a browser window.
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());

  win.loadFile(join(here, '..', 'renderer', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

// ── printing ─────────────────────────────────────────────────
/**
 * Renders HTML in an offscreen window and hands it to `fn`. Printing from a
 * real page (rather than a string) is what gives us the OS print dialog and
 * correct A4 pagination.
 */
async function withRenderedPage(html, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'doform-'));
  const file = join(dir, 'print.html');
  await writeFile(file, html, 'utf8');

  const sheet = new BrowserWindow({
    show: false,
    webPreferences: {offscreen: true, contextIsolation: true, nodeIntegration: false},
  });
  try {
    await sheet.loadFile(file);
    return await fn(sheet);
  } finally {
    sheet.destroy();
    await rm(dir, {recursive: true, force: true}).catch(() => {});
  }
}

const printDialog = html =>
  withRenderedPage(html, sheet =>
    new Promise(resolve => {
      sheet.webContents.print(
        {silent: false, printBackground: true, pageSize: 'A4'},
        (success, reason) => resolve({ok: success, reason}),
      );
    }),
  );

async function savePdf(html, suggestedName) {
  const {canceled, filePath} = await dialog.showSaveDialog(win, {
    title: 'Save as PDF',
    defaultPath: suggestedName,
    filters: [{name: 'PDF', extensions: ['pdf']}],
  });
  if (canceled || !filePath) return {ok: false, canceled: true};

  const pdf = await withRenderedPage(html, sheet =>
    sheet.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: {marginType: 'none'},
    }),
  );
  await writeFile(filePath, pdf);
  return {ok: true, path: filePath};
}

async function saveText(contents, suggestedName, filters) {
  const {canceled, filePath} = await dialog.showSaveDialog(win, {
    title: 'Save',
    defaultPath: suggestedName,
    filters,
  });
  if (canceled || !filePath) return {ok: false, canceled: true};
  await writeFile(filePath, contents, 'utf8');
  return {ok: true, path: filePath};
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── IPC ──────────────────────────────────────────────────────
/** Wraps a handler so a thrown error reaches the renderer as data, not a crash. */
const handle = (channel, fn) =>
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return {ok: true, data: await fn(...args)};
    } catch (err) {
      // A rejected input is an expected outcome, not a fault: log one line.
      // Anything else is a real failure and keeps its stack trace.
      if (err instanceof G.BadInput) console.warn(`[${channel}] rejected: ${err.message}`);
      else console.error(`[${channel}]`, err);
      return {ok: false, error: String(err?.message ?? err)};
    }
  });

handle('config:get', () => ({
  ...publicConfig(),
  database: db.describeDb(),
}));
handle('db:ping', async () => {
  await db.ping();
  return true;
});

handle('auth:firstRun', () => auth.isFirstRun());

handle('auth:login', async (username, password) => {
  const c = G.credentials({username, password});
  const res = await auth.login(c.username, c.password);
  if (res.user) session = res;
  return res;
});

handle('auth:signup', async input => {
  const res = await auth.signup(G.credentials(input));
  if (res.user) session = {user: res.user, expiresAt: res.expiresAt};
  return res;
});

handle('auth:logout', () => {
  session = null;
  return true;
});

handle('auth:session', () => currentUser());

// ── accounts (administrators only, except changing your own password) ──
handle('users:list', async () => {
  requireAdmin();
  return db.listUsers();
});

handle('users:create', async input => {
  requireAdmin();
  return auth.createAccount(G.account(input));
});

handle('users:resetPassword', async (id, password) => {
  requireAdmin();
  return auth.resetPassword(G.userId(id), G.newPassword(password));
});

handle('users:setRole', async (id, role) => {
  const me = requireAdmin();
  const target = G.userId(id);
  if (target === me.id && role !== 'admin')
    throw new G.BadInput('You cannot remove your own administrator rights.');
  return auth.setRole(target, G.oneOf(role, G.ROLES, {field: 'Role'}));
});

handle('users:update', async (id, profile) => {
  requireAdmin();
  const v = profile ?? {};
  const res = await auth.updateAccount(G.userId(id), {
    fullName: G.str(v.fullName, {field: 'Full name', max: 255, required: true}),
    rank: G.str(v.rank, {field: 'Rank', max: 255}),
    serviceNo: G.serviceNo(v.serviceNo),
  });
  // Keep the live session in step if an admin edited their own details.
  if (res.user && session?.user?.id === res.user.id) session.user = res.user;
  return res;
});

/** How many requisitions a service number would bring back with it. */
handle('users:recordsForService', async service => {
  requireUser();
  return auth.recordsForService(G.serviceNo(service));
});

handle('users:recordCount', async id => {
  requireAdmin();
  return db.countRequisitionsBy(G.userId(id));
});

handle('users:remove', async id => {
  const me = requireAdmin();
  const target = G.userId(id);
  if (target === me.id) throw new G.BadInput('You cannot remove your own account.');
  return auth.removeAccount(target);
});

/** Anyone may change their own password, given the current one. */
handle('users:changeOwnPassword', async (current, next) => {
  const me = requireUser();
  return auth.changeOwnPassword(
    me.id,
    G.str(current, {field: 'Current password', max: 256, required: true}),
    G.newPassword(next),
  );
});

handle('req:list', async f => {
  requireUser();
  return db.listRequisitions(G.filters(f, {defaultPageSize: CFG.recordsPageSize}));
});

handle('req:ids', async f => {
  requireUser();
  return db.matchingIds(G.filters(f), G.LIMITS.ids);
});

handle('req:get', async id => {
  requireUser();
  const [one] = G.idList([id], {field: 'Record'});
  return db.getFull(one);
});

handle('req:save', async payload => {
  const user = requireUser();
  const clean = G.requisition(payload, {
    maxVisitors: CFG.maxVisitors,
    maxVehicles: CFG.maxVehicles,
    maxEscorts: CFG.maxEscorts,
    isAdmin: user.role === 'admin',
  });
  const existing = clean.id ? await db.getFull(clean.id) : null;
  return db.saveFull({
    ...clean,
    // Authorship is stamped once, by the person who first wrote it. The
    // service number is what survives an account being deleted and remade.
    created_by: existing?.created_by || user.id,
    created_by_service: existing?.created_by_service || user.serviceNo || '',
    created_by_name: existing?.created_by_name || user.fullName || user.username,
  });
});

handle('req:delete', async ids => {
  requireAdmin();
  return db.removeRequisitions(G.idList(ids));
});

handle('req:setStatus', async (ids, status) => {
  requireAdmin();
  return db.setStatus(G.idList(ids), G.oneOf(status, G.STATUSES, {field: 'Status'}));
});

handle('stats:get', async f => {
  requireUser();
  return db.stats(G.filters(f));
});

/** Shared by print, PDF and CSV: resolve a selection into real records. */
async function selected(ids, what) {
  requireUser();
  const recs = await db.getManyFull(G.idList(ids));
  if (!recs.length) throw new G.BadInput(`Nothing selected to ${what}.`);
  return recs;
}

handle('export:csv', async ids =>
  saveText(toCsv(await selected(ids, 'export')), `CVP-export-${stamp()}.csv`,
    [{name: 'CSV', extensions: ['csv']}]));

handle('export:pdf', async (ids, mode) => {
  const m = G.oneOf(mode ?? 'form', G.MODES, {field: 'Mode'});
  return savePdf(toHtml(await selected(ids, 'export'), m), `CVP-${m}-${stamp()}.pdf`);
});

handle('print:run', async (ids, mode) => {
  const m = G.oneOf(mode ?? 'form', G.MODES, {field: 'Mode'});
  return printDialog(toHtml(await selected(ids, 'print'), m));
});

handle('shell:openEnv', async () => {
  const {envPath} = publicConfig();
  if (!envPath) throw new Error('No .env file found.');
  await shell.openPath(envPath);
  return envPath;
});

// ── menu ─────────────────────────────────────────────────────
function buildMenu() {
  const send = (channel, ...args) => win?.webContents.send(channel, ...args);
  const isMac = process.platform === 'darwin';

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{role: 'appMenu'}] : []),
    {
      label: 'File',
      submenu: [
        {label: 'New requisition', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new')},
        {type: 'separator'},
        {label: 'Print selected…', accelerator: 'CmdOrCtrl+P', click: () => send('menu:print')},
        {label: 'Save selected as PDF…', accelerator: 'CmdOrCtrl+Shift+P', click: () => send('menu:pdf')},
        {label: 'Download selected as CSV…', accelerator: 'CmdOrCtrl+E', click: () => send('menu:csv')},
        {type: 'separator'},
        {label: 'Open .env configuration', click: () => shell.openPath(publicConfig().envPath ?? '')},
        {type: 'separator'},
        isMac ? {role: 'close'} : {role: 'quit'},
      ],
    },
    {role: 'editMenu'},
    {
      label: 'View',
      submenu: [
        {label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => send('menu:tab', 'dashboard')},
        {label: 'Records', accelerator: 'CmdOrCtrl+2', click: () => send('menu:tab', 'records')},
        {label: 'Accounts', accelerator: 'CmdOrCtrl+3', click: () => send('menu:tab', 'accounts')},
        {label: 'Settings', accelerator: 'CmdOrCtrl+4', click: () => send('menu:tab', 'settings')},
        {type: 'separator'},
        {role: 'resetZoom'}, {role: 'zoomIn'}, {role: 'zoomOut'},
        {type: 'separator'},
        {role: 'togglefullscreen'},
        ...(DEV ? [{role: 'toggleDevTools'}] : []),
      ],
    },
    {role: 'windowMenu'},
  ]));
}

app.whenReady().then(async () => {
  // Open the database before the first window so the UI can report a clear
  // failure instead of a blank screen.
  await db.init({dataDir: app.getPath('userData')}).catch(e => {
    console.error('database init failed:', e);
  });
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  await db.closePool().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});
