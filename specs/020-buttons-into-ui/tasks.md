---

description: "Tasks for one button with properties, Tabs and ToggleGroup, in four pull requests"
---

# Tasks: One button, with properties, from tokens

**Input**: `specs/020-buttons-into-ui/` (spec.md Q1–Q4, plan.md R1–R7)

**Tests**: required.
- The catalogue: every combination, axe, keyboard.
- The centring check in the real app (R4).
- `check-tokens.mjs` (literals, `rawButtons`, the `button-ok` marker
  self-test).
- The browser tests of every touched screen.
- Before and after screenshots, light and dark.

**Issues**: parent #379; tasks T001–T034 are #764–#797

**Delivery**: four pull requests by part (Q3), each from its own branch off
`main`, each lowering `rawButtons` to its measured count.

**CodeGraph** (before writing these tasks; `codegraph status`: up to date):

- **`Button` callers**: 20 graph callers, 34 call sites in 16 files.
  **`IconButton`**: 14 graph callers, 8 call sites in 6 files. **`ButtonVariant`**:
  3 callers, all in `ui/`. These are PR 1's inventory (T005, T006).
- **CSS is not indexed**: the class-built buttons (PR 2) and the tab and
  choose-one rows (PR 3) come from the census in plan.md, re-run at the start
  of each PR.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## PR 1 — The part (US1, US2)

- [x] T001 [ui] `component.tokens.json`: the `button` group of R2 (heights,
  paddings, gap, radius, border width, font weight and sizes, icon sizes,
  disabled opacity); build `tokens.css`
- [x] T002 [US1] [ui] `ui/Button`:
  - `emphasis`, `tone`, `size`, `icon`, `label`, `pressed` (R1); icon-only
    when there is no label text, with `label` required by type;
  - the tooltip and `aria-label` from `label`;
  - `aria-pressed` from `pressed`.
- [x] T003 [US1] [ui] `Button.css` from tokens and spec 019's roles only (R5),
  one radius (R3); no literal (`check-tokens.mjs` on `web/src/ui/`)
- [x] T004 [US2] [ui] Centring (R4): fixed height, flex, `text-box: trim-both
  cap alphabetic`. Measure the fallback offset per font in the running app;
  add the `@supports not` nudge and its token only if it is 1px or more
- [x] T005 [ui] Move the 34 `Button` call sites to the properties (R1
  mapping)
- [x] T006 [ui] Move the 8 `IconButton` call sites to icon-only `Button`;
  remove `ui/IconButton` and `ButtonVariant`
- [x] T007 [ui] Token build: a contrast pair for `primary` on
  `primary-subtle` and `destructive` on `destructive-subtle`, both themes
  (R5)
- [x] T008 [test] Catalogue: rebuild the Button section with every emphasis
  × tone × size × icon, plus pressed, disabled and focus, light and dark. Axe
  and keyboard pass
- [x] T009 [US2] [test] Browser check: label centring within 1px per font ×
  size, measured from the rendered pixels in the built app with fonts loaded
  (R4); mutation-check it (remove `text-box` and the nudge)
- [x] T010 [ui] `ui/README.md`: the Button entry (properties, the mapping,
  when to use which); the registry's Design system entry gains the button
  rule (plan, New concepts)
- [x] T011 [wiki] Screenshots the PR makes stale retaken and compared; the
  three defaults (radius, small height, weight) named with before/after in
  the PR
- [x] T012 [test] Reviews: `/code-review`; `ux-ui-audit` light/dark,
  desktop/phone; `codegraph sync`, then `codegraph callers Button` and
  confirm `IconButton` has none

---

## PR 2 — The class-built buttons (US1, US3)

- [x] T013 [ui] Census of raw buttons with `btn`, `btn-sm`, `icon-btn`,
  `menu-btn` and the other button classes, by file; split the PR's commits by
  area (settings and dialogs, then the big screens)
- [x] T014 [P] [ui] Settings and dialogs (`AdminSettings`, `UserMenu`,
  `AgentConnect`, `WorkspaceRules`, `WorkspaceMembers`, `WorkspaceSettings`,
  `BlueprintLibrary`, `TemplateGallery`, `dialog.tsx`, `ErrorBoundary`, the
  public and OAuth pages) to `Button`
- [x] T015 [P] [ui] The big screens (`CollectionView`, `Sidebar`,
  `PropertyValue`, `IconPicker`, `TrashSection`, `IndexView`,
  `StructurePanel`, `NotesList`, `App.tsx` …): their class-built buttons to
  `Button`
- [x] T016 [US3] [i18n] Icon-only buttons that had no name get one through
  `t()`, with de, es and nl
- [x] T017 [test] Browser tests that find a moved button by class switch to
  role and name; the touched screens' tests pass
- [x] T018 [ui] Remove the `btn`, `btn-sm`, `icon-btn` rules from
  `styles.css` and `theme.css` once no raw button uses them (Outside names);
  lower `rawButtons`
- [x] T019 [wiki] Screenshots retaken and compared; the wiki text checked for
  a button described by its old look
- [x] T020 [test] Reviews: `/code-review`; `ux-ui-audit` on the touched
  screens; `codegraph callers Button`

---

## PR 3 — Tabs and ToggleGroup (US3)

- [ ] T021 [ui] `ui/Tabs` on Base UI Tabs (R6): low · neutral · sm items,
  the selected one pressed, arrow keys; README and catalogue section
- [ ] T022 [ui] `ui/ToggleGroup` on Base UI ToggleGroup (R6): hairline frame
  at radius + inset, the chosen item pressed (tint) and announced; README
  and catalogue section
- [ ] T023 [P] [ui] Tabs move: the settings dialog's tabs, the icon picker's
  Emoji/Icons/Upload, the template categories, the index's modes, the login
  switch
- [ ] T024 [P] [ui] ToggleGroups move: the theme switch, a member's role, a
  filter's "exact", form chips, how an agent connects
- [ ] T025 [ui] A database's view tabs: move them if Base UI Tabs keeps
  their drag and menu; otherwise list them in #763 with the reason
- [ ] T026 [test] Keyboard: arrow keys in every moved tab row and toggle
  group (browser tests); axe in the catalogue; lower `rawButtons`
- [ ] T027 [wiki] Screenshots retaken and compared
- [ ] T028 [test] Reviews: `/code-review`; `ux-ui-audit` on the touched
  screens

---

## PR 4 — The rest, and the marker (US4)

- [ ] T029 [ui] Every raw button left that is a plain button moves to
  `Button` (re-count first)
- [ ] T030 [US4] [test] `check-tokens.mjs`: a raw button it allows needs
  `button-ok: <reason>` (a marker without a reason fails), counted
  separately; self-test cases in the style of spec 019's (mutation-checked)
- [ ] T031 [US4] [ui] The editor library's own controls (`blocks.tsx`, the
  `bn-*` controls in `Editor.tsx`) carry the marker
- [ ] T032 [ui] List every remaining raw button (cards, tree rows, result
  rows) in #763 by file and line; lower `rawButtons` to the measured count
- [ ] T033 [wiki] Screenshots retaken and compared
- [ ] T034 [test] Reviews: `/code-review`; `ux-ui-audit` on the touched
  screens

---

## Dependencies

PR 1 → PR 2 → PR 3 → PR 4. Each starts after the one before merges: they
share `Button.css` and the touched screens.

## Parallel

T014 with T015 (disjoint files), T023 with T024.
