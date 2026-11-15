# Implementation Plan: A view's layout can be changed

**Branch**: `claude/spec-018-view-layout` (spec and plan); the build gets its own branch | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md) | **Issue**: #469

**Input**: Feature specification from `/specs/018-view-layout-change/spec.md`

## Summary

**Layout** in a view's Settings switches its type. Settings every type
shares stay; settings of the type left behind stay in the view and return
with it; the new type gets the defaults a new view of it gets.

- **Model**: a type change is a view change through the existing doors,
  with their lock and log (R1).
- **Defaults**: `switchLayout` (browser) and `switchViewLayout` (Go), held
  level by shared cases (R2).
- **No date property**: the browser asks, then adds "Date" and switches in
  one save; agents add it with `update_schema` first (R3, owner "B").
- **Agents**: `set_view` stops refusing `type` on database and embed views
  (R4); REST checks types like `set_view` does (R5).
- **Interface**: Layout submenu, the default said in a toast, a warning
  before the only form view stops being one (R6).

One pull request. **Start after spec 016's PR 1 merges** if both are built
at once: both touch `ViewSettingsMenu.tsx`, `quickFilters.ts` (the board's
group candidates) and `viewopen.go`.

## Technical Context

**Language/Version**: Go 1.27 (`server/`); TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: none new. `ui/Menu` (`MenuSubmenu`,
`MenuValueItem`), `dialog.tsx` (`confirm`), `toast.ts`.

**Storage**: no table, column or key. A view's `type` becomes writable;
nothing stored is rewritten.

**Testing**:
- Go `server/viewlayout_test.go`: the shared cases
  (`testdata/viewlayout/cases.json`); `set_view` type change on a database
  view and an embed's view, with other arguments winning over defaults;
  refused while locked, for read scope, for an unknown type, for `form` on
  an embed, for calendar/timeline without a date property; the change is
  in the activity log; REST refuses an unknown type (`invalid_view_type`);
  a table → board → table round trip leaves the stored view identical
  (SC-002). Updated: `TestUpdateViewMergesAndCanClear` and the embed tests
  that asserted the refusal. `TestEveryViewDoorIsRefusedWhileLocked` gains
  the type change. A pair of acts in `parity_property_test.go`.
