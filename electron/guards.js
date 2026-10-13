/**
 * Input guards for the IPC boundary.
 *
 * The renderer is our own code, but it is the untrusted side of the bridge: a
 * compromised or buggy page must not be able to hand the database unbounded
 * input, a wrong type, or SQL-shaped junk. Everything crossing `preload.cjs`
 * is validated here first, and every failure is a plain message the UI shows.
 */

export const LIMITS = {
  ids: 5000,
  shortText: 255,
  longText: 4000,
  username: 32,
  password: 256,
  pageSize: 200,
  searchText: 120,
  /**
   * A visitor photo, as the length of its data URL.
   *
   * The page shrinks a picture to roughly 400px before sending it, which lands
   * around 20–40 KB — so this is headroom rather than a target. It exists
   * because a photo is the one field a page could hand over unbounded: ten
   * visitors on one requisition, each with a full camera frame, is a database
   * row measured in megabytes and a print that never renders.
   */
  photo: 192 * 1024,
};

export class BadInput extends Error {}

export const fail = msg => {
  throw new BadInput(msg);
};

const isPlainObject = v =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'issued'];
export const ROLES = ['admin', 'operator'];
export const MODES = ['form', 'summary'];

/** Trims, enforces a length ceiling, and rejects anything that is not a string. */
export function str(value, {field, max = LIMITS.shortText, required = false} = {}) {
  if (value === null || value === undefined) value = '';
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string') fail(`${field} must be text.`);
  const out = value.trim();
  if (required && !out) fail(`${field} is required.`);
  if (out.length > max) fail(`${field} must be ${max} characters or fewer.`);
  return out;
}

/** Empty is allowed (stored as NULL); anything present must be a real date. */
export function dateStr(value, {field} = {}) {
  const s = str(value, {field, max: 10});
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(`${field} must be a date (YYYY-MM-DD).`);
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    fail(`${field} is not a real date.`);
  if (y < 1900 || y > 2200) fail(`${field} is outside a sensible range.`);
  return s;
}

export function timeStr(value, {field} = {}) {
  const s = str(value, {field, max: 5});
  if (!s) return '';
  if (!/^([01]?\d|2[0-3]):?[0-5]\d$/.test(s))
    fail(`${field} must be a 24-hour time such as 0930 or 09:30.`);
  return s;
}

export function oneOf(value, allowed, {field} = {}) {
  const s = str(value, {field});
  if (!allowed.includes(s)) fail(`${field} must be one of: ${allowed.join(', ')}.`);
  return s;
}

export function idList(value, {field = 'Selection'} = {}) {
  if (!Array.isArray(value)) fail(`${field} must be a list.`);
  if (value.length > LIMITS.ids)
    fail(`${field} is too large — at most ${LIMITS.ids} records at a time.`);
  const out = value.map(v => {
    if (typeof v !== 'string' || !v) fail(`${field} contains an invalid record id.`);
    if (v.length > 64) fail(`${field} contains an invalid record id.`);
    return v;
  });
  if (new Set(out).size !== out.length) fail(`${field} contains duplicates.`);
  return out;
}

export function intIn(value, {field, min, max, fallback}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) fail(`${field} must be a whole number.`);
  return Math.min(max, Math.max(min, n));
}

export function filters(value, {defaultPageSize = 50} = {}) {
  const f = isPlainObject(value) ? value : {};
  const out = {
    q: str(f.q, {field: 'Search', max: LIMITS.searchText}),
    status: f.status === undefined || f.status === '' || f.status === 'all'
      ? 'all'
      : oneOf(f.status, STATUSES, {field: 'Status'}),
    from: dateStr(f.from, {field: 'Date from'}),
    to: dateStr(f.to, {field: 'Date to'}),
    page: intIn(f.page, {field: 'Page', min: 1, max: 100000, fallback: 1}),
    pageSize: intIn(f.pageSize, {field: 'Page size', min: 1, max: LIMITS.pageSize, fallback: defaultPageSize}),
  };
  if (out.from && out.to && out.from > out.to)
    fail('The "date from" must not be after the "date to".');
  return out;
}

