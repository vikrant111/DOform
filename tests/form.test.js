import assert from 'node:assert/strict';
import test from 'node:test';
import {blankRequisition, validate} from '../renderer/validate.js';

const ok = {
  department: 'AED', visit_date: '2026-10-09', purpose: 'Servicing',
  time_from: '0930', time_to: '1730',
  visitors: [{name: 'R Kumar', id_proof_no: 'X1'}],
};

test('a complete requisition passes', () => {
  assert.deepEqual(validate(ok), []);
});

test('missing required fields are each reported', () => {
  const errs = validate({...ok, department: '  ', purpose: '', visit_date: ''});
  assert.equal(errs.length, 3);
});

test('a visitor without an ID proof number is rejected', () => {
  assert.ok(validate({...ok, visitors: [{name: 'R Kumar', id_proof_no: ' '}]})
    .some(e => e.includes('ID proof number')));
});

test('unnamed visitors do not count as visitors', () => {
  assert.ok(validate({...ok, visitors: [{name: '  ', id_proof_no: 'X1'}]})
    .some(e => e.includes('At least one visitor')));
});

test('times must be valid 24-hour and in order', () => {
  assert.ok(validate({...ok, time_from: '2560'}).some(e => e.includes('24-hour')));
  assert.ok(validate({...ok, time_from: '1730', time_to: '0930'}).some(e => e.includes('later than')));
  assert.deepEqual(validate({...ok, time_from: '09:30', time_to: '17:30'}), []);
  // 0930–0930 is a zero-length visit, not a valid window.
  assert.ok(validate({...ok, time_from: '0930', time_to: '0930'}).some(e => e.includes('later than')));
});

test('a blank requisition starts with one visitor and today as the date', () => {
  const f = blankRequisition('u1');
  assert.equal(f.visitors.length, 1);
  assert.equal(f.status, 'draft');
  assert.match(f.requisition_date, /^\d{4}-\d{2}-\d{2}$/);
});

test('today() uses the local calendar date, not UTC', async () => {
  const {today} = await import('../renderer/validate.js');
  assert.equal(today(new Date(2026, 9, 8, 0, 30)), '2026-10-08');
  assert.equal(today(new Date(2026, 9, 8, 23, 45)), '2026-10-08');
});
