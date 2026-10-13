import {CFG} from './config.js';

// ── CSV ──────────────────────────────────────────────────────
const cell = (v, d) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /["\n\r]|^\s|\s$/.test(s) || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s;
};

const HEADERS = [
  'Pass No', 'File No', 'Status', 'Department/Squadron', 'Date of Visit',
  'Time From', 'Time To', 'Purpose', 'Place of Visit',
  'Visitor Ser', 'Visitor Name', 'Sex', 'Age', 'Nationality',
  'ID Proof Type', 'ID Proof No', 'Address',
  'Vehicle Regn No', 'Vehicle Type', 'Driver Name', 'CDL No', 'Vehicle Purpose',
  'Escort Name', 'Escort Rank/Desig', 'Escort P.No', 'Escort I-Card No',
  'Escort Dept', 'Escort Mob No',
  'Requested By', 'Requisition Date',
  'Pass Issued At', 'Pass Issued On', 'Pass Signed By', 'Created At',
];

/**
 * One row per visitor, so the file drops straight into a pivot table.
 * Vehicles and escorts ride along positionally; a requisition with more
 * vehicles than visitors still emits every vehicle.
 */
export function toCsv(reqs, delimiter = CFG.csvDelimiter) {
  const join = cells => cells.map(c => cell(c, delimiter)).join(delimiter);
  const lines = [join(HEADERS)];
  for (const r of reqs) {
    const n = Math.max(1, r.visitors?.length ?? 0, r.vehicles?.length ?? 0, r.escorts?.length ?? 0);
    for (let i = 0; i < n; i++) {
      const v = r.visitors?.[i];
      const c = r.vehicles?.[i];
      const e = r.escorts?.[i];
      lines.push(join([
        r.pass_no, r.file_no, r.status, r.department, r.visit_date,
        r.time_from, r.time_to, r.purpose, r.place_of_visit,
        v ? v.ser : '', v?.name ?? '', v?.sex ?? '', v?.age ?? '', v?.nationality ?? '',
        v?.id_proof_type ?? '', v?.id_proof_no ?? '', v?.address ?? '',
        c?.regn_no ?? '', c?.vehicle_type ?? '', c?.driver_name ?? '', c?.cdl_no ?? '', c?.purpose ?? '',
        e?.name ?? '', e?.rank_desig ?? '', e?.p_no ?? '', e?.i_card_no ?? '',
        e?.dept ?? '', e?.mob_no ?? '',
        r.requested_by_rank_name, r.requisition_date,
        r.pass_issued_at, r.pass_issued_on, r.pass_signed_by, r.created_at,
      ]));
    }
  }
  // BOM so Excel reads UTF-8 (and the Devanagari motto) correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// ── pass number ──────────────────────────────────────────────
/**
 * CVP/UTK/<service no>/<DDMMYYYY>/<HHMMSS>, plus the same moment as the pass's
 * "at … Hrs on (Date)". Local time, since the pass is read against the wall clock.
 */
export function issuePass(serviceNo, now = new Date()) {
  const p = n => String(n).padStart(2, '0');
  const [dd, mm, yyyy] = [p(now.getDate()), p(now.getMonth() + 1), now.getFullYear()];
  const [hh, mi, ss] = [p(now.getHours()), p(now.getMinutes()), p(now.getSeconds())];
  return {
    // ponytail: seconds keep two passes by one person in the same minute apart
    pass_no: [CFG.passNoPrefix, String(serviceNo ?? '').trim() || 'NA', `${dd}${mm}${yyyy}`, `${hh}${mi}${ss}`].join('/'),
    pass_issued_at: `${hh}${mi}`,
    pass_issued_on: `${yyyy}-${mm}-${dd}`,
  };
}

/** A pass this app generated, as opposed to an old hand-typed one. */
export const isIssuedPass = r =>
  String(r?.pass_no ?? '').startsWith(CFG.passNoPrefix + '/') && !!r.pass_issued_on && !!r.pass_issued_at;

/**
 * The pass a record should be given when it is printed, or `null` when it
 * already has one and must keep it.
 *
 * Split out from the printing itself so the decision can be tested without an
 * Electron window or a database — the writing is one line in `main.js`, the
 * judgement is here.
 *
 * `null` for an already-issued pass is what makes a reprint show the same
 * number. A pass number that changed every time it was printed would be worse
 * than a blank one: two papers, same visitor, different numbers at the gate.
 */
export const passOnPrint = (r, now = new Date()) =>
  isIssuedPass(r) ? null : issuePass(r?.created_by_service, now);

// ── printable HTML ───────────────────────────────────────────
const esc = v =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Blank fields print as a ruled line, so a sheet stays fillable by hand. */
const fill = (v, width = 140) =>
  String(v ?? '').trim()
    ? `<span class="fv">${esc(v)}</span>`
    : `<span class="fb" style="min-width:${width}px"></span>`;

const CSS = `
  @page { size: A4; margin: 11mm 10mm; }
  * { box-sizing: border-box; }
  /* Tuned so one requisition is exactly one A4 page, as on the paper form. */
  body { font-family: "Times New Roman", Georgia, serif; font-size: 10pt;
         line-height: 1.32; color: #000; margin: 0; }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  h1 { font-size: 11.5pt; text-align: center; margin: 0 0 1px; letter-spacing: .2px; }
  h2 { font-size: 10pt; text-align: center; margin: 0 0 9px; font-weight: 700; }
  ol.main { margin: 0; padding-left: 18px; }
  ol.main > li { margin-bottom: 7px; }
  .sec-title { font-weight: 700; }
  .fv { border-bottom: 1px solid #000; padding: 0 4px; display: inline-block; min-width: 60px; }
  .fb { border-bottom: 1px solid #000; display: inline-block; height: 1.05em; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #000; padding: 2px 4px; font-size: 8pt;
           line-height: 1.25; vertical-align: top; }
  th { font-weight: 700; text-align: left; background: #f2f2f2; }
  td.ser { width: 26px; text-align: center; }
  /*
   * The visitor photograph, passport size (35 × 45 mm), top left where one is
   * pasted on the paper form. It sits in a flex row with the heading, the
   * department line and section 1, so those keep their own alignment and the
   * "1." stays visible; the visitor table below runs the full width. The
   * heading is padded on the right by the photo's width so it stays centred
   * on the page. object-fit crops rather than stretching a face, and
   * print-color-adjust stops a printer driver economising on ink and dropping it.
   */
  .intro { display: flex; gap: 12px; align-items: flex-start; }
  .intro-body { flex: 1; min-width: 0; }
  .intro.has-photo h1, .intro.has-photo h2 { padding-right: calc(35mm + 12px); }
  .passphoto { flex: none; width: 35mm; margin: 0; text-align: center; }
  .passphoto img { width: 35mm; height: 45mm; object-fit: cover; display: block;
                   border: 1px solid #000;
                   -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .passphoto figcaption { font-size: 8pt; line-height: 1.2; margin-top: 2px;
                          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .office { border-top: 1px solid #000; margin-top: 9px; padding-top: 6px; }
  .office h3 { text-align: center; font-size: 10pt; margin: 0 0 7px; }
  .office p { margin: 0; }
  .note { margin-top: 9px; font-size: 8.5pt; }
  .motto { text-align: center; font-weight: 700; margin-top: 8px; font-size: 10pt;
           font-family: system-ui, "Nirmala UI", sans-serif; }
  .meta { text-align: right; font-size: 8pt; color: #555; margin-bottom: 2px; }
  table.summary th, table.summary td { font-size: 9pt; padding: 3px 4px; }
  table.summary { margin-top: 10px; }
`;

/** A row counts as data when any of its own fields has text in it. */
const KEYS = new Set(['id', 'requisition_id', 'ser', 'signed']);
const filled = items => (items ?? []).filter(row =>
  Object.entries(row ?? {}).some(([k, v]) => !KEYS.has(k) && String(v ?? '').trim()));

/**
 * The one photograph a pass carries.
 *
 * **One, not one per visitor.** A pass is for a visit and takes a single
 * picture, so it belongs to the requisition — a column of them beside five
 * names would be four empty boxes and a narrower table.
 *
 * The `src` is re-checked here rather than trusted from the record, because
 * this string goes into an attribute on a page the app renders. A record
 * written by an older version, or edited in the database by hand, must not be
 * able to put anything else there.
 */
const hasPhoto = r => PRINTABLE_PHOTO.test(String(r?.photo ?? '').trim());

const passPhoto = r => {
  const src = String(r?.photo ?? '').trim();
  if (!hasPhoto(r)) return '';
  const name = String((r?.visitors ?? []).find(v => String(v?.name ?? '').trim())?.name ?? '').trim();
  return `<figure class="passphoto">
            <img src="${esc(src)}" alt="${esc(name ? `Photograph of ${name}` : 'Visitor photograph')}" />
            <figcaption>${esc(name || 'Visitor')}</figcaption>
          </figure>`;
};

/** The same shape `guards.photo` admits: a base64 PNG, JPEG or WebP and nothing else. */
const PRINTABLE_PHOTO = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Only the rows actually entered are printed; an empty section says Nil. */
const rowsOrNil = (items, head, row) => items.length
  ? `<table><thead><tr>${head}</tr></thead><tbody>${items.map(row).join('')}</tbody></table>`
  : ' Nil';

function sheet(r) {
  const visitors = (r.visitors ?? []).filter(v => String(v?.name ?? '').trim());
  const vehicles = filled(r.vehicles);
  const escorts = filled(r.escorts);

  return `
  <div class="sheet">
    <div class="meta">${esc(String(r.status ?? '').toUpperCase())}${r.pass_no ? ' · Pass No ' + esc(r.pass_no) : ''}</div>
    <div class="intro${hasPhoto(r) ? ' has-photo' : ''}">
      ${passPhoto(r)}
      <div class="intro-body">
        <h1>${esc(CFG.formTitle)}</h1>
        <h2>${esc(CFG.unitName)}</h2>

        <div class="dept"><span class="sec-title">Departments/ Squadron/ Unit</span> ${fill(r.department, 260)}</div>

        <ol class="main">
          <li>
            Date of Visit ${fill(r.visit_date, 120)}
            &nbsp; Time of visit from ${fill(r.time_from, 70)}
            To ${fill(r.time_to, 70)} Hrs<br/>
            Purpose ${fill(r.purpose, 420)}<br/>
            Place of visit ${fill(r.place_of_visit, 400)}
          </li>
        </ol>
      </div>
    </div>

    <ol class="main" start="2">

      <li>
        <span class="sec-title">Details of Visitors: -</span>
        ${rowsOrNil(visitors, `
            <th class="ser">Ser</th><th>Name</th><th>Sex/Age</th><th>Nationality</th>
            <th>ID Proof No. &amp; details</th><th>Full address of firm/ company/ visitors</th>`, (v, i) => `<tr>
              <td class="ser">${i + 1}.</td>
              <td>${esc(v?.name ?? '')}</td>
              <td>${esc([v?.sex, v?.age].filter(Boolean).join('/'))}</td>
              <td>${esc(v?.nationality ?? '')}</td>
              <td>${esc([v?.id_proof_type, v?.id_proof_no].filter(Boolean).join(' – '))}</td>
              <td>${esc(v?.address ?? '')}</td>
            </tr>`)}
      </li>

      <li>
        <span class="sec-title">Details of Vehicle (if any): -</span>
        ${rowsOrNil(vehicles, `
            <th>Regn No.</th><th>Type of Vehicle</th><th>Driver Name</th>
            <th>CDL No.</th><th>Purpose to bring inside</th>`, v => `<tr>
              <td>${esc(v?.regn_no ?? '')}</td><td>${esc(v?.vehicle_type ?? '')}</td>
              <td>${esc(v?.driver_name ?? '')}</td><td>${esc(v?.cdl_no ?? '')}</td>
              <td>${esc(v?.purpose ?? '')}</td>
            </tr>`)}
      </li>

      <li>
        <span class="sec-title">Details of Escort: -</span>
        ${rowsOrNil(escorts, `
            <th>Name</th><th>Rank/Desig</th><th>P. No</th><th>I Card No.</th>
            <th>Dept</th><th>Mob No.</th><th>Sign</th>`, e => `<tr>
              <td>${esc(e?.name ?? '')}</td><td>${esc(e?.rank_desig ?? '')}</td>
              <td>${esc(e?.p_no ?? '')}</td><td>${esc(e?.i_card_no ?? '')}</td>
              <td>${esc(e?.dept ?? '')}</td><td>${esc(e?.mob_no ?? '')}</td>
              <td>${e?.signed ? '✓' : ''}</td>
            </tr>`)}
      </li>
    </ol>

    <div class="office">
      <h3>For use of Security Office</h3>
      <p>Pass No. ${fill(r.pass_no, 130)} at ${fill(r.pass_issued_at, 80)}
         Hrs on (Date) ${fill(r.pass_issued_on, 150)}</p>
      <p style="margin-top:16px">Sign ${fill(r.pass_signed_by, 180)}<br/>
         <span style="padding-left:34px">(MAA SEC/ DCOP/ Duty Chief)</span></p>
    </div>

    ${CFG.formFooterNote ? `<p class="note">${esc(CFG.formFooterNote)}</p>` : ''}
    ${CFG.unitMotto ? `<div class="motto">${esc(CFG.unitMotto)}</div>` : ''}
  </div>`;
}

function summary(reqs) {
  const head = ['Pass No', 'File No', 'Date', 'From–To', 'Department', 'Purpose',
                'Place', 'Visitors', 'Vehicles', 'Status'];
  /* A table of many records, so no one photograph belongs on it. */
  return `
  <div class="sheet">
    <h1>${esc(CFG.formTitle)} — Summary</h1>
    <h2>${esc(CFG.unitName)} · ${reqs.length} record(s) · ${new Date().toLocaleString()}</h2>
    <table class="summary">
      <thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${reqs.map(r => `<tr>
          <td>${esc(r.pass_no)}</td><td>${esc(r.file_no)}</td>
          <td>${esc(r.visit_date ?? '')}</td>
          <td>${esc([r.time_from, r.time_to].filter(Boolean).join('–'))}</td>
          <td>${esc(r.department)}</td><td>${esc(r.purpose)}</td>
          <td>${esc(r.place_of_visit)}</td>
          <td>${esc((r.visitors ?? []).map(v => v.name).filter(Boolean).join(', '))}</td>
          <td>${esc((r.vehicles ?? []).map(v => v.regn_no).filter(Boolean).join(', '))}</td>
          <td>${esc(r.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

export function toHtml(reqs, mode = 'form') {
  const body = mode === 'summary' ? summary(reqs) : reqs.map(sheet).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(CFG.unitName)} — CVP</title><style>${CSS}</style></head>
<body>${body}</body></html>`;
}
