---

description: "Tasks for changing a view's layout"
---

# Tasks: A view's layout can be changed

**Input**: `specs/018-view-layout-change/` (plan.md, spec.md, research.md R1–R6)

**Tests**: required. Go tests on every view door and refusal, the shared default cases, the lock test, a parity pair; one pure check; one new browser spec, two kept passing.

**Issues**: parent #469; T001–T019 are #708–#726, in order

**Delivery**: one pull request. Start after spec 016's PR 1 merges (shared files: `ViewSettingsMenu.tsx`, `quickFilters.ts`, `viewopen.go`).

**CodeGraph** (before writing these tasks; `codegraph status`: current):

- `codegraph callers applyViewSpec` → `mcpCreateView`, `mcpUpdateView`, `mcpCreateEmbedView`, `mcpUpdateEmbedView`: the switch runs before it on both update paths (T005, T006); the create paths already take a type.
- `codegraph callers defaultChartView` → `addView`, `chartEmbed` (`chartInsert.ts`) and `check-chartdefaults.mjs`: the Go mirror is held to the same function by the shared cases (T003), and the existing check keeps passing.
- `codegraph callers ViewSettingsMenu` → `CollectionView` only, for database and embed views alike (T009).
- `AddViewMenu` (`CollectionMenus.tsx`) draws the type list with `MenuValueItem`s and icons; Layout reuses it (T010).

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Foundational — one rule for the defaults

- [ ] T001 [ui] New `web/src/viewLayout.ts` (pure): `switchLayout(view, type, schema)` (R2) and `newDateName(schema)` ("Date", "Date 2", …)
- [ ] T002 [backend] New `server/viewlayout.go`: `switchViewLayout` (the same rule; chart defaults mirroring `defaultChartView`), `checkViewType` (known type; no form in an embed)
- [ ] T003 [test] `server/testdata/viewlayout/cases.json` (schema, view, type → view); `server/viewlayout_test.go` reads it; new `web/scripts/check-viewlayout.mjs` runs T001 against it, added to `npm run check`

---

## Phase 2: User Story 4 first — the server takes a type (P2, blocks the rest)

- [ ] T004 [backend] `normalizeViews` calls `checkViewType` (`400 invalid_view_type`); `applyViewSpec` uses it too (R5)
- [ ] T005 [mcp] `mcpUpdateView`: a `type` goes through `switchViewLayout` before `applyViewSpec`; calendar/timeline without a date property refused naming `update_schema`; the answer names the defaults (R4)
- [ ] T006 [mcp] `mcpUpdateEmbedView`: the same, with `form` refused by the embed sentence
- [ ] T007 [test] Go: type change on both kinds of view; other arguments win over defaults; refused while locked (`TestEveryViewDoorIsRefusedWhileLocked` gains REST and `set_view` type changes), read scope, unknown type, form in an embed, no date property; logged; round trip identical (SC-002). `TestUpdateViewMergesAndCanClear` and the embed tests that asserted the refusal now assert the switch. Mutation-checked
- [ ] T008 [mcp] `set_view` description in `server/mcp.go`; `capabilities.json` `collections` note; parity pair for a type change in `server/parity_property_test.go`; a case in `server/testdata/embedviews`

---

## Phase 3: User Story 1 — table to board and back (P1) 🎯 MVP

- [ ] T009 [US1] [ui] `ViewSettingsMenu.tsx`: **Layout** first, a `MenuSubmenu` with the current type as value, function `viewLayout` (new in `web/src/menuIcons.ts`, `LayoutDashboard`); the R9 comment replaced; not offered to a reader or while locked, as the other settings
- [ ] T010 [US1] [ui] `CollectionMenus.tsx`: the type list shared by `AddViewMenu` and Layout, Form left out for an embed
- [ ] T011 [US1] [ui] `CollectionView.tsx`: apply `switchLayout`, save as any view change (database: the views PUT; embed: the document); the toast naming the default and where to change it (R6)
- [ ] T012 [US1] [i18n] Layout, the toasts, the error sentence; `invalid_view_type` in `web/src/serverErrors.ts`; de/es/nl

---

## Phase 4: User Story 2 — layouts that need something (P1)

- [ ] T013 [US2] [ui] Calendar/Timeline with no date property: `confirm` "Add a date property named {name}?", then one PUT with the schema and views halves; without the right to change properties, the explanation and no change (R3)
- [ ] T014 [US2] [ui] Switching away from the only form view: `formShareStatus` first; when shared, `confirm` with the warning (FR-008)
- [ ] T015 [US2] [i18n] The two confirmations and the "someone who can edit the database" sentence; de/es/nl

---

## Phase 5: User Story 3 — in an embed (P2)

- [ ] T016 [US3] [test] Playwright part of T017: an embed's view switched to a board leaves the database's views unchanged; no Form offered

---

## Phase 6: Polish

- [ ] T017 [test] New `web/tests/view-layout.mjs`: table → board (filters, sort, hidden kept; toast), back (widths and order back), → calendar with and without a date property, the embed case (T016), by keyboard, reader and locked; `view-settings.mjs` and `embeds.mjs` pass
- [ ] T018 [wiki] `wiki/collections.md` (changing a layout, what is kept, the date property offer), `wiki/mcp-tools.md` (`set_view` type on updates), `docs/what-it-does.md`; shots listing `ViewSettingsMenu.tsx` retaken
- [ ] T019 [test] Reviews before the PR: `/code-review`; `ux-ui-audit` light/dark, desktop/phone; `codegraph sync` then `codegraph callers` on every exported symbol added or moved

---

## Dependencies

Spec 016 PR 1 merged → Phase 1 → Phase 2 → Phases 3–5 → Phase 6.

## Parallel

T001 and T002. T012 and T015 with their phases.
