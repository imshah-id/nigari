import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// A view's layout can be changed (spec 018, #469): Settings → Layout. What
// must hold: a table becomes a board with its filters, sort and hidden
// columns kept and a grouping chosen and said; back to a table it is the
// table it was (SC-002); a calendar on a database with no date property
// offers to add one and switches in one save; an embed's view switches in the
// document only, with no Form offered; it works by keyboard; and a locked
// database offers no Layout.
await withFixture(async ({ page, api, base, workspace, path }) => {
  page.setDefaultTimeout(15000);
  const collectionId = path.split('/').pop();
  const table = {
    id: 'table', name: 'Work', type: 'table',
    filters: [{ property: 'status', op: 'is', value: 'todo' }],
    sort: { property: 'status', dir: 'asc' },
    hidden: ['labels'],
    colWidths: { __title: 320 },
  };
  await api('PUT', path, { views: [table, { id: 'board', name: 'Board', type: 'board', groupBy: 'status' }] });
  const stored = async (id) => (await api('GET', path)).views.find((v) => v.id === id);
  const toolbar = page.locator('.collection-toolbar').first();
  const settingsMenu = page.getByRole('menu', { name: /view settings$/ });
  const pick = async (layout) => {
    await toolbar.getByRole('button', { name: 'Settings', exact: true }).click();
    await settingsMenu.getByRole('menuitem', { name: /^Layout/ }).hover();
    await page.getByRole('menuitem', { name: layout, exact: true }).click();
  };
  // Each wait names itself, so a timeout says which step it was.
  let step = 0;
  const until = (check) => {
    const n = ++step;
    return eventually(check).catch(() => {
      throw new Error(`wait ${n} timed out`);
    });
  };
  const toast = (text) => page.getByText(text, { exact: false }).first();

  await page.goto(`${base}/p/${collectionId}`);
  await toolbar.waitFor();
  const before = await stored('table');

  // ---- Table → board: everything kept, the grouping chosen and said ----
  await pick('Board');
  await toast('Grouped by Status. Change it with Group.').waitFor();
  await until(async () => (await stored('table')).type === 'board');
  const board = await stored('table');
  assert.equal(board.groupBy, 'status');
  for (const k of ['filters', 'sort', 'hidden', 'colWidths', 'name']) {
    assert.deepEqual(board[k], before[k], `the board lost ${k}`);
  }

  // ---- Back to a table: the table it was (SC-002), the grouping kept unused ----
  await pick('Table');
  await until(async () => (await stored('table')).type === 'table');
  const back = { ...(await stored('table')) };
  assert.equal(back.groupBy, 'status', "the board's grouping was not kept");
  delete back.groupBy;
  assert.deepEqual(back, before, 'table → board → table changed the table');

  // ---- Layout shows the current type, ticked; the menu offers all eight ----
  await toolbar.getByRole('button', { name: 'Settings', exact: true }).click();
  assert.match(await settingsMenu.getByRole('menuitem', { name: /^Layout/ }).textContent(), /Layout\s*Table/);
  await settingsMenu.getByRole('menuitem', { name: /^Layout/ }).hover();
  for (const name of ['Table', 'Board', 'Gallery', 'Calendar', 'Timeline', 'List', 'Form', 'Chart']) {
    await page.getByRole('menuitem', { name, exact: true }).waitFor();
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // ---- By keyboard: Enter on Settings, → into Layout, ↓ to Board, Enter ----
  // The pointer off the menu: left where the last click put it, it rests over
  // a menu item and its hover moves the highlight the keys are moving.
  await page.mouse.move(1, 1);
  await toolbar.getByRole('button', { name: 'Settings', exact: true }).focus();
  await page.keyboard.press('Enter');
  await settingsMenu.waitFor();
  await until(async () => (await page.evaluate(() => document.activeElement?.textContent ?? '')).startsWith('Layout'));
  await page.keyboard.press('ArrowRight');
  await until(async () => (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Table');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await until(async () => (await stored('table')).type === 'board');

  // ---- A calendar on a database with no date property: add one, one save ----
  await pick('Calendar');
  const dialog = page.locator('.confirm-dialog');
  await dialog.getByText('Add one named Date?').waitFor();
  await dialog.getByRole('button', { name: 'Add and switch', exact: true }).click();
  await until(async () => (await stored('table')).type === 'calendar');
  const config = await api('GET', path);
  const date = config.schema.find((p) => p.type === 'date');
  assert(date && date.name === 'Date', `no "Date" property: ${JSON.stringify(config.schema)}`);
  assert.equal((await stored('table')).dateProp, date.id, 'the calendar does not use the new property');

  // ---- In an embed: its own view switches, the database's do not; no Form ----
  const dbViews = JSON.stringify((await api('GET', path)).views);
  const doc = await api('POST', '/api/pages', { title: 'Plan', workspaceId: workspace.id });
  await api('PATCH', `/api/pages/${doc.id}`, { content: [{ id: 'emb', type: 'database', props: { collectionId, local: '' }, content: [], children: [] }] });
  await page.goto(`${base}/p/${doc.id}`);
  const embed = page.locator('.bn-db-embed').first();
  await embed.locator('.view-tab').first().waitFor();
  await embed.locator('.collection-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
  await settingsMenu.getByRole('menuitem', { name: /^Layout/ }).hover();
  await page.getByRole('menuitem', { name: 'List', exact: true }).waitFor();
  assert.equal(await page.getByRole('menuitem', { name: 'Form', exact: true }).count(), 0, 'an embed offers Form');
  await page.getByRole('menuitem', { name: 'List', exact: true }).click();
  await until(async () => {
    const content = (await api('GET', `/api/pages/${doc.id}`)).content;
    const local = content.find((b) => b.id === 'emb')?.props?.local;
    return !!local && JSON.parse(local).views.some((v) => v.type === 'list');
  });
  assert.equal(JSON.stringify((await api('GET', path)).views), dbViews, "an embed's layout change changed the database's views");

  // ---- Locked: no Layout ----
  await api('PUT', `/api/collections/${collectionId}/lock`);
  await page.goto(`${base}/p/${collectionId}`);
  await toolbar.getByRole('button', { name: 'Settings', exact: true }).click();
  await settingsMenu.waitFor();
  assert.equal(await settingsMenu.getByRole('menuitem', { name: /^Layout/ }).count(), 0, 'a locked database offers Layout');

  console.log('View layout: table ↔ board kept, calendar with a new date, embed, keyboard, locked.');
});
