---

description: "Tasks for a Status property type"
---

# Tasks: A Status property type

**Input**: `specs/016-status-property/` (plan.md, spec.md, research.md R1–R11)

**Tests**: required. Go tests on every door and refusal, the shared conversion cases, a parity pair, two benchmarks; one pure check; one new browser spec, four kept passing.

**Issues**: parent #18; T001–T036 are #646–#681, in order

**Delivery**: two pull requests (plan Summary). PR 1 = Phases 1–5; PR 2 = Phases 6–7; Phase 8 closes each PR's own share.

**CodeGraph** (before writing these tasks; `codegraph status`: current):

- `codegraph callers sortComparator` → `applyView` **and `dropIndex`** (`web/src/boardDrag.ts`): the board's drop marker sorts with the same comparator, so it needs the status order too (T019), which the plan did not name.
- `codegraph callers computeDerived` → `collectionRowsQuery`, `fillDerivedForPage` and `aggregateDerived` (`aggregate.go`): the rollup's group resolution lives inside `computeDerived`, so all three get it (T027).
- `codegraph callers pinsFromFilters` → `rowPinsForView` and `pinsForFilters` (database and embed views): one change covers both (T029).
- `codegraph callers checkViewQuickFilters` / `checkViewSubGroup` → `normalizeViews` and `applyViewSpec`: REST and MCP share the type lists (T013).
- `codegraph callers mcpCreateDatabase` → `mcpCall`: the third schema door (T004).

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Foundational — the type and its rules on the server

**Purpose**: `status` is a type, its options carry a group, every door checks it (R1, R2, R9). Blocks everything.

