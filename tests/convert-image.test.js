import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {toJpeg} from '../electron/convert-image.js';

/*
 * The formats the page cannot decode go through the OS converter. Only
 * runnable where `sips` can make the sample files, i.e. on macOS.
 */
test('HEIC and TIFF become JPEG through the OS converter', {skip: process.platform !== 'darwin'}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cvp-conv-'));
  try {
    for (const fmt of ['heic', 'tiff']) {
      const file = join(dir, `t.${fmt}`);
      execFileSync('sips', ['-s', 'format', fmt, 'build/icon.png', '--out', file], {stdio: 'ignore'});
      const jpg = await toJpeg(readFileSync(file), fmt);
      assert.equal(jpg[0], 0xff, `${fmt}: JPEG magic`);
      assert.equal(jpg[1], 0xd8);
    }
    await assert.rejects(toJpeg(Buffer.from('not an image'), 'heic'), /could not be read|HEIF/);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
