# Implementation Plan: A Status property type

**Branch**: `claude/spec-016-status-property` (spec and plan); the build gets its own branch | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md) | **Issue**: #18

**Input**: Feature specification from `/specs/016-status-property/spec.md`

## Summary

A `status` property: options as a select's, each in one of three fixed
groups (To-do, In progress, Complete), every group with at least one option.

- **Stored**: `group` on each option in the schema; rows keep the option id
  (R1). Options kept in group order at every save, so boards, charts and
  pickers draw the right order without knowing groups (R2).
- **Filters and rollups by group**: `group_is` / `group_is_not`, rewritten to
  the existing `is` / `is_not` with option ids per query in `typeFilters`
  and per rollup in `computeDerived` (R3). No new SQL for filtering.
- **New rows** start with the first To-do option, through one function every
  door calls (R4); a view's pin or a given value wins.
- **Sort** by group, then option place (R5). **Conversion** from a select by
  one shared name guess (R6). **New databases** get a status (R7). **Charts**
  can group by group (R8). **Validation** in one function on the three
  schema doors (R9). A helper replaces `=== 'select'` where it means "has
  options" (R10).
- **Agents**: no new tool; `update_schema`, `create_database`, `query_rows`,
  `set_view` and rollups take the type and the operators; one parity pair.

Two pull requests: **PR 1** the type, editor, cell, board, validation,
conversion, new-row default, sort, new databases' default and MCP (stories 1,
3, 4 and FR-017/018); **PR 2** group filters, rollups, pins, quick filters and
charts by group (story 2). PR 1 is useful alone (a status that works like a
select with groups); PR 2 is what makes "open work" stop breaking.

## Technical Context

**Language/Version**: Go 1.27 (`server/`); TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: none new. `ui/Menu`, `MenuValues`, the existing
option editor in `PropertyFields`.

**Storage**: no table, column or index. One more property type and one key
per option inside `collections.schema`. `defaultSchema` changes for new
databases only (R7); no upgrade step (Stored data row).

**Testing**:
- Go `server/status_test.go`: validation on all three schema doors (unknown
  group, empty group, duplicate name) with nothing stored; conversion guess
  from `testdata/statusgroups.json`; options reordered by group on save;
  default value through every row door (R4); sort order in the rows query;
  group filter rows equal per-option filter rows, and follow an option moved
  or added (SC-001); rollup by group; pin from a single-group filter;
  `typeFilters` leaves non-status properties alone. MCP through `callTool`,
  read scope refused. A pair in `parity_property_test.go`.
- Check scripts: `check-statusgroups.mjs` (the TypeScript guess against the
  shared cases; no new bare `=== 'select'` meaning "has options", R10).
- Playwright `web/tests/status-property.mjs`: add a status, options under
  group headings, move an option between groups (mouse and keyboard),
  refused last-option delete, convert the default board's select, board
  columns in group order, new row starts in Not started; PR 2: filter by
  group, quick filter chip, rollup progress. `select-options.mjs`,
  `board-lanes.mjs`, `quick-filters.mjs`, `new-row-filters.mjs` keep passing.

**Target Platform**: browser at desktop and phone widths; the desktop shell;
MCP clients

**Performance Goals**: `query_rows` / the rows query on the seeded 10k-row
database stays within its p95 budget with a group filter and with a status
sort (spec 002 research). The schema is already loaded once per query by
`typeFilters` when filters exist; the sort adds one `loadCollection` only
when sorting by a property.

**Constraints**: design system (`ui/` and tokens; budgets only go down);
menu icons (no new function: the type picker is a `<select>`, the option
menu reuses rename/delete and `moveTo`); English source;
`CollectionView.tsx` is large, so the group filter's value picker goes in its
own module.

**Scale/Scope**: 1 issue, 2 PRs, 0 routes, 0 tools, 1 property type, 2
filter operators, 1 error code, about 15 strings.

## CodeGraph

Index checked with `codegraph status`: 469 files, current with the checkout
(2026-11-14).

