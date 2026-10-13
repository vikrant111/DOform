import assert from 'node:assert/strict';
import test from 'node:test';
import {fillDays, iso} from '../renderer/series.js';

const NOW = new Date(2026, 9, 7); // 7 Oct 2026, local time

test('expands a sparse series to the full window', () => {
  const out = fillDays([{day: '2026-10-05', n: 3}], 7, NOW);
  assert.equal(out.length, 7);
  assert.equal(out[0].day, '2026-10-01');
  assert.equal(out.at(-1).day, '2026-10-07');
  assert.equal(out.find(d => d.day === '2026-10-05').n, 3);
  assert.equal(out.filter(d => d.n === 0).length, 6);
});

test('an empty series still yields a full window of zeros', () => {
  const out = fillDays([], 14, NOW);
  assert.equal(out.length, 14);
  assert.ok(out.every(d => d.n === 0));
});

test('days are chronological, never duplicated', () => {
  const out = fillDays([{day: '2026-10-07', n: 2}, {day: '2026-10-06', n: 1}], 5, NOW);
  const days = out.map(d => d.day);
  assert.deepEqual(days, [...days].sort());
  assert.equal(new Set(days).size, days.length);
  assert.equal(out.at(-1).n, 2);
});

test('counts arriving as strings from MySQL become numbers', () => {
  const [d] = fillDays([{day: '2026-10-07', n: '4'}], 1, NOW);
  assert.strictEqual(d.n, 4);
});

test('a visit dated in the future is kept, not dropped', () => {
  const out = fillDays([{day: '2026-10-20', n: 1}], 7, NOW);
  assert.ok(out.some(d => d.day === '2026-10-20'), 'future visit must survive');
  assert.equal(out.length, 7, 'window size is still respected');
});

test('dates are local, not UTC — IST must not report yesterday', () => {
  // 00:30 local on 8 Oct is still 7 Oct in UTC for any zone east of +0:30.
  const earlyMorning = new Date(2026, 9, 8, 0, 30);
  assert.equal(iso(earlyMorning), '2026-10-08');
  assert.equal(fillDays([], 1, earlyMorning)[0].day, '2026-10-08');
});

test('late evening does not roll forward either', () => {
  assert.equal(iso(new Date(2026, 9, 8, 23, 45)), '2026-10-08');
});
