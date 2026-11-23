// Asserts the column-width arithmetic (src/columnWidths.ts).
//
//   node scripts/check-columnwidths.mjs
//
// Same shape as check-treemode.mjs: esbuild bundles the module once and it is
// imported. No framework.
//
// What it pins is the part that quietly corrupts a page: a stored layout that
// no longer matches its column count, or a drag that leaves a column too narrow
// to grab back. The server applies the same rule (server/columns_test.go).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-colw-'));
const bundle = join(tmp, 'columnWidths.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/columnWidths.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }

  const cw = await import(bundle);
  const out = [];
  const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want) });

  // ---- Equal columns ----
  check('two equal', cw.equalWidths(2), [50, 50]);
  check('three equal sum to 100', cw.equalWidths(3).reduce((a, b) => a + b, 0), 100);
  check('equal layouts store nothing', cw.formatWidths([50, 50]), '');
  check('equal thirds store nothing', cw.formatWidths(cw.equalWidths(3)), '');
  check('a real layout is stored', cw.formatWidths([70, 30]), '70,30');

  // ---- Reading what is stored ----
  check('empty means equal', cw.parseWidths('', 2), null);
  check('missing means equal', cw.parseWidths(undefined, 2), null);
  check('a layout', cw.parseWidths('70,30', 2), [70, 30]);
  check('a layout for another count is ignored', cw.parseWidths('70,30', 3), null);
  check('text is ignored', cw.parseWidths('a,b', 2), null);
  check('a sliver is ignored', cw.parseWidths('99,1', 2), null);

  // ---- Dragging a divider ----
  check('move right', cw.moveDivider([50, 50], 0, 20), [70, 30]);
  check('move left', cw.moveDivider([50, 50], 0, -20), [30, 70]);
  check('cannot squeeze the right column', cw.moveDivider([50, 50], 0, 90), [85, 15]);
  check('cannot squeeze the left column', cw.moveDivider([50, 50], 0, -90), [15, 85]);
  check('the middle divider leaves the first column alone', cw.moveDivider([25, 50, 25], 1, 10), [25, 60, 15]);
  check('the total never changes', cw.moveDivider([33, 33, 34], 0, 7.4).reduce((a, b) => a + b, 0), 100);

  // ---- Every preset is a layout the rest accepts ----
  for (const p of cw.PRESETS) {
    check(`preset ${p.join('/')} sums to 100`, p.reduce((a, b) => a + b, 0), 100);
    check(`preset ${p.join('/')} survives a round trip`,
      cw.parseWidths(cw.formatWidths(p), p.length) ?? cw.equalWidths(p.length), [...p]);
  }

  // ---- A new column (spec 021, Q3: the owner's rule and Claude's defaults) ----
  check('40/30/30 + one at the end', cw.insertColumnWidths([40, 30, 30], 3), [40, 20, 20, 20]);
  check('50/50 + one at the end', cw.insertColumnWidths([50, 50], 2), [33, 33, 34]);
  check('50/50 + one at the start', cw.insertColumnWidths([50, 50], 0), [33, 33, 34]);
  check('thirds + one: four equal', cw.insertColumnWidths([33, 33, 34], 3), [25, 25, 25, 25]);
  check('70/30 + one in the middle: in proportion', cw.insertColumnWidths([70, 30], 1), [47, 33, 20]);
  check('50/30/20 + one: in proportion', cw.insertColumnWidths([50, 30, 20], 3), [37, 23, 15, 25]);
  check('a column of its own width keeps it', cw.insertColumnWidths([25, 50, 25], 3)[1], 50);
  check('the floor: 60/20/20 + one shrinks all in proportion', cw.insertColumnWidths([60, 20, 20], 3), [45, 15, 15, 25]);
  check('the floor, still under it: four equal', cw.insertColumnWidths([70, 15, 15], 3), [25, 25, 25, 25]);
  check('the new column sits where it was put', cw.insertColumnWidths([40, 30, 30], 0), [20, 40, 20, 20]);
  for (const [w, at] of [[[50, 50], 1], [[70, 30], 2], [[40, 30, 30], 0], [[33, 33, 34], 2]]) {
    check(`${w.join('/')} + one at ${at} sums to 100`, cw.insertColumnWidths(w, at).reduce((a, b) => a + b, 0), 100);
  }

  // ---- A column goes (FR-008): its room to its neighbours ----
  check('the last of two', cw.removeColumnWidths([70, 30], 1), [100]);
  check('the middle of three, in proportion', cw.removeColumnWidths([25, 50, 25], 1), [50, 50]);
  check('the first of three', cw.removeColumnWidths([20, 40, 40], 0), [60, 40]);
  check('the middle of four', cw.removeColumnWidths([25, 25, 25, 25], 1), [37, 38, 25]);

  check('grid template', cw.gridTemplate([70, 30]), 'minmax(0,70fr) minmax(0,30fr)');

  let fail = 0;
  for (const c of out) {
    if (c.got !== c.want) {
      fail++;
      console.log(`  FAIL ${c.name}: got ${c.got}, want ${c.want}`);
    }
  }
  console.log(`\n  column widths: ${out.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
