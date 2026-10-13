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
  'Requested By', 'Requisition Date', 'Security Remarks',
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
        r.requested_by_rank_name, r.requisition_date, r.security_remarks,
        r.pass_issued_at, r.pass_issued_on, r.pass_signed_by, r.created_at,
      ]));
    }
  }
  // BOM so Excel reads UTF-8 (and the Devanagari motto) correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

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
  .sig { display: flex; justify-content: space-between; margin-top: 10px; gap: 36px; }
  .sig > div { flex: 1; }
  .sig p { margin: 0 0 7px; }
  .fwd { margin-top: 10px; }
  .fwd p { margin: 0; }
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

const padTo = (items, min) => {
  const out = [...(items ?? [])];
  while (out.length < min) out.push(null);
  return out;
};

function sheet(r) {
  const visitors = padTo(r.visitors, Math.min(CFG.maxVisitors, 10));
  const vehicles = padTo(r.vehicles, 1);
  const escorts = padTo(r.escorts, 1);

  return `
  <div class="sheet">
    <div class="meta">${esc(String(r.status ?? '').toUpperCase())}${r.pass_no ? ' · Pass No ' + esc(r.pass_no) : ''}</div>
    <h1>${esc(CFG.formTitle)}</h1>
    <h2>${esc(CFG.unitName)}</h2>

    <div><span class="sec-title">Departments/ Squadron</span> ${fill(r.department, 260)}</div>

    <ol class="main">
      <li>
        The under mentioned personnel are required to visit this department/ Sqdn.<br/>
        Date of Visit ${fill(r.visit_date, 120)}
        &nbsp; Time of visit from ${fill(r.time_from, 70)}
        To ${fill(r.time_to, 70)} Hrs<br/>
        Purpose ${fill(r.purpose, 420)}<br/>
        Place of visit ${fill(r.place_of_visit, 400)}
      </li>

      <li>
        <span class="sec-title">Details of Visitors: -</span>
        <table>
          <thead><tr>
            <th class="ser">Ser</th><th>Name</th><th>Sex/Age</th><th>Nationality</th>
            <th>ID Proof No. &amp; details</th><th>Full address of firm/ company/ visitors</th>
          </tr></thead>
          <tbody>
            ${visitors.map((v, i) => `<tr>
              <td class="ser">${i + 1}.</td>
              <td>${esc(v?.name ?? '')}</td>
              <td>${esc([v?.sex, v?.age].filter(Boolean).join('/'))}</td>
              <td>${esc(v?.nationality ?? '')}</td>
              <td>${esc([v?.id_proof_type, v?.id_proof_no].filter(Boolean).join(' – '))}</td>
              <td>${esc(v?.address ?? '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </li>

      <li>
        <span class="sec-title">Details of Vehicle (if any): -</span>
        <table>
          <thead><tr>
            <th>Regn No.</th><th>Type of Vehicle</th><th>Driver Name</th>
            <th>CDL No.</th><th>Purpose to bring inside</th>
          </tr></thead>
          <tbody>
            ${vehicles.map(v => `<tr>
              <td>${esc(v?.regn_no ?? '')}</td><td>${esc(v?.vehicle_type ?? '')}</td>
              <td>${esc(v?.driver_name ?? '')}</td><td>${esc(v?.cdl_no ?? '')}</td>
              <td>${esc(v?.purpose ?? '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </li>

      <li>
        <span class="sec-title">Details of Escort: -</span>
        <table>
          <thead><tr>
            <th>Name</th><th>Rank/Desig</th><th>P. No</th><th>I Card No.</th>
            <th>Dept</th><th>Mob No.</th><th>Sign</th>
          </tr></thead>
          <tbody>
            ${escorts.map(e => `<tr>
              <td>${esc(e?.name ?? '')}</td><td>${esc(e?.rank_desig ?? '')}</td>
              <td>${esc(e?.p_no ?? '')}</td><td>${esc(e?.i_card_no ?? '')}</td>
              <td>${esc(e?.dept ?? '')}</td><td>${esc(e?.mob_no ?? '')}</td>
              <td>${e?.signed ? '✓' : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </li>

      <li>
        It is requested that casual visitors pass may be issued to the above-mentioned visitors.
        <div class="sig">
          <div>
            <p>File No. ${fill(r.file_no, 130)}</p>
            <p>Date ${fill(r.requisition_date, 130)}</p>
          </div>
          <div>
            <p>Signature. ${fill('', 150)}</p>
            <p>Rank &amp; Name ${fill(r.requested_by_rank_name, 150)}</p>
          </div>
        </div>
      </li>
    </ol>

    <div class="fwd">
      <p style="margin:0 0 4px"><b>Forwarded to:-</b></p>
      <p style="margin:0">${esc(CFG.securityOfficeLabel)}</p>
      <p style="margin:10px 0 0">
        Remarks of Security Officer/ OOD: ${fill(r.security_remarks, 230)}
        Signature ${fill(r.security_signature, 140)}
      </p>
    </div>

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
