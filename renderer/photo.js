/**
 * The visitor photograph: taken with the camera, or chosen from the machine.
 *
 * Everything here produces one thing — a small base64 JPEG data URL — so the
 * rest of the app never has to know where it came from or what format it was.
 * Any file size and any image format is accepted: the picture is shrunk to
 * `MAX_EDGE` **in the page, before it is sent**, so a 20 MB phone photo is
 * stored as roughly 30 KB.
 *
 * Formats the page decodes itself: JPEG, PNG, WebP, GIF, BMP, AVIF, ICO, SVG.
 * Anything else (HEIC/HEIF, TIFF, JPEG 2000, PSD, RAW…) is converted to JPEG
 * by the operating system's own tool in the main process — see
 * `electron/convert-image.js`.
 *
 * No library. A canvas resizes and re-encodes, which is the platform doing the
 * work that an image library would otherwise be installed for.
 */
import {h, setChildren, toast} from './ui.js';

/** The long edge of a stored photo. A pass prints it about 25mm wide. */
export const MAX_EDGE = 400;
/** JPEG quality. 0.72 is where a face stops improving and the bytes keep growing. */
export const QUALITY = 0.72;

/**
 * Every image type. The extensions are listed too because Windows and some
 * Linux desktops report no MIME type for HEIC, TIFF or RAW files, and the
 * picker would otherwise hide them.
 */
export const ACCEPT = 'image/*,.heic,.heif,.tif,.tiff,.jp2,.j2k,.jxl,.psd,.dng,.cr2,.cr3,.nef,.arw,.orf,.rw2,.raf';

