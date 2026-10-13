import assert from 'node:assert/strict';
import test, {describe} from 'node:test';
import {ACCEPT, MAX_EDGE, QUALITY, cameraOptions, constraintsFor,
        fitted, permissionHelp, preferredCamera} from '../renderer/photo.js';
import {LIMITS, photo as guardPhoto} from '../electron/guards.js';
import {blankRequisition, blankVisitor} from '../renderer/validate.js';

/**
 * The sizing maths the page uses before a picture crosses the bridge.
 *
 * Only the pure half is exercised here: the canvas, the camera and the file
 * reader are the browser's, and testing them would be testing Chromium. What is
 * ours — and what decides how large a stored photograph is — is
 * the number the canvas is given.
 */
describe('visitor photograph', () => {
  test('a picture is shrunk to the long edge, keeping its shape', () => {
    assert.deepEqual(fitted(1200, 1600), {width: 300, height: 400}, 'portrait');
    assert.deepEqual(fitted(1600, 1200), {width: 400, height: 300}, 'landscape');
    assert.deepEqual(fitted(800, 800), {width: 400, height: 400}, 'square');

    /* The aspect ratio must survive, or every face comes out stretched. */
    const wide = fitted(4032, 3024);
    assert.equal(Math.round((wide.width / wide.height) * 100), Math.round((4032 / 3024) * 100));
  });

  test('a picture already small enough is left alone', () => {
    assert.deepEqual(fitted(300, 200), {width: 300, height: 200});
    assert.deepEqual(fitted(MAX_EDGE, 10), {width: MAX_EDGE, height: 10});
  });

  /*
   * A canvas of zero width throws, and a zero comes from a video element read
   * before the camera has delivered its first frame — which is exactly the
   * moment somebody presses the button.
   */
  test('a degenerate size never reaches the canvas as zero', () => {
    assert.deepEqual(fitted(0, 0), {width: 1, height: 1});
    assert.deepEqual(fitted(0, 600), {width: 1, height: 400});
    assert.equal(fitted(1, 10000).width >= 1, true);
  });

  test('there is no size limit, only a print resolution', () => {
    assert.equal(LIMITS.photo, undefined);
    assert.ok(QUALITY > 0 && QUALITY <= 1);
    assert.ok(MAX_EDGE >= 200, 'a pass photograph still has to be a recognisable face');
  });

  test('every image format is offered in the file picker', () => {
    assert.ok(ACCEPT.startsWith('image/*'));
    /* Listed by extension too: Windows gives these files no MIME type. */
    for (const ext of ['.heic', '.heif', '.tiff', '.dng']) assert.ok(ACCEPT.includes(ext));
    assert.ok(!ACCEPT.includes('video/'));
  });

  test('a new requisition starts with no photograph, and a visitor never has one', () => {
    assert.equal(blankRequisition('u1').photo, '');
    /* An empty one is what the guard calls acceptable, not an error. */
    assert.equal(guardPhoto(blankRequisition('u1').photo), '');
    /* One picture per pass, so a visitor row has no photo of its own. */
    assert.equal(blankVisitor().photo, undefined);
  });
});

/**
 * The upgrade path.
 *
 * Every installation already in use has a `requisitions` table without a
 * `photo` column, and some have one on `visitors` from the version that put it
 * there first. The schema files only ever run as CREATE TABLE IF NOT EXISTS, so
 * they do nothing to a database that already exists — `ADDED_COLUMNS` and the
 * backfill beside it are what reach those. Getting it wrong is not a missing
 * feature: it is every save failing on a column that is not there, or somebody
 * losing a photograph they had already taken.
 */
describe('an existing database is carried forward', () => {
  const sqlite = async file => {
    const db = await import('../electron/db.js');
    return db.openStandalone({engine: 'sqlite', file});
  };

  test('a database made before photographs gains the column', async () => {
    const {mkdtempSync, rmSync} = await import('node:fs');
    const {tmpdir} = await import('node:os');
    const {join} = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'doform-photo-'));
    try {
      const file = join(dir, 'old.db');
      const first = await sqlite(file);
      await first.run('ALTER TABLE requisitions DROP COLUMN photo');
      assert.ok(!(await first.columns('requisitions')).includes('photo'), 'set up as a pre-photo database');
      await first.close();

      /* Opening it again is what an update does. */
      const upgraded = await sqlite(file);
      assert.ok((await upgraded.columns('requisitions')).includes('photo'), 'the column was added on open');
      await upgraded.close();
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  /*
   * A photograph taken while it lived on the visitor is moved onto the
   * requisition. Without this it would still be in the database, on a column
   * nothing reads any more — which is the worst of both: not lost, not shown.
   */
  test('a photograph taken on a visitor is carried onto the requisition', async () => {
    const {mkdtempSync, rmSync} = await import('node:fs');
    const {tmpdir} = await import('node:os');
    const {join} = await import('node:path');
    const PNG = 'data:image/png;base64,iVBORw0KGgo=';
    const dir = mkdtempSync(join(tmpdir(), 'doform-carry-'));
    try {
      const file = join(dir, 'old.db');
      const old = await sqlite(file);
      /* A database shaped like the one that stored it on the visitor. */
      await old.run('ALTER TABLE requisitions DROP COLUMN photo');
      await old.run("ALTER TABLE visitors ADD COLUMN photo TEXT NOT NULL DEFAULT ''");
      await old.run('INSERT INTO requisitions (id, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', ['r1']);
      await old.run('INSERT INTO requisitions (id, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', ['r2']);
      /* Two visitors, and the second is the one with the picture. */
      await old.run('INSERT INTO visitors (id, requisition_id, ser, name, photo) VALUES (?,?,?,?,?)', ['v1', 'r1', 1, 'Rahul', '']);
      await old.run('INSERT INTO visitors (id, requisition_id, ser, name, photo) VALUES (?,?,?,?,?)', ['v2', 'r1', 2, 'Meena', PNG]);
      await old.run('INSERT INTO visitors (id, requisition_id, ser, name, photo) VALUES (?,?,?,?,?)', ['v3', 'r2', 1, 'Das', '']);
      await old.close();

      const now = await sqlite(file);
      const [r1] = await now.all('SELECT photo FROM requisitions WHERE id = ?', ['r1']);
      const [r2] = await now.all('SELECT photo FROM requisitions WHERE id = ?', ['r2']);
      assert.equal(r1.photo, PNG, 'the picture moved to the requisition');
      assert.equal(r2.photo ?? '', '', 'a record that never had one still has none');

      /* Running again must not overwrite a newer picture with the old one. */
      const NEWER = 'data:image/png;base64,UklGRg==';
      await now.run('UPDATE requisitions SET photo = ? WHERE id = ?', [NEWER, 'r1']);
      await now.close();
      const again = await sqlite(file);
      assert.equal((await again.all('SELECT photo FROM requisitions WHERE id = ?', ['r1']))[0].photo, NEWER,
        'the backfill only fills what is empty');
      await again.close();
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
