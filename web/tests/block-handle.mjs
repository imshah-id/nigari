import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// The block handle and the drop line (epic #812).
//
// #808: the + and drag handle of a block in a column jumped away as the
// pointer moved onto them, so such a block could not be dragged. The pointer
// walks here from a column's text to its handle in 2px steps, as a hand does,
// and the handle has to stay beside that block the whole way; then the block
// is dragged out of its column, and after the drop the handle follows the
// pointer again (the fix holds the handle while the pointer is on it, and a
// hold that outlived the drop left it stuck on the moved block).
//
// #811: the handle is 20px wide with an 18px icon in the muted text colour
// (owner's option B), not BlockNote's 24px squares in pale grey.
//
// #809: the line that shows where a dragged block lands is the focus colour,
// 2px, not BlockNote's #ddeeff (1.13:1 on the light page).
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const para = (id, text, children = []) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children });
  const head = (id, text, children) => ({ id, type: 'heading', props: { level: 3 }, content: [{ type: 'text', text, styles: {} }], children });
  const column = (k, name) => head(k, name, [para(`${k}1`, 'Inbox'), para(`${k}2`, 'Tasks'), para(`${k}3`, 'Projects')]);
  const doc = await api('POST', '/api/pages', { title: 'Handles', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, {
    content: [
      para('top', 'A paragraph above the columns'),
      { id: 'cols', type: 'columns', props: { count: 3 }, content: [], children: [column('a', 'Do'), column('b', 'Plan'), column('c', 'Think')] },
      para('bottom', 'A paragraph below the columns'),
    ],
  });
  await page.goto(`${base}/p/${doc.id}`);
  await page.locator('[data-id="c3"] .bn-inline-content').waitFor();

  const text = (id) => page.locator(`[data-id="${id}"] .bn-inline-content`).first().boundingBox();
  // Where the side menu is: its right edge sits at the text's left edge of
  // the block it belongs to, its top 3px above that block's line.
  const menu = () => page.evaluate(() => {
    const m = document.querySelector('.bn-side-menu');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { right: Math.round(r.right), top: Math.round(r.top) };
  });
  const besides = async (id) => {
    const t = await text(id);
    const m = await menu();
    return m !== null && Math.abs(m.right - t.x) <= 1 && Math.abs(m.top - t.y) <= 4;
  };

  // ---- #808: walk to the handle of a block in each column ----
  for (const id of ['top', 'a2', 'b2', 'c2']) {
    const t = await text(id);
    const y = t.y + t.height / 2;
    await page.mouse.move(t.x + 10, y);
    await eventually(() => besides(id));
    for (let x = t.x + 8; x >= t.x - 38; x -= 2) {
      await page.mouse.move(x, y);
      assert(await besides(id), `the handle of ${id} moved away when the pointer was ${Math.round(t.x - x)}px left of its text`);
    }
  }

  // ---- #811: the handle's size and colour ----
  const look = await page.evaluate(() => {
    const handle = document.querySelector('.bn-side-menu [draggable="true"]');
    const icon = handle.querySelector('svg');
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-text-muted)';
    document.body.append(probe);
    const muted = getComputedStyle(probe).color;
    probe.remove();
    return { width: handle.getBoundingClientRect().width, height: handle.getBoundingClientRect().height, icon: icon.getBoundingClientRect().width, colour: getComputedStyle(icon).color, muted };
  });
  assert.equal(look.width, 20, 'the drag handle is not 20px wide');
  assert.equal(look.height, 24, 'the drag handle is no longer a line tall');
  assert.equal(look.icon, 18, 'the handle icon is not 18px');
  assert.equal(look.colour, look.muted, 'the handle icon is not the muted text colour');

  // ---- #808 + #809: drag Plan › Tasks out of its column, watch the line ----
  const from = await text('b2');
  await page.mouse.move(from.x + 10, from.y + 10);
  for (let x = from.x + 8; x >= from.x - 10; x -= 2) await page.mouse.move(x, from.y + 12);
  await page.mouse.down();
  const to = await text('bottom');
  const steps = 40;
  let line = null;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x - 10 + (to.x + 30 - from.x + 10) * i / steps, from.y + 12 + (to.y + to.height * 0.8 - from.y - 12) * i / steps);
    if (i === steps - 5) {
      line = await page.evaluate(() => {
        const l = document.querySelector('[class*="prosemirror-dropcursor"]');
        if (!l) return null;
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-focus)';
        document.body.append(probe);
        const focus = getComputedStyle(probe).color;
        probe.remove();
        return { colour: getComputedStyle(l).backgroundColor, height: l.getBoundingClientRect().height, focus };
      });
    }
  }
  assert(line, 'no drop line while dragging a block');
  assert.equal(line.colour, line.focus, 'the drop line is not the focus colour');
  // BlockNote divides the width by the editor's scale, so it comes out a hair
  // under 2 (1.98 measured); rounded, it is the token.
  assert.equal(Math.round(line.height), 2, 'the drop line is not 2px');
  await page.mouse.up();
  let content;
  await eventually(async () => {
    content = (await api('GET', `/api/pages/${doc.id}`)).content;
    return content.some((b) => b.id === 'b2');
  });
  const plan = content.find((b) => b.id === 'cols').children.find((c) => c.id === 'b');
  assert.deepEqual(plan.children.map((c) => c.id), ['b1', 'b3'], 'the block did not leave its column');

  // ---- after the drop the handle follows the pointer again ----
  for (const id of ['top', 'c3', 'a1']) {
    const t = await text(id);
    await page.mouse.move(t.x + 15, t.y + t.height / 2, { steps: 5 });
    await eventually(() => besides(id)).catch(() => assert.fail(`after the drop the handle did not come to ${id}`));
  }

  // ---- the block menu behind the handle still opens and closes ----
  const t = await text('top');
  await page.mouse.move(t.x + 10, t.y + t.height / 2);
  for (let x = t.x + 8; x >= t.x - 10; x -= 2) await page.mouse.move(x, t.y + t.height / 2);
  await page.locator('.bn-side-menu [draggable="true"]').click();
  await page.getByRole('menuitem', { name: /Delete/ }).waitFor();
  // The open menu stays when the pointer wanders off it: BlockNote froze the
  // handle for the menu, and the hold's release must not undo that.
  const b1 = await text('b1');
  await page.mouse.move(b1.x + 15, b1.y + b1.height / 2, { steps: 8 });
  await page.waitForTimeout(300);
  assert(await page.getByRole('menuitem', { name: /Delete/ }).isVisible(), 'the block menu closed when the pointer moved off it');
  await page.keyboard.press('Escape');
  await page.getByRole('menuitem', { name: /Delete/ }).waitFor({ state: 'detached' });
  const c3 = await text('c3');
  await page.mouse.move(c3.x + 15, c3.y + c3.height / 2, { steps: 8 });
  await eventually(() => besides('c3')).catch(() => assert.fail('after the block menu closed the handle stayed put'));
});
