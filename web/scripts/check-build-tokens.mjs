// Proves that build-tokens.mjs refuses what it promises to refuse.
//
//   node scripts/check-build-tokens.mjs
//
// A check that never fails guards nothing, and the token build's refusals are
// the whole point of it: a broken alias would emit `undefined` into the
// stylesheet, a cycle would hang it, a colour below AA would ship unnoticed,
// and a hand edit to the generated file would be overwritten by the next
// build. Each case copies the token files to a temporary directory, breaks one
// thing, and expects the build to fail naming it. The last two cases expect the
// committed files to pass: built byte for byte into the committed tokens.css,
// and nothing else fails with them.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(web, 'scripts/build-tokens.mjs');
const failures = [];

function run(args) {
  const r = spawnSync(process.execPath, [build, ...args], { encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}

// Copy the tokens, apply `edit` to one tier's JSON, build into a scratch file.
function broken(name, tier, edit, expect) {
  const dir = mkdtempSync(join(tmpdir(), 'nigari-tokens-'));
  try {
    cpSync(join(web, 'tokens'), dir, { recursive: true });
    const file = join(dir, `${tier}.tokens.json`);
    const json = JSON.parse(readFileSync(file, 'utf8'));
    edit(json);
    writeFileSync(file, JSON.stringify(json, null, 2));
    const r = run(['--dir', dir, '--out', join(dir, 'tokens.css')]);
    if (r.code === 0) failures.push(`${name}: the build passed`);
    else if (!expect.test(r.out)) failures.push(`${name}: failed, but without naming it:\n${r.out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

broken('a broken alias', 'semantic', (j) => {
  j.color.text.default.$value = '{palette.stone.404}';
}, /color\.text\.default.*\{palette\.stone\.404\} names no token/);

broken('an alias cycle', 'semantic', (j) => {
  j.color.focus.$value = '{color.focus}';
}, /alias cycle: color\.focus → color\.focus/);

// Quickstart step 1: muted text this dark is about 2.6:1 on the dark document.
broken('a colour below AA', 'semantic', (j) => {
  j.color.text.muted.$extensions['io.github.neatlittlemacapps.nigari.dark'] = { colorSpace: 'srgb', components: [0.3333, 0.3333, 0.3333], hex: '#555555' };
}, /contrast: color\.text\.muted on color\.surface\.default \(dark\) is [\d.]+:1, below 4\.5:1/);

broken('a token without a $type', 'component', (j) => {
  delete j.control.height.$type;
}, /control\.height: no \$type/);

broken('a type outside DTCG', 'component', (j) => {
  j.control.height.$type = 'size';
}, /control\.height: \$type "size" is not a DTCG 2025\.10 type/);

broken("an extension that is not ours", 'component', (j) => {
  j.control.height.$extensions = { 'com.example.x': 1 };
}, /control\.height: extension "com\.example\.x" is not ours/);

// The bug this guards: the radius scale's --radius-sm (4px) once overwrote the
// --radius-sm (7px) that theme.css and the public pages read.
broken('two tokens writing one property', 'primitives', (j) => {
  j.radius.sm = j.radius.scale.sm;
}, /writes --radius-sm, which .* writes too/);

// ---- palettes and roles (spec 019) -----------------------------------------

// Build the tokens, with `edit` applied to one tier, and return every custom
// property's value per theme, var() chains followed: what a page computes.
// `tier` may also be { primitives: edit, semantic: edit } to change two files.
function built(tier, edit) {
  const dir = mkdtempSync(join(tmpdir(), 'nigari-tokens-'));
  try {
    cpSync(join(web, 'tokens'), dir, { recursive: true });
    const edits = typeof tier === 'object' ? tier : tier ? { [tier]: edit } : {};
    for (const [name, change] of Object.entries(edits)) {
      const file = join(dir, `${name}.tokens.json`);
      const json = JSON.parse(readFileSync(file, 'utf8'));
      change(json);
      writeFileSync(file, JSON.stringify(json, null, 2));
    }
    const out = join(dir, 'tokens.css');
    const r = run(['--dir', dir, '--out', out]);
    if (r.code !== 0) throw new Error(r.out);
    return computed(readFileSync(out, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function computed(css) {
  const block = (selector) => {
    const from = css.indexOf(`${selector} {`);
    const m = {};
    for (const line of css.slice(from, css.indexOf('\n}', from)).split('\n')) {
      const d = line.match(/^\s*(--[\w-]+):\s*(.*);$/);
      if (d) m[d[1]] = d[2];
    }
    return m;
  };
  const follow = (map, v, depth = 0) =>
    depth > 20 ? v : v.replace(/var\((--[\w-]+)\)/g, (_, n) => (n in map ? follow(map, map[n], depth + 1) : `var(${n})`));
  const light = block(':root');
  const both = { ...light, ...block("[data-theme='dark']") };
  const res = (map) => Object.fromEntries(Object.keys(map).map((k) => [k, follow(map, map[k])]));
  return { light: res(light), dark: res(both) };
}

// OKLCH lightness of a #rrggbb, to read a generated step back.
function lightness(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

// OKLCH chroma and hue of a #rrggbb.
function chromaHue(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

function check(name, fn) {
  try {
    const problem = fn();
    if (problem) failures.push(`${name}: ${problem}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
}

// Every palette's steps come from its base by the one table: 500 is the base
// itself, each other step sits at its fraction between the base's lightness
// and white or black. Read back from the built CSS, so a hex rounding of up to
// half a unit per channel is allowed for.
check('palette steps from a base', () => {
  const primitives = JSON.parse(readFileSync(join(web, 'tokens/primitives.tokens.json'), 'utf8'));
  const table = primitives.palette.$extensions['io.github.neatlittlemacapps.nigari.steps'];
  const { light } = built();
  const names = Object.keys(primitives.palette).filter((k) => !k.startsWith('$'));
  if (names.length < 4) return `only ${names.length} palettes`;
  for (const name of names) {
    const [L0] = primitives.palette[name]['500'].$value.components;
    for (const [step, f] of Object.entries(table)) {
      const v = light[`--palette-${name}-${step}`];
      if (!/^#[0-9a-f]{6}$/.test(v ?? '')) return `--palette-${name}-${step} is ${v}`;
      const want = f >= 0 ? L0 + f * (1 - L0) : L0 + f * L0;
      if (Math.abs(lightness(v) - want) > 0.006) return `--palette-${name}-${step} has lightness ${lightness(v).toFixed(4)}, the table says ${want.toFixed(4)}`;
      // Hue stays: only chroma gives way to the gamut. Read back where the
      // colour has enough chroma and light for its hue to survive rounding
      // to hex (near black, one unit of a channel turns the hue by degrees).
      const [, C0, H0] = primitives.palette[name]['500'].$value.components;
      const [c, h] = chromaHue(v);
      if (C0 > 0.05 && c > 0.04 && lightness(v) > 0.25 && Math.min(Math.abs(h - H0), 360 - Math.abs(h - H0)) > 3) return `--palette-${name}-${step} has hue ${h.toFixed(1)}, its base ${H0}`;
    }
  }
});

broken('a palette without a base', 'primitives', (j) => {
  delete j.palette.stone['500'];
}, /palette\.stone: no base \(step 500\)/);

broken('a base that is not OKLCH', 'primitives', (j) => {
  j.palette.stone['500'].$value = { colorSpace: 'srgb', components: [0.4, 0.4, 0.4] };
}, /palette\.stone\.500: a base is an OKLCH colour/);

// One table for every palette: a step written by hand beside the base would
// let one palette drift from the others.
broken('a step written by hand', 'primitives', (j) => {
  j.palette.raspberry['400'] = { $value: { colorSpace: 'oklch', components: [0.7, 0.2, 10] } };
}, /palette\.raspberry\.400: steps are generated from the base; write only 500/);

broken('a table without its base at 0', 'primitives', (j) => {
  j.palette.$extensions['io.github.neatlittlemacapps.nigari.steps']['500'] = 0.1;
}, /with 500 \(the base\) at 0/);

broken('an alpha out of range', 'semantic', (j) => {
  j.color.hover.$extensions['io.github.neatlittlemacapps.nigari.alpha'] = 1.5;
}, /color\.hover: io\.github\.neatlittlemacapps\.nigari\.alpha must be a number from 0 to 1/);

// A role is the palette step it names, in each theme, and today's names
// follow it.
check('a role references a step', () => {
  const { light, dark } = built();
  const pairs = [
    ['light', '--color-primary', '--palette-raspberry-500'],
    ['dark', '--color-primary', '--palette-raspberry-400'],
    ['light', '--accent', '--palette-raspberry-500'],
    ['dark', '--danger', '--palette-burnt-orange-400'],
    ['light', '--bg', '--palette-stone-50'],
    ['dark', '--bg', '--palette-slate-925'],
  ];
  for (const [theme, role, step] of pairs) {
    const t = theme === 'light' ? light : dark;
    if (!t[role] || t[role] !== t[step]) return `${role} (${theme}) is ${t[role]}, ${step} is ${t[step]}`;
  }
  // A translucent role is its step at its alpha, in each theme.
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
  if (light['--hover'] !== `rgba(${rgb(light['--palette-stone-850'])}, 0.045)`) return `--hover (light) is ${light['--hover']}, not --palette-stone-850 at 0.045`;
  if (dark['--border'] !== `rgba(${rgb(dark['--palette-slate-0'])}, 0.08)`) return `--border (dark) is ${dark['--border']}, not --palette-slate-0 at 0.08`;
});

// A translucent token that aliases a themed role writes the colour at its
// alpha, not a var() of the opaque role (the var() shortcut in css()).
check('a translucent alias of a role', () => {
  const { light } = built('semantic', (j) => {
    j.color.focus.$value = '{color.primary}';
    j.color.focus.$extensions = { 'io.github.neatlittlemacapps.nigari.alpha': 0.5 };
  });
  const hex = light['--palette-raspberry-500'];
  const want = `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')}, 0.5)`;
  if (light['--color-focus'] !== want) return `--color-focus is ${light['--color-focus']}, not ${want}`;
});

// An alias of a translucent role keeps its opacity: a contrast pair on
// color.accent.soft (an alias of primary-subtle, a wash at 8.5 %) must judge
// the wash, which is far below 4.5:1, not opaque raspberry (found by review).
broken('a contrast pair on an alias of a translucent role', 'semantic', (j) => {
  j.color.accent.soft.$extensions = { ...j.color.accent.soft.$extensions, 'io.github.neatlittlemacapps.nigari.contrast': [{ on: '{color.surface.default}', min: 4.5 }] };
}, /contrast: color\.accent\.soft on color\.surface\.default \(light\) is 1\.\d+:1/);

// A dark opacity on a token with no dark value would be ignored without a word.
broken('a dark alpha on a token with no dark value', 'semantic', (j) => {
  j.color.focus.$extensions = { 'io.github.neatlittlemacapps.nigari.alpha': { light: 0.5, dark: 0.4 } };
}, /color\.focus: .*alpha gives \{ light, dark \}, but the token has no dark value/);

// A base outside sRGB would be clipped, shifting its hue off its own scale.
broken('a base outside sRGB', 'primitives', (j) => {
  j.palette.blue['500'].$value.components = [0.6, 0.35, 254.74];
}, /palette\.blue\.500: the base is outside sRGB/);

// Swapping a role is one edit, and it moves that role and nothing else. The
// palette it moves to is made here, a dark plum readable everywhere primary
// is (on every surface, on its own wash): an existing palette such as
// burnt-orange is refused, because its text on its wash is below AA, which
// is the build doing its job (spec 020).
check('a swap moves only its role', () => {
  const before = built();
  const after = built({
    primitives: (j) => {
      j.palette.plum = { 500: { $value: { colorSpace: 'oklch', components: [0.45, 0.15, 330] } } };
    },
    semantic: (j) => {
      for (const k of ['primary', 'primary-hover', 'primary-pressed', 'primary-subtle']) {
        const t = j.color[k];
        t.$value = t.$value.replace('raspberry', 'plum');
        t.$extensions['io.github.neatlittlemacapps.nigari.dark'] = t.$extensions['io.github.neatlittlemacapps.nigari.dark'].replace('raspberry', 'plum');
      }
    },
  });
  // What reads primary: its own names, today's aliases, and what is built on them.
  const follows = /^--(color-primary|color-accent|accent|color-focus|editor-highlight|grad-accent)/;
  const moved = [];
  for (const theme of ['light', 'dark']) {
    for (const [k, v] of Object.entries(before[theme])) {
      if (after[theme][k] !== v && !follows.test(k)) moved.push(`${k} (${theme})`);
    }
  }
  if (moved.length) return `these moved too: ${moved.join(', ')}`;
  if (after.light['--color-primary'] === before.light['--color-primary']) return 'primary did not move';
  if (after.light['--accent'] !== after.light['--palette-plum-500']) return `--accent did not follow: ${after.light['--accent']}`;
});

// A base too light for text: the build names the role and the ratio.
broken('a swap that fails contrast', 'primitives', (j) => {
  j.palette.raspberry['500'].$value.components = [0.8, 0.12, 14.27];
}, /contrast: color\.primary on color\.surface\.\w+ \(light\) is [\d.]+:1, below 4\.5:1/);

// Components name roles, never a palette step (R4): check-tokens.mjs counts
// --palette-* with a budget of 0, and token-ok does not excuse it. A role in
// the same place passes, so the case shows the step is what fails.
{
  const dir = mkdtempSync(join(tmpdir(), 'nigari-tokens-'));
  try {
    const budgets = join(dir, 'budgets.json');
    writeFileSync(budgets, JSON.stringify({ literals: { color: 0, fontSize: 0, radius: 0, shadow: 0, zIndex: 0 }, rawButtons: 0, handDialogs: 0, paletteSteps: 0 }));
    const tokens = (css) => {
      writeFileSync(join(dir, 'x.css'), css);
      const r = spawnSync(process.execPath, [join(web, 'scripts/check-tokens.mjs'), '--src', dir, '--budgets', budgets], { encoding: 'utf8' });
      return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
    };
    const step = tokens('.x { color: var(--palette-raspberry-500); } /* token-ok: no */\n.y { color: var(--palette-stone-50); } /* token-ok: trying */');
    if (step.code === 0 || !/paletteSteps: 2, over its budget of 0/.test(step.out)) failures.push(`a palette step in a component: not refused\n${step.out}`);
    const role = tokens('.x { color: var(--color-primary); }');
    if (role.code !== 0) failures.push(`a role in a component: refused\n${role.out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A wash under text (a pressed or hovered button): the translucent surface is
// laid over an opaque one first. The case is the one this check found: the
// destructive role's own colour on its wash, on the light sidebar, is 4.08:1
// (spec 020, R5), which is why a tinted button's hover text is the hover role.
broken('text on a wash over a surface, below AA', 'semantic', (j) => {
  j.color.destructive.$extensions['io.github.neatlittlemacapps.nigari.contrast'].push({ on: '{color.destructive-subtle}', over: '{color.surface.sidebar}', min: 4.5 });
}, /contrast: color\.destructive on color\.destructive-subtle over color\.surface\.sidebar \(light\) is 4\.0\d:1, below 4\.5:1/);

broken('a wash over a surface that is no token', 'semantic', (j) => {
  j.color['primary-hover'].$extensions['io.github.neatlittlemacapps.nigari.contrast'][0].over = '{color.surface.nowhere}';
}, /color\.primary-hover: .*names "over": "\{color\.surface\.nowhere\}", which is not a token alias/);

broken('a wash without a surface under it', 'semantic', (j) => {
  delete j.color['primary-hover'].$extensions['io.github.neatlittlemacapps.nigari.contrast'][0].over;
}, /color\.primary-subtle is translucent; contrast needs an opaque surface, or "over" one/);

// A hand edit to the generated file.
{
  const dir = mkdtempSync(join(tmpdir(), 'nigari-tokens-'));
  try {
    const out = join(dir, 'tokens.css');
    writeFileSync(out, readFileSync(join(web, 'src/tokens.css'), 'utf8').replace('--bg:', '--bg: #000; --x:'));
    const r = run(['--check', '--out', out]);
    if (r.code === 0 || !/does not match the token files/.test(r.out)) failures.push(`a hand edit to tokens.css: not caught\n${r.out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The committed files: they build into exactly the committed tokens.css.
{
  const r = run(['--check']);
  if (r.code !== 0) failures.push(`the committed tokens:\n${r.out}`);
}

if (failures.length) {
  console.error(`build-tokens: ${failures.length} problem(s)\n` + failures.map((f) => '  ' + f).join('\n'));
  process.exit(1);
}
console.log('  build-tokens: refuses broken aliases, cycles, contrast below AA, bad types, foreign extensions, clashing names, hand-written palette steps, palette steps in components, text on a wash below AA and hand edits; palettes come from their bases, roles from their steps, a swap moves only its role; committed tokens up to date');
