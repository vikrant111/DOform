import {call, chips, empty, h, setChildren} from '../ui.js';
import {fillDays, iso} from '../series.js';

const STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'issued'];
const RANGES = [
  {value: '7', label: 'Last 7 days'},
  {value: '30', label: 'Last 30 days'},
  {value: '90', label: 'Last 90 days'},
  {value: 'all', label: 'All time'},
];

/** A single number needs no plot — a stat tile says it faster. */
const tile = (label, value, color) =>
  h('div', {class: 'tile'},
    h('div', {class: 'k'}, label),
    h('div', {class: 'v', style: color ? {color} : {}}, String(value)));

/** Horizontal magnitude bars, value direct-labelled, so no legend is needed. */
function barList(data, defaultColor, emptyText) {
  if (!data.length) return h('p', {class: 'hint'}, emptyText);
  const max = Math.max(1, ...data.map(d => d.n));
  return h('div', {class: 'bars'},
    ...data.map(d =>
      h('div', {class: 'bar'},
        h('div', {class: 'top'},
          h('span', {}, d.label),
          h('span', {class: 'n'}, String(d.n))),
        h('div', {class: 'track'},
          h('div', {
            class: 'fill',
            style: {
              width: `${Math.max(2, (d.n / max) * 100)}%`,
              background: d.color ?? defaultColor,
            },
          })))),
  );
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' -> a local Date, without the UTC shift `new Date(s)` applies. */
const parseDay = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Visits per day.
 *
 * Every bar carries its own date underneath, inside the same column, so a
 * label can never drift away from the bar it belongs to. Weekends are tinted
 * and today is marked, because "was that a Sunday?" is the first question
 * anyone asks of this chart.
 */
function dayBars(data, color) {
  if (!data.length) return h('p', {class: 'hint'}, 'No requisitions in this range yet.');

  const max = Math.max(1, ...data.map(d => d.n));
  const todayKey = iso(new Date());
  const total = data.reduce((a, b) => a + b.n, 0);
  const busiest = data.reduce((a, b) => (b.n > a.n ? b : a), data[0]);
  const average = total / data.length;
  const describe = key => {
    const d = parseDay(key);
    return `${WEEKDAY[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTH[d.getMonth()]}`;
  };

  return h('div', {},
    h('p', {class: 'chart-caption'},
      `${total} requisition${total === 1 ? '' : 's'} over these ${data.length} days`,
      h('span', {class: 'sep'}, '·'),
      `${average.toFixed(1)} per day on average`,
      busiest.n > 0 ? h('span', {class: 'sep'}, '·') : null,
      busiest.n > 0 ? `busiest ${describe(busiest.day)} with ${busiest.n}` : null,
    ),

    h('div', {class: 'daychart'},
      ...data.map(d => {
        const date = parseDay(d.day);
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        const today = d.day === todayKey;
        return h('div', {
          class: `col${weekend ? ' weekend' : ''}${today ? ' today' : ''}`,
          title: `${describe(d.day)} — ${d.n} requisition${d.n === 1 ? '' : 's'}`
                 + (weekend ? ' (weekend)' : ''),
        },
          h('span', {class: 'n'}, d.n > 0 ? String(d.n) : ''),
          h('div', {class: 'track'},
            h('div', {
              class: 'fill',
              style: {height: `${(d.n / max) * 100}%`, background: d.n ? color : 'transparent'},
            }),
            d.n === 0 ? h('div', {class: 'zero'}) : null,
          ),
          // Tinting is confined to the labels: a shaded plot area reads as a
          // full-height bar, which is badly wrong on a day with nothing booked.
          h('div', {class: 'labels'},
            h('span', {class: 'dd'}, String(date.getDate()).padStart(2, '0')),
            h('span', {class: 'ww'}, WEEKDAY[date.getDay()]),
            today ? h('span', {class: 'today-tag'}, 'Today') : null,
          ),
        );
      }),
    ),

    h('p', {class: 'chart-key'},
      h('span', {class: 'swatch', style: {background: color}}),
      'Requisitions raised for that date',
      h('span', {class: 'sep'}, '·'),
      h('span', {class: 'swatch weekend-swatch'}),
      'Saturday / Sunday',
      h('span', {class: 'sep'}, '·'),
      'A blank column means no visitors were booked that day.',
    ),
  );
}

export function renderDashboard(state, {onOpenRecords}) {
  const {config} = state;
  let range = '30';
  let status = 'all';
  let data = null;

  const host = h('div', {class: 'page'});

  function filters() {
    if (range === 'all') return {status};
    const d = new Date();
    d.setDate(d.getDate() - Number(range));
    return {status, from: iso(d)};
  }

  async function load() {
    try {
      data = await call(window.api.stats(filters()));
    } catch {
      data = null;
    }
    draw();
  }

  function draw() {
    const statusBars = !data ? [] : (() => {
      const by = new Map(data.byStatus.map(s => [s.status, s.n]));
      return STATUSES
        .map(s => ({label: s[0].toUpperCase() + s.slice(1), n: by.get(s) ?? 0,
                    color: config.statusColors[s]}))
        .filter(s => s.n > 0);
    })();

    setChildren(host, 
      h('h1', {}, 'Dashboard'),
      h('p', {class: 'sub'}, `${config.unitName} · visitor pass activity`),

      h('div', {class: 'filters'},
        h('span', {class: 'flabel'}, 'Period'),
        chips(RANGES, range, v => { range = v; load(); }),
        h('span', {class: 'flabel'}, 'Status'),
        chips(
          [{value: 'all', label: 'All statuses'},
           ...STATUSES.map(s => ({value: s, label: s[0].toUpperCase() + s.slice(1)}))],
          status, v => { status = v; load(); },
        ),
      ),

      ...(!data
        ? [empty('Loading…', '')]
        : [
            h('div', {class: 'tiles'},
              tile('Requisitions', data.total),
              tile('Visitors', data.visitors),
              tile('Vehicles', data.vehicles),
              tile('Awaiting action', data.pending,
                data.pending ? config.statusColors.submitted : undefined),
            ),

            h('div', {class: 'card'},
              h('h2', {}, `Visits per day — last ${config.dashboardDays} days`),
              dayBars(fillDays(data.byDay, config.dashboardDays), config.chartBar)),

            h('div', {class: 'grid g2'},
              h('div', {class: 'card'},
                h('h2', {}, 'By status'),
                barList(statusBars, config.chartBar, 'Nothing recorded in this range.')),
              h('div', {class: 'card'},
                h('h2', {}, 'Busiest departments'),
                barList(
                  data.topDepartments.map(d => ({label: d.department, n: d.n})),
                  config.chartBar,
                  'No departments recorded yet.')),
            ),

            h('div', {class: 'btn-row'},
              h('button', {class: 'btn', onClick: onOpenRecords}, 'View all records'),
              h('button', {class: 'btn ghost', onClick: load}, 'Refresh'),
            ),
          ]),
    );
  }

  draw();
  load();
  return host;
}
