import {call, field, h, setChildren, toast} from '../ui.js';
import {rules} from '../validate.js';

const SERVICE_HINT = 'Letters, digits, / or - (3–32). This is what reconnects a person to their records if their account is ever recreated.';

export function renderAccounts(state, {onProfileChanged}) {
  const {config, user} = state;
  const host = h('div', {class: 'page'});

  const passwordRule = v => {
    if (!v) return 'A new password is required.';
    if (v.length < config.minPasswordLength)
      return `Use at least ${config.minPasswordLength} characters.`;
    if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v))
      return 'Include at least one letter and one number.';
    return null;
  };

  const serviceRule = v =>
    (!v.trim() || /^[A-Za-z0-9/-]{3,32}$/.test(v.trim()))
      ? null : 'Use 3–32 letters, digits, / or -.';

  /** Collects fields so a form can validate everything at once. */
  const collector = () => {
    const list = [];
    const add = (...args) => {
      const el = field(...args);
      list.push(el);
      return el;
    };
    const firstProblem = () => list.map(el => ({el, m: el.check({force: true})})).find(x => x.m);
    return {add, firstProblem, reset: () => (list.length = 0)};
  };

  // ── your own details ───────────────────────────────────────
  function profileCard() {
    const card = h('div', {class: 'card'});
    const form = {fullName: user.fullName ?? '', rank: user.rank ?? '',
                  serviceNo: user.serviceNo ?? ''};
    let busy = false;

    async function save(c) {
      const bad = c.firstProblem();
      if (bad) return bad.el.control?.focus?.();
      busy = true;
      draw();
      try {
        const res = await call(window.api.users.update(user.id, form));
        if (res.error) return toast(res.error, 'err');
        Object.assign(user, res.user);
        toast(res.reclaimed
          ? `Saved. ${res.reclaimed} earlier requisition(s) reconnected to this account.`
          : 'Your details have been saved.', 'ok');
        onProfileChanged?.(res.user);
      } catch {
        /* reported */
      } finally {
        busy = false;
        draw();
      }
    }

    function draw() {
      const c = collector();
      setChildren(card,
        h('h2', {}, 'Your account'),
        h('div', {class: 'grid g2'},
          h('div', {},
            h('dl', {class: 'kv'},
              h('dt', {}, 'Username'), h('dd', {}, user.username),
              h('dt', {}, 'Role'), h('dd', {}, user.role),
              h('dt', {}, 'Session expires after'), h('dd', {}, `${config.sessionHours} hour(s)`)),
          ),
          h('div', {},
            c.add('Full name', form.fullName, v => (form.fullName = v),
              {required: true, validate: rules.required('Full name')}),
            c.add('Rank / designation', form.rank, v => (form.rank = v)),
            user.role === 'admin'
              ? c.add('Service number', form.serviceNo, v => (form.serviceNo = v),
                  {validate: serviceRule, hint: SERVICE_HINT})
              : h('div', {class: 'field'},
                  h('label', {}, 'Service number'),
                  h('div', {class: 'readonly-value'}, form.serviceNo || '— not set —'),
                  h('div', {class: 'hint'}, 'Only an administrator can change this.')),
            h('div', {class: 'btn-row'},
              h('button', {class: 'btn sm', disabled: busy, onClick: () => save(c)},
                busy ? 'Saving…' : 'Save details')),
          ),
        ),
      );
    }

    draw();
    return card;
  }

  // ── your password ──────────────────────────────────────────
  function passwordCard() {
    const card = h('div', {class: 'card'});
    const form = {current: '', next: '', confirm: ''};
    let busy = false;

    async function submit(c) {
      const bad = c.firstProblem();
      if (bad) return bad.el.control?.focus?.();
      busy = true;
      draw();
      try {
        const res = await call(window.api.users.changeOwnPassword(form.current, form.next));
        if (res.error) return toast(res.error, 'err');
        toast('Your password has been changed.', 'ok');
        Object.assign(form, {current: '', next: '', confirm: ''});
      } catch {
        /* reported */
      } finally {
        busy = false;
        draw();
      }
    }

    function draw() {
      const c = collector();
      const next = c.add('New password', form.next, v => {
        form.next = v;
        confirm.check();
      }, {type: 'password', required: true, validate: passwordRule,
          hint: `At least ${config.minPasswordLength} characters, with a letter and a number.`});
      const confirm = c.add('Confirm new password', form.confirm, v => (form.confirm = v),
        {type: 'password', required: true,
         validate: v => (v === form.next ? null : 'This does not match the new password.')});

      setChildren(card,
        h('h2', {}, 'Your password'),
        h('div', {class: 'grid g3'},
          c.add('Current password', form.current, v => (form.current = v),
            {type: 'password', required: true, validate: rules.required('Current password')}),
          next, confirm,
        ),
        h('div', {class: 'btn-row'},
          h('button', {class: 'btn', disabled: busy, onClick: () => submit(c)},
            busy ? 'Changing…' : 'Change password')),
      );
    }

    draw();
    return card;
  }

  // ── everyone's accounts (administrators only) ──────────────
  function directoryCard() {
    const card = h('div', {class: 'card'});
    let users = [];
    let open = null;      // {id, kind, count}
    let adding = false;
    let busy = false;

    async function load() {
      try {
        users = await call(window.api.users.list());
      } catch {
        users = [];
      }
      draw();
    }

    const run = async (fn, okMessage) => {
      if (busy) return false;
      busy = true;
      draw();
      try {
        const res = await fn();
        if (res?.error) {
          toast(res.error, 'err');
          return false;
        }
        if (okMessage) toast(typeof okMessage === 'function' ? okMessage(res) : okMessage, 'ok');
        open = null;
        adding = false;
        await load();
        return true;
      } catch {
        return false;
      } finally {
        busy = false;
        draw();
      }
    };

    function resetPanel(u) {
      const c = collector();
      const form = {next: '', confirm: ''};
      const next = c.add('New password', '', v => {
        form.next = v;
        confirm.check();
      }, {type: 'password', required: true, validate: passwordRule});
      const confirm = c.add('Confirm', '', v => (form.confirm = v),
        {type: 'password', required: true,
         validate: v => (v === form.next ? null : 'This does not match.')});

      return h('div', {class: 'account-panel'},
        h('p', {class: 'hint'},
          `Set a new password for ${u.username}. Give it to them directly — they can change it themselves afterwards.`),
        h('div', {class: 'grid g2'}, next, confirm),
        h('div', {class: 'btn-row'},
          h('button', {class: 'btn sm', disabled: busy, onClick: () => {
            const bad = c.firstProblem();
            if (bad) return bad.el.control?.focus?.();
            run(() => call(window.api.users.resetPassword(u.id, form.next)),
              `Password reset for ${u.username}.`);
          }}, 'Set password'),
          h('button', {class: 'btn ghost sm', onClick: () => { open = null; draw(); }}, 'Cancel'),
        ),
      );
    }

    function editPanel(u) {
      const c = collector();
      const form = {fullName: u.full_name ?? '', rank: u.rank ?? '', serviceNo: u.service_no ?? ''};
      return h('div', {class: 'account-panel'},
        h('div', {class: 'grid g3'},
          c.add('Full name', form.fullName, v => (form.fullName = v),
            {required: true, validate: rules.required('Full name')}),
          c.add('Rank / designation', form.rank, v => (form.rank = v)),
          c.add('Service number', form.serviceNo, v => (form.serviceNo = v),
            {validate: serviceRule, hint: SERVICE_HINT}),
        ),
        h('div', {class: 'btn-row'},
          h('button', {class: 'btn sm', disabled: busy, onClick: () => {
            const bad = c.firstProblem();
            if (bad) return bad.el.control?.focus?.();
            run(() => call(window.api.users.update(u.id, form)),
              res => res.reclaimed
                ? `Saved. ${res.reclaimed} requisition(s) reconnected to ${u.username}.`
                : `${u.username} updated.`);
          }}, 'Save'),
          h('button', {class: 'btn ghost sm', onClick: () => { open = null; draw(); }}, 'Cancel'),
        ),
      );
    }

    function removePanel(u, count) {
      return h('div', {class: 'account-panel'},
        h('p', {class: 'hint'},
          `Remove the sign-in account for ${u.username}? `,
          count === null ? 'Checking their records…'
            : count === 0 ? 'They have not written any requisitions.'
            : `Their ${count} requisition(s) stay in the database — only the account goes.`),
        u.service_no
          ? h('p', {class: 'hint'},
              `If they rejoin, create an account with service number ${u.service_no} and their records reconnect automatically.`)
          : h('p', {class: 'hint warn-text'},
              'This account has no service number, so a future account cannot be linked back to their records automatically.'),
        h('div', {class: 'btn-row'},
          h('button', {class: 'btn danger sm', disabled: busy || count === null,
            onClick: () => run(() => call(window.api.users.remove(u.id)),
              `Account ${u.username} removed. Their requisitions were kept.`)}, 'Remove account'),
          h('button', {class: 'btn ghost sm', onClick: () => { open = null; draw(); }}, 'Cancel'),
        ),
      );
    }

    function addPanel() {
      const c = collector();
      const form = {username: '', password: '', fullName: '', rank: '', serviceNo: '', role: 'operator'};
      const note = h('p', {class: 'hint'});

      const showReclaimable = async value => {
        const s = String(value ?? '').trim();
        if (!/^[A-Za-z0-9/-]{3,32}$/.test(s)) return setChildren(note);
        try {
          const n = await call(window.api.users.recordsForService(s), {quiet: true});
          setChildren(note, n > 0
            ? `${n} existing requisition(s) were written under service number ${s} — they will be reconnected to this account.`
            : `No earlier requisitions found for service number ${s}.`);
        } catch {
          setChildren(note);
        }
      };

      return h('div', {class: 'account-panel'},
        h('div', {class: 'grid g2'},
          c.add('Username', '', v => (form.username = v), {required: true,
            validate: v => (/^[A-Za-z0-9._-]{3,32}$/.test(v.trim())
              ? null : 'Use 3–32 letters, digits, dots, underscores or hyphens.')}),
          c.add('Full name', '', v => (form.fullName = v),
            {required: true, validate: rules.required('Full name')}),
        ),
        h('div', {class: 'grid g2'},
          c.add('Rank / designation', '', v => (form.rank = v)),
          c.add('Service number', '', v => {
            form.serviceNo = v;
            showReclaimable(v);
          }, {validate: serviceRule, hint: SERVICE_HINT}),
        ),
        note,
        h('div', {class: 'grid g2'},
          c.add('Role', 'operator', v => (form.role = v),
            {options: [{value: 'operator', label: 'Operator'},
                       {value: 'admin', label: 'Administrator'}]}),
          c.add('Initial password', '', v => (form.password = v),
            {type: 'password', required: true, validate: passwordRule}),
        ),
        h('div', {class: 'btn-row'},
          h('button', {class: 'btn sm', disabled: busy, onClick: () => {
            const bad = c.firstProblem();
            if (bad) return bad.el.control?.focus?.();
            run(() => call(window.api.users.create(form)),
              res => res.reclaimed
                ? `Account ${form.username} created and ${res.reclaimed} requisition(s) reconnected.`
                : `Account ${form.username} created.`);
          }}, 'Create account'),
          h('button', {class: 'btn ghost sm', onClick: () => { adding = false; draw(); }}, 'Cancel'),
        ),
      );
    }

    const action = (label, extraClass, onClick) =>
      h('button', {class: `btn ghost sm ${extraClass ?? ''}`, disabled: busy, onClick}, label);

    function draw() {
      setChildren(card,
        h('h2', {}, `All accounts (${users.length})`),
        h('table', {class: 'mini accounts'},
          h('thead', {}, h('tr', {},
            h('th', {}, 'Username'), h('th', {}, 'Name'), h('th', {}, 'Rank'),
            h('th', {}, 'Service no.'), h('th', {}, 'Role'), h('th', {}, ''))),
          h('tbody', {},
            ...users.flatMap(u => {
              const isMe = u.id === user.id;
              const toggle = kind => () => {
                open = open?.id === u.id && open.kind === kind ? null : {id: u.id, kind, count: null};
                draw();
                if (kind === 'remove') {
                  call(window.api.users.recordCount(u.id))
                    .then(n => {
                      if (open?.id === u.id && open.kind === 'remove') {
                        open.count = n;
                        draw();
                      }
                    })
                    .catch(() => {});
                }
              };
              const row = h('tr', {},
                h('td', {}, u.username, isMe ? h('span', {class: 'dim'}, ' (you)') : null),
                h('td', {}, u.full_name || '—'),
                h('td', {}, u.rank || '—'),
                h('td', {class: 'num'}, u.service_no || '—'),
                h('td', {},
                  h('span', {class: 'pill', style: u.role === 'admin'
                    ? {background: '#b8860b22', color: '#8a6508'}
                    : {background: '#6b7a8a22', color: '#4a5866'}}, u.role)),
                h('td', {class: 'row-actions'},
                  action('Edit', '', toggle('edit')),
                  action('Reset password', '', toggle('reset')),
                  isMe ? null : action(u.role === 'admin' ? 'Make operator' : 'Make admin', '',
                    () => run(() => call(window.api.users.setRole(u.id, u.role === 'admin' ? 'operator' : 'admin')),
                      `${u.username} is now ${u.role === 'admin' ? 'an operator' : 'an administrator'}.`)),
                  isMe ? null : action('Remove', 'danger-text', toggle('remove')),
                ),
              );
              if (open?.id !== u.id) return [row];
              const panel = open.kind === 'reset' ? resetPanel(u)
                : open.kind === 'edit' ? editPanel(u)
                : removePanel(u, open.count);
              return [row, h('tr', {class: 'detail'}, h('td', {colspan: 6}, panel))];
            })),
        ),
        adding
          ? addPanel()
          : h('div', {class: 'btn-row', style: {marginTop: '12px'}},
              action('+ Add account', '', () => { adding = true; open = null; draw(); })),
      );
    }

    draw();
    load();
    return card;
  }

  setChildren(host,
    h('h1', {}, 'Accounts'),
    h('p', {class: 'sub'},
      user.role === 'admin'
        ? 'Your own details, and every account on this database.'
        : 'Your own details and password.'),
    profileCard(),
    passwordCard(),
    user.role === 'admin' ? directoryCard() : null,
    h('div', {class: 'card'},
      h('h2', {}, 'How records survive an account change'),
      h('p', {class: 'body'},
        'Requisitions are shared records: they belong to the unit, not to a person, and every ' +
        'signed-in user sees all of them. Removing an account never deletes a single requisition.'),
      h('p', {class: 'body'},
        'Each requisition also stores the service number of whoever wrote it. Give a new account ' +
        'the same service number and that person’s earlier requisitions are reconnected to it ' +
        'automatically — so a forgotten password, a deleted account or a posting out and back ' +
        'never costs anyone their history.'),
    ),
  );

  return host;
}
