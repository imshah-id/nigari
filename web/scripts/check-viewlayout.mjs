// A view switched to another layout (spec 018, R2): the browser's switchLayout
// must give the defaults set_view's switchViewLayout gives, so a view changed
// in the interface and one changed by an agent end up the same. Both run the
// cases in server/testdata/viewlayout/cases.json; this is the browser half.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'nigari-viewlayout-'));
let passed = 0;
let failed = 0;
try {
  const outfile = join(tmp, 'viewLayout.mjs');
  await build({
    entryPoints: [join(webDir, 'src/viewLayout.ts')],
    bundle: true, format: 'esm', outfile, logLevel: 'silent',
    plugins: [{
      name: 'no-i18n',
      setup(b) {
        b.onResolve({ filter: /\/i18n$/ }, () => ({ path: 'i18n', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const t = (s) => s; export const plural = (s) => s;', loader: 'js' }));
      },
    }],
  });
  const m = await import(pathToFileURL(outfile).href);
  const { schemas, cases } = JSON.parse(readFileSync(join(webDir, '../server/testdata/viewlayout/cases.json'), 'utf8'));
  // Key order is not a difference: compare as sorted JSON.
  const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b, 'en'))) : x)); // i18n-ok: comparing keys, not showing text
  for (const c of cases) {
    const before = JSON.stringify(c.view);
    try {
      const got = m.switchLayout(c.view, c.type, schemas[c.schema]);
      assert.equal(canon(got.view), canon(c.want), `${c.name}: view`);
      assert.equal(got.needsDate, c.needsDate, `${c.name}: needsDate`);
      assert.equal(JSON.stringify(c.view), before, `${c.name}: the view passed in was changed`);
      passed++;
    } catch (e) {
      failed++;
      console.error('  FAIL', e.message);
    }
  }
  // The added date property's name.
  const named = [
    [[], 'Date'],
    [[{ id: 'a', name: 'date', type: 'text' }], 'Date 2'],
    [[{ id: 'a', name: 'Date', type: 'date' }, { id: 'b', name: 'Date 2', type: 'text' }], 'Date 3'],
  ];
  for (const [schema, want] of named) {
    try {
      assert.equal(m.newDateName(schema, 'Date'), want);
      passed++;
    } catch (e) {
      failed++;
      console.error('  FAIL newDateName', e.message);
    }
  }
  try {
    assert.deepEqual(m.newDateProperty([{ id: 'date', name: 'Date', type: 'date' }], 'Date'), { id: 'date_', name: 'Date 2', type: 'date' });
    passed++;
  } catch (e) {
    failed++;
    console.error('  FAIL newDateProperty', e.message);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`  view layout: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
