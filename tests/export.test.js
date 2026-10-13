import assert from 'node:assert/strict';
import test from 'node:test';
import {issuePass, isIssuedPass, passOnPrint, toCsv, toHtml} from '../electron/export.js';

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

test('only entered rows are printed — one visitor prints one row', () => {
  const html = toHtml([{...base, vehicles: [{regn_no: '', vehicle_type: '', driver_name: '',
    cdl_no: '', purpose: ''}]}], 'form');
  assert.equal((html.match(/<td class="ser">/g) ?? []).length, 1);
  assert.equal((html.match(/<table>/g) ?? []).length, 1, 'blank vehicle and no escorts print Nil');
  assert.equal((html.match(/ Nil/g) ?? []).length, 2);
});

test('the requisition line and Forwarded-to block are gone', () => {
  const html = toHtml([base], 'form');
  assert.ok(!html.includes('It is requested'));
  assert.ok(!html.includes('Forwarded to'));
  assert.ok(!html.includes('Remarks of Security Officer'));
  assert.ok(!html.includes('Rank &amp; Name'), 'requesting officer sign-off block is gone');
  assert.ok(!html.includes('Signature.'));
});

test('pass number is CVP/UTK/service/DDMMYYYY/HHMMSS, issue time matches it', () => {
  assert.deepEqual(issuePass('12345A', new Date(2026, 9, 3, 7, 5, 9)), {
    pass_no: 'CVP/UTK/12345A/03102026/070509', pass_issued_at: '0705', pass_issued_on: '2026-10-03'});
  assert.equal(issuePass('', new Date(2026, 0, 1)).pass_no, 'CVP/UTK/NA/01012026/000000');
});

test('old hand-typed pass numbers are not treated as issued', () => {
  assert.equal(isIssuedPass({pass_no: 'CVP-2026-0114', pass_issued_at: '0925', pass_issued_on: '2026-10-09'}), false);
  assert.equal(isIssuedPass(issuePass('12345A')), true);
  assert.equal(isIssuedPass(null), false);
});

test('a pass carries one photograph, whichever visitor it is of', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  const v = name => ({ser: 1, name, sex: 'M', age: '30', nationality: 'Indian',
    id_proof_type: 'PAN', id_proof_no: 'X', address: 'A'});
  const sheet = (photo, names = ['Rahul', 'Meena', 'Das']) =>
    toHtml([{...base, photo, visitors: names.map(v)}], 'form');

  /*
   * One photograph, not one per visitor. It belongs to the requisition, which
   * is what a pass is for — a column of them beside five names is four empty
   * boxes and a narrower table.
   */
  const many = sheet(PNG);
  assert.equal((many.match(/<img/g) ?? []).length, 1, 'exactly one photograph on the sheet');
  assert.ok(many.includes(PNG), 'and it is the one that was taken');
  assert.ok(many.includes('Photograph of Rahul'), 'named for the first visitor, so it is clear who it is of');
  assert.ok(!many.includes('<th class="photo">'), 'no per-visitor photo column');

  /* It sits top left, where one is pasted on the paper form, at passport size. */
  assert.ok(many.indexOf('<figure class="passphoto">') < many.indexOf('<div class="intro-body">'),
    'first in the row, so on the left');
  assert.match(many, /\.passphoto img \{[^}]*width: 35mm; height: 45mm/, 'passport size, not a thumbnail');
  /* Before the heading, so it cannot be pushed off the first page by content. */
  assert.ok(many.indexOf('<figure class="passphoto">') < many.indexOf('<h1>'));

  /*
   * The lines level with it sit in their own column beside it, so they keep
   * their alignment and section 1 keeps its number — absolute positioning
   * with hand-tuned padding hid the "1." under the picture.
   */
  assert.ok(/<div class="intro has-photo">/.test(many), 'the row says it carries one');
  assert.ok(!/position: absolute/.test(many), 'nothing pulled out of the flow');
  const body = many.slice(many.indexOf('<div class="intro-body">'), many.indexOf('<ol class="main" start="2">'));
  assert.ok(body.includes('<div class="dept">') && body.includes('Date of Visit'), 'department and section 1 beside it');
  assert.ok(!body.includes('Details of Visitors'), 'visitor table runs full width below');

  /* No photograph at all is the normal case and draws nothing. */
  const none = sheet('');
  assert.ok(!none.includes('<img'), 'nothing is drawn, and no empty frame');
  assert.ok(!none.includes('<figure'), 'not even an empty figure');
  /* And it does not indent, or every form without a photograph is lopsided. */
  assert.ok(/<div class="intro">/.test(none), 'no photo, no indent');

  /* A requisition with no named visitor still prints its photograph. */
  assert.equal((sheet(PNG, []).match(/<img/g) ?? []).length, 1);

  /*
   * A record written by an older version, or edited in the database by hand,
   * must not be able to put anything else inside that `src`. The guard refuses
   * these on the way in; this is the second place, because a stored row never
   * passed through it.
   */
  for (const bad of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=',
                     'https://example.test/a.png', '" onerror="alert(1)', 'data:image/png;base64,<img>']) {
    const html = sheet(bad);
    assert.ok(!html.includes('<img'), `refused on the sheet: ${bad}`);
    assert.ok(!html.includes('onerror'), `and nothing escaped the attribute: ${bad}`);
  }

  /* The summary sheet is a table of records and carries no photograph. */
  assert.ok(!toHtml([{...base, photo: PNG}], 'summary').includes('<img'));
});

test('printing a record with no issued pass gives it one', () => {
  const when = new Date(2026, 9, 13, 21, 8, 17);

  /*
   * The record from the complaint: a hand-typed number and no issue time, so
   * its pass line printed "at ____ Hrs on (Date) ____" blank — a pass number
   * with no moment attached to it.
   */
  const legacy = {pass_no: 'CVP-2026-0142', pass_issued_at: '', pass_issued_on: '', created_by_service: '12345A'};
  assert.deepEqual(passOnPrint(legacy, when), {
    pass_no: 'CVP/UTK/12345A/13102026/210817', pass_issued_at: '2108', pass_issued_on: '2026-10-13'});

  /* A record that never had a number at all. */
  assert.ok(passOnPrint({created_by_service: '9'}, when).pass_no.startsWith('CVP/UTK/9/'));
  /* And one whose service number is gone — a deleted account. */
  assert.ok(passOnPrint({}, when).pass_no.includes('/NA/'));

  /*
   * An issued pass is kept, which is what makes a reprint show the same number.
   * One that changed per print would be worse than a blank: two papers, same
   * visitor, two numbers at the gate.
   */
  const issued = issuePass('12345A', new Date(2026, 9, 3, 7, 5, 9));
  assert.equal(passOnPrint(issued, when), null);
  assert.equal(passOnPrint({...issued, created_by_service: '12345A'}, when), null);

  /* The line the pass is printed on has both halves filled afterwards. */
  const printed = {...base, ...passOnPrint(legacy, when)};
  const html = toHtml([printed], 'form');
  assert.ok(html.includes('CVP/UTK/12345A/13102026/210817'), 'the number is on the pass line');
  assert.ok(html.includes('2108'), 'the hour is filled in');
  assert.ok(html.includes('2026-10-13'), 'the date is filled in');
  assert.ok(!/at <span class="fill"[^>]*><\/span>/.test(html), 'the time blank is still empty');
});
