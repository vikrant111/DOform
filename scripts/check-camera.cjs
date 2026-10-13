#!/usr/bin/env electron
/**
 * Does the camera work on this machine?
 *
 *   npm run check:camera             a real camera, if one is attached
 *   npm run check:camera -- --fake   Chromium's test pattern, no hardware needed
 *
 * This exists because the camera is the one part of the app that cannot be
 * tested without a window: `npm test` is plain Node and runs anywhere, while
 * `getUserMedia` needs a renderer, a display, and the operating system's
 * permission. On Windows that permission is a switch in Settings that nothing
 * in the app can see — so this is what to run on the machine itself, before
 * anybody is told the feature works there.
 *
 * It loads the real page, with the real preload, CSP and sandbox, so a refusal
 * here is a refusal the operator would have had.
 */
const {app, BrowserWindow} = require('electron');
const {join} = require('node:path');

const FAKE = process.argv.includes('--fake');
if (FAKE) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

const ROOT = join(__dirname, '..');
const C = process.stdout.isTTY
  ? {ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[2m', off: '\x1b[0m'}
  : {ok: '', bad: '', dim: '', off: ''};

let failures = 0;
const check = (label, pass, detail = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? C.ok + '✓' : C.bad + '✗'}${C.off} ${label}  ${C.dim}${detail}${C.off}`);
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The same rule the app itself applies: the camera, and nothing else.
  const ALLOWED = new Set(['media']);
  win.webContents.session.setPermissionRequestHandler((_wc, p, done) => done(ALLOWED.has(p)));
  win.webContents.session.setPermissionCheckHandler((_wc, p) => ALLOWED.has(p));

  await win.loadFile(join(ROOT, 'renderer', 'index.html'));

  console.log(`\n\x1b[1mCamera\x1b[0m ${C.dim}— ${process.platform}, ${FAKE ? 'fake device' : 'real hardware'}${C.off}\n`);

  const r = await win.webContents.executeJavaScript(`(async () => {
    const out = {secure: window.isSecureContext, has: !!navigator.mediaDevices?.getUserMedia};
    try {
      const s = await navigator.mediaDevices.getUserMedia(
        {video: {width: {ideal: 1280}, height: {ideal: 960}}, audio: false});
      out.settings = s.getVideoTracks()[0].getSettings();

      const v = document.createElement('video');
      v.srcObject = s; v.muted = true; v.playsInline = true;
      await v.play();
      await new Promise(done => setTimeout(done, 400));
      out.frame = {w: v.videoWidth, h: v.videoHeight};

      const c = document.createElement('canvas');
      c.width = 400;
      c.height = Math.max(1, Math.round(400 * v.videoHeight / Math.max(1, v.videoWidth)));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.72);
      out.jpeg = {ok: url.startsWith('data:image/jpeg;base64,'), bytes: url.length};

      s.getTracks().forEach(t => t.stop());
      out.stopped = s.getVideoTracks().every(t => t.readyState === 'ended');
      out.cameras = (await navigator.mediaDevices.enumerateDevices())
        .filter(d => d.kind === 'videoinput').map(d => d.label || '(unnamed)');
    } catch (e) { out.error = e.name + ': ' + e.message; }
    return out;
  })()`);

  check('the page is a secure context', r.secure === true, 'getUserMedia is refused outside one');
  check('getUserMedia is available', r.has === true);

  if (r.error) {
    check('the camera opened', false, r.error);
    console.log(`\n  ${C.dim}NotAllowedError on Windows: Settings → Privacy & security → Camera →${C.off}`);
    console.log(`  ${C.dim}turn on "Let desktop apps access your camera".${C.off}`);
    console.log(`  ${C.dim}On macOS: System Settings → Privacy & Security → Camera.${C.off}`);
    console.log(`  ${C.dim}No camera attached? Run with --fake to test the rest.${C.off}`);
  } else {
    check('the camera opened', true, `${r.settings?.width}×${r.settings?.height}`);
    check('a frame reached the page', r.frame?.w > 0 && r.frame?.h > 0, `${r.frame?.w}×${r.frame?.h}`);
    check('a frame encodes to a JPEG', r.jpeg?.ok === true, `${r.jpeg?.bytes} characters of data URL`);
    // A camera light left on after the dialog closes is alarming, and on a
    // laptop it is also a flat battery.
    check('the camera is released afterwards', r.stopped === true);
    check('at least one camera is listed', (r.cameras ?? []).length > 0, (r.cameras ?? []).join(', '));
    if ((r.cameras ?? []).length > 1) {
      console.log(`  ${C.dim}More than one camera — the dialog offers a picker.${C.off}`);
    }
  }

  console.log('\n' + '─'.repeat(58));
  console.log(failures === 0
    ? `${C.ok}The camera works on this machine.${C.off}`
    : `${C.bad}${failures} check(s) failed.${C.off}`);
  app.exit(failures ? 1 : 0);
}).catch(err => {
  console.error('Could not start:', err?.message ?? err);
  app.exit(1);
});
