import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// Where a dragged block lands (spec 021, epic #812).
//
// SC-001: the block lands where the line showed, at every kind of spot: between
// plain blocks, above and below each line of a column, a column's first and
// last line, above and below the layout. #809 measured the line one column to
// the left in a layout, and #824 a drop on a column's first line that made an
// extra column.
// SC-002: no drop changes how many columns a layout has (the vertical line
// that would offer a new column comes with PR 2).
// SC-005: the layout bar takes no room, and showing it moves nothing.
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const para = (id, text, children = []) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children });
  const head = (id, text, children) => ({ id, type: 'heading', props: { level: 3 }, content: [{ type: 'text', text, styles: {} }], children });
  const column = (k, name) => head(k, name, [para(`${k}1`, `${name} one`), para(`${k}2`, `${name} two`), para(`${k}3`, `${name} three`)]);
  const start = () => [
    para('mover', 'The block that is dragged'),
    para('top', 'A paragraph above the columns'),
    { id: 'cols', type: 'columns', props: { count: 3 }, content: [], children: [column('a', 'Do'), column('b', 'Plan'), column('c', 'Think')] },
    para('bottom', 'A paragraph below the columns'),
    para('last', 'The last paragraph'),
  ];
  const doc = await api('POST', '/api/pages', { title: 'Drops', workspaceId: workspace.id });

  const text = (id) => page.locator(`[data-id="${id}"] .bn-inline-content`).first().boundingBox();
  const open = async () => {
    await api('PATCH', `/api/pages/${doc.id}`, { content: start() });
    await page.goto(`${base}/p/${doc.id}`);
    await page.locator('[data-id="c3"] .bn-inline-content').waitFor();
    await page.mouse.move(1, 1);
  };
  // Drags "mover" by its handle to (x, y) in small steps, as a hand does, and
  // returns where the line was just before the drop.
  const drag = async (x, y) => {
    const from = await text('mover');
    await page.mouse.move(from.x + 10, from.y + 10);
    for (let px = from.x + 8; px >= from.x - 10; px -= 2) await page.mouse.move(px, from.y + 12);
    await page.mouse.down();
    const steps = 30;
    for (let i = 1; i <= steps; i++) await page.mouse.move(from.x - 10 + (x - from.x + 10) * i / steps, from.y + 12 + (y - from.y - 12) * i / steps);
    const line = await page.evaluate(() => {
      const l = document.querySelector('.nigari-drop-line');
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return { left: r.left, right: r.right, y: (r.top + r.bottom) / 2, height: r.height, colour: getComputedStyle(l).backgroundColor };
    });
    const others = await page.locator('[class*="prosemirror-dropcursor"]').count();
    await page.mouse.up();
    return { line, others };
  };
  // Where "mover" ended up: its parent's id (null at the top) and its place.
  const landed = async () => {
    let found = null;
    await eventually(async () => {
      const content = (await api('GET', `/api/pages/${doc.id}`)).content;
      const walk = (blocks, parent) => {
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i];
          if (b.id === 'mover') return { parent, index: i, siblings: blocks.map((s) => s.id), content };
          const r = walk(b.children ?? [], b.id);
          if (r) return r;
        }
        return null;
      };
      const r = walk(content, null);
      // Moved: no longer the first block of the page.
      if (r && !(r.parent === null && r.index === 0)) found = r;
      return found !== null;
    });
    return found;
  };

  // Each spot: where the pointer goes (a line's id and how far down its text,
  // 0 = top, 1 = bottom; or a gap under a line), where the block must land,
  // and which boxes the line must sit between.
  const spots = [
    { name: 'between two plain blocks', at: ['bottom', 0.8], parent: null, after: 'bottom', between: ['bottom', 'last'] },
    { name: 'above the layout', at: ['top', 0.8], parent: null, after: 'top', between: ['top', 'a'] },
    { name: 'upper half of a column\'s first line', at: ['b', 0.25], column: 'b', first: true },
    { name: 'lower half of a column\'s first line', at: ['b', 0.75], parent: 'b', after: null, between: ['b', 'b1'] },
    { name: 'between two lines of the middle column', at: ['b2', 0.25], parent: 'b', after: 'b1', between: ['b1', 'b2'] },
    { name: 'lower half of the last column\'s last line', at: ['c3', 0.8], parent: 'c', after: 'c3', between: ['c3', 'bottom'] },
    { name: 'upper half of the first column\'s last line', at: ['a3', 0.25], parent: 'a', after: 'a2', between: ['a2', 'a3'] },
  ];

  for (const s of spots) {
    await open();
    const t = await text(s.at[0]);
    const { line, others } = await drag(t.x + 30, t.y + t.height * s.at[1]);
    assert(line, `${s.name}: no drop line while dragging`);
    assert.equal(others, 0, `${s.name}: BlockNote's own line showed too`);
    const r = await landed();
    const cols = r.content.find((b) => b.id === 'cols');
    assert.equal(cols.children.length, 3, `${s.name}: the layout no longer has 3 columns (SC-002)`);
    assert.equal(cols.props.count, 3, `${s.name}: the layout's count changed (SC-002)`);
    if (s.first) {
      // Above a column's first line: the block is the column's first line now,
      // and the old one is its next line.
      const col = cols.children[['a', 'b', 'c'].indexOf(s.column)];
      assert.equal(col.id, 'mover', `${s.name}: the block is not the column's first line`);
      assert.deepEqual(col.children.map((c) => c.id), [s.column, `${s.column}1`, `${s.column}2`, `${s.column}3`], `${s.name}: the column's lines are out of order`);
      continue;
    }
    assert.equal(r.parent, s.parent, `${s.name}: landed under ${r.parent}, not ${s.parent}`);
    const want = s.after === null ? 0 : r.siblings.indexOf(s.after) + 1;
    assert.equal(r.index, want, `${s.name}: landed at ${r.index} among ${r.siblings.join(',')}`);
  }

  // The line sat where the block then landed: draw again and compare with the
  // boxes the block went between, before the drop moved anything.
  for (const s of spots.filter((x) => x.between)) {
    await open();
    const [above, below] = await Promise.all(s.between.map(text));
    const t = await text(s.at[0]);
    const from = await text('mover');
    await page.mouse.move(from.x + 10, from.y + 10);
    for (let px = from.x + 8; px >= from.x - 10; px -= 2) await page.mouse.move(px, from.y + 12);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(from.x - 10 + (t.x + 40 - from.x) * i / 30, from.y + 12 + (t.y + t.height * s.at[1] - from.y - 12) * i / 30);
    const l = await page.evaluate(() => { const r = document.querySelector('.nigari-drop-line').getBoundingClientRect(); return { y: (r.top + r.bottom) / 2, left: r.left, right: r.right }; });
    await page.mouse.up();
    assert(l.y >= above.y + above.height - 1 && l.y <= below.y + 1, `${s.name}: the line (y ${l.y}) is not between ${s.between.join(' and ')}`);
    const col = await page.locator(`[data-id="${s.between[0]}"] .bn-block-content`).first().boundingBox();
    assert(l.left <= col.x + 1 && l.right >= col.x + col.width - 1, `${s.name}: the line is not across ${s.between[0]}'s line (x ${l.left}–${l.right})`);
  }

  // ---- one spot per gap: a slow sweep down a gap shows one line ----
  await open();
  {
    const a = await text('bottom');
    const b = await text('last');
    const from = await text('mover');
    await page.mouse.move(from.x + 10, from.y + 10);
    for (let px = from.x + 8; px >= from.x - 10; px -= 2) await page.mouse.move(px, from.y + 12);
    await page.mouse.down();
    await page.mouse.move(a.x + 40, a.y + a.height * 0.6, { steps: 20 });
    const ys = new Set();
    for (let y = a.y + a.height * 0.6; y <= b.y + b.height * 0.4; y += 1) {
      await page.mouse.move(a.x + 40, y);
      ys.add(await page.evaluate(() => Math.round(document.querySelector('.nigari-drop-line')?.getBoundingClientRect().top ?? -1)));
    }
    await page.mouse.up();
    assert.equal(ys.size, 1, `the line moved between ${ys.size} spots in one gap: ${[...ys].join(', ')}`);
  }

  // ---- SC-005: the layout bar takes no room, and showing it moves nothing ----
  await open();
  const toColumns = await page.evaluate(() => {
    const top = document.querySelector('[data-id="top"] .bn-block-content').getBoundingClientRect();
    const first = document.querySelector('[data-id="a"] .bn-block-content').getBoundingClientRect();
    const next = document.querySelector('[data-id="mover"] .bn-block-content').getBoundingClientRect();
    const after = document.querySelector('[data-id="top"] .bn-block-content').getBoundingClientRect();
    return { columns: Math.round(first.top - top.bottom), plain: Math.round(after.top - next.bottom) };
  });
  assert.equal(toColumns.columns, toColumns.plain, `a paragraph to the columns' first line is ${toColumns.columns}px, between two paragraphs ${toColumns.plain}px`);
  const lines = () => page.evaluate(() => [...document.querySelectorAll('.bn-block-content')].map((e) => Math.round(e.getBoundingClientRect().top)).join(','));
  const before = await lines();
  const bar = page.locator('.bn-columns-bar');
  assert.equal(await bar.evaluate((e) => getComputedStyle(e).opacity), '0', 'the layout bar shows with nothing hovered');
  const b2 = await text('b2');
  await page.mouse.move(b2.x + 20, b2.y + 5, { steps: 4 });
  await eventually(async () => (await bar.evaluate((e) => getComputedStyle(e).opacity)) === '1');
  assert.equal(await lines(), before, 'showing the layout bar moved a line');
  // Over the end of the line above when hidden, it takes no click there.
  await page.mouse.move(1, 1);
  await eventually(async () => (await bar.evaluate((e) => getComputedStyle(e).opacity)) === '0');
  assert.equal(await bar.evaluate((e) => getComputedStyle(e).pointerEvents), 'none', 'the hidden layout bar still takes clicks');
  // The caret in a column shows it (a phone has no hover).
  await page.locator('[data-id="b2"] .bn-inline-content').click();
  await page.mouse.move(1, 1);
  await eventually(async () => (await bar.evaluate((e) => getComputedStyle(e).opacity)) === '1');
  await page.locator('[data-id="last"] .bn-inline-content').click();
  await page.mouse.move(1, 1);
  await eventually(async () => (await bar.evaluate((e) => getComputedStyle(e).opacity)) === '0');
  // Leaving the editor hides it again: a click outside changes no selection
  // (found by review: the bar stayed shown and clickable).
  await page.locator('[data-id="b2"] .bn-inline-content').click();
  await eventually(async () => (await bar.evaluate((e) => getComputedStyle(e).opacity)) === '1');
  await page.locator('textarea.page-title').click();
  await page.mouse.move(1, 1);
  await eventually(async () => (await bar.evaluate((e) => getComputedStyle(e).opacity)) === '0').catch(() => assert.fail('the layout bar stays shown after the caret left the editor'));
  // And keyboard focus.
  await bar.locator('button').first().focus();
  await eventually(async () => (await bar.evaluate((e) => getComputedStyle(e).opacity)) === '1').catch(() => assert.fail('the layout bar does not show with keyboard focus'));

  // ---- a layout inside a column: a drop beside its first line is above or
  // below the inner layout, and makes no column (found by review; #824) ----
  const inner = { id: 'inner', type: 'columns', props: { count: 2 }, content: [], children: [para('x', 'Inner left'), para('y', 'Inner right')] };
  await api('PATCH', `/api/pages/${doc.id}`, { content: [para('mover', 'The block that is dragged'), { id: 'cols', type: 'columns', props: { count: 2 }, content: [], children: [head('a', 'Do', [inner, para('a2', 'After the inner layout')]), head('b', 'Plan', [])] }] });
  await page.goto(`${base}/p/${doc.id}`);
  await page.locator('[data-id="y"] .bn-inline-content').waitFor();
  await page.mouse.move(1, 1);
  const y = await text('y');
  await drag(y.x + 10, y.y + y.height * 0.25);
  let after = null;
  await eventually(async () => {
    after = (await api('GET', `/api/pages/${doc.id}`)).content;
    return after[0].id !== 'mover';
  });
  const outer = after.find((b) => b.id === 'cols');
  const innerNow = JSON.stringify(outer).includes('"inner"') && (function find(bs) { for (const b of bs) { if (b.id === 'inner') return b; const r = find(b.children ?? []); if (r) return r; } return null; })(outer.children);
  assert.equal(outer.children.length, 2, 'the outer layout gained a column');
  assert(innerNow, 'the inner layout is gone');
  assert.deepEqual(innerNow.children.map((c) => c.id), ['x', 'y'], 'the inner layout gained a column');
});