- [x] T001 [backend] `validPropTypes` and `propTypeNames` (`server/mcp_schema.go`) gain `status`; the test that keeps them level passes
- [x] T002 [backend] New `server/status.go`: the three groups, `checkStatusProps(schema)` (known group, every group ≥1 option, unique names), `normalizeStatusOptions` (stable sort by group, R2), `optionTypes` (select, multiselect, status) for R10
- [x] T003 [backend] `guessStatusGroup(name)` and the empty-group fill (R6), with `server/testdata/statusgroups.json` holding the word list's cases; conversion from multi-select refused when a row holds several values, saying how many
- [x] T004 [backend] Call check, order and guess from `handlePutCollection` (`400 invalid_status_options`), `mcpUpdateSchema` and `mcpCreateDatabase`; same sentence on all three
- [x] T005 [test] New `server/status_test.go`: each refusal on all three doors with nothing stored; options reordered on save; conversion cases from the JSON file; multi-select refusal. Mutation-checked (each door's call removed in turn)

**Checkpoint**: an agent can create and convert a status; nothing in the browser yet.

---

## Phase 2: Foundational — the browser knows the type

- [x] T006 [P] [ui] `PropType` gains `'status'`; `PropOption.group?`; `isOptionType(type)` in `web/src/types.ts`
- [x] T007 [P] [ui] New `web/src/statusGroups.ts` (pure): the groups and their labels through `t()`, `guessStatusGroup`, `fillEmptyGroups`, `orderByGroup`
- [x] T008 [P] [test] New `web/scripts/check-statusgroups.mjs`: T007 against `server/testdata/statusgroups.json`; fails a new `=== 'select'` meaning "has options" outside its reviewed list (R10); added to `npm run check`
- [x] T009 [P] [i18n] `invalid_status_options` in `web/src/serverErrors.ts`; the group names, Status, Not started, Done; de/es/nl

---

## Phase 3: User Story 1 — track work with a Status (P1) 🎯 MVP

**Goal**: add a status, edit its options under groups, set it on rows, board columns in group order (FR-001–FR-006).

**Independent Test**: add a status, move an option to Complete, group a board by it.

- [ ] T010 [US1] [ui] `propertyTypes.tsx`: Status in `TYPES`; `changePropertyType` converts with T007 (from select, from multi-select when allowed)
- [ ] T011 [US1] [ui] `PropertyFields.tsx`: options under three group headings; add an option into a group; drag between groups; option menu **Move to** (`moveTo`) with a `MenuValues` of the groups; last-option delete refused with the sentence
- [ ] T012 [US1] [ui] `PropertyValue.tsx`: the picker lists options under group headings; set and clear like a select
- [x] T013 [US1] [ui] Replace the `=== 'select'` tests meaning "has options" with `isOptionType` / `optionTypes`: `BoardView`, `boardLanes.ts`, `cardLayout.ts`, `GalleryView`, `QuickFilters`, `quickFilters.ts`, `chartDefaults.ts`, `rowProperties.ts`, `propertyDelete.ts`, `ViewSettingsMenu`, `CollectionView`; server `viewopen.go` (quick filters, lanes, a board's default column property), `public_form.go`, `public_collection_table.go`, `import_csv.go` (export only, R11), `mcp_db.go`
- [ ] T014 [US1] [test] Kept passing: `select-options.mjs`, `board-lanes.mjs`, `quick-filters.mjs`

---

## Phase 4: User Story 3 — turn a select into a status (P2)

- [ ] T015 [US3] [test] Go: converting the default schema's select keeps every row's value and the board's columns (SC-002), REST and `update_schema`
- [x] T016 [US3] [backend] `defaultSchema` (`server/collections.go`) becomes a status with ids `todo`, `doing`, `done` and their groups (FR-018, R7); a test that a new database's board still groups by `status`

---

## Phase 5: New rows, sort, agents (FR-014, FR-017, US4)

- [x] T017 [backend] `withStatusDefaults(schema, props)` in `server/status.go`, called by `handleCreatePage`, `handleRowFromTemplate`, `mcpCreateRows`, `propsInRowView` (create_page, templates), `handlePublicFormSubmit`, the CSV import and `runIngest`; a Go test makes a row through each door (the list is the calls) (R4)
- [ ] T018 [backend] Status sort by group then option place: `ORDER BY CASE` in `collectionRowsQuery` (R5)
- [ ] T019 [ui] `sortComparator` takes the option order, and its callers `applyView` **and `dropIndex`** pass it (R5)
- [ ] T020 [mcp] `update_schema`, `create_database` descriptions: the type, `group` on options, the conversion; `capabilities.json` notes; parity pair "save a status schema" in `server/parity_property_test.go`
- [ ] T021 [test] Go: sort order in the rows query; default value through every door; read scope refused on a status schema change
- [ ] T022 [perf] Benchmark in `server/bench_world_test.go`: a status sort on the seeded database within the rows query's p95 budget

**Checkpoint (PR 1)**: Playwright `web/tests/status-property.mjs` part 1 (T023) green; wiki part 1 (T034).

- [ ] T023 [test] New `web/tests/status-property.mjs`: add a status, options under headings, Move to by mouse and keyboard, refused last-option delete, convert the default board's select, columns in group order, a new row starts in Not started, set in a side peek

---

## Phase 6: User Story 2 — filter and count by group (P1, PR 2)

**Goal**: `group_is` / `group_is_not` in filters and rollups, pins, quick filters (FR-007–FR-009).

**Independent Test**: filter "group is not Complete", add an option to Complete, the view stays right.

- [ ] T024 [US2] [backend] `resolveStatusGroups` in `server/status.go`; `typeFilters` rewrites group conditions to `is`/`is_not` with option ids (R3); a group condition on a non-status narrows nothing
- [ ] T025 [US2] [backend] Saving a group condition on a non-status property refused: `normalizeViews`, `applyViewSpec` (`set_view`), rollup conditions in `checkStatusProps`' caller
- [ ] T026 [US2] [ui] `matchesFilter` (`CollectionView.tsx`) resolves group conditions from the schema it holds; new `components/StatusGroupFilter.tsx` for the filter row's **Group is / Group is not**
- [ ] T027 [US2] [backend] Rollup condition by group: resolved once per rollup in `computeDerived` (reaches `collectionRowsQuery`, `fillDerivedForPage`, `aggregateDerived`)
- [ ] T028 [US2] [ui] The rollup settings in `PropertyFields.tsx` offer a group condition
- [ ] T029 [US2] [backend] `pinsFromFilters`: a single-group `group_is` pins that group's first option (database and embed views through its two callers)
- [ ] T030 [US2] [ui] Quick filter chip of a status lists the groups, then the options
- [ ] T031 [US2] [test] Go: group filter rows equal per-option rows and follow an option added or moved (SC-001); rollup by group; pin; refusals; a case in `server/testdata/embedviews`; benchmark `group_is_not ["complete"]` within budget (SC-003); `query_rows`, `set_view` descriptions and a parity pair for a group-filtered read

---

## Phase 7: Charts by group (FR-012, PR 2)

- [ ] T032 [backend] `statusGroups` chart setting: `aggregate.go` maps option to group in the same pass, with a case in `aggregate_test.go`
- [ ] T033 [ui] `ChartSettings.tsx` offers **Group by: Option / Group**

---

## Phase 8: Polish (each PR its own share)

- [ ] T034 [wiki] `wiki/collections.md` (the type, groups, conversion; PR 2: filters, rollups, charts by group), `wiki/mcp-tools.md`, `docs/what-it-does.md`; screenshots listing `PropertyFields.tsx`, `PropertyValue.tsx`, `BoardView.tsx` or `CollectionView.tsx` retaken
- [ ] T035 [test] `web/tests/status-property.mjs` part 2: filter by group, quick filter chip, rollup progress; `new-row-filters.mjs` passes
- [ ] T036 [test] Reviews before each PR: `/code-review`; `ux-ui-audit` light/dark, desktop/phone; `codegraph sync` then `codegraph callers` on every exported symbol added or moved

---

## Dependencies

Phase 1 → Phase 2 → Phases 3–5 (PR 1) → Phases 6–7 (PR 2). T013 before T014. T024 before T025–T031. Spec 018 starts after PR 1 merges (shared files).

## Parallel

Within Phase 2, T006–T009. Within Phase 6, T029 and T030 once T024 is in.