- Check `check-viewlayout.mjs`: `switchLayout` against the shared cases.
- Playwright `web/tests/view-layout.mjs`: table → board (filters, sort,
  hidden kept; toast names the grouping), back to table (widths and order
  back), → calendar with and without a date property (confirm, one save),
  in an embed (no Form; database's views unchanged), by keyboard; a reader
  and a locked view see no Layout. `view-settings.mjs`, `embeds.mjs` keep
  passing.

**Target Platform**: browser at desktop and phone widths; the desktop shell;
MCP clients

**Performance Goals**: N/A: a click, no new query.

**Constraints**: design system; menu icons (Layout needs a function, R6
and the Menu icons row); English source; `CollectionView.tsx` over 1,400
lines, so the switch logic is in `viewLayout.ts` and the menu.

**Scale/Scope**: 1 issue, 1 PR, 0 routes, 0 tools, 1 error code, about 8
strings.

## CodeGraph

Index checked with `codegraph status`: current with the checkout
(2026-11-15).

- `codegraph explore "set_view type change refused update view types
  validViewTypes ViewSettingsMenu normalizeViews …"`: `mcpUpdateView`
  refuses a type; `normalizeViews` (REST) checks open-in, column order,
  quick filters, sub-group and charts but not the type; `ViewSettingsMenu`
  carries the comment pointing at spec 012 R9; `embedViewType` exists on
  both sides.
- `codegraph callers mcpUpdateView`, `changeEmbedViews`: a second refusal
  in `mcpUpdateEmbedView` (`embedviews.go`), the embed door text search
  for the sentence would have found only by its duplicate wording; both
  are lifted (R4).
- `checkViewsUnlocked` (read with its comment in `viewlock.go`): four
  database-view doors, all calling it; the type change adds no door.
- `defaultChartView` (`chartDefaults.ts`) is what a new chart view starts
  with; the server has no chart defaults (`applyChartSpec` copies only what
  is sent), so R2 adds the Go mirror held by the shared cases.
- Not from the graph: a board's group-by is set from the toolbar's
  **Group** button (`CollectionView.tsx`), not from Settings, which changed
  FR-006's wording; a public form link reads the database's first form view
  (`handlePublicFormConfig`), behind FR-008; the browser can ask
  `formShareStatus`.

## Constitution Check

- I. One binary, no external services: ✅ nothing new stored.
- II. Agent parity: ✅ `set_view` on both kinds of view; `gapBudget`
  stays 10.
- III. Gates are one function: ✅ the existing view doors' gates; type
  rules in one function both doors call (R5).
- IV. Derive from code: ✅ shared cases for the defaults (R2); no
  data-model, contracts or quickstart (no entity, route or tool).
- V. English source: ✅ through `t()`, de/es/nl.
- VI. Every surface: ✅ table below. New concept: none.
- VII. Measured: ✅ no query.

Re-checked after design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | `server/viewlayout.go` (new): `switchViewLayout`, `checkViewType`. Gates unchanged: write on the database (database views) or the document (embed views), the lock, the credential gate, as for every view change. Audit: `auditViewChanges` already records a changed view; it now names the type change. No webhook: view changes fire none today | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: no query | backend |
| REST routes (`server/server.go`, middleware) | No new route. `PUT /api/collections/{id}` refuses an unknown view type (`400 invalid_view_type`, R5) and takes the schema and views halves together for R3 (it already does) | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `set_view`: `type` allowed on an update (database and embed), description says what is kept and what defaults are chosen, and that a calendar/timeline needs a date property (`update_schema` first). The answer names the defaults. Read scope refused by the write gate as now | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `ViewSettingsMenu.tsx`: Layout submenu (R6); `viewLayout.ts` (new, pure): `switchLayout`, the date-property name; `CollectionView.tsx`: the save (one PUT with both halves for R3), the toast, the form-link warning; `CollectionMenus.tsx`: the type list shared with the add-view menu. Light and dark; keyboard as the other Settings submenus | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | About 8: Layout, "Add a date property named {name}?", "A calendar needs a date property; someone who can edit the database can add one", "Grouped by {name} — change it with Group", "Dates from {name} — change them in Settings", the form-link warning, the error sentence; de/es/nl | i18n |
| Server error codes (`web/src/serverErrors.ts`) | `invalid_view_type` | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | `wiki/collections.md` (views section): changing a layout, what is kept, the date property offer. `wiki/mcp-tools.md`: `set_view`'s `type` on updates. `docs/what-it-does.md`: one line. Shots whose sources include `ViewSettingsMenu.tsx` retaken (the menu gains an item) | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | See Technical Context. New tests mutation-checked | test |
| Performance (query plans, payload size, per-request work) | No change: no query; a view grows only by the defaults it is given | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | The `collections` capability's note (which lists `set_view`): a view's type can be changed. Parity pair for a type change. `gapBudget` stays 10 | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | No new component: `MenuSubmenu`, `MenuValueItem`, `confirm`, `toast`. No literals | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | No change: no hot-path query | perf |
| Page containers (full page, side peek, centre peek) | A database drawn in a page or a peek uses the same `CollectionView` and Settings menu; nothing per container | ui |
| Aggregation (`server/aggregate.go`) | No change to grouping or aggregation; a view becoming a chart is checked by `checkChartView` as a new chart is (FR-005) | backend |
| Stored data (`server/upgrade_steps.go`) | No upgrade step: no new key or shape; a view's `type` was always stored | backend |
| Outside names (env vars, cookies, storage keys, …) | No change | backend |
| Menu icons (`ui/Menu`, `menuIcons.ts`, `check-menu-icons.mjs`) | Layout is a new function, `viewLayout`, with an icon no other function has (`LayoutDashboard`, used by no function in `menuIcons.ts` today); the type list inside it is a `MenuValues` with its reason, as in the add-view menu | ui |
| View lock (`checkViewsUnlocked`, `auditViewChanges`) | No new door: the type change goes through the four database-view doors, which already lock and log; `TestEveryViewDoorIsRefusedWhileLocked` gains a type change on `set_view` and REST | backend |
| Cross-origin requests (`server/crossorigin.go`) | No change: no new route or socket | backend |
| Embedded views (`web/src/embedViews.ts`, `server/embedviews.go`) | Layout works on an embed's own views (story 3): the browser writes them into the document as for any embed setting; `mcpUpdateEmbedView` takes a type (R4); Form is never offered (`embedViewType`). A case in `server/testdata/embedviews` for a switched view | ui |
| Content actions (`web/src/actions/`) | Layout is a view setting in Settings, a choice among values (a submenu), not an action on the view (rename, move, remove are). `web/src/actions/` holds only the property list today; no view list to add it to | ui |

**New concepts**: None.

**Parity statement**: Agents can do this over MCP via `set_view` (database
views, and embed views with `embed_id`), with the same checks as `PUT
/api/collections/{id}`; a date property is added with `update_schema`.

## Project Structure

```text
specs/018-view-layout-change/
├── spec.md
├── plan.md        # this file
├── research.md    # R1–R6
├── checklists/requirements.md
└── tasks.md       # /speckit-tasks
```

**Files touched**: `server/viewlayout.go` (new), `server/viewlayout_test.go`
(new), `server/testdata/viewlayout/cases.json` (new),
`server/testdata/embedviews/` (one case), `server/mcp_schema.go`,
`server/embedviews.go`, `server/viewopen.go`, `server/mcp.go`
(descriptions), `server/viewlock_test.go`, `server/mcp_views_test.go`,
`server/parity_property_test.go`, `capabilities.json`,
`web/src/viewLayout.ts` (new), `web/src/components/ViewSettingsMenu.tsx`,
`web/src/components/CollectionView.tsx`,
`web/src/components/CollectionMenus.tsx`, `web/src/menuIcons.ts`,
`web/src/serverErrors.ts`, `web/src/locales/*.json`,
`web/scripts/check-viewlayout.mjs` (new), `web/tests/view-layout.mjs`
(new), `wiki/collections.md`, `wiki/mcp-tools.md`, `docs/what-it-does.md`.

## Complexity Tracking

No violations.