- `codegraph explore "select property options schema validation
  update_schema property types"`: `validPropTypes`/`propTypeNames`
  (`mcp_schema.go`) refuse `status`; `TYPES` and `changePropertyType`
  (`propertyTypes.tsx`) are the browser's list and type change; options are
  edited in `PropertyFields` with `renameSelectOption`/`reorderSelectOption`
  (checked by `check-select-rename.mjs`). `changePropertyType` has 2
  callers (`EditPropertyPanel`, `SchemaEditor.changeType`), both get the
  conversion through it.
- `codegraph explore "filter operators … rollup percent aggregation; board
  groupBy"`: `typeFilters` (2 callers: `rowsWhere`, `viewFiltersNow`) is the
  single place every rows query, chart and view-match types its filters
  from the schema, which is why R3 resolves groups there. `rowsWhere` is
  shared by the rows query and `aggregate.go` (spec 004 SC-002), so charts
  get group filters for free. Rollup conditions are evaluated apart, in
  `matchesRollupWhere` (`derived.go`), with no schema: R3 resolves them in
  `computeDerived`.
- `codegraph explore "typeFilters matchesFilter mergePins propsInView
  sortParam"` and `codegraph callers mergePins` (4 doors:
  `handleCreatePage`, `handleRowFromTemplate`, `mcpCreateRows`,
  `propsInRowView` → `mcpCall` create_page and `mcpCreateFromTemplate`):
  the doors R4 must reach; text search added the public form, CSV import and
  ingest, which insert rows without pins. The browser's `matchesFilter`
  (`CollectionView.tsx`) and `sortComparator` (`viewSort.ts`) are the
  second pass that must agree with the server.