/** Pixel size that fits inside `MAX_EDGE` without changing the shape of a face. */
export function fitted(width, height, max = MAX_EDGE) {
  const longest = Math.max(width, height);
  if (!longest || longest <= max) return {width: Math.max(1, width), height: Math.max(1, height)};
  const scale = max / longest;
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

/**
 * Draw whatever was given onto a canvas at the smaller size and read it back
 * as a JPEG.
 *
 * JPEG rather than PNG on purpose: a PNG of a photograph is several times
 * larger for no visible gain, and the ceiling on the other side is real.
 */
function render(source, {width, height}, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  /* White behind it: a transparent PNG would otherwise come out black in JPEG. */
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Shrunk to `MAX_EDGE` and re-encoded as a JPEG. */
const encode = (source, width, height) => render(source, fitted(width, height), QUALITY);

/** Loads a data URL into an <img>. Data URLs, not blob URLs: the page's CSP allows only those. */
const imageFrom = src => new Promise((resolve, reject) => {
  const el = new Image();
  el.onload = () => (el.naturalWidth ? resolve(el) : reject(new Error('empty image')));
  el.onerror = () => reject(new Error('undecodable'));
  el.src = src;
});

const readAsDataUrl = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

/**
 * A chosen file of any size and format, decoded, shrunk, and returned as a
 * JPEG data URL. Tried in order, cheapest first:
 *   1. createImageBitmap — every raster format Chromium knows, EXIF rotation applied
 *   2. an <img> — adds SVG
 *   3. the operating system's converter, in the main process — HEIC, TIFF, RAW…
 */
export async function fromFile(file) {
  if (!file) return '';

  try {
    const bmp = await createImageBitmap(file);
    try {
      return encode(bmp, bmp.width, bmp.height);
    } finally {
      bmp.close();
    }
  } catch { /* not a format Chromium decodes as a bitmap */ }

  try {
    const img = await imageFrom(await readAsDataUrl(file));
    return encode(img, img.naturalWidth, img.naturalHeight);
  } catch { /* nor as an <img> */ }

  const ext = (/\.([a-z0-9]{1,8})$/i.exec(file.name ?? '')?.[1] ?? 'img').toLowerCase();
  const res = await window.api.photo.convert(new Uint8Array(await file.arrayBuffer()), ext);
  if (!res?.ok) throw new Error(res?.error || 'That image could not be read. Try a JPEG or PNG.');
  const img = await imageFrom(res.data);
  return encode(img, img.naturalWidth, img.naturalHeight);
}

/**
 * Where this machine keeps its camera setting, so the dialog opens on the one
 * that was used last. A desk with a USB camera beside a laptop lid should not
 * have to be told which is which every time.
 */
const REMEMBERED = 'cvp.cameraId';

const remember = id => {
  try {
    if (id) localStorage.setItem(REMEMBERED, id);
  } catch {
    /* Private mode, or storage turned off. Not worth failing a photograph over. */
  }
};
const remembered = () => {
  try {
    return localStorage.getItem(REMEMBERED) ?? '';
  } catch {
    return '';
  }
};

/**
 * The cameras on this machine, named.
 *
 * A device label is empty until the user has allowed camera access at least
 * once — before that the browser will not say what is attached — so a
 * numbered fallback is used rather than an empty entry in the list. Pure, so
 * the shaping is tested without a camera.
 */
export function cameraOptions(devices) {
  return (devices ?? [])
    .filter(d => d?.kind === 'videoinput')
    .map((d, i) => ({
      id: String(d.deviceId ?? ''),
      label: String(d.label ?? '').trim() || `Camera ${i + 1}`,
    }));
}

/**
 * Which camera to open: the one used last if it is still attached, otherwise
 * the first.
 *
 * Checking it is still attached is the point — a remembered USB camera that has
 * since been unplugged would otherwise be requested by id and fail with a
 * device error, on a machine that has a perfectly good camera in the lid.
 */
export function preferredCamera(options, last = '') {
  if (!options?.length) return '';
  return options.some(o => o.id === last) ? last : options[0].id;
}

/**
 * What to tell somebody whose camera was refused, in the words of the system
 * that refused it. "Check your settings" is not help; naming the panel is.
 */
export function permissionHelp(userAgent = '') {
  if (/windows/i.test(userAgent))
    return 'Windows is blocking the camera. Open Settings → Privacy & security → Camera, turn on "Let desktop apps access your camera", then try again.';
  if (/mac os|macintosh/i.test(userAgent))
    return 'macOS is blocking the camera. Open System Settings → Privacy & Security → Camera, allow this app, then try again.';
  return 'The camera was refused. Allow camera access for this app in your system settings, then try again.';
}

/** What the camera is asked for: a decent frame, and no sound, ever. */
export const constraintsFor = id => ({
  /*
   * No `facingMode`. That is a phone's front-or-back question, and on a desktop
   * with a USB camera attached it is either meaningless or actively wrong — the
   * camera is chosen by id here instead.
   */
  video: id ? {deviceId: {exact: id}, width: {ideal: 1280}, height: {ideal: 960}}
            : {width: {ideal: 1280}, height: {ideal: 960}},
  audio: false,
});

/**
 * The camera, as a small dialog: a live preview, a camera to choose when more
 * than one is attached, one button to take the shot and one to accept it.
 *
 * Resolves to a data URL, or `''` if the dialog is closed without a picture.
 * The stream is stopped on every exit — a camera light left on after the dialog
 * closes is alarming, and on a laptop it is also a flat battery.
 */
export function capture() {
  return new Promise(resolve => {
    let stream = null;
    let shot = '';

    const video = h('video', {class: 'cam-view', autoplay: true, playsInline: true, muted: true});
    const still = h('img', {class: 'cam-view', alt: 'The photograph just taken', hidden: true});
    const status = h('p', {class: 'hint'}, 'Starting the camera…');

    const picker = h('select', {class: 'cam-pick', hidden: true, 'aria-label': 'Camera'});
    const shoot = h('button', {class: 'btn', type: 'button', disabled: true}, 'Take photo');
    const retake = h('button', {class: 'btn ghost', type: 'button', hidden: true}, 'Retake');
    const use = h('button', {class: 'btn primary', type: 'button', hidden: true}, 'Use this photo');
    const cancel = h('button', {class: 'btn ghost', type: 'button'}, 'Cancel');

    const dialog = h('div', {class: 'modal-back'},
      h('div', {class: 'modal cam', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Take a photograph'},
        h('h2', {}, 'Take a photograph'),
        video, still, picker, status,
        h('div', {class: 'btn-row'}, shoot, retake, use, cancel)));

    const stop = () => {
      stream?.getTracks().forEach(t => t.stop());
      stream = null;
    };

    /** Every exit goes through here, so the camera cannot be left running. */
    const close = value => {
      stop();
      document.removeEventListener('keydown', onKey);
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDevices);
      dialog.remove();
      resolve(value);
    };
    const onKey = e => {
      if (e.key === 'Escape') close('');
    };

    /** Open one camera, replacing whatever is already running. */
    async function open(id) {
      stop();
      shoot.disabled = true;
      status.textContent = 'Starting the camera…';
      status.className = 'hint';
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraintsFor(id));
        video.srcObject = stream;
        shoot.disabled = false;
        status.textContent = 'Ready.';
        remember(id);
        await listCameras();
      } catch (err) {
        /*
         * Said in the words of the system that refused it, and split by cause:
         * a blocked permission needs a settings panel, a missing camera needs a
         * cable, and a camera another program is holding needs that program
         * closed. "Could not start the camera" answers none of them.
         */
        status.className = 'hint err';
        status.textContent =
          err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
            ? permissionHelp(navigator.userAgent)
            : err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError'
              ? 'No camera was found. Attach one, or choose a file instead.'
              : err?.name === 'NotReadableError'
                ? 'The camera is in use by another program. Close it, then try again.'
                : 'The camera could not be started. Choose a file instead.';
      }
    }

    /**
     * Fill the picker, and show it only when there is a choice to make.
     *
     * Runs after the stream starts, because a device has no label until camera
     * access has been allowed once — before that the list reads "Camera 1,
     * Camera 2", which helps nobody decide.
     */
    async function listCameras() {
      const options = cameraOptions(await navigator.mediaDevices.enumerateDevices().catch(() => []));
      const current = stream?.getVideoTracks?.()[0]?.getSettings?.().deviceId ?? remembered();
      picker.replaceChildren(
        ...options.map(o => h('option', {value: o.id, selected: o.id === current}, o.label)),
      );
      picker.hidden = options.length < 2;
    }

    /* A camera plugged in or unplugged while the dialog is open. */
    const onDevices = () => {
      listCameras().catch(() => {});
    };

    picker.addEventListener('change', () => open(picker.value));
    shoot.addEventListener('click', () => {
      shot = encode(video, video.videoWidth, video.videoHeight);
      still.src = shot;
      still.hidden = false;
      video.hidden = true;
      picker.hidden = true;
      shoot.hidden = true;
      retake.hidden = false;
      use.hidden = false;
      status.textContent = 'Keep this one, or take another.';
    });
    retake.addEventListener('click', () => {
      shot = '';
      still.hidden = true;
      video.hidden = false;
      shoot.hidden = false;
      retake.hidden = true;
      use.hidden = true;
      status.textContent = 'Ready.';
      listCameras().catch(() => {});
    });
    use.addEventListener('click', () => close(shot));
    cancel.addEventListener('click', () => close(''));
    dialog.addEventListener('click', e => e.target === dialog && close(''));
    document.addEventListener('keydown', onKey);
    navigator.mediaDevices?.addEventListener?.('devicechange', onDevices);

    document.body.append(dialog);
    shoot.focus();

    if (!navigator.mediaDevices?.getUserMedia) {
      status.className = 'hint err';
      status.textContent = 'This machine has no camera support. Choose a file instead.';
      return;
    }

    /*
     * Opened without naming a camera first. The remembered one is requested
     * only once the list is known to still contain it — asking for an unplugged
     * USB camera by id fails on a machine whose built-in camera works fine.
     */
    navigator.mediaDevices.enumerateDevices()
      .then(devices => open(preferredCamera(cameraOptions(devices), remembered())))
      .catch(() => open(''));
  });
}

