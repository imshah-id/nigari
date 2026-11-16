// The six comment reactions (spec 017, R2) are listed twice: COMMENT_REACTIONS
// in web/src/commentReactions.ts for the picker and the chips, and
// commentReactions in server/comments.go, which decides what is stored. A
// reaction on one side only would be refused by the server, or stored and
// never shown. This holds the two lists equal, keys, glyphs and order, and
// checks that every reaction has a name for screen readers.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'nigari-reactions-'));
try {
  const outfile = join(tmp, 'commentReactions.mjs');
  await build({
    entryPoints: [join(webDir, 'src/commentReactions.ts')],
    bundle: true, format: 'esm', outfile, logLevel: 'silent',
    // i18n.ts only loads under Vite; t() is the identity here.
    plugins: [{
      name: 'no-i18n',
      setup(b) {
        b.onResolve({ filter: /\/i18n$/ }, () => ({ path: 'i18n', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const t = (s) => s;', loader: 'js' }));
      },
    }],
  });
  const m = await import(pathToFileURL(outfile).href);
  const web = m.COMMENT_REACTIONS.map((r) => `${r.key} ${r.glyph}`);

  const go = readFileSync(join(webDir, '../server/comments.go'), 'utf8');
  const block = go.match(/var commentReactions = \[\]struct\{ Key, Glyph string \}\{([\s\S]*?)\n\}/);
  assert.ok(block, 'commentReactions not found in server/comments.go');
  const server = [...block[1].matchAll(/\{"([a-z_]+)", "([^"]+)"\}/g)].map((x) => `${x[1]} ${x[2]}`);

  assert.ok(server.length > 0, 'commentReactions in server/comments.go lists no reaction');
  assert.deepEqual(web, server, 'the reactions in web/src/commentReactions.ts and server/comments.go differ');
  for (const r of m.COMMENT_REACTIONS) {
    assert.notEqual(m.reactionName(r.key), r.key, `reaction ${r.key} has no name for screen readers (reactionName)`);
    assert.equal(m.reactionGlyph(r.key), r.glyph);
  }
  console.log(`check-comment-reactions: ${web.length} reactions, the same on both sides`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
