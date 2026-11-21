# Implementation Plan: Dragging a block makes columns, and shows where it lands

**Branch**: `claude/spec-021-drag-columns` | **Date**: 2026-11-21 | **Spec**: [spec.md](spec.md) | **Issue**: epic #812 (#824, the rest of #809); a feature issue is created with the tasks

**Input**: Feature specification from `/specs/021-drag-columns/spec.md`

## Summary

One decision module, `web/src/dropTarget.ts`, says where a dragged block lands. Both the drop line and the drop itself use it, so they can no longer disagree (#809, #824).

It returns either:
- a place *between* blocks, drawn as the horizontal line; or
- a *new column*, drawn as a vertical line while the columns slide apart.

A drop on a new column inserts the block as a column. The widths follow the owner's rule (Q3) and are worked out in `columnWidths.ts`. A sideways drop beside an ordinary top-level block wraps the two in a new columns block (Q2).

Columns go up to 4 everywhere: the editor, the print view, the shared page, and Markdown in both directions, so agents get 4 through `write_content` too.

The work comes as two pull requests:
1. The landing spot (Story 1), and the layout bar floating over the block's top edge (Story 4).
2. Sideways columns, the opening and 4 columns (Stories 2 and 3).

## Technical Context

**Language/Version**: Go 1.27 (server, one package `server/`), TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: Go standard library + pure-Go SQLite; Mantine, BlockNote, Yjs in the frontend. New dependencies: none

**Storage**: One SQLite file. Schema change: none. A columns block's `count` may now be 4, inside the page's content JSON. Readers that clamp it today are listed under CodeGraph; nothing stored has to be rewritten (see Surfaces, Stored data).

**Testing**: `go test ./...`, `npm run check` (tsc + check scripts, a new `check-droptarget.mjs`, `check-columnwidths.mjs` extended), Playwright `web/tests/block-drop.mjs` (new) and `block-handle.mjs`

**Target Platform**: One static binary (`CGO_ENABLED=0`); browser, desktop shell, MCP clients

**Performance Goals**: a drag step stays under 4ms of script and style work on a 300-block page (SC-003). #812 and #810 measured 0.3–1ms before this feature. The opening is drawn by a stylesheet rule the columns block already owns, not by per-step DOM writes.

**Constraints**: No external services. English source strings. Agent parity: making columns is writing a `columns` block, already open to agents.

**Scale/Scope**: any page; columns 2–4 per layout; nested columns are not made (spec, Story 3).

## CodeGraph

- `codegraph explore "columnsSpec columnWidths gridTemplate columnEnter dropCursor DropCursorExtension computeDropPosition"`:
  - `columnsSpec` and `ColumnsBlock` (`blocks.tsx`) are the only editor owners of a layout.
  - `ColumnsBlock` already writes its grid through a `<style>` it renders itself, rather than marking editor DOM (its own comment explains why). The opening reuses that path.
  - `columnWidths.ts` holds the width arithmetic and has its check.
  - `columnEnter.ts` defines the shape: a column is the columns block's child, and a column's later lines are that block's children.
- `codegraph explore "renderColumnsMarkdown renderPublicBlock renderBlockHTML columnsFromSections"`, then text search for `== 3`, `!= 3`, `data-count`. Five readers hold a layout to 2 or 3, each a one-line change plus its test:
  - `ColumnsBlock` (`count === 3 ? 3 : 2`).
  - The editor CSS (`data-count='3'` only).
  - `renderPublicBlock` (`n != 3 → 2`).
  - The print view in `renderBlockHTML` (`== 3`) and its CSS.
  - `columnsFromSections` in Markdown import, which folds sections past 3 into the third.
  - `columnsStyle` (`server/columns.go`) already takes any count. `renderColumnsMarkdown` writes as many columns as there are children, so the export already handles 4.
- `codegraph callers columnsStyle`: three callers (public, print, Markdown export), all covered by `columns_test.go`. No MCP-only path: `write_content` and `get_page` go through Markdown import and export.
- BlockNote's `DropCursorExtension` (read in `node_modules`, not indexed):
  - It accepts `computeDropPosition` and can draw a vertical line (`block-vertical-left/right`).
  - It only draws. The drop itself is ProseMirror's own `dropPoint`, so the decision also needs a `handleDrop` that moves the block to the same target. Without it the line and the drop would disagree again.
- `codegraph callers holdSideMenuWhileHovered`: one, `Editor.tsx`. The new drop handling is installed next to it, in its own module (frontend rule: no new behaviour inline in `Editor.tsx`).
- The graph found no other drag of blocks inside the editor. The board and table drags (`boardDrag.ts`, `columnDrag.ts`) are separate and untouched.

## Constitution Check

- I. One binary, no external services ✅ nothing new to run.
- II. Agent parity ✅ agents make columns by writing a `columns` block. 4 columns reach them through the same Markdown spelling, and the `write_content` description says up to four.
- III. Gates are one function ✅ no gate. Dragging edits a document the person can already edit.
- IV. Derive from code ✅ the landing decision and the width rule are pure modules, each with a `check-*.mjs`.
- V. English source ✅ the only new string is the drag's screen-reader announcement (FR-007 area), and it gets de/es/nl.
- VI. Every surface, every time ✅ table below.
- VII. Measured, not assumed ✅ SC-003 is measured with the #810 probe in Chromium and WebKit before and after.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | No change: a drag is an edit of the document through the editor's live connection, under the same right to edit as typing; no new door. | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | No change: no table, column or query. | backend |
| REST routes (`server/server.go`, middleware) | No change: no route. | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `columnsFromSections` (`mdimport.go`) keeps up to 4 sections and folds only past 4. The `write_content` spelling text (`mdimport.go`, "columns …") says up to four. `get_page` already writes every column. | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed. Dragging is a pointer gesture; its result is open. | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | New `dropTarget.ts` (the decision) and `blockDrop.ts` (installs `computeDropPosition` and `handleDrop` with the editor). `ColumnsBlock` takes 2–4 columns, renders the opening (a gap where the new column goes) through its own `<style>`, and removes an emptied column (FR-008). The layout bar (`.bn-columns-bar`) floats: the strip `.bn-columns` that holds it takes no height, and the bar sits absolutely at its top right, over the block's top edge (FR-012). It shows on hover, on `:focus-within` of the columns block (caret in a column) and on its own keyboard focus. Editor CSS for `data-count='4'`; the vertical line in the focus colour. Light and dark. Keyboard: no new key; block moves by keyboard stay BlockNote's. | ui |
| Translations (`t()`, `de.json` and `nl.json` required, `es.json`) | The announcement for screen readers when a new column will be made, and the "4 columns" preset label on the layout bar: de, es, nl. | i18n |
| Server error codes (`web/src/serverErrors.ts`) | No change: no new error. | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots) | `editor-blocks.md`: dragging (the two lines, sideways columns, up to 4, widths) and the "Not right yet" note from PR #827 removed. `mcp-tools.md`: columns spelling up to 4. Screenshots that list the touched files are retaken. | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | `check-droptarget.mjs`: every target kind, plus Q1 and FR-010. `check-columnwidths.mjs`: the Q3 rule with the spec's three examples and the 15% floor. Go: `columns_test.go` with 4 columns in print, public and the Markdown round trip; `mdimport` keeps 4 and folds a 5th. Playwright `block-drop.mjs`: SC-005 (paragraph-to-columns gap equals paragraph-to-paragraph; bar shown moves nothing), SC-001/SC-002 on a test page, the opening and its reverse, Q2, reduced motion, WebKit run. No refusal path: no gate (above). | test |
| Performance (query plans, payload size, per-request work) | Per drag step: one target computation from cached column boxes, and a style change only when the target changes. Measured against SC-003 with the #810 probe. | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | No change: no route or tool. | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | The vertical line and the opening use `--color-focus`, `--editor-drop-line-width` and `--motion-duration-base` / `--motion-easing-out`. No new literal; budgets unchanged. | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | No change: no query. | perf |
| Page containers | The drop works the same in a full page and a side peek. A peek's own handle is missing today (#826); this feature does not depend on it, and fixing #826 is its own PR. | ui |
| Aggregation | No change: no property type. | backend |
| Stored data | No upgrade step: no table, column or JSON shape changes. A `count` of 4 is a new value in an existing prop, and older binaries read it as 2 (the old clamp) without losing a block, so no migration. The release notes say a page with 4 columns shows as 2 in an older version. | backend |
| Outside names | No change: no name outside the code. | backend |
| Menu icons | The layout bar is not a menu. Its new "4 columns" button follows the existing presets. No menu changes. | ui |
| View lock | No change: no database view is written. | backend |
| Cross-origin requests | No change: no route or socket. | backend |
| Embedded views | No change: the drop is about document blocks; an embed block moves as one block like any other. | ui |
| Content actions | No change: no new action in a menu. Dragging is a gesture on the handle. | ui |

