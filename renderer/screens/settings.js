import {call, h, setChildren, toast} from '../ui.js';

/** Booleans read as Yes/No; a missing value reads as a dash, never "null". */
const show = v => {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const s = v === null || v === undefined ? '' : String(v);
  return s.trim() || '—';
};

const kv = pairs =>
  h('dl', {class: 'kv'},
    ...pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, show(v))]));

export function renderSettings(state, {onLogout}) {
  const {config, user} = state;
  const host = h('div', {class: 'page'});

  setChildren(host,
    h('h1', {}, 'Settings'),
    h('p', {class: 'sub'}, 'Every value below comes from the .env file. Nothing is configured in code.'),

    h('div', {class: 'card'},
      h('h2', {}, 'Signed in'),
      kv([
        ['Username', user.username],
        ['Name', user.fullName],
        ['Rank / designation', user.rank],
        ['Service number', user.serviceNo],
        ['Role', user.role],
        ['Session expires after', `${config.sessionHours} hour(s)`],
      ]),
      h('p', {class: 'hint', style: {marginTop: '8px'}},
        'Your details and password are on the Accounts screen.'),
      h('div', {class: 'btn-row', style: {marginTop: '14px'}},
        h('button', {class: 'btn ghost', onClick: onLogout}, 'Sign out')),
    ),

    h('div', {class: 'card'},
      h('h2', {}, 'Database'),
      kv([
        ['Engine', config.dbEngine === 'mysql' ? 'MySQL (shared server)' : 'Local file (no server)'],
        ['Location', config.database],
        ['Network', 'none — the app never connects to the internet'],
      ]),
      h('p', {class: 'hint', style: {marginTop: '10px'}},
        'Requisitions are shared: every signed-in user of this database sees the same records.'),
    ),

    h('div', {class: 'card'},
      h('h2', {}, 'Configuration (.env)'),
      kv([
        ['APP_NAME', config.appName],
        ['UNIT_NAME', config.unitName],
        ['MAX_VISITORS', config.maxVisitors],
        ['MAX_VEHICLES', config.maxVehicles],
        ['MAX_ESCORTS', config.maxEscorts],
        ['ALLOW_SELF_SIGNUP', config.allowSelfSignup],
        ['DEFAULT_ROLE', config.defaultRole],
        ['AUTH_MIN_PASSWORD_LENGTH', config.minPasswordLength],
        ['DASHBOARD_DAYS', config.dashboardDays],
        ['RECORDS_PAGE_SIZE', config.recordsPageSize],
        ['File', config.envPath],
      ]),
      h('p', {class: 'hint', style: {marginTop: '12px'}},
        'Edit the file and restart the app for changes to take effect.'),
      h('div', {class: 'btn-row', style: {marginTop: '10px'}},
        h('button', {
          class: 'btn ghost',
          onClick: () => call(window.api.openEnv())
            .then(p => toast(`Opened ${p}`, 'ok'))
            .catch(() => {}),
        }, 'Open .env')),
    ),

    h('div', {class: 'card'},
      h('h2', {}, 'Keyboard shortcuts'),
      kv([
        ['New requisition', 'Ctrl/Cmd + N'],
        ['Print selected', 'Ctrl/Cmd + P'],
        ['Save selected as PDF', 'Ctrl/Cmd + Shift + P'],
        ['Download selected as CSV', 'Ctrl/Cmd + E'],
        ['Dashboard / Records / Accounts / Settings', 'Ctrl/Cmd + 1 / 2 / 3 / 4'],
        ['Leave a form', 'Esc'],
      ]),
    ),
  );

  return host;
}