- The rows query's sort is `json_extract(props, '$.<prop>')` and
  `sortComparator` compares raw values: a select sorts by id text today
  (spec's FR-014 corrected from "option order" to say so; R5).
- `codegraph callers normalizeSchema`: only `mcpUpdateSchema` (plus tests).
  `handlePutCollection` stores raw JSON; spec 015 found `mcpCreateDatabase`
  as a third schema door. R9 calls the check on all three.
- Surprise from the graph: `groupableTypes` (`aggregate.go`) and
  `chartDefaults.ts`/`ChartSettings.tsx` already list `status` (spec 004
  planned for it), so charts by option need no change; only R8's by-group
  setting is new.
- Text search (strings, not in the graph): the `=== 'select'` tests R10
  replaces (14 browser files, 10 server files), `defaultSchema`, and the
  `is_not [done, discarded]` advice in `update_schema`'s description.
  `wiki/collections.md` and `wiki/mcp-tools.md` are the pages; screenshots
  listing `PropertyFields.tsx`, `BoardView.tsx` or `CollectionView.tsx` as a
  source go stale and are retaken.

## Constitution Check

- I. One binary, no external services: ✅ a schema key and a type.
- II. Agent parity: ✅ every action over existing tools (`update_schema`,
  `create_database`, `query_rows`, `set_view`, `create_rows`); `gapBudget`
  stays 10.
- III. Gates are one function: ✅ `checkStatusProps` on the three schema
  doors (R9), `withStatusDefaults` on every row door (R4), group resolution
  in `typeFilters` (R3); the existing write gates unchanged.
- IV. Derive from code: ✅ the conversion's word list is one file read by
  both sides' tests (R6); a check keeps `=== 'select'` from coming back
  (R10). No `data-model.md` (one key on an option, written in R1),
  `contracts/` (no new route or tool; the arguments are in the Surfaces MCP
  row) or `quickstart.md` (nothing beyond the tasks).
- V. English source: ✅ group labels and strings through `t()`, de/es/nl.
- VI. Every surface: ✅ table below. **New concept**: none for the registry
  (a property type is already covered by the Aggregation row).
- VII. Measured: ✅ group filter and status sort benchmarked on the seeded
  workspace.

Re-checked after design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | `server/status.go` (new): `checkStatusProps`, `normalizeStatusOptions`, `guessStatusGroup`, `withStatusDefaults`, `resolveStatusGroups`. Called by `handlePutCollection`, `mcpUpdateSchema`, `mcpCreateDatabase` (validation, order, guess); by every row door (R4); by `typeFilters` and `pinsFromFilters` (R3, R4); by `computeDerived` (rollups). Gates unchanged: `canWriteReq` / the MCP write gate for schema writes, the existing row-create gates. Audit and webhooks unchanged: schema and row writes are logged and fired as today | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change to the schema. The rows query's `ORDER BY` gains a `CASE` over a status's option ids (R5); group filters reuse the existing `IN (…)` SQL (R3). Both on the read pool under `withReadLimit` as now | backend |
| REST routes (`server/server.go`, middleware) | No new route. `PUT /api/collections/{id}` validates status properties (`400 invalid_status_options`) and refuses a group condition on a non-status property in `views`; `GET …/rows` accepts `group_is`/`group_is_not` in `filter`/`filter_group` | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `validPropTypes` and `propTypeNames` gain `status`. `update_schema`, `create_database`: the type, `group` on options, the conversion; the `is_not [done, discarded]` advice replaced by `group_is_not ["complete"]`. `query_rows`, `set_view`, rollup conditions: the two operators. `create_rows`/`create_page`: the To-do default. Same sentences as REST; read scope refused by the existing write gate; returned names already pass through `wrapUntrusted` where they did | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `propertyTypes.tsx`: Status in `TYPES`; `changePropertyType` converts (R6, `statusGroups.ts` new, pure). `PropertyFields`: options under three group headings, drag or the option menu's **Move to** to change group, last-option delete refused with the sentence. `PropertyValue`: picker lists options under group headings. `BoardView`/`boardLanes.ts`/`cardLayout.ts`/`GalleryView`/`QuickFilters`: via `isOptionType` (R10). Filter row: **Group is / Group is not** with a group picker (new `components/StatusGroupFilter.tsx`). Rollup settings: group condition. `ChartSettings`: Group by Option/Group (R8). `viewSort.ts`: status order (R5). Light and dark; keyboard: group headings are not focus stops, every option reachable, Move to through `ui/Menu` | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | About 15 strings: Status, To-do, In progress, Complete, Not started, Done, Group is, Group is not, Move to, Group by, Option, Group, the last-option sentence, the multi-select refusal; de/es/nl, informal | i18n |
| Server error codes (`web/src/serverErrors.ts`) | `invalid_status_options` with its sentence | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | `wiki/collections.md`: the Status type, groups, conversion, filtering by group, rollups by group. `wiki/mcp-tools.md`: the type, `group`, the operators. `docs/what-it-does.md`: one line. Screenshots: new databases' board now shows a status (same columns); every shot whose sources include `PropertyFields.tsx`, `PropertyValue.tsx`, `BoardView.tsx` or `CollectionView.tsx` retaken by `shoot-wiki.mjs` | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | See Technical Context. Refusal paths: bad group, empty group, duplicate name on all three doors; multi-select with multi-value rows; group condition on a non-status; read scope. New tests mutation-checked | test |
| Performance (query plans, payload size, per-request work) | Group filter: same SQL as an `is` list, `EXPLAIN QUERY PLAN` unchanged. Sort: one `CASE` over tens of ids. Rollups: one schema load per rollup per `computeDerived` call, not per row. Schema payload: a few bytes per option | perf |
| Manifest (`capabilities.json`, `gapBudget`, `parity_property_test.go`) | No new route or tool; `update_schema` and `query_rows` notes mention status. One parity pair: a status schema saved and a group-filtered read by REST and MCP agree on access. `gapBudget` stays 10 | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | No new component: group headings use the existing menu/section label style tokens; `MenuValues` for the group picker (its reason: a choice among three fixed values). No new literal; budgets only go down | ui |
| Storage budgets (`bench_world_test.go`, p95 in spec 002 research) | Benchmarks added: rows query with `group_is_not ["complete"]` and with a status sort on the seeded database; must stay within the rows query's p95 budget | perf |
| Page containers (full page, side peek, centre peek) | A status on a row's page is drawn by `PropertyValue` inside the shared `Editor`, in all three containers; the Playwright spec sets one in a side peek | ui |
| Aggregation (`server/aggregate.go`) | `status` already groups by option (`groupableTypes`). New: by group when the chart says `statusGroups` (R8), with a case in `aggregate_test.go`. Not a number: no sum/avg | backend |
| Stored data (`server/upgrade_steps.go`) | No upgrade step: no existing value is rewritten; the new type and the `group` key appear only when someone creates or converts a property; `defaultSchema` applies to new databases only (R7, FR-016) | backend |
| Outside names (env vars, cookies, storage keys, …) | No change: no new outside name. `status` and the group values are new names in the schema an agent sees, documented in `mcp-tools.md`; none renamed | backend |
| Menu icons (`ui/Menu`, `menuIcons.ts`, `check-menu-icons.mjs`) | **Move to** in an option's menu reuses the existing `moveTo` function (`CornerUpRight`, today a page's Move to: the same meaning, moving something into another container). No new function. The group picker is a `MenuValues` with its reason | ui |
| View lock (`checkViewsUnlocked`, `auditViewChanges`) | No new path writes views. A group filter is saved by the existing view doors, which already check the lock. Converting a property's type does not rewrite views | backend |
| Cross-origin requests (`server/crossorigin.go`) | No change: no new route or socket | backend |
| Embedded views (`web/src/embedViews.ts`, `server/embedviews.go`) | A group filter in an embed's own view is read by `viewFilterList` → the same `typeFilters` path, and pins through `pinsForFilters`; the browser's `matchesFilter` is shared. A case added to `server/testdata/embedviews` for a group filter | ui |
| Content actions (`web/src/actions/`) | No new property action (type change and options live in the property's own settings). The option menu's Move to is an option setting, not a content action of a property; noted in the option editor's comment | ui |

**New concepts**: None. A property type is already answered for by the
Aggregation row; the "has options" helper (R10) is enforced by its own check.

**Parity statement**: Agents can do this over MCP via `update_schema`,
`create_database`, `query_rows`, `set_view` and `create_rows`, with the same
checks as `PUT /api/collections/{id}` and `GET /api/collections/{id}/rows`.

## Project Structure

### Documentation (this feature)

```text
specs/016-status-property/
├── spec.md
├── plan.md        # this file
├── research.md    # R1–R11
├── checklists/requirements.md
└── tasks.md       # /speckit-tasks
```

### Source Code (repository root)

**Files touched**: `server/status.go` (new), `server/status_test.go` (new),
`server/testdata/statusgroups.json` (new), `server/collections.go`
(`defaultSchema`, `typeFilters`, sort, `handlePutCollection`),
`server/mcp_schema.go`, `server/mcp_db.go`, `server/viewpins.go`,
`server/derived.go`, `server/aggregate.go`, `server/viewopen.go`,
`server/pages.go`, `server/db_templates.go`, `server/public_form.go`,
`server/public_collection_table.go`, `server/import_csv.go`,
`server/ingest.go`, `server/mcp.go` (descriptions),
`server/parity_property_test.go`, `server/bench_world_test.go`,
`web/src/types.ts`, `web/src/statusGroups.ts` (new),
`web/src/components/propertyTypes.tsx`, `PropertyFields.tsx`,
`PropertyValue.tsx`, `BoardView.tsx`, `GalleryView.tsx`, `QuickFilters.tsx`,
`CollectionView.tsx`, `StatusGroupFilter.tsx` (new), `ChartSettings.tsx`,
`web/src/viewSort.ts`, `boardLanes.ts`, `cardLayout.ts`, `quickFilters.ts`,
`chartDefaults.ts`, `serverErrors.ts`, `web/src/locales/*.json`,
`web/scripts/check-statusgroups.mjs` (new), `web/tests/status-property.mjs`
(new), `wiki/collections.md`, `wiki/mcp-tools.md`, `docs/what-it-does.md`.

## Complexity Tracking

No violations.