**New concepts**: None. The drop target is one module's decision, not something later features must answer for.

**Parity statement**: Agents can do this over MCP via `write_content` (a `:::: columns` section with up to four `::: column` parts), with the same right to edit as the editor's live connection.

## Project Structure

### Documentation (this feature)

```text
specs/021-drag-columns/
├── plan.md
├── research.md          # R1–R6: the decisions below
└── tasks.md             # /speckit-tasks
```

`data-model.md` skipped: no new entity, only `count` going to 4 (in the spec). `contracts/` skipped: no route or tool changes shape; the Markdown spelling is unchanged. `quickstart.md` skipped: the Playwright spec is the walk-through.

### Source Code (repository root)

**Files touched**:
- `web/src/`: `dropTarget.ts` (new), `blockDrop.ts` (new), `columnWidths.ts`, `blocks.tsx` (`ColumnsBlock`), `components/Editor.tsx` (one install line), `styles.css`, `locales/{de,es,nl}.json`.
- `web/scripts/`: `check-droptarget.mjs` (new), `check-columnwidths.mjs`.
- `web/tests/`: `block-drop.mjs` (new).
- `server/`: `public_blocks.go`, `export_html.go`, `mdimport.go`, `columns_test.go`, `mdimport` tests.
- `wiki/`: `editor-blocks.md`, `mcp-tools.md`.
- `docs/decisions.md`.

## Complexity Tracking

None.
