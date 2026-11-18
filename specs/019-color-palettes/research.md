# Research: Named colour palettes, and role tokens that reference them

Decisions for spec 019, with the options turned down. Read with
[plan.md](plan.md).

## R1 — How a palette's steps are generated

**Decision**: a palette is one OKLCH base (L₀, C₀, H₀), stored as step
500. Every other step is a fraction of the way from the base's lightness:

- lighter: `L = L₀ + f · (1 − L₀)`
- darker: `L = L₀ − f · L₀`

with one table of fractions for every palette:

| Step | 0 | 50 | 100 | 200 | 300 | 400 | 450 | 500 | 600 | 700 | 800 | 850 | 900 | 925 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| f | +1 | +0.965 | +0.91 | +0.71 | +0.55 | +0.40 | +0.20 | 0 | −0.15 | −0.30 | −0.49 | −0.59 | −0.70 | −0.75 | −0.78 |

(As built: step 0, step 450 and 100 at +0.91 instead of +0.905 were added
while building; why, in `docs/decisions.md`, 2026-11-17.)

Hue stays H₀. Chroma stays C₀ and is lowered, step by step, only until the
colour fits sRGB (the build's existing `oklchToSrgb`), so a light step of
a saturated palette comes out paler but never shifts hue.

**Why this table**: it was fitted to where today's colours sit relative to
their palette's base (measured, 2026-11-17):

| Today | Palette | Fraction | Step |
|---|---|---|---|
| dark accent `#ff5c80` | raspberry | +0.404 | 400 |
| dark danger `#ff7a59` | burnt-orange | +0.393 | 400 |
| `paper.50` (surface) | stone | +0.968 | 50 |
| `paper.100` (sidebar) | stone | +0.907 | 100 |
| `mist.50` | slate | +0.927 | 50 (nearest; +0.965) |
| `mist.100` (dark text) | slate | +0.714 | 200 |
| `ink.800` | stone | −0.491 | 800 |
| `ink.900` (text) | stone | −0.594 | 850 |
| `night.850` | slate | −0.700 | 900 |
| `night.900` | slate | −0.749 | 925 |
| `night.950` | slate | −0.783 | 950 |

Two observations decided its shape. Dark mode's accent and danger sit at
the same fraction (+0.40) from their bases, so one step serves both roles.
Dark mode's three surfaces are only 0.02–0.05 apart in lightness, so the
dark end needs 850 and 925 besides the usual steps, or two of the three
surfaces would merge. The plan's first task measures every role's colour
before and after; differences are listed in the pull request (owner:
nearest step).

**Turned down**: fixed lightness targets per step, the same for every
palette (Tailwind's way) — the base would not land on 500 and swapping a
base would move its other steps by different amounts; a per-palette table
— the palettes would no longer be interchangeable; a hand-set override per
step (owner, "nearest step").

## R2 — The three tiers, renamed

**Decision**:

- **Palettes** (`primitives.tokens.json`, group `palette`): `raspberry`,
  `burnt-orange`, `stone`, `slate`, and the data palettes (R5). Each holds
  its base in `$value` of `500` and the generation rule; the build writes
  the steps. A palette step is never read by a stylesheet or component
  (R4).
- **Roles** (`semantic.tokens.json`): `primary`, `primary-hover`,
  `primary-pressed`, `primary-subtle`, `on-primary`; `destructive` and its
  states; `neutral` roles (surfaces, text, muted text, borders, hover,
  active, the ink pill, focus); each a palette step per theme, with an
  alpha for the translucent ones (hover, borders are today's text colour
  at a few percent).
- **Flat output** (`tokens.css`): each role as one CSS variable
  (`--color-primary-pressed`), light under `:root`, dark under
  `[data-theme="dark"]`, as the build writes today.

**Today's names stay**: every variable the stylesheets read
(`--color-accent-default`, `--color-danger`, `--accent`, `--bg`, `--fg`,
`--muted`, `--border`, `--hover`, `--accent-rgb`, …) is kept as an alias
of its role. `--accent-rgb` (50 uses, `rgba(var(--accent-rgb), x)`) is
written as the primary role's sRGB channels. Renaming the uses is spec
020's and later work; this spec changes no stylesheet.

**Turned down**: palettes named by role (the first draft; the owner: "palettes
are named by a name"); components reading palette steps (a swap would have
to find them all).

## R3 — Swapping

**Decision**: two ways, both one edit in a token file: point the role
tokens at another palette, or change a palette's base. The contrast check
(`build-tokens.mjs`) runs on the result; a swap that leaves a text colour
below its ratio fails the build naming it. The token files' descriptions
say how (FR-008).

## R4 — Keeping components on roles

**Decision**: palette steps are written to `tokens.css` under a
`--palette-` prefix (needed for the roles to reference), and
`check-tokens.mjs` refuses a `--palette-` name anywhere outside
`tokens.css` (FR-007), with a budget of 0.

**Turned down**: not writing palette steps to CSS at all (the roles could
then only hold resolved values, and the browser's dev tools would no
longer show which step a role is).

## R5 — Data colours

**Decision** (owner, "same for data"): each hue the charts use is a named
palette: the twelve chart series hues (blue, orange, green, purple, teal,
pink, yellow, red, indigo, lime, brown, cyan) and gray, 13 in all. The data roles reference their steps: `data-1` …
`data-12` (chart series), `data-<hue>-strong|medium|soft` (today's
`chart.<hue>.1–3`, the single-hue chart palettes), `data-background-1–4`.
The 3:1 rule for drawn colours (spec 004) runs on the result, as today.
`check-chartcolours.mjs` reads the role names (`OPTION_TOKEN` in
`chartTheme.ts` is renamed with them).

**Stays as it is**: the nine colours a select option **stores**
(`OPTION_HEXES`, `selectOptions.ts`). They are saved in every database's
schema; changing them would rewrite users' data. They remain the keys
`OPTION_TOKEN` maps to data roles. Their contrast is #736.

## R6 — The build and its checks

**Decision**: `build-tokens.mjs` gains the generator (R1) and the `palette`
group; `check-build-tokens.mjs` gains cases: a palette's steps from its
base, a role referencing a step, a swap failing contrast, a `--palette-`
name refused by `check-tokens.mjs`. No new dependency.
