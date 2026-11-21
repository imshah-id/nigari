// Asserts where a dragged block lands (src/dropTarget.ts, spec 021; #809, #824).
//
//   node scripts/check-droptarget.mjs
//
// Same shape as check-sidemenuhold.mjs: esbuild bundles the module once and it
// is imported. No framework. The page below is the one #812 measured on: a
// paragraph, a three-column layout whose columns each have a heading and three
// lines, and a paragraph below. The ones that would hurt most if they drifted:
// a drop on a column's first line that leaves the column (#824), a gap with two
// targets (the twitch), and the line drawn somewhere the drop does not go.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const tmp = mkdtempSync(join(tmpdir(), 'nigari-droptarget-'));
const bundle = join(tmp, 'dropTarget.mjs');

try {
  try {
    execFileSync(
      join(web, 'node_modules/esbuild/bin/esbuild'),
      [join(web, 'src/dropTarget.ts'), '--bundle', '--format=esm', '--outfile=' + bundle],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
  } catch (e) {
    console.error(String(e.stderr ?? e));
    process.exit(1);
  }
  const { dropTarget, lineFor, staysPut, openEdges, openingCentre } = await import(bundle);

  let failed = 0;
  let passed = 0;
  const check = (name, got, want) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    if (g === w) passed++;
    else {
      failed++;
      console.error(`  FAIL  ${name}: got ${g}, want ${w}`);
    }
  };

  // Lines are 24px tall with 8px between them.
  const box = (left, right, top) => ({ left, right, top, bottom: top + 24 });
  const line = (id, left, right, top, path = [], head = false) => ({ id, box: box(left, right, top), path, ...(head ? { head: true } : {}) });
  const column = (k, left, right) => ({
    box: { left, right, top: 64, bottom: 64 + 4 * 32 - 8 },
    lines: [
      line(k, left, right, 64, ['cols'], true),
      line(`${k}1`, left, right, 96, ['cols', k]),
      line(`${k}2`, left, right, 128, ['cols', k]),
      line(`${k}3`, left, right, 160, ['cols', k]),
    ],
  });
  const page = [
    { line: line('top', 100, 700, 0) },
    { line: line('list', 100, 700, 32) },
    { layout: { id: 'cols', box: { left: 100, right: 700, top: 64, bottom: 184 }, columns: [column('a', 100, 290), column('b', 310, 490), column('c', 510, 700)] } },
    { line: line('bottom', 100, 700, 192) },
  ];
  const at = (x, y, dragged) => dropTarget(page, x, y, dragged);
  const before = (id, head = false) => ({ kind: 'before', id, head });
  const after = (id, head = false) => ({ kind: 'after', id, head });

  // ---- plain blocks: each half of a line, and one target per gap ----
  check('upper half of the first line', at(300, 5), before('top'));
  check('lower half of the first line', at(300, 20), before('list'));
  check('upper half of the second line', at(300, 40), before('list'));
  for (const y of [25, 26, 28, 30, 31, 33, 35, 43]) check(`the gap above "list", y ${y}`, at(300, y), before('list'));
  check('below the last line', at(300, 400), after('bottom'));
  check('lower half of the last line', at(300, 210), after('bottom'));

  // ---- columns: a drop stays in the column it is over (#809, #824) ----
  check('upper half of a column\'s first line: above it, in that column', at(400, 66), before('b', true));
  check('lower half of a column\'s first line: under it, in that column', at(400, 84), before('b1'));
  check('the middle column, not the one to its left', at(320, 100), before('b1'));
  check('the last column', at(690, 135), before('c2'));
  check('lower half of a column\'s last line: after it', at(400, 178), after('b3'));
  check('the gap between two columns goes to the nearer one', at(296, 130), before('a2'));
  check('the gap between two columns, nearer the right one', at(305, 130), before('b2'));
  check('above the layout: before it', at(400, 62), before('cols'));
  check('below the layout: before the next block', at(400, 188), before('bottom'));
  check('past the right edge: the last column', at(900, 100), before('c1'));

  // ---- stacked columns (a phone): the column under the pointer ----
  const stacked = [{
    layout: {
      id: 'cols', box: { left: 0, right: 300, top: 0, bottom: 200 },
      columns: [
        { box: { left: 0, right: 300, top: 0, bottom: 88 }, lines: [line('a', 0, 300, 0, ['cols'], true), line('a1', 0, 300, 32, ['cols', 'a']), line('a2', 0, 300, 64, ['cols', 'a'])] },
        { box: { left: 0, right: 300, top: 112, bottom: 200 }, lines: [line('b', 0, 300, 112, ['cols'], true), line('b1', 0, 300, 144, ['cols', 'b'])] },
      ],
    },
  }];
  check('stacked: the second column', dropTarget(stacked, 150, 170), after('b1'));
  check('stacked: the end of the first column', dropTarget(stacked, 150, 80), after('a2'));

  // ---- a block cannot go inside itself ----
  check('into the dragged column: refused', at(400, 140, ['b']), null);
  check('beside the dragged column: allowed', at(200, 135, ['b']), before('a2'));
  check('above a nested line of a dragged parent: refused',
    dropTarget([{ line: line('p', 0, 300, 0) }, { line: line('p1', 20, 300, 32, ['p']) }], 50, 40, ['p']), null);

  // ---- a layout never goes into another layout's column ----
  const two = [...page, { layout: { id: 'cols2', box: { left: 100, right: 700, top: 300, bottom: 420 }, columns: [column('d', 100, 390), column('e', 410, 700)] } }];
  check('a dragged layout over a column: refused', dropTarget(two, 400, 135, ['cols2']), null);
  check('a dragged layout above a layout: allowed', dropTarget(two, 400, 62, ['cols2']), before('cols'));
  const nested = [{ layout: { id: 'cols', box: { left: 0, right: 600, top: 0, bottom: 200 }, columns: [
    { box: { left: 0, right: 290, top: 0, bottom: 200 }, lines: [line('a', 0, 290, 0, ['cols'], true), { id: 'inner', box: { left: 0, right: 290, top: 32, bottom: 200 }, path: ['cols', 'a'], columns: true }] },
    { box: { left: 310, right: 600, top: 0, bottom: 24 }, lines: [line('b', 310, 600, 0, ['cols'], true)] },
  ] } }];
  check('a nested layout dragged into a column: refused', dropTarget(nested, 400, 10, ['inner']), null);
  check('a block over a nested layout goes above or below it, not into it', dropTarget(nested, 100, 100), before('inner'));

  // ---- dropping a block where it already is changes nothing ----
  check('before itself', staysPut(page, before('b2'), ['b2']), true);
  check('before the block right after it', staysPut(page, before('b3'), ['b2']), true);
  check('after the block right before it is a move', staysPut(page, before('b2'), ['b3']), false);
  check('before a block two further down is a move', staysPut(page, before('bottom'), ['top']), false);
  check('before the next block, skipping its own children',
    staysPut([{ line: line('p', 0, 300, 0) }, { line: line('p1', 20, 300, 32, ['p']) }, { line: line('q', 0, 300, 64) }], before('q'), ['p']), true);

  // ---- the line is drawn where the target is ----
  const mid = (b) => b && Math.round((b.top + b.bottom) / 2);
  check('the line before "list" is in the gap above it', mid(lineFor(page, before('list'), 2)), 28);
  check('the line before b1 is in b\'s column', lineFor(page, before('b1'), 2) && lineFor(page, before('b1'), 2).left, 310);
  check('the line before b1 is between b and b1', mid(lineFor(page, before('b1'), 2)), 92);
  check('the line above a column\'s first line is above it, in that column', [lineFor(page, before('b', true), 2).left, mid(lineFor(page, before('b', true), 2))], [310, 62]);
  check('the line after a column\'s last line is under it', mid(lineFor(page, after('b3'), 2)), 186);
  check('the line is as thick as asked', (() => { const b = lineFor(page, before('list'), 2); return b.bottom - b.top; })(), 2);

  // ---- sideways (spec 021, PR 2): a new column, or side by side ----
  const side = { sideways: true };
  const col = (id, at, before) => ({ kind: 'column', id, at, before });
  const pair = { layout: { id: 'duo', box: { left: 100, right: 700, top: 64, bottom: 184 }, columns: [column('d', 100, 390), column('e', 410, 700)] } };
  const duo = [{ line: line('top', 100, 700, 0, [], false) }, pair];
  check('Q1: a row of 2 opens at every edge', openEdges(2), [0, 1, 2]);
  check('Q1: a row of 3 only at the far right', openEdges(3), [3]);
  check('Q1: a row of 4 nowhere', openEdges(4), []);
  check('row of 2: left edge of the first column', dropTarget(duo, 105, 100, ['top'], side), col('duo', 0, 'd'));
  check('row of 2: the gap between the columns', dropTarget(duo, 400, 100, ['top'], side), col('duo', 1, 'e'));
  check('row of 2: right edge of the first column is the same gap', dropTarget(duo, 380, 100, ['top'], side), col('duo', 1, 'e'));
  check('row of 2: right edge of the last column', dropTarget(duo, 695, 100, ['top'], side), col('duo', 2, null));
  check('row of 2: past the right edge', dropTarget(duo, 800, 100, ['top'], side), col('duo', 2, null));
  check('row of 2: over a column\'s text is a line, not a column', dropTarget(duo, 250, 100, ['top'], side), before('d1'));
  check('row of 3: an inner edge is a line', at(296, 130, ['top']) && dropTarget(page, 296, 130, ['top'], side), before('a2'));
  check('row of 3: the far right edge opens a 4th', dropTarget(page, 695, 130, ['top'], side), col('cols', 3, null));
  const four = [{ layout: { id: 'q', box: { left: 0, right: 800, top: 0, bottom: 120 }, columns: [column('w', 0, 185), column('x', 205, 390), column('y', 410, 595), column('z', 615, 800)] } }];
  check('row of 4: the far right edge is no column', dropTarget(four, 795, 100, ['top'], side).kind, 'before');
  check('without sideways (a narrow page): a line', dropTarget(duo, 695, 100, ['top']), before('e1'));
  check('a whole column at its own edge: nothing', dropTarget(duo, 400, 100, ['e'], side), null);
  check('a whole column at the other side: a move', dropTarget(duo, 105, 100, ['e'], side), col('duo', 0, 'd'));
  check('a layout dragged: no column inside columns', dropTarget([pair, { layout: { id: 'other', box: { left: 100, right: 700, top: 300, bottom: 400 }, columns: [column('f', 100, 390), column('g', 410, 700)] } }], 695, 100, ['other'], side), null);
  const stackedSide = dropTarget(stacked, 295, 170, ['zz'], side);
  check('stacked columns: no new column', stackedSide && stackedSide.kind, 'after');
  check('beside a plain block: left', dropTarget(duo, 105, 10, ['x'], side), { kind: 'beside', id: 'top', edge: 'left' });
  // The margin left of a block is where its handle is: a block moved down it reorders.
  check('the margin left of a plain block: a line, not beside', dropTarget(duo, 60, 10, ['x'], side), before('top'));
  check('the margin left of a layout: no new first column', dropTarget(duo, 60, 100, ['top'], side).kind, 'before');
  check('every column of a layout dragged to its edge: nothing', dropTarget(duo, 695, 100, ['d', 'e'], side), null);
  check('beside a plain block: right', dropTarget(duo, 695, 10, ['x'], side), { kind: 'beside', id: 'top', edge: 'right' });
  check('beside a plain block, over its text: a line', dropTarget(duo, 300, 5, ['x'], side), before('top'));
  check('beside itself: nothing beside', dropTarget(duo, 695, 10, ['top'], side).kind, 'before');
  check('beside a list item: a line', dropTarget([{ line: { ...line('li', 100, 700, 0), type: 'bulletListItem' } }], 695, 5, ['x'], side), before('li'));
  check('beside a nested block: a line', dropTarget([{ line: line('p', 100, 700, 0) }, { line: line('p1', 120, 700, 32, ['p']) }], 695, 40, ['x'], side), before('p1'));
  check('beside a plain block, no sideways: a line', dropTarget(duo, 695, 5, ['x']), before('top'));
  check('the line for a new column is in the opened gap', Math.round(openingCentre(pair.layout, 2)), 605);
  check('the line for a new column is vertical', (() => { const b = lineFor(duo, col('duo', 2, null), 2); return [b.right - b.left, b.top, b.bottom]; })(), [2, 64, 184]);
  check('the line beside a block is at its edge', (() => { const b = lineFor(duo, { kind: 'beside', id: 'top', edge: 'left' }, 2); return [b.left, b.right, b.top, b.bottom]; })(), [95, 97, 0, 24]);
  check('a sideways target never stays put', staysPut(duo, col('duo', 0, 'd'), ['top']), false);

  console.log(`  drop target: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
