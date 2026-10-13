import {call, field, h, mount, setChildren, toast} from '../ui.js';
import {rules} from '../validate.js';

export function renderAuth(state, onSignedIn) {
  const {config, firstRun} = state;
  let mode = firstRun ? 'signup' : 'login';
  const form = {username: '', password: '', confirm: '', fullName: '', rank: '', serviceNo: ''};
  let busy = false;
  let signedIn = false;
  let submitBtn = null;
  let fields = [];
  const F = (...args) => {
    const el = field(...args);
    fields.push(el);
    return el;
  };

  /**
   * Toggles the button in place. Redrawing the card here would replace the
   * inputs the user is typing into and throw away their focus.
   */
  function toLogin() {
    mode = 'login';
    form.confirm = '';
    draw();
  }

  function setBusy(on) {
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.textContent = on
      ? 'Working…'
      : mode === 'login' ? 'Sign in' : 'Create account';
  }

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;

    // Reveal any inline messages and stop at the first one.
    const firstBad = fields
      .map(el => ({el, message: el.check({force: true})}))
      .find(x => x.message);
    if (firstBad) {
      firstBad.el.control?.focus?.();
      return;
    }

    busy = true;
    setBusy(true);
    try {
      const res =
        mode === 'signup'
          ? await call(window.api.auth.signup(form))
          : await call(window.api.auth.login(form.username, form.password));
      if (res.error) {
        toast(res.error, 'err');
        return;
      }
      // Hand off and stop: the app shell replaces this screen, so redrawing
      // the auth form afterwards would mount it straight back over the top.
      if (res.reclaimed) {
        toast(`${res.reclaimed} earlier requisition(s) reconnected to this account.`, 'ok');
      }
      signedIn = true;
      onSignedIn(res);
    } catch {
      /* call() already reported it */
    } finally {
      busy = false;
      if (!signedIn) setBusy(false);
    }
  }

  function draw() {
    fields = [];
    const signupAllowed = firstRun || config.allowSelfSignup;

    // Built up front because the password field re-checks it as you type.
    // Only in sign-up mode: registering it while signing in would make its
    // "does not match" rule block every login.
    const confirmField = mode === 'signup'
      ? F('Confirm password', form.confirm, v => (form.confirm = v),
          {type: 'password', required: true,
           validate: v => (v === form.password ? null : 'This does not match the password above.')})
      : null;
    mount(
      h('div', {class: 'auth'},
        h('form', {class: 'auth-card', onSubmit: submit},
          // Nothing to go back to on a first run, or when already signing in.
          mode === 'signup' && !firstRun
            ? h('button', {class: 'btn ghost sm back-link', type: 'button', onClick: toLogin},
                '← Back to sign in')
            : null,
          h('div', {class: 'auth-head'},
            h('div', {class: 'boot-mark'}, 'CVP'),
            h('h1', {}, config.appName),
            h('p', {}, config.unitName),
          ),
          h('h2', {},
            firstRun ? 'Create the administrator account'
              : mode === 'login' ? 'Sign in' : 'Create an account'),

          firstRun
            ? h('p', {class: 'hint', style: {marginBottom: '14px'}},
                'No accounts exist yet. The first account created is the administrator.')
            : null,

          h('div', {class: 'grid'},
            F('Username', form.username, v => (form.username = v),
              {required: true, placeholder: 'e.g. r.sharma',
               validate: mode === 'signup'
                 ? rules.all(rules.required('Username'), v =>
                     /^[A-Za-z0-9._-]{3,32}$/.test(v.trim())
                       ? null
                       : 'Use 3–32 letters, digits, dots, underscores or hyphens.')
                 : rules.required('Username')}),

            ...(mode === 'signup' ? [
              F('Full name', form.fullName, v => (form.fullName = v),
                {required: true, placeholder: 'e.g. Rahul Sharma',
                 validate: rules.all(rules.required('Full name'), rules.maxLen('Full name', 255))}),
              F('Rank / designation', form.rank, v => (form.rank = v),
                {placeholder: 'e.g. Lt Cdr', validate: rules.maxLen('Rank', 255)}),
              F('Service number', form.serviceNo, v => (form.serviceNo = v), {
                placeholder: 'e.g. 224477',
                hint: 'Optional, but it is what reconnects you to your own records if this account is ever recreated.',
                validate: v => (!v.trim() || /^[A-Za-z0-9/-]{3,32}$/.test(v.trim())
                  ? null : 'Use 3–32 letters, digits, / or -.'),
              }),
            ] : []),

            F('Password', form.password, v => {
              form.password = v;
              confirmField?.check();   // the match may have just become true
            }, {
              type: 'password',
              required: true,
              hint: mode === 'signup'
                ? `At least ${config.minPasswordLength} characters, including a letter and a number.`
                : undefined,
              validate: mode === 'signup'
                ? rules.all(rules.required('Password'), v => {
                    if (v.length < config.minPasswordLength)
                      return `Use at least ${config.minPasswordLength} characters.`;
                    if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v))
                      return 'Include at least one letter and one number.';
                    return null;
                  })
                : rules.required('Password'),
            }),

            ...(mode === 'signup'
              ? [confirmField]
              : []),
          ),

          (submitBtn = h('button', {
            class: 'btn', type: 'submit', disabled: busy,
            style: {width: '100%', justifyContent: 'center', marginTop: '16px'},
          }, busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account')),

          signupAllowed && !firstRun
            ? h('button', {
                class: 'btn link', type: 'button',
                style: {width: '100%', marginTop: '10px'},
                onClick: () => {
                  mode = mode === 'login' ? 'signup' : 'login';
                  draw();
                },
              }, mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in')
            : null,

          h('p', {class: 'auth-foot'}, 'Works entirely offline. Data stays on this machine.'),
        ),
      ),
    );
  }

  draw();
}
