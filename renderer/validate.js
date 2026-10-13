/** Shared by the form screen and the test suite — no DOM, no Node. */

export const STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'issued'];

const TIME = /^([01]?\d|2[0-3]):?[0-5]\d$/;
const minutes = s => {
  const d = String(s).replace(':', '').padStart(4, '0');
  return Number(d.slice(0, 2)) * 60 + Number(d.slice(2));
};

export const blankVisitor = () => ({
  name: '', sex: '', age: '', nationality: 'Indian',
  id_proof_type: '', id_proof_no: '', address: '',
});
export const blankVehicle = () => ({
  regn_no: '', vehicle_type: '', driver_name: '', cdl_no: '', purpose: '',
});
export const blankEscort = () => ({
  name: '', rank_desig: '', p_no: '', i_card_no: '', dept: '', mob_no: '', signed: 0,
});

// Local calendar date — toISOString() is UTC and reports yesterday in IST.
export const today = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function blankRequisition(userId) {
  return {
    id: '', department: '', visit_date: '', time_from: '', time_to: '',
    purpose: '', place_of_visit: '', file_no: '', requisition_date: today(),
    requested_by_rank_name: '', security_remarks: '', security_signature: '',
    pass_no: '', pass_issued_at: '', pass_issued_on: '', pass_signed_by: '',
    status: 'draft', created_by: userId,
    visitors: [blankVisitor()], vehicles: [], escorts: [],
  };
}

const t = v => String(v ?? '').trim();

export function validate(f) {
  const errs = [];
  if (!t(f.department)) errs.push('Department / Squadron is required.');
  if (!t(f.visit_date)) errs.push('Date of visit is required.');
  if (!t(f.purpose)) errs.push('Purpose of visit is required.');

  const named = (f.visitors ?? []).filter(v => t(v.name));
  if (!named.length) errs.push('At least one visitor name is required.');
  named.forEach((v, i) => {
    if (!t(v.id_proof_no))
      errs.push(`Visitor ${i + 1} (${t(v.name)}): ID proof number is required.`);
  });

  for (const [label, value] of [['Time from', f.time_from], ['Time to', f.time_to]]) {
    if (t(value) && !TIME.test(t(value)))
      errs.push(`${label} "${value}" is not a valid 24-hour time (e.g. 0930 or 09:30).`);
  }
  if (TIME.test(t(f.time_from)) && TIME.test(t(f.time_to))
      && minutes(f.time_to) <= minutes(f.time_from)) {
    errs.push('Time to must be later than time from.');
  }
  return errs;
}

// ── field-level rules, used for live checking while the form is filled ──
const isRealDate = s => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

export const rules = {
  required: label => v => (t(v) ? null : `${label} is required.`),

  date: label => v => {
    const s = t(v);
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${label} must be a date (YYYY-MM-DD).`;
    if (!isRealDate(s)) return `${label} is not a real date.`;
    const year = Number(s.slice(0, 4));
    if (year < 1900 || year > 2200) return `${label} is outside a sensible range.`;
    return null;
  },

  requiredDate: label => v => rules.required(label)(v) ?? rules.date(label)(v),

  time: label => v => {
    const s = t(v);
    if (!s) return null;
    return TIME.test(s) ? null : `${label} must be a 24-hour time, such as 0930 or 09:30.`;
  },

  age: v => {
    const s = t(v);
    if (!s) return null;
    return /^\d{1,3}$/.test(s) && Number(s) >= 1 && Number(s) <= 120
      ? null : 'Age must be a whole number between 1 and 120.';
  },

  mobile: v => {
    const s = t(v);
    if (!s) return null;
    if (!/^[0-9+][0-9 +\-()]{5,19}$/.test(s)) return 'Use digits, spaces, + or - only.';
    return (s.match(/\d/g) ?? []).length >= 6 ? null : 'That is too short for a phone number.';
  },

  maxLen: (label, n) => v =>
    (t(v).length <= n ? null : `${label} must be ${n} characters or fewer.`),

  /** Both rules in order: the first message wins. */
  all: (...fns) => v => fns.reduce((msg, fn) => msg ?? fn(v), null),
};

/** The visit window, which only makes sense when both ends are present. */
export const timeOrderError = (from, to) => {
  if (!TIME.test(t(from)) || !TIME.test(t(to))) return null;
  return minutes(to) > minutes(from) ? null : 'Must be later than the "time from".';
};
