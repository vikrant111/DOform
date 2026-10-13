const {contextBridge, ipcRenderer} = require('electron');

/**
 * The only bridge between the page and Node. The renderer can call exactly
 * these channels and nothing else — no filesystem, no MySQL credentials, no
 * `require`. Every call resolves to {ok, data} or {ok:false, error}.
 */
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const onMenu = (channel, fn) => {
  const listener = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  config: () => invoke('config:get'),
  ping: () => invoke('db:ping'),

  auth: {
    firstRun: () => invoke('auth:firstRun'),
    login: (username, password) => invoke('auth:login', username, password),
    signup: input => invoke('auth:signup', input),
    logout: () => invoke('auth:logout'),
    session: () => invoke('auth:session'),
  },

  users: {
    list: () => invoke('users:list'),
    create: input => invoke('users:create', input),
    resetPassword: (id, password) => invoke('users:resetPassword', id, password),
    setRole: (id, role) => invoke('users:setRole', id, role),
    update: (id, profile) => invoke('users:update', id, profile),
    recordCount: id => invoke('users:recordCount', id),
    recordsForService: service => invoke('users:recordsForService', service),
    remove: id => invoke('users:remove', id),
    changeOwnPassword: (current, next) => invoke('users:changeOwnPassword', current, next),
  },

  req: {
    list: filters => invoke('req:list', filters),
    ids: filters => invoke('req:ids', filters),
    get: id => invoke('req:get', id),
    save: payload => invoke('req:save', payload),
    remove: ids => invoke('req:delete', ids),
    setStatus: (ids, status) => invoke('req:setStatus', ids, status),
  },

  stats: filters => invoke('stats:get', filters),

  exportCsv: ids => invoke('export:csv', ids),
  exportPdf: (ids, mode) => invoke('export:pdf', ids, mode),
  print: (ids, mode) => invoke('print:run', ids, mode),
  openEnv: () => invoke('shell:openEnv'),

  onMenuNew: fn => onMenu('menu:new', fn),
  onMenuPrint: fn => onMenu('menu:print', fn),
  onMenuPdf: fn => onMenu('menu:pdf', fn),
  onMenuCsv: fn => onMenu('menu:csv', fn),
  onMenuTab: fn => onMenu('menu:tab', fn),
});
