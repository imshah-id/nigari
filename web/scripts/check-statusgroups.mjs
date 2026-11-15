// The status property's browser side (spec 016): the guess that places an
// option in a group must match the server's, the group order must hold, and a
// new `=== 'select'` test must not slip in where "has options" is meant (R10).
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// R10 ratchet. Every file here still tests `=== 'select'` or `!== 'select'`
// that way this many times. Each entry is to be reviewed and removed as T013
// replaces it with isOptionType() (or leaves it, when "exactly a single
// select" is meant, with a comment saying so). The list only shrinks: a count
// that goes up or a new file fails, and so does a count that went down, until
// the list is lowered to match.
const SELECT_TESTS = {
  'src/components/propertyTypes.tsx': 1, // changePropertyType: the conversion to select/multiselect only (T010)
};

const webDir = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'nigari-statusgroups-'));
try {
  const outfile = join(tmp, 'statusGroups.mjs');
  await build({
    entryPoints: [join(webDir, 'src/statusGroups.ts')],
    bundle: true, format: 'esm', outfile, logLevel: 'silent',
    // i18n.ts only loads under Vite (import.meta.glob); the group names play
    // no part in the guess, so t() is the identity here.
    plugins: [{
      name: 'no-i18n',
      setup(b) {
        b.onResolve({ filter: /\/i18n$/ }, () => ({ path: 'i18n', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const t = (s) => s; export const plural = (s) => s;', loader: 'js' }));
      },
    }],
  });
  const m = await import(pathToFileURL(outfile).href);
  const shared = JSON.parse(readFileSync(join(webDir, '../server/testdata/statusgroups.json'), 'utf8'));

  // (a) the shared cases
  for (const [name, want] of shared.cases) {
    assert.equal(m.guessStatusGroup(name), want, `guessStatusGroup(${JSON.stringify(name)})`);
  }

  // (b) the same word list as the server's
  for (const g of new Set([...Object.keys(shared.words), ...Object.keys(m.STATUS_WORDS)])) {
    assert.deepEqual([...(m.STATUS_WORDS[g] ?? [])].sort(), [...(shared.words[g] ?? [])].sort(),
      `word list of group ${g} differs from server/testdata/statusgroups.json`);
  }

  // (c) order and fill
  const newId = (name, taken) => {
    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    while (taken.includes(id)) id += '_';
    return id;
  };
  const sel = [
    { id: 'backlog', name: 'Backlog', color: '' },
    { id: 'done', name: 'Done', color: '' },
    { id: 'doing', name: 'Doing', color: '' },
  ];
  const filled = m.fillEmptyGroups(sel, newId);
  assert.deepEqual(filled.map((o) => o.group), ['todo', 'complete', 'in_progress']);
  assert.equal(filled.length, 3, 'all groups filled, nothing added');
  assert.deepEqual(m.orderByGroup(filled).map((o) => o.id), ['backlog', 'doing', 'done']);
  assert.deepEqual(m.orderByGroup([{ id: 'x', name: 'X', color: '' }, ...filled]).map((o) => o.id),
    ['backlog', 'doing', 'done', 'x']);
  const idea = m.fillEmptyGroups([{ id: 'idea', name: 'Idea', color: '' }], newId);
  assert.deepEqual(idea.map((o) => [o.name, o.group]),
    [['Idea', 'todo'], ['In progress', 'in_progress'], ['Done', 'complete']]);
  // a name already taken in another group falls back to the group label
  const clash = m.fillEmptyGroups([{ id: 'ip', name: 'in progress', color: '', group: undefined }], newId);
  assert.ok(clash.some((o) => o.group === 'todo' && o.name === 'Not started'));
  assert.ok(clash.some((o) => o.group === 'complete' && o.name === 'Done'));
  assert.equal(clash.filter((o) => o.name.toLowerCase() === 'in progress').length, 1);
  // some groups already set: guess the rest, add nothing
  const part = m.fillEmptyGroups([
    { id: 'a', name: 'A', color: '', group: 'complete' }, { id: 'b', name: 'Doing', color: '' }], newId);
  assert.deepEqual(part.map((o) => o.group), ['complete', 'in_progress']);
  assert.deepEqual(m.defaultStatusOptions(newId).map((o) => [o.name, o.group]),
    [['Not started', 'todo'], ['In progress', 'in_progress'], ['Done', 'complete']]);

  // (d) the R10 ratchet
  const found = {};
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { if (f !== 'locales') walk(p); continue; }
      if (!/\.tsx?$/.test(f)) continue;
      const n = (readFileSync(p, 'utf8').match(/[!=]==\s*(['"])select\1/g) || []).length;
      if (n) found[relative(webDir, p)] = n;
    }
  };
  walk(join(webDir, 'src'));
  const problems = [];
  for (const [f, n] of Object.entries(found)) {
    const allowed = SELECT_TESTS[f] ?? 0;
    if (n > allowed) problems.push(`${f}: ${n} test(s) of 'select', ${allowed} allowed. Use isOptionType() when "has options" is meant (R10).`);
    else if (n < allowed) problems.push(`${f}: ${n} left, ${allowed} listed. Lower SELECT_TESTS in this script.`);
  }
  for (const f of Object.keys(SELECT_TESTS)) {
    if (!(f in found)) problems.push(`${f}: none left, still listed. Remove it from SELECT_TESTS in this script.`);
  }
  if (problems.length) {
    console.error('Status groups: the select-test ratchet failed:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  const left = Object.values(found).reduce((a, b) => a + b, 0);
  console.log(`Status groups: ${shared.cases.length} shared cases, word list, order and fill match; ${left} reviewed select tests left.`);
} catch (e) {
  console.error('Status groups check failed:', e.message ?? e);
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
