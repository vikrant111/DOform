/** Pure chart-data shaping. No DOM — so it can be tested directly. */

/**
 * Local calendar date as YYYY-MM-DD. Deliberately NOT toISOString(), which is
 * UTC: east of Greenwich (IST is +5:30) that reports yesterday for most of the
 * working day, shifting every chart bucket and date filter by one.
 */
export const iso = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Expands a sparse `[{day, n}]` series into every day of the last `days`,
 * zeros included. Without this, one busy day renders as a single full-width
 * block instead of one bar in a calendar window.
 *
 * Days outside the window are kept only if they are more recent than it
 * (visits dated in the future), never silently dropped into the wrong slot.
 */
export function fillDays(rows, days, now = new Date()) {
  const have = new Map((rows ?? []).map(r => [r.day, Number(r.n)]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    out.push({day, n: have.get(day) ?? 0});
  }
  for (const r of rows ?? []) {
    if (!out.some(o => o.day === r.day)) out.push({day: r.day, n: Number(r.n)});
  }
  return out.sort((a, b) => a.day.localeCompare(b.day)).slice(-days);
}
