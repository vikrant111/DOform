import {$, call, h, mount, toast} from './ui.js';
import {renderAuth} from './screens/login.js';
import {blankRequisition, renderForm} from './screens/form.js';
import {renderRecords} from './screens/records.js';
import {renderDashboard} from './screens/dashboard.js';
import {renderSettings} from './screens/settings.js';
import {renderAccounts} from './screens/accounts.js';

const state = {config: null, user: null, firstRun: false, tab: 'records', editing: null};

const TABS = [
  {key: 'dashboard', label: 'Dashboard', icon: '▣', k: '⌘1'},
  {key: 'records', label: 'Records', icon: '☰', k: '⌘2'},
  {key: 'accounts', label: 'Accounts', icon: '👤', k: '⌘3'},
  {key: 'settings', label: 'Settings', icon: '⚙', k: '⌘4'},
];

let current = null; // the mounted screen, so menu accelerators can reach it

function applyTheme(config) {
  const root = document.documentElement;
  root.style.setProperty('--primary', config.primary);
  root.style.setProperty('--accent', config.accent);
  document.title = `${config.appName} — ${config.unitName}`;
}

function fatal(title, detail, hint) {
  mount(
    h('div', {class: 'fatal'},
      h('div', {class: 'boot-mark'}, '!'),
      h('h2', {}, title),
      hint ? h('p', {}, hint) : null,
      h('pre', {}, detail),
      h('button', {class: 'btn', onClick: () => location.reload()}, 'Try again'),
    ),
  );
}

// ── shell ────────────────────────────────────────────────────
function shell(content) {
  const nav = h('nav', {class: 'sidebar'},
    h('div', {class: 'brand'}, state.config.appName,
      h('small', {}, state.config.unitName)),
    h('hr'),
    ...TABS.map(t =>
      h('button', {
        class: 'nav-item',
        'aria-current': String(state.tab === t.key && !state.editing),
        onClick: () => go(t.key),
      }, h('span', {}, t.icon), h('span', {}, t.label), h('span', {class: 'k'}, t.k))),
    h('div', {class: 'spacer'}),
    h('div', {class: 'who'},
      h('b', {}, state.user.fullName || state.user.username),
      state.user.rank || state.user.username,
      h('span', {class: 'role'}, state.user.role)),
  );
  return h('div', {class: 'shell'}, nav, h('main', {class: 'main'}, content));
}

function screen() {
  if (state.editing) {
    return renderForm(state, {
      initial: state.editing,
      onDone: () => {
        state.editing = null;
        state.tab = 'records';
        render();
      },
      onCancel: () => {
        state.editing = null;
        render();
      },
    });
  }
  if (state.tab === 'dashboard')
    return renderDashboard(state, {onOpenRecords: () => go('records')});
  if (state.tab === 'accounts')
    return renderAccounts(state, {onProfileChanged: () => render()});
  if (state.tab === 'settings')
    return renderSettings(state, {onLogout: signOut});
  return renderRecords(state, {onEdit: editRequisition, onNew: newRequisition});
}

function render() {
  current = screen();
  mount(shell(current));
}

function go(tab) {
  state.editing = null;
  state.tab = tab;
  render();
}

function newRequisition() {
  state.editing = blankRequisition(state.user.id);
  render();
}

async function editRequisition(id) {
  try {
    const full = await call(window.api.req.get(id));
    if (!full) return toast('That requisition no longer exists.', 'err');
    state.editing = full;
    render();
  } catch {
    /* reported by call() */
  }
}

async function signOut() {
  // Clear the main-process session too, not just the copy the UI draws from.
  await window.api.auth.logout().catch(() => {});
  clearTimeout(expiryTimer);
  state.user = null;
  state.editing = null;
  state.tab = 'records';
  boot();
}

// ── session expiry ───────────────────────────────────────────
let expiryTimer = null;
function armExpiry(expiresAt) {
  clearTimeout(expiryTimer);
  const ms = expiresAt - Date.now();
  if (ms <= 0) return;
  expiryTimer = setTimeout(() => {
    toast('Session expired — please sign in again.');
    signOut();
  }, Math.min(ms, 2 ** 31 - 1));
}

// ── menu wiring ──────────────────────────────────────────────
window.api.onMenuTab(tab => state.user && go(tab));
window.api.onMenuNew(() => state.user && newRequisition());
window.api.onMenuPrint(() => current?.actions?.print?.());
window.api.onMenuPdf(() => current?.actions?.pdf?.());
window.api.onMenuCsv(() => current?.actions?.csv?.());

// ── boot ─────────────────────────────────────────────────────
async function boot() {
  const cfg = await window.api.config();
  if (!cfg.ok) return fatal('Could not read the configuration', cfg.error);
  state.config = cfg.data;
  applyTheme(state.config);

  const ping = await window.api.ping();
  if (!ping.ok)
    return fatal(
      'Cannot reach the local database',
      ping.error,
      `Start MySQL, check the credentials in ${state.config.envPath ?? '.env'}, ` +
      'and run `npm run init-db` if this is a new installation.',
    );

  const first = await window.api.auth.firstRun();
  state.firstRun = first.ok ? first.data : false;

  renderAuth(state, session => {
    state.user = session.user;
    armExpiry(session.expiresAt);
    state.tab = 'records';
    render();
  });
}

boot().catch(e => fatal('Startup failed', String(e?.message ?? e)));
