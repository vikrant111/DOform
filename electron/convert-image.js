import {execFile} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

const run = promisify(execFile);

/**
 * Turns an image the page cannot decode — HEIC/HEIF from a phone, TIFF, JPEG
 * 2000, PSD, camera RAW — into a JPEG, using the converter the operating
 * system already has. No library: each OS ships one.
 *
 *   macOS    `sips`, which reads everything Preview can open
 *   Windows  the Windows Imaging Component, through PowerShell. Reads what
 *            Photos can (TIFF, BMP, GIF, ICO, JPEG-XR, DNG…). HEIC needs the
 *            free "HEIF Image Extensions" from the Microsoft Store.
 *   Linux    ImageMagick (`magick` or `convert`) when it is installed
 *
 * Everything else (JPEG, PNG, WebP, GIF, BMP, AVIF, ICO, SVG) is decoded in the
 * page and never comes here.
 */
const WINDOWS_SCRIPT = `
Add-Type -AssemblyName PresentationCore
$d = [System.Windows.Media.Imaging.BitmapDecoder]::Create([Uri]$env:IMG_IN, 'IgnoreColorProfile', 'OnLoad')
$e = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
$e.QualityLevel = 92
$e.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($d.Frames[0]))
$s = [IO.File]::Create($env:IMG_OUT); $e.Save($s); $s.Close()`;

const commands = (input, output) => ({
  darwin: [['sips', ['-s', 'format', 'jpeg', input, '--out', output]]],
  win32: [['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT]]],
}[process.platform] ?? [
  ['magick', [input + '[0]', output]],
  ['convert', [input + '[0]', output]],
]);

/** Bytes in, JPEG bytes out. Throws a message fit to show the user. */
export async function toJpeg(bytes, ext = 'img') {
  const dir = await mkdtemp(join(tmpdir(), 'cvp-photo-'));
  const input = join(dir, `in.${ext}`);
  const output = join(dir, 'out.jpg');
  try {
    await writeFile(input, bytes);
    for (const [cmd, args] of commands(input, output)) {
      try {
        await run(cmd, args, {timeout: 30_000, windowsHide: true,
          env: {...process.env, IMG_IN: input, IMG_OUT: output}});
        return await readFile(output);
      } catch {
        /* Not installed, or could not read this file: try the next one. */
      }
    }
    throw new Error(process.platform === 'win32' && /^hei[cf]$/i.test(ext)
      ? 'Windows cannot read HEIC photos yet. Install "HEIF Image Extensions" from the Microsoft Store, or choose a JPEG.'
      : 'That image format could not be read on this computer. Try a JPEG or PNG.');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}
