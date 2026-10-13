import assert from 'node:assert/strict';
import test from 'node:test';
import {toCsv, toHtml} from '../electron/export.js';

const base = {
  id: 'r1', department: 'Air Engg', visit_date: '2026-10-09',
  time_from: '0930', time_to: '1730', purpose: 'Servicing, urgent',
  place_of_visit: 'Hangar 2', file_no: 'F/01', requisition_date: '2026-10-07',
  requested_by_rank_name: 'Lt Cdr A Singh', security_remarks: '', security_signature: '',
  pass_no: 'CVP-9', pass_issued_at: '0925', pass_issued_on: '2026-10-09',
  pass_signed_by: '', status: 'issued', created_by: 'u1',
  created_at: '2026-10-07 10:00:00', updated_at: '2026-10-07 10:00:00',
  visitors: [
    {ser: 1, name: 'Rahul "RK" Kumar', sex: 'M', age: '34', nationality: 'Indian',
     id_proof_type: 'Aadhaar', id_proof_no: '1234', address: 'Line1\nLine2'},
  ],
  vehicles: [
    {regn_no: 'MH01AB1234', vehicle_type: 'Van', driver_name: 'S Das', cdl_no: 'DL9', purpose: 'Tools'},
    {regn_no: 'MH02CD5678', vehicle_type: 'Car', driver_name: '', cdl_no: '', purpose: ''},
  ],
  escorts: [],
};

test('CSV quotes delimiters, quotes and newlines', () => {
  const csv = toCsv([base]);
  assert.ok(csv.startsWith('﻿'), 'needs a BOM so Excel reads UTF-8');
  assert.ok(csv.includes('"Servicing, urgent"'), 'comma must be quoted');
  assert.ok(csv.includes('"Rahul ""RK"" Kumar"'), 'quotes must be doubled');
  assert.ok(csv.includes('"Line1\nLine2"'), 'newline must be quoted');
});

test('CSV emits a row per visitor and never drops extra vehicles', () => {
  const body = toCsv([base]).trim().split('\r\n').slice(1);
  assert.equal(body.length, 2, '1 visitor but 2 vehicles — both vehicles need a row');
  assert.ok(body[0].includes('MH01AB1234'));
  assert.ok(body[1].includes('MH02CD5678'));
});

test('CSV respects a non-comma delimiter', () => {
  const csv = toCsv([base], ';');
  assert.ok(csv.includes('"Servicing, urgent"') === false, 'a comma is plain text when ; separates');
  assert.ok(csv.split('\r\n')[0].includes('Pass No;File No'));
});

test('CSV of an empty selection is headers only', () => {
  assert.equal(toCsv([]).trim().split('\r\n').length, 1);
});

test('HTML escapes injected markup', () => {
  const html = toHtml([{...base, purpose: '<script>alert(1)</script>'}], 'form');
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('HTML prints one page per requisition, one page for a summary', () => {
  const two = [base, {...base, id: 'r2'}];
  assert.equal((toHtml(two, 'form').match(/class="sheet"/g) ?? []).length, 2);
  assert.equal((toHtml(two, 'summary').match(/class="sheet"/g) ?? []).length, 1);
});

test('blank visitor rows stay ruled, so a sheet can be filled by hand', () => {
  const html = toHtml([{...base, visitors: []}], 'form');
  assert.equal((html.match(/<td class="ser">/g) ?? []).length, 10);
});
