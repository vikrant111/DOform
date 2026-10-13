import {call, field, h, setChildren, toast} from '../ui.js';
import {photoField} from '../photo.js';
import {STATUSES, blankEscort, blankRequisition, blankVehicle, blankVisitor, rules,
        timeOrderError, validate} from '../validate.js';

export {blankRequisition};

export function renderForm(state, {initial, onDone, onCancel}) {
  const {config, user} = state;
  const f = structuredClone(initial);
  if (!f.visitors?.length) f.visitors = [blankVisitor()];
  let showErrors = false;
  let busy = false;

  const host = h('div', {class: 'page'});
  const summaryBox = h('div', {});
  let saveBtn = null;

  // Snapshot of the record as it was opened, to tell edits from an untouched
  // visit. Taken after the blank first visitor is added, so simply opening a
  // new requisition does not look like a change.
  const pristine = JSON.stringify(f);
  const isDirty = () => JSON.stringify(f) !== pristine;

  /** Leaving with unsaved work asks first — this form is long to re-type. */
  function leave() {
    if (isDirty() && !confirm(
      'This requisition has unsaved changes.\n\nLeave without saving them?')) return;
    onCancel();
  }

  // Escape backs out too, whenever focus is anywhere inside the form.
  host.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !busy) {
      e.preventDefault();
      leave();
    }
  });

  /**
   * Every field built this draw, so Save can check them all at once and jump
   * to the first problem. Rebuilt on each draw, like the fields themselves.
   */
  let fields = [];
  const F = (...args) => {
    const el = field(...args);
    fields.push(el);
    return el;
  };

  // Once a save has been attempted, keep the summary in step as fields are
  // fixed. Delegated, so it survives the fields being rebuilt.
  host.addEventListener('input', () => showErrors && refreshSummary());
  host.addEventListener('change', () => showErrors && refreshSummary());

  function refreshSummary() {
    const errs = validate(f);
    if (!showErrors || !errs.length) return setChildren(summaryBox);
    setChildren(summaryBox,
      h('div', {class: 'card errors'},
        h('h2', {}, `Fix ${errs.length === 1 ? 'this' : 'these ' + errs.length} before saving`),
        h('ul', {}, ...errs.map(e => h('li', {}, e)))));
  }

  const rowCard = (title, onRemove, ...body) =>
    h('div', {class: 'rowcard'},
      h('header', {}, h('h3', {}, title),
        onRemove ? h('button', {class: 'btn del', type: 'button', onClick: onRemove}, 'Remove') : null),
      ...body);

  const adder = (label, list, make, max) =>
    h('button', {
      class: 'btn ghost sm', type: 'button',
      disabled: f[list].length >= max,
      onClick: () => {
        f[list].push(make());
        draw();
      },
    }, label);

  /** Toggles the button in place; redrawing would rebuild every field. */
  function setSaving(on) {
    busy = on;
    if (!saveBtn) return;
    saveBtn.disabled = on;
    saveBtn.textContent = on ? 'Saving…' : 'Save requisition';
  }

  async function save() {
    if (busy) return;
    showErrors = true;

    // Reveal every inline message at once, then take the user to the first one.
    const firstBad = fields
      .map(el => ({el, message: el.check({force: true})}))
      .find(x => x.message);
    refreshSummary();

    if (firstBad || validate(f).length) {
      const target = firstBad?.el ?? summaryBox.firstElementChild;
      target?.scrollIntoView({behavior: 'smooth', block: 'center'});
      firstBad?.el?.control?.focus?.({preventScroll: true});
      return;
    }

    setSaving(true);
    try {
      const payload = {...f, visitors: f.visitors.filter(v => v.name.trim())};
      const id = await call(window.api.req.save(payload));
      toast('Requisition saved.', 'ok');
      onDone(id);
    } catch {
      /* reported by call() */
    } finally {
      setSaving(false);
    }
  }

  async function printThis() {
    if (!f.id) {
      toast('Save the requisition before printing it.', 'err');
      return;
    }
    await call(window.api.print([f.id], 'form')).catch(() => {});
  }

  function draw() {
    fields = [];

    // The two times validate each other, so they are built as a pair.
    const timeTo = F('Time to (Hrs)', f.time_to, v => (f.time_to = v),
      {placeholder: '1730', inputMode: 'numeric',
       validate: rules.all(rules.time('Time to'), v => timeOrderError(f.time_from, v))});
    const timeFrom = F('Time from (Hrs)', f.time_from, v => {
      f.time_from = v;
      timeTo.check();   // the window may have become valid, or stopped being so
    }, {placeholder: '0930', inputMode: 'numeric', validate: rules.time('Time from')});

    setChildren(host,
      h('div', {class: 'page-head'},
        h('button', {class: 'btn ghost back', type: 'button', onClick: leave,
          title: 'Back to records (Esc)'}, '← Back'),
        h('div', {},
          h('h1', {}, f.id ? 'Edit requisition' : 'New requisition'),
          h('p', {class: 'sub'}, config.formTitle + ' · ' + config.unitName)),
      ),

      /*
       * The photograph, once, at the top of the form.
       *
       * A pass carries one picture whichever visitor it is of, so this belongs
       * to the requisition rather than to a visitor row — a control under every
       * visitor read as a requirement to photograph all of them.
       *
       * It redraws itself rather than going through `draw()`: rebuilding the
       * form would move focus out of whichever field the user was in when they
       * took the picture.
       */
      h('div', {class: 'card photo-card'},
        photoField(f, {
          label: 'Photograph for the pass',
          hint: 'One photograph, of any one visitor. It is printed on the pass.',
        })),

      // 1 — visit details
      h('div', {class: 'card'},
        h('h2', {}, '1 · Visit details'),
        h('div', {class: 'grid'},
          F('Department / Squadron', f.department, v => (f.department = v),
            {required: true, placeholder: 'e.g. Air Engineering Dept',
             validate: rules.all(rules.required('Department / Squadron'),
                                 rules.maxLen('Department / Squadron', 255))}),
        ),
        h('div', {class: 'grid g3', style: {marginTop: '12px'}},
          F('Date of visit', f.visit_date, v => (f.visit_date = v),
            {type: 'date', required: true, validate: rules.requiredDate('Date of visit')}),
          timeFrom,
          timeTo,
        ),
        h('div', {class: 'grid', style: {marginTop: '12px'}},
          F('Purpose', f.purpose, v => (f.purpose = v),
            {required: true, multiline: true, placeholder: 'Reason for the visit',
             validate: rules.all(rules.required('Purpose'), rules.maxLen('Purpose', 4000))}),
          F('Place of visit', f.place_of_visit, v => (f.place_of_visit = v),
            {placeholder: 'Exact location inside the unit',
             validate: rules.maxLen('Place of visit', 255)}),
        ),
      ),

      // 2 — visitors
      h('div', {class: 'card'},
        h('h2', {}, '2 · Details of visitors'),
        ...f.visitors.map((v, i) => {
          // A visitor only needs an ID proof once they have been named.
          const idProof = F('ID proof number', v.id_proof_no, x => (v.id_proof_no = x),
            {required: i === 0,
             validate: rules.all(
               x => (v.name.trim() && !x.trim()
                 ? 'An ID proof number is required for a named visitor.' : null),
               rules.maxLen('ID proof number', 128))});
          return rowCard(`Visitor ${i + 1}`,
            f.visitors.length > 1 ? () => { f.visitors.splice(i, 1); draw(); } : null,
            h('div', {class: 'grid'},
              F('Name', v.name, x => { v.name = x; idProof.check(); },
                // The first visitor is the one the pass is for; later rows may
                // be left blank and are dropped on save.
                {required: i === 0,
                 validate: rules.all(
                   i === 0 ? rules.required('Name') : () => null,
                   rules.maxLen('Name', 255))})),
            h('div', {class: 'grid g4', style: {marginTop: '12px'}},
              F('Sex', v.sex, x => (v.sex = x), {
                options: [{value: '', label: '—'}, {value: 'M', label: 'Male'},
                          {value: 'F', label: 'Female'}, {value: 'O', label: 'Other'}]}),
              F('Age', v.age, x => (v.age = x), {type: 'number', inputMode: 'numeric',
                validate: rules.age}),
              F('Nationality', v.nationality, x => (v.nationality = x),
                {validate: rules.maxLen('Nationality', 64)}),
              F('ID proof type', v.id_proof_type, x => (v.id_proof_type = x), {
                options: ['', 'Aadhaar', 'PAN', 'Driving Licence', 'Passport', 'Voter ID', 'Other']
                  .map(o => ({value: o, label: o || '—'}))}),
            ),
            h('div', {class: 'grid g2', style: {marginTop: '12px'}},
              idProof,
              F('Full address of firm / company / visitor', v.address, x => (v.address = x),
                {validate: rules.maxLen('Address', 4000)}),
            ),
          );
        }),
        h('div', {class: 'btn-row'},
          adder('+ Add visitor', 'visitors', blankVisitor, config.maxVisitors),
          h('span', {class: 'hint'}, `${f.visitors.length} of ${config.maxVisitors} (MAX_VISITORS in .env)`),
        ),
      ),

      // 3 — vehicles
      h('div', {class: 'card'},
        h('h2', {}, '3 · Details of vehicle (if any)'),
        ...f.vehicles.map((v, i) =>
          rowCard(`Vehicle ${i + 1}`, () => { f.vehicles.splice(i, 1); draw(); },
            h('div', {class: 'grid g2'},
              F('Registration no.', v.regn_no, x => (v.regn_no = x),
                {placeholder: 'AN01 AB 1234', validate: rules.maxLen('Registration no.', 64)}),
              F('Type of vehicle', v.vehicle_type, x => (v.vehicle_type = x),
                {validate: rules.maxLen('Type of vehicle', 64)}),
            ),
            h('div', {class: 'grid g3', style: {marginTop: '12px'}},
              F('Driver name', v.driver_name, x => (v.driver_name = x),
                {validate: rules.maxLen('Driver name', 255)}),
              F('CDL no.', v.cdl_no, x => (v.cdl_no = x),
                {validate: rules.maxLen('CDL no.', 64)}),
              F('Purpose to bring inside', v.purpose, x => (v.purpose = x),
                {validate: rules.maxLen('Purpose', 255)}),
            ),
          )),
        f.vehicles.length ? null : h('p', {class: 'hint'}, 'No vehicle recorded.'),
        h('div', {class: 'btn-row'}, adder('+ Add vehicle', 'vehicles', blankVehicle, config.maxVehicles)),
      ),

      // 4 — escorts
      h('div', {class: 'card'},
        h('h2', {}, '4 · Details of escort'),
        ...f.escorts.map((e, i) =>
          rowCard(`Escort ${i + 1}`, () => { f.escorts.splice(i, 1); draw(); },
            h('div', {class: 'grid g2'},
              F('Name', e.name, x => (e.name = x), {validate: rules.maxLen('Name', 255)}),
              F('Rank / designation', e.rank_desig, x => (e.rank_desig = x),
                {validate: rules.maxLen('Rank / designation', 128)}),
            ),
            h('div', {class: 'grid g4', style: {marginTop: '12px'}},
              F('P. No', e.p_no, x => (e.p_no = x), {validate: rules.maxLen('P. No', 64)}),
              F('I-Card No.', e.i_card_no, x => (e.i_card_no = x),
                {validate: rules.maxLen('I-Card No.', 64)}),
              F('Dept', e.dept, x => (e.dept = x), {validate: rules.maxLen('Dept', 128)}),
              F('Mobile No.', e.mob_no, x => (e.mob_no = x),
                {inputMode: 'tel', validate: rules.mobile}),
            ),
            h('label', {class: 'btn-row', style: {marginTop: '10px', fontSize: '13px'}},
              h('input', {type: 'checkbox', checked: !!e.signed,
                onChange: ev => (e.signed = ev.target.checked ? 1 : 0)}),
              'Signed',
            ),
          )),
        f.escorts.length ? null : h('p', {class: 'hint'}, 'No escort recorded.'),
        h('div', {class: 'btn-row'}, adder('+ Add escort', 'escorts', blankEscort, config.maxEscorts)),
      ),

      // requisition block
      h('div', {class: 'card'},
        h('h2', {}, 'Requisition'),
        h('p', {class: 'hint', style: {marginBottom: '12px'}},
          'Pass no. ', h('b', {}, f.pass_no || 'generated automatically when saved'),
          f.pass_no && f.pass_issued_on
            ? ` · issued at ${f.pass_issued_at} Hrs on ${f.pass_issued_on}` : ''),
        h('div', {class: 'grid g3'},
          F('File no.', f.file_no, v => (f.file_no = v),
            {placeholder: 'UTK/SEC/CVP/2026/…', validate: rules.maxLen('File no.', 64)}),
          F('Date', f.requisition_date, v => (f.requisition_date = v),
            {type: 'date', validate: rules.date('Date')}),
          F('Status', f.status, v => (f.status = v),
            {options: STATUSES.map(s => ({value: s, label: s[0].toUpperCase() + s.slice(1)}))}),
        ),
        h('div', {class: 'grid', style: {marginTop: '12px'}},
          F('Rank & name (requesting officer)', f.requested_by_rank_name,
            v => (f.requested_by_rank_name = v),
            {validate: rules.maxLen('Rank & name', 255)}),
        ),
      ),

      // security office — admins only
      user.role === 'admin'
        ? h('div', {class: 'card'},
            h('h2', {}, 'For use of Security Office'),
            h('div', {class: 'grid'},
              F('Sign (MAA SEC / DCOP / Duty Chief)', f.pass_signed_by,
                v => (f.pass_signed_by = v), {validate: rules.maxLen('Sign', 255)}),
            ),
          )
        : null,

      summaryBox,

      h('div', {class: 'btn-row'},
        (saveBtn = h('button', {class: 'btn', onClick: save, disabled: busy},
          busy ? 'Saving…' : 'Save requisition')),
        h('button', {class: 'btn accent', onClick: printThis,
          title: f.id ? 'Print this requisition' : 'Save the requisition before printing it'},
          'Print'),
        h('button', {class: 'btn ghost', onClick: leave}, 'Cancel'),
      ),
    );
  }

  draw();
  return host;
}
