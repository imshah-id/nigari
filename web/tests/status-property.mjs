import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// The status property (spec 016, PR 1): a select whose options sit in three
// groups. In the real UI: a status added in the properties dialog shows its
// options under To-do / In progress / Complete; Move to changes an option's
// group by mouse and by keyboard; the last option of a group cannot be
// deleted; a select converted to a status guesses groups by name; a board
// grouped by it lists columns in group order; a new row starts in the first
// To-do option; a row's side peek sets it through the grouped picker.
await withFixture(async ({ page, api, base, path, open, read }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const stored = async () => (await read()).schema;
  const rowsOf = async () => {
    const r = await api('GET', `${path}/rows`);
    return Array.isArray(r) ? r : r.rows;
  };
  // The options deliberately start out of group order: Done first.
  await api('PUT', path, {
    schema: [{ id: 'phase', name: 'Phase', type: 'select', options: [
      { id: 'done', name: 'Done', color: '#448361' },
      { id: 'doing', name: 'Doing', color: '#337ea9' },
      { id: 'backlog', name: 'Backlog', color: '#123456' },
    ] }],
    views: [
      { id: 'table', name: 'Table', type: 'table' },
      { id: 'board', name: 'Board', type: 'board', groupBy: 'phase' },
    ],
  });
  const seed = [];
  for (const [title, phase] of [['Alpha', 'doing'], ['Beta', 'done']]) {
    seed.push(await api('POST', '/api/pages', { parentId: collectionId, title, props: { phase } }));
  }
  await page.goto(`${base}/p/${collectionId}`);
  await open();

  // ---- add a Status property: options under the three headings ----
  const list = page.locator('.schema-list > div');
  await page.getByPlaceholder('New property name').fill('Stage');
  await page.locator('.schema-add').getByLabel('Type').selectOption('status');
  await page.locator('.schema-add').getByRole('button', { name: 'Add', exact: true }).click();
  const stage = list.nth(1);
  await stage.locator('.schema-status-group').first().waitFor();
  const groups = stage.locator('.schema-status-group');
  const headings = () => stage.locator('.schema-status-label').allTextContents();
  const chipsIn = (g) => groups.nth(g).locator('.opt-chip').allTextContents();
  // The dialog renders a moment after a click: wait for the chips instead of reading once.
  const chipsAre = async (g, want, why) => {
    await eventually(async () => JSON.stringify(await chipsIn(g)) === JSON.stringify(want))
      .catch(async () => assert.deepEqual(await chipsIn(g), want, why));
  };
  assert.deepEqual(await headings(), ['To-do', 'In progress', 'Complete'], 'group headings');
  await chipsAre(0, ['Not started']);
  await chipsAre(1, ['In progress']);
  await chipsAre(2, ['Done']);

  // ---- a new option goes into the group whose input it was typed in ----
  const addInput = stage.getByRole('textbox', { name: '+ Option · To-do' });
  await addInput.fill('Later');
  await addInput.press('Enter');
  await chipsAre(0, ['Not started', 'Later']);

  // ---- Move to by mouse: the option changes heading ----
  const chip = (name) => stage.locator('.opt-chip', { hasText: new RegExp(`^${name}$`) });
  const menu = page.getByRole('menu', { name: 'Move to' });
  await chip('Later').click();
  await page.getByRole('button', { name: 'Move to', exact: true }).click();
  await menu.waitFor();
  // The item of the option's current group carries a tick.
  await menu.getByRole('menuitem', { name: 'To-do' }).locator('.ui-menu-tick').waitFor();
  await menu.getByRole('menuitem', { name: 'In progress' }).click();
  await eventually(async () => (await chipsIn(1)).includes('Later'));
  await chipsAre(0, ['Not started'], 'Later left To-do');

  // ---- Move to by keyboard: Tab to the button, Enter, arrows, Enter ----
  await chip('Later').focus();
  await page.keyboard.press('Enter');
  const name = page.getByRole('textbox', { name: 'Option name' });
  await name.waitFor();
  const focused = () => page.evaluate(() => (document.activeElement?.textContent ?? '').trim());
  for (let i = 0; i < 8 && (await focused()) !== 'Move to'; i++) await page.keyboard.press('Tab');
  assert.equal(await focused(), 'Move to', 'Tab never reached Move to');
  await page.keyboard.press('Enter');
  await menu.waitFor();
  for (let i = 0; i < 4 && (await focused()) !== 'Complete'; i++) await page.keyboard.press('ArrowDown');
  assert.equal(await focused(), 'Complete', 'the arrows did not reach Complete');
  await page.keyboard.press('Enter');
  await eventually(async () => (await chipsIn(2)).includes('Later'));
  await chipsAre(1, ['In progress']);

  // ---- the last option of a group cannot be deleted ----
  await chip('Not started').click();
  await page.getByRole('button', { name: 'Delete option', exact: true }).click();
  await page.getByText('Each group needs at least one option. Add another to this group first.').waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0, 'a delete confirmation opened');
  await chipsAre(0, ['Not started'], 'the refused option disappeared');

  // ---- a select becomes a status: groups guessed by name, in group order ----
  await list.nth(0).getByLabel('Type').selectOption('status');
  const phase = list.nth(0).locator('.schema-status-group');
  const phaseChips = (g) => phase.nth(g).locator('.opt-chip').allTextContents();
  await phase.first().waitFor();
  assert.deepEqual(await phaseChips(0), ['Backlog'], 'Backlog is not To-do');
  assert.deepEqual(await phaseChips(1), ['Doing'], 'Doing is not In progress');
  assert.deepEqual(await phaseChips(2), ['Done'], 'Done is not Complete');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Collection properties' }).waitFor({ state: 'hidden' });
  const schema = await stored();
  const byId = Object.fromEntries(schema.map((p) => [p.id, p]));
  assert.equal(byId.phase.type, 'status');
  assert.deepEqual(byId.phase.options.map((o) => [o.id, o.group]),
    [['backlog', 'todo'], ['doing', 'in_progress'], ['done', 'complete']]);
  assert.equal(byId.stage.type, 'status');
  assert.deepEqual(byId.stage.options.map((o) => [o.name, o.group]),
    [['Not started', 'todo'], ['In progress', 'in_progress'], ['Done', 'complete'], ['Later', 'complete']]);
  for (const row of seed) {
    assert.equal((await api('GET', `/api/pages/${row.id}`)).props.phase, row.props.phase, 'the conversion changed a value');
  }

  // ---- a board grouped by it: columns in group order ----
  await page.locator('.view-tab', { hasText: 'Board' }).click();
  await page.locator('.board').waitFor();
  const columns = async () => (await page.locator('.board-col .board-chip').allTextContents()).filter((s) => !/^No /.test(s));
  await eventually(async () => (await columns()).join() === 'Backlog,Doing,Done');

  // ---- a new row starts in the first To-do option ----
  await page.locator('.view-tab', { hasText: 'Table' }).click();
  const before = new Set((await rowsOf()).map((r) => r.id));
  await page.locator('.view-menu-wrap').getByRole('button', { name: 'New', exact: true }).click();
  let fresh;
  await eventually(async () => {
    fresh = (await rowsOf()).find((r) => !before.has(r.id));
    return !!fresh;
  });
  assert.equal((await api('GET', `/api/pages/${fresh.id}`)).props.phase, 'backlog', 'a new row did not start in the first To-do option');

  // ---- set a value in a side peek through the grouped picker ----
  const config = await read();
  config.views[0].openIn = 'side_peek';
  await api('PUT', path, { views: config.views });
  await page.goto(`${base}/p/${collectionId}`);
  await page.getByText('Alpha', { exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Page preview' });
  await panel.waitFor();
  await panel.getByRole('button', { name: 'Doing', exact: true }).click();
  const labels = page.locator('.select-group-label');
  await labels.first().waitFor();
  assert.deepEqual(await labels.allTextContents(), ['To-do', 'In progress', 'Complete']);
  await page.locator('.select-option-main', { hasText: 'Done' }).click();
  await eventually(async () => (await api('GET', `/api/pages/${seed[0].id}`)).props.phase === 'done');
  console.log('Status property: groups under headings, Move to by mouse and keyboard, last option kept, select converted by name, board columns in group order, new row in first To-do, side peek picker passed.');
});
