/** Tiny DOM helpers — enough to build the app without a framework or bundler. */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/**
 * Replaces an element's children, dropping conditional blanks first.
 *
 * `replaceChildren()` stringifies anything that is not a Node, so a `null`
 * left by a `cond ? node : null` would be inserted as the literal text
 * "null". `h()` already filters its own children; this does the same for the
 * call sites that build a child list directly.
 */
export function setChildren(el, ...children) {
  el.replaceChildren(
    ...children
      .flat(Infinity)
      .filter(c => c !== null && c !== undefined && c !== false && c !== true),
  );
}

export function mount(node) {
  const root = $('#root');
  root.className = '';
  setChildren(root, node);
}

/** Never renders an empty, null or "[object Object]" message at the user. */
export function toast(message, kind = '') {
  let text = typeof message === 'string' ? message.trim() : '';
  if (!text && message instanceof Error) text = message.message?.trim() ?? '';
  if (!text || text === 'null' || text === 'undefined' || text === '[object Object]') {
    text = kind === 'err' ? 'Something went wrong.' : 'Done.';
  }
  const el = h('div', {class: `toast ${kind}`}, text);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 4000);
  return text;
}

/**
 * A labelled input. `onInput` receives the raw value, so callers mutate their
 * own state object and never read back from the DOM.
 */
/**
 * A labelled input that checks itself as the user works.
 *
 * `opts.validate` receives the current value and returns a message or null.
 * The message only appears once the field has been left (or the form has been
 * submitted), so nothing is flagged before there was a chance to fill it in —
 * but once flagged, it clears the moment the value becomes valid.
 */
export function field(label, value, onInput, opts = {}) {
  const {type = 'text', placeholder = '', hint, required, multiline, rows = 3,
         options, validate, inputMode} = opts;
  const id = `f${Math.random().toString(36).slice(2, 9)}`;

  const handle = e => {
    onInput(e.target.value);
    if (touched) check();
  };

  const control = options
    ? h('select', {id, onChange: handle},
        ...options.map(o => h('option', {value: o.value, selected: o.value === value}, o.label)))
    : multiline
    ? h('textarea', {id, rows, placeholder, value: value ?? '', onInput: handle})
    : h('input', {id, type, placeholder, inputMode, value: value ?? '', onInput: handle});

  const errorEl = h('div', {class: 'field-error', hidden: true});
  let touched = false;

  function check({force = false} = {}) {
    if (!validate) return null;
    const message = validate(control.value) || null;
    if (force) touched = true;
    const visible = message && touched;
    wrapper.classList.toggle('bad', Boolean(visible));
    errorEl.hidden = !visible;
    errorEl.textContent = visible ? message : '';
    return message;
  }

  control.addEventListener('blur', () => {
    touched = true;
    check();
  });

  const wrapper = h('div', {class: 'field'},
    h('label', {for: id}, label, required ? h('span', {class: 'req'}, ' *') : null),
    control,
    errorEl,
    hint ? h('div', {class: 'hint'}, hint) : null,
  );

  // The form uses these to validate everything at once and focus the first problem.
  wrapper.check = check;
  wrapper.control = control;
  wrapper.fieldLabel = label;
  return wrapper;
}

export function chips(values, current, onPick) {
  return h('div', {class: 'chips'},
    ...values.map(v =>
      h('button', {
        class: 'chip',
        type: 'button',
        'aria-pressed': String(v.value === current),
        onClick: () => onPick(v.value),
      }, v.label)),
  );
}

export const cap = s => String(s ?? '').replace(/^./, c => c.toUpperCase());

export function pill(status, colors) {
  const c = colors[status] ?? '#637284';
  return h('span', {class: 'pill', style: {background: `${c}22`, color: c}}, status);
}

export const empty = (title, body) =>
  h('div', {class: 'empty'}, h('h3', {}, title), h('p', {}, body));

/**
 * Unwraps the {ok, data} envelope every IPC call returns, surfacing failures
 * as a toast so no caller has to repeat the error plumbing.
 */
export async function call(promise, {quiet = false} = {}) {
  let res;
  try {
    res = await promise;
  } catch (e) {
    // The bridge itself failed — a missing channel, or the main process
    // crashed. Surface it instead of swallowing it into a silent no-op.
    const msg = e?.message ? `The application could not complete that: ${e.message}` : 'Something went wrong.';
    if (!quiet) toast(msg, 'err');
    throw e instanceof Error ? e : new Error(msg);
  }
  if (res?.ok) return res.data;
  const msg = typeof res?.error === 'string' && res.error.trim()
    ? res.error.trim()
    : 'Something went wrong.';
  if (!quiet) toast(msg, 'err');
  throw new Error(msg);
}
