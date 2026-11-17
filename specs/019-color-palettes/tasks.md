---

description: "Tasks for named colour palettes and the role tokens that reference them"
---

# Tasks: Named colour palettes, and role tokens that reference them

**Input**: `specs/019-color-palettes/` (plan.md, spec.md, research.md R1–R6)

**Tests**: required. `check-build-tokens.mjs` cases for generation, references, a swap that fails contrast and a palette name used outside `tokens.css`; `build-tokens.mjs --check`; `check-chartcolours.mjs` on the data roles; every role's colour before and after, both themes.

**Issues**: parent #747; tasks T001–T013 are #748–#760

**Delivery**: one pull request. Spec 020 (the button) starts after it merges.

**CodeGraph** (before writing these tasks; `codegraph status`: up to date):

- `oklchToSrgb` → one caller (`build-tokens.mjs`): the generator sits beside it (T002).
- `OPTION_TOKEN` → two callers in `chartTheme.ts`; `groupColourTokens` → `ChartFigure` and `check-chartcolours.mjs`: the data roles' names change in those three places only (T008).
- CSS is not indexed: the legacy names' uses were counted by text search (`--muted` 223 … `--accent-rgb` 50); they stay as aliases (T005).

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Foundational — measure, then generate

- [x] T001 [ui] Record every semantic colour's value today, light and dark (`tokens.css` resolved), into a before table in the scratchpad, for the PR's before/after
- [x] T002 [ui] `build-tokens.mjs`: a `palette` group whose `500` is an OKLCH base; generate 50 … 950 (with 850 and 925) by the R1 fraction table, hue kept, chroma lowered only into gamut; write each step as `--palette-<name>-<step>`
- [x] T003 [test] `check-build-tokens.mjs`: steps from a base (500 is the base, lightness per the table, in gamut), the same table for every palette, a missing base fails

---

## Phase 2: User Story 1 — swap a role in one place (P1) 🎯 MVP

**Independent Test**: point `primary` at another palette, build, see every primary colour change; a too-light base fails contrast naming the token.

- [x] T004 [US1] [ui] `primitives.tokens.json`: palettes `raspberry` (base `#b3123f`), `burnt-orange` (`#c2410c`), `stone` (`#6f6e6a`), `slate` (`#808083`), as OKLCH; the colour-named primitives (`paper`, `ink`, `night`, `mist`, `pink`, `orange`) removed
- [x] T005 [US1] [ui] `semantic.tokens.json`: the role tier (`primary`, `-hover`, `-pressed`, `-subtle`, `on-primary`; `destructive` and its states; the neutral roles), each a palette step per theme, alpha for the translucent ones; today's names (`color.accent.default`, `color.danger`, `color.surface.*`, `color.text.*`, `color.border.*`, `color.hover`, `color.active`, `color.pill.*`, `--accent-rgb` and the legacy `--bg` … aliases) kept as aliases of their roles
- [x] T006 [US1] [test] `check-build-tokens.mjs`: a role referencing a step resolves in both themes; a swap (role → other palette) changes only that role's colours; a swap whose text fails its contrast fails the build naming token and ratio

---

## Phase 3: User Story 2 — nothing looks different (P1)

- [x] T007 [ui] Build `tokens.css`; compare every role with T001's table; list each difference (role, theme, before, after, ΔL) for the PR; nothing beyond the nearest-step rule

---

## Phase 4: Data colours (owner, "same for data")

- [x] T008 [ui] Data palettes (the twelve series hues and gray, from today's OKLCH values) and data roles `data-1` … `data-12`, `data-<hue>-strong|medium|soft`, `data-background-1–4`; today's `color.chart.*` names kept as aliases; `chartTheme.ts` `OPTION_TOKEN` and `check-chartcolours.mjs` read the role names; the 3:1 rule passes
- [x] T009 [test] `check-chartcolours.mjs` and the chart browser tests (`chart-colours.mjs`, `chart-view.mjs`) pass on the data roles

---

## Phase 5: User Story 3 — components name roles (P2)

- [x] T010 [US3] [ui] `check-tokens.mjs`: a `--palette-` name outside `tokens.css` fails (budget 0); a test case for it
- [x] T011 [ui] `.specify/memory/surfaces.md` Design system entry gains the colour tiers (plan, New concepts); the token files' descriptions say how to swap a palette and how steps are generated (FR-008)

---

## Phase 6: Polish

- [x] T012 [wiki] Screenshots made stale by `tokens.css` retaken and compared; `web/src/ui/README.md` (or the catalogue) shows the palettes and roles, light and dark
- [ ] T013 [test] Reviews before the PR: `/code-review`; `ux-ui-audit` light/dark, desktop/phone, on the before/after; `codegraph sync` then `codegraph callers` on every symbol renamed (`OPTION_TOKEN`, the build's new functions)

---

## Dependencies

Phase 1 → Phase 2 → Phases 3 and 4 → Phase 5 → Phase 6.

## Parallel

T003 with T004. T008 after T005 (both edit `semantic.tokens.json`).
