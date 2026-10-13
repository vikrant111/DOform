import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/**
 * In a packaged build the app code is inside an asar archive, so `.env` is
 * shipped as an extra resource next to it. Development reads the project root.
 */
const candidates = [
  process.env.DOFORM_ENV_FILE,
  process.resourcesPath ? join(process.resourcesPath, '.env') : null,
  join(root, '.env'),
  join(root, '.env.example'),
].filter(Boolean);

export const envPath = candidates.find(p => existsSync(p)) ?? null;
if (envPath) dotenv.config({path: envPath, quiet: true});

const str = (k, d = '') => (process.env[k] ?? '') === '' ? d : String(process.env[k]);
const num = (k, d) => (Number.isFinite(Number(process.env[k])) && process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);
const bool = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : /^(1|true|yes|on)$/i.test(process.env[k]));

export const CFG = {
  appName: str('APP_NAME', 'CVP Requisition'),
  unitName: str('UNIT_NAME', 'INS UTKROSH'),
  formTitle: str('FORM_TITLE', 'REQUISITION FOR ISSUE OF CASUAL VISITOR PASS (CVP)'),
  formFooterNote: str('FORM_FOOTER_NOTE'),
  unitMotto: str('UNIT_MOTTO'),
  securityOfficeLabel: str('SECURITY_OFFICE_LABEL', 'Security Officer'),

  maxVisitors: num('MAX_VISITORS', 10),
  maxVehicles: num('MAX_VEHICLES', 5),
  maxEscorts: num('MAX_ESCORTS', 5),

  // Pass numbers read <prefix>/<service no>/<DDMMYYYY>/<HHMMSS>.
  passNoPrefix: str('PASS_NO_PREFIX', 'CVP/UTK'),

  /**
   * Issue a pass number to a record that has none when it is first printed.
   *
   * Records written before the app generated pass numbers carry a hand-typed
   * one — `CVP-2026-0142` — and no issue time, so the pass line prints a number
   * with "at ____ Hrs on (Date) ____" left blank. On the next save they are
   * replaced, but a record nobody edits again never gets there.
   *
   * With this on, printing one issues a proper pass and writes it back, so the
   * paper and the record agree. Only the Security Office can trigger it, the
   * number is generated here rather than taken from the page, and it is written
   * once — reprinting shows the same number.
   */
  passOnPrint: bool('PASS_ON_PRINT', true),

  // 'sqlite' (default) keeps everything in one local file — no server, no
  // install. 'mysql' points the same app at a shared server instead.
  dbEngine: /^mysql$/i.test(str('DB_ENGINE', 'sqlite')) ? 'mysql' : 'sqlite',
  dbFile: str('DB_FILE', ''),
  // Overridden by the main process with Electron's userData directory; this
  // fallback is what command-line scripts and tests use.
  dataDir: join(homedir(), '.doform'),

  mysql: {
    host: str('MYSQL_HOST', '127.0.0.1'),
    port: num('MYSQL_PORT', 3306),
    user: str('MYSQL_USER', 'doform'),
    password: str('MYSQL_PASSWORD', ''),
    database: str('MYSQL_DATABASE', 'doform'),
    connectionLimit: num('MYSQL_CONNECTION_LIMIT', 10),
  },

  scryptCost: num('AUTH_SCRYPT_COST', 16384),
  minPasswordLength: num('AUTH_MIN_PASSWORD_LENGTH', 8),
  sessionHours: num('AUTH_SESSION_HOURS', 12),
  maxLoginAttempts: num('AUTH_MAX_LOGIN_ATTEMPTS', 5),
  lockoutMinutes: num('AUTH_LOCKOUT_MINUTES', 5),
  allowSelfSignup: bool('ALLOW_SELF_SIGNUP', true),
  defaultRole: str('DEFAULT_ROLE', 'operator'),

  window: {
    width: num('WINDOW_WIDTH', 1280),
    height: num('WINDOW_HEIGHT', 860),
    minWidth: num('WINDOW_MIN_WIDTH', 900),
    minHeight: num('WINDOW_MIN_HEIGHT', 600),
    maximized: bool('START_MAXIMIZED', false),
  },

  primary: str('THEME_PRIMARY', '#14395e'),
  accent: str('THEME_ACCENT', '#b8860b'),
  dateFormat: str('DATE_FORMAT', 'DD/MM/YYYY'),

  chartBar: str('CHART_BAR', '#2a78d6'),
  statusColors: {
    draft: str('CHART_STATUS_DRAFT', '#6b7a8a'),
    submitted: str('CHART_STATUS_SUBMITTED', '#fab219'),
    approved: str('CHART_STATUS_APPROVED', '#0ca30c'),
    issued: str('CHART_STATUS_ISSUED', '#2a78d6'),
    rejected: str('CHART_STATUS_REJECTED', '#d03b3b'),
  },
  dashboardDays: num('DASHBOARD_DAYS', 14),

  csvDelimiter: str('EXPORT_CSV_DELIMITER', ','),
  recordsPageSize: num('RECORDS_PAGE_SIZE', 500),
};

/** The subset the renderer is allowed to see — MySQL credentials never cross. */
export const publicConfig = () => ({
  appName: CFG.appName,
  unitName: CFG.unitName,
  formTitle: CFG.formTitle,
  formFooterNote: CFG.formFooterNote,
  unitMotto: CFG.unitMotto,
  securityOfficeLabel: CFG.securityOfficeLabel,
  maxVisitors: CFG.maxVisitors,
  maxVehicles: CFG.maxVehicles,
  maxEscorts: CFG.maxEscorts,
  minPasswordLength: CFG.minPasswordLength,
  allowSelfSignup: CFG.allowSelfSignup,
  defaultRole: CFG.defaultRole,
  sessionHours: CFG.sessionHours,
  primary: CFG.primary,
  accent: CFG.accent,
  dateFormat: CFG.dateFormat,
  chartBar: CFG.chartBar,
  statusColors: CFG.statusColors,
  dashboardDays: CFG.dashboardDays,
  recordsPageSize: CFG.recordsPageSize,
  maxLoginAttempts: CFG.maxLoginAttempts,
  envPath,
  dbEngine: CFG.dbEngine,
});
