import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// #861: a block drop that nigari handles (blockDrop.ts stops the event) must
// still reset BlockNote's UniqueID drag state. UniqueID remembers where a drag
// started and forgets it only in its own drop handler; when that handler
// never ran, the next drop that started outside this window (content from
// another tab or app) was taken for a drop from inside the editor, and the
// block ids it carried were kept instead of new ones.
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const para = (id, text) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] });
  const doc = await api('POST', '/api/pages', { title: 'Drop ids', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, { content: [para('mover', 'The block that is dragged'), para('second', 'Second'), para('third', 'Third')] });
  await page.goto(`${base}/p/${doc.id}`);
  await page.locator('[data-id="third"] .bn-inline-content').waitFor();
  const ids = async () => (await api('GET', `/api/pages/${doc.id}`)).content.map((b) => b.id);

  // A block dropped in from elsewhere: no dragstart in this window. Its HTML
  // is a closed slice of whole blocks with their ids, as a ProseMirror editor
  // in another tab hands it over.
  const dropFromOutside = (id, words) =>
    page.evaluate(([id, words]) => {
      const view = document.querySelector('.bn-editor');
      const block = document.querySelector('.bn-block[data-id="second"]');
      const html = ('<div data-node-type="blockGroup" data-pm-slice="0 0 []">' + block.outerHTML + '</div>').replaceAll('data-id="second"', `data-id="${id}"`).replace('Second', words);
      const r = document.querySelector('[data-id="second"] .bn-inline-content').getBoundingClientRect();
      const dt = new DataTransfer();
      dt.setData('text/html', html);
      dt.setData('text/plain', words);
      view.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.right - 2, clientY: r.top + r.height / 2 }));
    }, [id, words]);
  const landed = async (words) => {
    let content = '';
    await eventually(async () => {
      content = JSON.stringify((await api('GET', `/api/pages/${doc.id}`)).content);
      return content.includes(words);
    }).catch(() => assert.fail(`the outside drop "${words}" did not land`));
    return content;
  };

  // Before any drag here: the dropped block gets a new id (BlockNote's own
  // rule, and the control for the check below).
  await dropFromOutside('foreign-one', 'First from another tab');
  assert(!(await landed('First from another tab')).includes('"foreign-one"'), 'control: an outside drop kept its id before any drag');

  // A block dragged by its handle below "third": nigari's drop.
  const from = await page.locator('[data-id="mover"] .bn-inline-content').boundingBox();
  const to = await page.locator('[data-id="third"] .bn-inline-content').boundingBox();
  await page.mouse.move(from.x + 10, from.y + 10);
  for (let px = from.x + 8; px >= from.x - 10; px -= 2) await page.mouse.move(px, from.y + 12);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(from.x - 10 + (to.x + 20 - from.x + 10) * i / 30, from.y + 12 + (to.y + to.height - 2 - from.y - 12) * i / 30);
  await page.mouse.up();
  await eventually(async () => (await ids()).at(-1) === 'mover').catch(async () => assert.fail('the handled drop did not move the block: ' + (await ids()).join(',')));

  // Then the same from outside again: still a new id.
  await dropFromOutside('foreign-two', 'Second from another tab');
  assert(!(await landed('Second from another tab')).includes('"foreign-two"'), 'after a handled drop, a block dropped in from outside kept the id it carried (#861)');
  console.log('Block drop ids: a block dropped in from outside gets a new id, before and after a drop nigari handled.');
});
