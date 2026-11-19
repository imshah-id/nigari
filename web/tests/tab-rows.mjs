import assert from 'node:assert/strict';
import { eventually, withFixture } from './fixture.mjs';

// Spec 020 PR 3 (T026): the tab rows and choose-one rows that moved to
// ui/Tabs and ui/ToggleGroup work from the keyboard on the real screens, not
// only in the catalogue. Before, each was a row of hand-built buttons with an
// `on` or `active` class: no tab role, no pressed state, and the arrow keys
// did nothing (Tab walked every button instead).
await withFixture(async ({ page, api, base, workspace }) => {
  page.setDefaultTimeout(15000);
  const doc = await api('POST', '/api/pages', { title: 'Tab rows', workspaceId: workspace.id });
  await page.goto(`${base}/p/${doc.id}`);
  // A pointer left over a row moves its highlight under keyboard steps (#155).
  const away = () => page.mouse.move(1, 1);

  // Instance settings: a named tablist; ArrowRight selects the next section
  // and shows it.
  await page.locator('.user-menu-btn').click();
  await page.getByRole('menuitem', { name: 'Instance settings' }).click();
  const sections = page.getByRole('tablist', { name: 'Instance settings' });
  await sections.waitFor();
  await away();
  await sections.getByRole('tab', { name: 'General' }).focus();
  await page.keyboard.press('ArrowRight');
  const access = sections.getByRole('tab', { name: 'Access' });
  await eventually(async () => (await access.getAttribute('aria-selected')) === 'true').catch(() =>
    assert.fail('settings: ArrowRight did not select Access'),
  );
  assert(await access.evaluate((el) => el === document.activeElement), 'settings: focus did not follow the arrow');
  await page.keyboard.press('Escape');
  await sections.waitFor({ state: 'hidden' });

  // The library's shelves: the same, and the shelf shown follows.
  await page.getByRole('button', { name: /^Library/ }).first().click();
  const shelves = page.getByRole('tablist', { name: 'Library' });
  await shelves.waitFor();
  await away();
  const selected = shelves.locator('[role=tab][aria-selected=true]');
  const before = await selected.textContent();
  await selected.focus();
  await page.keyboard.press('ArrowRight');
  await eventually(async () => (await selected.textContent()) !== before).catch(() =>
    assert.fail('library: ArrowRight did not select the next shelf'),
  );
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();

  // The theme: a group of pressed toggles. The arrows move, Space picks, and
  // the page follows.
  const appearance = page.getByRole('group', { name: 'Appearance' }).first();
  const light = appearance.getByRole('button', { name: 'Light', exact: true });
  await away();
  await light.click();
  await eventually(async () => (await light.getAttribute('aria-pressed')) === 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const dark = appearance.getByRole('button', { name: 'Dark', exact: true });
  assert(await dark.evaluate((el) => el === document.activeElement), 'theme: the arrows did not reach Dark');
  await page.keyboard.press('Space');
  await eventually(async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark').catch(() =>
    assert.fail('theme: Space on Dark did not switch the page to dark'),
  );
  assert.equal(await light.getAttribute('aria-pressed'), 'false', 'theme: two themes pressed');

  // The icon picker: Emoji / Icons / Upload is a tablist too.
  await page.locator('.head-adders').getByRole('button', { name: 'Emoji' }).click();
  const kinds = page.getByRole('tablist', { name: 'Icon' });
  await kinds.waitFor();
  await away();
  await kinds.getByRole('tab', { name: 'Emoji' }).focus();
  await page.keyboard.press('ArrowRight');
  await eventually(async () => (await kinds.getByRole('tab', { name: 'Icons' }).getAttribute('aria-selected')) === 'true').catch(() =>
    assert.fail('icon picker: ArrowRight did not select Icons'),
  );

  console.log('Tab rows: settings, library shelves, theme and icon picker work from the keyboard.');
});