/** An administrator creating or editing someone else's account. */
export function account(value) {
  const v = isPlainObject(value) ? value : {};
  return {
    username: str(v.username, {field: 'Username', max: LIMITS.username, required: true}),
    password: str(v.password, {field: 'Password', max: LIMITS.password, required: true}),
    fullName: str(v.fullName, {field: 'Full name', max: LIMITS.shortText, required: true}),
    rank: str(v.rank, {field: 'Rank', max: LIMITS.shortText}),
    role: oneOf(v.role ?? 'operator', ROLES, {field: 'Role'}),
    serviceNo: serviceNo(v.serviceNo),
  };
}

/** Optional, but when present it is the person's lasting identity. */
export function serviceNo(value) {
  const s = str(value, {field: 'Service number', max: 32});
  if (s && !/^[A-Za-z0-9/-]{3,32}$/.test(s))
    fail('Service number may use 3–32 letters, digits, / or - only.');
  return s;
}

export const userId = v => str(v, {field: 'Account', max: 64, required: true});

export const newPassword = v =>
  str(v, {field: 'New password', max: LIMITS.password, required: true});

export function credentials(value) {
  const v = isPlainObject(value) ? value : {};
  return {
    username: str(v.username, {field: 'Username', max: LIMITS.username, required: true}),
    password: str(v.password, {field: 'Password', max: LIMITS.password, required: true}),
    fullName: str(v.fullName, {field: 'Full name', max: LIMITS.shortText}),
    rank: str(v.rank, {field: 'Rank', max: LIMITS.shortText}),
    serviceNo: serviceNo(v.serviceNo),
  };
}

/**
 * Image types a photo may be. **SVG is deliberately absent**: it is a document,
 * it can carry script, and this value is written straight into an `<img src>`
 * on a page the app renders for printing.
 */
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PHOTO_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * A visitor photograph, as a base64 data URL — or empty, which is the norm.
 *
 * Checked rather than trusted, even though the page is our own code. The value
 * ends up inside an `src` attribute in generated HTML, so anything that is not
 * plainly an image is refused here: a `javascript:` or `file:` URL, an SVG, a
 * remote address that would make the print reach the network, or base64 that
 * is not base64. The ceiling is `LIMITS.photo`.
 */
export function photo(value, {field = 'Photo'} = {}) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') fail(`${field} must be an image.`);
  const v = value.trim();
  if (!v) return '';
  if (v.length > LIMITS.photo)
    fail(`${field} is too large — use a smaller picture (limit ${Math.round(LIMITS.photo / 1024)} KB).`);

  const m = PHOTO_URL.exec(v);
  if (!m) fail(`${field} must be a PNG, JPEG or WebP image.`);
  if (!PHOTO_TYPES.includes(m[1])) fail(`${field} must be a PNG, JPEG or WebP image.`);
  // Base64 encodes three bytes as four characters, so a length that is not a
  // multiple of four is truncated data — an image that would render broken.
  if (m[2].length % 4 !== 0) fail(`${field} did not arrive complete. Try again.`);
  return v;
}

const visitor = (v, i) => {
  const o = isPlainObject(v) ? v : {};
  const label = `Visitor ${i + 1}`;
  return {
    name: str(o.name, {field: `${label} name`}),
    sex: str(o.sex, {field: `${label} sex`, max: 16}),
    age: str(o.age, {field: `${label} age`, max: 3}),
    nationality: str(o.nationality, {field: `${label} nationality`, max: 64}),
    id_proof_type: str(o.id_proof_type, {field: `${label} ID proof type`, max: 64}),
    id_proof_no: str(o.id_proof_no, {field: `${label} ID proof number`, max: 128}),
    address: str(o.address, {field: `${label} address`, max: LIMITS.longText}),
  };
};

const vehicle = (v, i) => {
  const o = isPlainObject(v) ? v : {};
  const label = `Vehicle ${i + 1}`;
  return {
    regn_no: str(o.regn_no, {field: `${label} registration no.`, max: 64}),
    vehicle_type: str(o.vehicle_type, {field: `${label} type`, max: 64}),
    driver_name: str(o.driver_name, {field: `${label} driver name`}),
    cdl_no: str(o.cdl_no, {field: `${label} CDL no.`, max: 64}),
    purpose: str(o.purpose, {field: `${label} purpose`}),
  };
};

