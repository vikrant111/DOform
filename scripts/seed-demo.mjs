/**
 * Fills the configured database with example requisitions so the dashboard and
 * records list have something to show. Never run against real data.
 *
 *   npm run seed-demo
 */
import {homedir} from 'node:os';
import {join} from 'node:path';
import * as db from '../electron/db.js';

// Matches Electron's app.getPath('userData') for this product name.
const USER_DATA = {
  darwin: join(homedir(), 'Library', 'Application Support', 'CVP Requisition'),
  win32: join(process.env.APPDATA ?? homedir(), 'CVP Requisition'),
}[process.platform] ?? join(homedir(), '.config', 'CVP Requisition');

await db.init({dataDir: USER_DATA});
console.log('seeding', db.engineName(), '->', db.describeDb());

const DEPTS = ['Air Engineering Dept', 'Logistics', 'Security Section', 'Medical', 'Works Dept'];
const PURPOSES = ['Routine servicing of ground-support equipment', 'Stores delivery',
  'AC plant maintenance', 'Annual fire-safety audit', 'Civil works survey'];
const NAMES = ['Rahul Kumar', 'S Meena', 'T Ravi', 'A Fernandes', 'P Nayak', 'D Barman',
  'K Iyer', 'M Hussain', 'J Lakra', 'V Rao'];
const STATUS = ['draft', 'submitted', 'approved', 'issued', 'issued', 'rejected'];

const pick = a => a[Math.floor(Math.random() * a.length)];
const pad = n => String(n).padStart(2, '0');
const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let made = 0;
for (let i = 0; i < 46; i++) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() ** 1.6 * 28));
  const nVisitors = 1 + Math.floor(Math.random() * 4);
  await db.saveFull({
    id: '', department: pick(DEPTS), visit_date: localIso(d),
    time_from: pick(['0830', '0930', '1030', '1400']),
    time_to: pick(['1230', '1700', '1730', '1800']),
    purpose: pick(PURPOSES), place_of_visit: pick(['Hangar 2', 'Main Stores', 'MT Park', 'Admin Block']),
    file_no: `UTK/SEC/CVP/2026/${100 + i}`, requisition_date: localIso(d),
    requested_by_rank_name: pick(['Lt Cdr A Singh', 'Cdr R Menon', 'Lt P Das']),
    security_remarks: '', security_signature: '',
    pass_no: Math.random() > 0.4 ? `CVP-2026-${String(100 + i).padStart(4, '0')}` : '',
    pass_issued_at: '', pass_issued_on: '', pass_signed_by: '',
    status: pick(STATUS), created_by: 'seed',
    visitors: Array.from({length: nVisitors}, () => ({
      name: pick(NAMES), sex: pick(['M', 'F']), age: String(22 + Math.floor(Math.random() * 35)),
      nationality: 'Indian', id_proof_type: pick(['Aadhaar', 'PAN', 'Driving Licence']),
      id_proof_no: Math.random().toString(36).slice(2, 12).toUpperCase(),
      address: 'Sunrise Engg Works, Plot 14, MIDC, Port Blair',
    })),
    vehicles: Math.random() > 0.55 ? [{
      regn_no: `AN01 ${pick(['AB', 'CD', 'EF'])} ${1000 + Math.floor(Math.random() * 8999)}`,
      vehicle_type: pick(['Tempo Traveller', 'Pick-up', 'Car']), driver_name: pick(NAMES),
      cdl_no: 'AN0120190099', purpose: 'Carrying tools and spares',
    }] : [],
    escorts: [{name: pick(NAMES), rank_desig: pick(['PO (AE)', 'LS (SEC)', 'CPO']),
      p_no: String(200000 + Math.floor(Math.random() * 99999)), i_card_no: 'IC-9981',
      dept: 'AED', mob_no: '9876543210', signed: 1}],
  });
  made++;
}
const s = await db.stats({});
console.log(`seeded ${made} requisitions -> ${s.total} total, ${s.visitors} visitors, ${s.vehicles} vehicles`);
await db.closePool();
