// Group conditions in the browser (spec 016, US2): src/statusFilter.ts must
// resolve "Group is / Group is not" the way the server does (R3), because the
// rows the server sent are filtered a second time here.
//
//   node scripts/check-statusfilter.mjs
//
// The module is bundled with esbuild and imported, no test framework. The
// quick-filter case goes through viewState.ts, where a pick of a whole group
// becomes a group_is condition.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'nigari-statusfilter-'));
try {
  const load = async (entry, name) => {
    const outfile = join(tmp, name + '.mjs');
    await build({
      entryPoints: [join(webDir, 'src', entry)],
      bundle: true, format: 'esm', outfile, logLevel: 'silent',
      // i18n.ts only loads under Vite; labels play no part here.
      plugins: [{
        name: 'no-i18n',
        setup(b) {
          b.onResolve({ filter: /\/i18n$/ }, () => ({ path: 'i18n', namespace: 'stub' }));
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const t = (s) => s; export const plural = (s) => s;', loader: 'js' }));
        },
      }],
    });
    return import(pathToFileURL(outfile).href);
  };
  const m = { ...(await load('statusFilter.ts', 'statusFilter')), ...(await load('statusPick.ts', 'statusPick')) };
  const vs = await load('viewState.ts', 'viewState');

  const opt = (id, group) => ({ id, name: id, color: '', group });
  const schema = [
    { id: 'st', name: 'Status', type: 'status', options: [opt('a', 'todo'), opt('b', 'in_progress'), opt('c', 'complete'), opt('d', 'complete')] },
    { id: 'sel', name: 'Select', type: 'select', options: [{ id: 'x', name: 'x', color: '' }] },
    { id: 'empty', name: 'Empty groups', type: 'status', options: [opt('a', 'todo')] },
  ];
  const f = (op, values, property = 'st') => ({ property, op, value: '', values });
  const m_ = (flt, cell) => m.groupFilterMatch(flt, schema, cell);

  // Not a group condition: the caller keeps the ordinary comparison.
  assert.equal(m_({ property: 'st', op: 'is', value: 'a' }, 'a'), undefined);
  assert.equal(m_({ property: 'st', value: '' }, 'a'), undefined);

  // group_is: any option of any ticked group.
  assert.equal(m_(f('group_is', ['complete']), 'c'), true);
  assert.equal(m_(f('group_is', ['complete']), 'd'), true);
  assert.equal(m_(f('group_is', ['complete']), 'a'), false);
  assert.equal(m_(f('group_is', ['todo', 'in_progress']), 'b'), true);
  assert.equal(m_(f('group_is', ['todo', 'in_progress']), 'c'), false);
  // A single group may also travel as `value`.
  assert.equal(m_({ property: 'st', op: 'group_is', value: 'complete' }, 'c'), true);

  // group_is_not.
  assert.equal(m_(f('group_is_not', ['complete']), 'c'), false);
  assert.equal(m_(f('group_is_not', ['complete']), 'a'), true);
  // An empty cell is in no group: not "complete", so it stays.
  assert.equal(m_(f('group_is_not', ['complete']), ''), true);
  assert.equal(m_(f('group_is', ['complete']), ''), false);
  assert.equal(m_(f('group_is', ['complete']), undefined), false);

  // A value stored as ["id"] reads like "id".
  assert.equal(m_(f('group_is', ['complete']), ['c']), true);
  assert.equal(m_(f('group_is_not', ['complete']), ['c']), false);

  // A group with no options: "is" matches nothing, "is not" everything.
  assert.equal(m_(f('group_is', ['complete'], 'empty'), 'a'), false);
  assert.equal(m_(f('group_is_not', ['complete'], 'empty'), 'a'), true);

  // Narrows nothing: a non-status property, a gone property, no group ticked,
  // an unknown group id.
  assert.equal(m_(f('group_is', ['complete'], 'sel'), 'x'), true);
  assert.equal(m_(f('group_is_not', ['complete'], 'sel'), 'x'), true);
  assert.equal(m_(f('group_is', ['complete'], 'gone'), 'x'), true);
  assert.equal(m_(f('group_is', []), 'a'), true);
  assert.equal(m_(f('group_is', ['nonsense']), 'a'), true);

  // The quick pick of a group.
  assert.equal(m.pickedGroup(m.groupPick('complete')), 'complete');
  assert.equal(m.pickedGroup('c'), null);
  assert.equal(m.pickedGroup('group:nonsense'), null);
  assert.deepEqual(
    vs.mergeViewState({ quickFilters: ['st', 'sel'] }, { quickPicks: { st: m.groupPick('todo'), sel: 'x' } }).filters,
    [{ property: 'st', op: 'group_is', value: '', values: ['todo'] }, { property: 'sel', op: 'is', value: 'x' }],
  );
  assert.deepEqual(
    vs.mergeViewState({ quickFilters: ['st'] }, { quickPicks: { st: 'a' } }).filters,
    [{ property: 'st', op: 'is', value: 'a' }],
  );

  console.log('Status filter: group_is / group_is_not, ["id"] cells, narrows-nothing cases and group quick picks hold.');
} catch (e) {
  console.error('Status filter check failed:', e.message ?? e);
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