const escort = (v, i) => {
  const o = isPlainObject(v) ? v : {};
  const label = `Escort ${i + 1}`;
  return {
    name: str(o.name, {field: `${label} name`}),
    rank_desig: str(o.rank_desig, {field: `${label} rank`, max: 128}),
    p_no: str(o.p_no, {field: `${label} P. No`, max: 64}),
    i_card_no: str(o.i_card_no, {field: `${label} I-Card No.`, max: 64}),
    dept: str(o.dept, {field: `${label} dept`, max: 128}),
    mob_no: str(o.mob_no, {field: `${label} mobile no.`, max: 32}),
    signed: o.signed ? 1 : 0,
  };
};

const rows = (value, make, {field, max}) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${field} must be a list.`);
  if (value.length > max) fail(`At most ${max} ${field.toLowerCase()} are allowed.`);
  return value.map(make);
};

/**
 * The same rules the form enforces, applied again on this side — the form can
 * be bypassed, the database cannot.
 */
export function requisition(value, {maxVisitors, maxVehicles, maxEscorts, isAdmin}) {
  const r = isPlainObject(value) ? value : fail('Requisition data is missing.');

  const out = {
    id: str(r.id, {field: 'Record id', max: 64}),
    department: str(r.department, {field: 'Department / Squadron', required: true}),
    visit_date: dateStr(r.visit_date, {field: 'Date of visit'}),
    time_from: timeStr(r.time_from, {field: 'Time from'}),
    time_to: timeStr(r.time_to, {field: 'Time to'}),
    purpose: str(r.purpose, {field: 'Purpose', max: LIMITS.longText, required: true}),
    place_of_visit: str(r.place_of_visit, {field: 'Place of visit'}),
    file_no: str(r.file_no, {field: 'File no.', max: 64}),
    requisition_date: dateStr(r.requisition_date, {field: 'Requisition date'}),
    requested_by_rank_name: str(r.requested_by_rank_name, {field: 'Rank & name'}),
    status: r.status === undefined || r.status === ''
      ? 'draft'
      : oneOf(r.status, STATUSES, {field: 'Status'}),
    created_by: str(r.created_by, {field: 'Created by', max: 64}),
    /*
     * One photograph for the pass, whichever visitor it is of — not one per
     * visitor. It is the requisition's, because that is what a pass is for.
     */
    photo: photo(r.photo, {field: 'Photograph'}),
    visitors: rows(r.visitors, visitor, {field: 'Visitors', max: maxVisitors}),
    vehicles: rows(r.vehicles, vehicle, {field: 'Vehicles', max: maxVehicles}),
    escorts: rows(r.escorts, escort, {field: 'Escorts', max: maxEscorts}),
  };

  if (!out.visit_date) fail('Date of visit is required.');
  if (out.time_from && out.time_to) {
    const mins = s => {
      const d = s.replace(':', '').padStart(4, '0');
      return Number(d.slice(0, 2)) * 60 + Number(d.slice(2));
    };
    if (mins(out.time_to) <= mins(out.time_from))
      fail('Time to must be later than time from.');
  }

  out.visitors = out.visitors.filter(v => v.name);
  if (!out.visitors.length) fail('At least one visitor name is required.');
  out.visitors.forEach((v, i) => {
    if (!v.id_proof_no) fail(`Visitor ${i + 1} (${v.name}): ID proof number is required.`);
  });

  // Only the Security Office may fill the pass block, whatever the page sends.
  const office = {
    security_remarks: str(r.security_remarks, {field: 'Security remarks', max: LIMITS.longText}),
    security_signature: str(r.security_signature, {field: 'Security signature'}),
    pass_no: str(r.pass_no, {field: 'Pass no.', max: 64}),
    pass_issued_at: timeStr(r.pass_issued_at, {field: 'Pass issued at'}),
    pass_issued_on: dateStr(r.pass_issued_on, {field: 'Pass issued on'}),
    pass_signed_by: str(r.pass_signed_by, {field: 'Pass signed by'}),
  };
  return isAdmin
    ? {...out, ...office}
    : {...out, security_remarks: '', security_signature: '', pass_no: '',
       pass_issued_at: '', pass_issued_on: '', pass_signed_by: ''};
}
