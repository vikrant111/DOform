import {call, empty, field, h, pill, setChildren, toast} from '../ui.js';

const STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'issued'];
const cap = s => s[0].toUpperCase() + s.slice(1);

export function renderRecords(state, {onEdit, onNew}) {
  const {config, user} = state;

  const filters = {q: '', status: 'all', from: '', to: ''};
  let page = 1;
  let pageSize = config.recordsPageSize;
  let rows = [];
  let total = 0;
  let pages = 1;
  let selected = new Set();
  let loading = true;
  let busy = false;
  let searchTimer = null;
  let expandedId = null;
  const detailCache = new Map();

  const host = h('div', {style: {display: 'flex', flexDirection: 'column', flex: '1', minHeight: '0'}});
  const toolbar = h('div', {class: 'toolbar'});
  const body = h('div', {style: {flex: '1', overflow: 'auto'}});
  const pagerBar = h('div', {});
  const actions = h('div', {class: 'actionbar'});
  host.append(toolbar, body, pagerBar, actions);

  // ── data ───────────────────────────────────────────────────
  async function load() {
    loading = true;
    drawBody();
    drawPager();
    try {
      const res = await call(window.api.req.list({...filters, page, pageSize}));
      ({rows, total, page, pages, pageSize} = res);
      detailCache.clear();
      if (expandedId && !rows.some(r => r.id === expandedId)) expandedId = null;
    } catch {
      rows = [];
      total = 0;
      pages = 1;
    } finally {
      loading = false;
      drawBody();
      drawPager();
      drawActions();
      syncToolbar();
    }
  }

  /** Any filter change starts again from page 1. */
  function refilter() {
    page = 1;
    load();
  }

  const debouncedSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refilter, 250);
  };

  // ── toolbar: built ONCE ────────────────────────────────────
  // Rebuilding it on every load would replace the input the user is typing
  // into, dropping focus and the characters typed while the query ran.
  const searchField = field('Search', '', v => { filters.q = v; debouncedSearch(); },
    {placeholder: 'Visitor name, ID proof, pass no., file no., department…'});
  const fromField = field('Visit date from', '', v => { filters.from = v; refilter(); }, {type: 'date'});
  const toField = field('to', '', v => { filters.to = v; refilter(); }, {type: 'date'});
  const searchInput = searchField.querySelector('input');
  const fromInput = fromField.querySelector('input');
  const toInput = toField.querySelector('input');

  const statusChips = [{value: 'all', label: 'All statuses'},
                       ...STATUSES.map(s => ({value: s, label: cap(s)}))]
    .map(o => h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(o.value === filters.status),
      onClick: () => {
        filters.status = o.value;
        selected = new Set();
        syncToolbar();
        refilter();
      },
    }, o.label));

  const selectAllBox = h('input', {
    type: 'checkbox',
    onChange: e => {
      for (const r of rows) e.target.checked ? selected.add(r.id) : selected.delete(r.id);
      // Only row highlighting and the action bar change — the table itself
      // is left alone so the scroll position survives.
      for (const tr of body.querySelectorAll('table.records > tbody > tr:not(.detail)')) {
        const box = tr.querySelector('input[type=checkbox]');
        if (!box) continue;
        box.checked = e.target.checked;
        tr.classList.toggle('sel', e.target.checked);
      }
      syncToolbar();
      drawActions();
    },
  });
  const selectAllLabel = h('span', {}, 'Select this page');
  const clearSelection = h('button', {
    class: 'btn link', type: 'button', hidden: true,
    onClick: () => {
      selected = new Set();
      for (const tr of body.querySelectorAll('table.records > tbody > tr:not(.detail)')) {
        const box = tr.querySelector('input[type=checkbox]');
        if (box) box.checked = false;
        tr.classList.remove('sel');
      }
      syncToolbar();
      drawActions();
    },
  }, 'Clear selection');

  toolbar.append(
    h('div', {class: 'line'},
      h('div', {class: 'search'}, searchField),
      h('div', {}, fromField),
      h('div', {}, toField),
      h('button', {
        class: 'btn ghost', type: 'button',
        onClick: () => {
          Object.assign(filters, {q: '', status: 'all', from: '', to: ''});
          searchInput.value = '';
          fromInput.value = '';
          toInput.value = '';
          selected = new Set();
          clearTimeout(searchTimer);
          syncToolbar();
          refilter();
        },
      }, 'Reset'),
    ),
    h('div', {class: 'line'},
      h('div', {class: 'chips'}, ...statusChips),
      h('label', {class: 'btn-row', style: {marginLeft: 'auto', fontSize: '12.5px'}},
        selectAllBox, selectAllLabel),
      clearSelection,
    ),
  );

  /** Updates toolbar state in place. Never replaces a node. */
  function syncToolbar() {
    statusChips.forEach((btn, i) => {
      const value = i === 0 ? 'all' : STATUSES[i - 1];
      btn.setAttribute('aria-pressed', String(value === filters.status));
    });
    const allOnPage = rows.length > 0 && rows.every(r => selected.has(r.id));
    selectAllBox.checked = allOnPage;
    selectAllBox.indeterminate = !allOnPage && rows.some(r => selected.has(r.id));
    selectAllBox.disabled = rows.length === 0;
    selectAllLabel.textContent = allOnPage ? 'Clear this page' : 'Select this page';
    clearSelection.hidden = selected.size === 0;
    clearSelection.textContent = `Clear ${selected.size} selected`;
  }

  // ── actions ────────────────────────────────────────────────
  /**
   * Ticked rows win. With nothing ticked, an action applies to every record
   * matching the current filters — not just the page on screen.
   */
  const targetIds = async () =>
    selected.size ? [...selected] : call(window.api.req.ids(filters));

  async function withBusy(fn) {
    if (busy) return;
    busy = true;
    drawActions();
    try {
      await fn();
    } catch {
      /* call() has already shown the message */
    } finally {
      busy = false;
      drawActions();
    }
  }

  const runExport = (label, fn) =>
    withBusy(async () => {
      const ids = await targetIds();
      if (!ids.length) return toast('There are no records to use.', 'err');
      const res = await fn(ids);
      if (res?.canceled) return;
      if (res?.path) toast(`${label}: ${res.path}`, 'ok');
      else if (res?.ok === false) toast(`Printing did not finish${res.reason ? ': ' + res.reason : '.'}`, 'err');
      else toast(`${label} ${ids.length} record(s).`, 'ok');
    });

  const doPrint = mode => runExport('Printed', ids => call(window.api.print(ids, mode)));
  const doPdf = mode => runExport('Saved', ids => call(window.api.exportPdf(ids, mode)));
  const doCsv = () => runExport('Downloaded', ids => call(window.api.exportCsv(ids)));

  const doStatus = status =>
    withBusy(async () => {
      const ids = await targetIds();
      if (!ids.length) return toast('There are no records to update.', 'err');
      const n = await call(window.api.req.setStatus(ids, status));
      selected = new Set();
      toast(`${n} record(s) marked ${status}.`, 'ok');
      await load();
    });

  const doDelete = () =>
    withBusy(async () => {
      const ids = await targetIds();
      if (!ids.length) return toast('There are no records to delete.', 'err');
      if (!confirm(`Permanently delete ${ids.length} record(s)?\n\nThis cannot be undone.`)) return;
      const n = await call(window.api.req.remove(ids));
      selected = new Set();
      toast(`${n} record(s) deleted.`, 'ok');
      await load();
    });

  // ── table ──────────────────────────────────────────────────
  function drawBody() {
    if (loading) return setChildren(body, empty('Loading…', ''));
    if (!rows.length) {
      const filtered = filters.q || filters.status !== 'all' || filters.from || filters.to;
      return setChildren(body, empty(
        filtered ? 'No requisitions match these filters' : 'No requisitions yet',
        filtered ? 'Try a different search, or press Reset to clear the filters.'
                 : 'Press “New requisition” to create the first one.',
      ));
    }

    setChildren(body, 
      h('table', {class: 'records'},
        h('thead', {},
          h('tr', {},
            h('th', {class: 'c'}, ''),
            h('th', {}, 'Visitors'), h('th', {}, 'Visit'), h('th', {}, 'Department'),
            h('th', {}, 'Purpose'), h('th', {}, 'Pass no.'), h('th', {}, 'Status'),
            h('th', {class: 'chev'}, ''))),
        h('tbody', {},
          ...rows.map(r => {
            const isOpen = expandedId === r.id;
            const tr = h('tr', {
              class: [selected.has(r.id) ? 'sel' : '', isOpen ? 'open' : ''].filter(Boolean).join(' '),
              title: 'Click to expand · double-click to edit',
              onClick: e => {
                // Ticking a row must not also open it.
                if (e.target.closest('input,button,select,a')) return;
                toggleRow(r.id);
              },
              onDblclick: e => {
                if (e.target.closest('input,button,select,a')) return;
                onEdit(r.id);
              },
            },
              h('td', {class: 'c'},
                h('input', {
                  type: 'checkbox', checked: selected.has(r.id),
                  onClick: e => e.stopPropagation(),
                  onChange: e => {
                    e.target.checked ? selected.add(r.id) : selected.delete(r.id);
                    tr.classList.toggle('sel', e.target.checked);
                    syncToolbar();
                    drawActions();
                  },
                })),
              h('td', {},
                h('div', {class: 'who-name'},
                  r.first_visitor || '(no visitor named)',
                  Number(r.visitor_count) > 1
                    ? h('span', {class: 'dim'}, `  +${Number(r.visitor_count) - 1} more`) : null),
                h('div', {class: 'dim'}, r.requested_by_rank_name || '—')),
              h('td', {},
                h('div', {}, r.visit_date || '—'),
                h('div', {class: 'dim'}, [r.time_from, r.time_to].filter(Boolean).join('–'))),
              h('td', {}, r.department || '—'),
              h('td', {class: 'dim', style: {maxWidth: '260px'}}, r.purpose || '—'),
              h('td', {class: 'num'}, r.pass_no || '—'),
              h('td', {}, pill(r.status, config.statusColors)),
              h('td', {class: 'chev'}, isOpen ? '▾' : '▸'),
            );
            return isOpen ? [tr, detailRow(r)] : tr;
          })),
      ),
    );
    if (expandedId) fillDetail(expandedId);
  }

  // ── expandable row detail ──────────────────────────────────
  function toggleRow(id) {
    expandedId = expandedId === id ? null : id;
    drawBody();
  }

  const detailRow = r =>
    h('tr', {class: 'detail'},
      h('td', {colspan: 8},
        h('div', {class: 'detail-body', 'data-id': r.id}, h('p', {class: 'hint'}, 'Loading…'))));

  async function fillDetail(id) {
    const cell = body.querySelector(`.detail-body[data-id="${id}"]`);
    if (!cell) return;
    try {
      if (!detailCache.has(id)) detailCache.set(id, await call(window.api.req.get(id)));
    } catch {
      setChildren(cell, h('p', {class: 'hint'}, 'Could not load this requisition.'));
      return;
    }
    const rec = detailCache.get(id);
    if (!rec) {
      setChildren(cell, h('p', {class: 'hint'}, 'This requisition no longer exists.'));
      return;
    }
    if (expandedId === id) setChildren(cell, detailView(rec));
  }

  const dl = pairs =>
    h('dl', {class: 'detail-kv'},
      ...pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v || '—')]));

  const miniTable = (caption, cols, data, cell) =>
    h('div', {class: 'detail-block'},
      h('h4', {}, `${caption} (${data.length})`),
      data.length
        ? h('table', {class: 'mini'},
            h('thead', {}, h('tr', {}, ...cols.map(c => h('th', {}, c)))),
            h('tbody', {}, ...data.map(d => h('tr', {}, ...cell(d).map(v => h('td', {}, v || '—'))))))
        : h('p', {class: 'hint'}, 'None recorded.'));

  function detailView(rec) {
    const isAdmin = user.role === 'admin';

    const statusPicker = h('select', {
      class: 'statuspick',
      onChange: async e => {
        const next = e.target.value;
        const previous = rec.status;
        e.target.disabled = true;
        try {
          await call(window.api.req.setStatus([rec.id], next));
          rec.status = next;
          // Update the row's pill in place so the table agrees with the panel.
          const row = rows.find(r => r.id === rec.id);
          if (row) row.status = next;
          toast(`Status changed to ${next}.`, 'ok');
          drawBody();
        } catch {
          e.target.value = previous;
        } finally {
          e.target.disabled = false;
        }
      },
    }, ...STATUSES.map(s2 => h('option', {value: s2, selected: s2 === rec.status}, cap(s2))));

    return h('div', {class: 'detail-grid'},
      h('div', {class: 'detail-main'},
        h('div', {class: 'detail-block'},
          h('h4', {}, 'Visit'),
          dl([
            ['Department / Squadron', rec.department],
            ['Date of visit', rec.visit_date],
            ['Time', [rec.time_from, rec.time_to].filter(Boolean).join(' – ')],
            ['Purpose', rec.purpose],
            ['Place of visit', rec.place_of_visit],
            ['File no.', rec.file_no],
            ['Requisition date', rec.requisition_date],
            ['Requested by', rec.requested_by_rank_name],
            ['Created by', [rec.created_by_name, rec.created_by_service && `(${rec.created_by_service})`]
              .filter(Boolean).join(' ')],
          ])),

        miniTable('Visitors', ['Ser', 'Name', 'Sex/Age', 'Nationality', 'ID proof', 'Address'],
          rec.visitors, v => [String(v.ser), v.name,
            [v.sex, v.age].filter(Boolean).join('/'), v.nationality,
            [v.id_proof_type, v.id_proof_no].filter(Boolean).join(' – '), v.address]),

        miniTable('Vehicles', ['Regn no.', 'Type', 'Driver', 'CDL no.', 'Purpose'],
          rec.vehicles, v => [v.regn_no, v.vehicle_type, v.driver_name, v.cdl_no, v.purpose]),

        miniTable('Escorts', ['Name', 'Rank/Desig', 'P. No', 'I-Card', 'Dept', 'Mob no.', 'Signed'],
          rec.escorts, e => [e.name, e.rank_desig, e.p_no, e.i_card_no, e.dept, e.mob_no,
            Number(e.signed) ? 'Yes' : 'No']),

        h('div', {class: 'detail-block'},
          h('h4', {}, 'Security Office'),
          dl([
            ['Remarks', rec.security_remarks],
            ['Signature', rec.security_signature],
            ['Pass no.', rec.pass_no],
            ['Issued at', rec.pass_issued_at],
            ['Issued on', rec.pass_issued_on],
            ['Signed by', rec.pass_signed_by],
          ])),
      ),

      h('div', {class: 'detail-side'},
        h('h4', {}, 'Status'),
        isAdmin
          ? statusPicker
          : h('div', {}, pill(rec.status, config.statusColors),
              h('p', {class: 'hint', style: {marginTop: '6px'}},
                'Only an administrator can change the status.')),
        h('div', {class: 'detail-actions'},
          h('button', {class: 'btn sm', onClick: () => onEdit(rec.id)}, 'Edit'),
          h('button', {class: 'btn ghost sm',
            onClick: () => withBusy(async () => {
              await call(window.api.print([rec.id], 'form'));
              toast('Sent to the print dialog.', 'ok');
            })}, 'Print'),
          h('button', {class: 'btn ghost sm',
            onClick: () => withBusy(async () => {
              const res = await call(window.api.exportPdf([rec.id], 'form'));
              if (res?.path) toast(`Saved: ${res.path}`, 'ok');
            })}, 'PDF'),
          h('button', {class: 'btn ghost sm', onClick: () => toggleRow(rec.id)}, 'Close'),
        ),
      ),
    );
  }

  function drawPager() {
    if (loading || !rows.length) return setChildren(pagerBar);
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(total, first + rows.length - 1);
    const go = p => { page = p; load(); };

    setChildren(pagerBar, h('div', {class: 'pager'},
      h('span', {class: 'range'}, `${first}–${last} of ${total}`),
      h('div', {class: 'btn-row'},
        h('button', {class: 'btn ghost sm', disabled: page <= 1, onClick: () => go(1)}, '« First'),
        h('button', {class: 'btn ghost sm', disabled: page <= 1, onClick: () => go(page - 1)}, '‹ Previous'),
        h('span', {class: 'pageno'}, `Page ${page} of ${pages}`),
        h('button', {class: 'btn ghost sm', disabled: page >= pages, onClick: () => go(page + 1)}, 'Next ›'),
        h('button', {class: 'btn ghost sm', disabled: page >= pages, onClick: () => go(pages)}, 'Last »'),
      ),
      h('label', {class: 'btn-row', style: {fontSize: '12px'}}, 'Rows',
        h('select', {
          class: 'statuspick',
          onChange: e => { pageSize = Number(e.target.value); page = 1; load(); },
        // Include whatever RECORDS_PAGE_SIZE is set to, or the box would show
        // a different number from the one actually in use.
        }, ...[...new Set([10, 25, 50, 100, 200, pageSize])].sort((a, b) => a - b).map(n =>
          h('option', {value: n, selected: n === pageSize}, String(n)))),
      ),
    ));
  }

  function drawActions() {
    const scope = selected.size
      ? `${selected.size} selected`
      : total === 0 ? 'nothing to act on' : `all ${total} matching`;
    const count = selected.size || total;
    const none = count === 0 || busy;

    setChildren(actions, 
      h('span', {class: 'scope'}, busy ? 'Working…' : `Acting on: ${scope}`),
      h('button', {class: 'btn', onClick: onNew, disabled: busy}, 'New requisition'),
      h('button', {class: 'btn accent', disabled: none, onClick: () => doPrint('form')},
        `Print forms (${count})`),
      h('button', {class: 'btn ghost', disabled: none, onClick: () => doPrint('summary')}, 'Print list'),
      h('button', {class: 'btn ghost', disabled: none, onClick: () => doPdf('form')}, 'Save as PDF'),
      h('button', {class: 'btn ghost', disabled: none, onClick: doCsv}, 'Download CSV'),
      ...(user.role === 'admin'
        ? [
            h('span', {class: 'vr'}),
            h('select', {
              class: 'statuspick', disabled: none,
              onChange: e => {
                const v = e.target.value;
                e.target.value = '';
                if (v) doStatus(v);
              },
            },
              h('option', {value: ''}, 'Set status…'),
              ...STATUSES.map(s => h('option', {value: s}, cap(s)))),
            h('button', {class: 'btn danger', disabled: none, onClick: doDelete}, 'Delete'),
          ]
        : []),
    );
  }

  syncToolbar();
  drawActions();
  load();

  // Exposed so the File-menu accelerators drive the same actions.
  host.actions = {print: () => doPrint('form'), pdf: () => doPdf('form'), csv: doCsv};
  return host;
}