/**
 * The control that sits in a visitor row: a thumbnail, and the three things
 * that can be done to it.
 *
 * It owns its own redraw so the whole form does not have to be rebuilt when a
 * photo changes — redrawing the form would move focus out of whatever field
 * the user was in.
 */
export function photoField(visitor, {onChange, label = 'Photograph', hint = ''} = {}) {
  const box = h('div', {class: 'photo-field'});

  const set = value => {
    visitor.photo = value;
    onChange?.(value);
    draw();
  };

  const pick = h('input', {type: 'file', accept: ACCEPT, class: 'hidden-file'});
  pick.addEventListener('change', async () => {
    const [file] = pick.files ?? [];
    pick.value = '';                       // so the same file can be chosen twice
    if (!file) return;
    try {
      set(await fromFile(file));
    } catch (err) {
      toast(err, 'err');
    }
  });

  function draw() {
    const has = Boolean(visitor.photo);
    setChildren(box,
      h('span', {class: 'lbl'}, label),
      hint ? h('p', {class: 'hint'}, hint) : null,
      h('div', {class: 'photo-row'},
        has
          ? h('img', {class: 'photo-thumb', src: visitor.photo, alt: 'Visitor photograph'})
          : h('div', {class: 'photo-thumb empty', 'aria-hidden': 'true'}, 'No photo'),
        h('div', {class: 'photo-acts'},
          h('button', {class: 'btn small', type: 'button', onClick: async () => {
            const taken = await capture();
            if (taken) set(taken);
          }}, has ? 'Retake' : 'Take photo'),
          h('button', {class: 'btn small ghost', type: 'button', onClick: () => pick.click()},
            has ? 'Choose another' : 'Choose file'),
          has ? h('button', {class: 'btn small ghost', type: 'button', onClick: () => set('')}, 'Remove') : null,
          pick,
        ),
      ),
    );
  }

  draw();
  return box;
}
