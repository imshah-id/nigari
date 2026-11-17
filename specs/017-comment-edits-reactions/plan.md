# Implementation Plan: Edit comments, and react to them

**Branch**: `claude/spec-017-comment-edits` (spec and plan); the build gets its own branch | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md) | **Issue**: #22

**Input**: Feature specification from `/specs/017-comment-edits-reactions/spec.md`

## Summary

A comment's author edits it in place; every earlier text is kept and
readable by anyone who can read the page; six reactions (👍 ❤️ 🎉 😄 👀 ✅)
toggle per person. Agents get `edit`, `history`, `react`, `unreact` on the
`comments` tool. Deleting someone else's comment becomes author-or-admin on
both doors (FR-009).

- **Stored**: upgrade step 3: `comments.edited_at`, `comment_versions`,
  `comment_reactions` (R1). Reactions by key, not glyph (R2).
- **Checked**: one gate per action in a new `server/comments.go`, called
  by REST and MCP (R3); the body check shared with add (#645).
- **Routes**: `PATCH /api/comments/{id}`, `GET …/versions`,
  `PUT`/`DELETE …/reactions/{reaction}` (R4).
- **Interface**: Edit, (edited) with versions, reaction picker and chips in
  the comments panel; a comment item moves into its own component (R6).

Order: **#645 first** (its own small pull request: the shared body check
on add); then **one pull request** for this spec. Spec 016 and 018 touch
none of these files.

## Technical Context

**Language/Version**: Go 1.27 (`server/`); TypeScript 5.6 + React 18 (`web/src/`)

**Primary Dependencies**: none new. `ui/Popover`, `ui/Button`,
`ui/IconButton` (its label is its tooltip).

**Storage**: upgrade step 3 (R1): one column, two tables, one index (the
reactions table's primary key serves its lookups). Fixture `step-2.db`
written before the step, per `server/testdata/upgrade/README.md`.

**Testing**:
- Go `server/comments_test.go`: edit by author (REST and `callTool`),
  refused for another person, for a workspace admin, for read scope, for
  someone without write permission, for an empty or too long body; same
  text changes nothing; versions newest first, readable by a reader;
  react/unreact idempotent and unique per person; unknown reaction refused
  naming the six; glyph accepted over MCP; delete by a writer who is not
  author or admin now refused over MCP (FR-009), allowed for author and
  admin on both doors; deleting a comment removes its versions and
  reactions; list carries `editedAt` and reactions. Upgrade fixture test
  passes with step 3 (`upgrade_fixture_test.go`). A pair of acts in
  `parity_property_test.go` for edit and react.
- Benchmark: `pageComments` on 200 comments × 3 reactions, before and
  after (SC-003).
- Check: `check-comment-reactions.mjs`, the Go and TypeScript lists equal.
- Playwright `web/tests/comment-edits.mjs`: edit by keyboard (⌘↵ saves,
  Escape cancels), (edited) opens versions, another person sees no Edit;
  react, unreact, the tooltip names who; a resolved comment's reactions.

**Target Platform**: browser at desktop and phone widths; the desktop shell;
MCP clients

**Performance Goals**: opening the panel on 200 comments has no noticeable
delay (SC-003; was "within 10% of today" until 2026-11-17, see
`docs/decisions.md`). One extra indexed query per list.

**Constraints**: design system (`ui/` and tokens; raw-button budget only
goes down); English source; agent parity.

**Scale/Scope**: 1 issue (+ #645), 1 PR, 3 routes, 0 new tools (4 actions),
1 upgrade step, about 15 strings.

## CodeGraph

Index checked with `codegraph status`: current with the checkout
(2026-11-15).

- `codegraph explore "comments table create comment delete comment
  resolve thread mcp comments action handler CommentsPanel"`: the panel
  (`CommentsPanel`, one caller, `Editor`) loads with `listComments` and
  acts through `createComment`/`resolveComment`/`deleteComment`;
  `mcpComments` (one caller, `mcpCall`) has list/add/resolve/reopen and
  resolves a comment id to its page (`commentPage`) before its gate.
- Reading `handleCreateComment`/`handleDeleteComment` and `mcpComments`
  beside each other: add over MCP skips `maxCommentLen` (filed #645), and
  `delete_comment` checks only `canWrite` where REST checks author or
  workspace admin (FR-009, owner "A").
- `codegraph callers pageComments`: three, `handleListComments`,
  `mcpComments` and `printOptionsFor` (`export_html.go`). The third is a
  door text search would have missed: the print/export of a page with its
  comments. It gets the current text and an "(edited)" mark, no
  reactions.
- `codegraph callers mcpComments` → `mcpCall` only; `delete_comment` is
  dispatched inline in `mcpCall`, so the new delete gate replaces that
  inline check.
- The upgrade steps (`upgradeSteps`, 2 steps; step 2
  `viewPrefsAndLock` is the pattern for tables plus a column).
- Not from the graph: `wiki/screenshots.json` lists `CommentsPanel.tsx` as
  a source of shot `comments-panel` (retaken); `capabilities.json`'s
  `comments` entry gains the three routes; `parity_property_test.go`
  already has a `comment` act to copy.

## Constitution Check

- I. One binary, no external services: ✅ two SQLite tables.
- II. Agent parity: ✅ four actions on `comments`; `gapBudget` stays 10;
  FR-009 closes a difference between the doors.
- III. Gates are one function: ✅ R3, one gate per action on both doors.
- IV. Derive from code: ✅ the reaction list checked across sides; specs
  lean (no data-model: the tables are in R1; no contracts: the routes are
  in R4; no quickstart).
- V. English source: ✅ through `t()`, de/es/nl.
- VI. Every surface: ✅ table below. New concept: none.
- VII. Measured: ✅ list benchmark before and after.

Re-checked after design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | `server/comments.go` (new; comment handlers move here from `history.go`): `commentForWrite`, `commentForEdit`, `commentForDelete`, `checkCommentBody`, `editComment`, `commentVersions`, `setReaction`. `delete_comment` narrowed to author or workspace admin (FR-009). Audit: `comment.edit` with actor type human/agent (R7). No webhook: no comment write fires one today | backend |
| Schema and queries (`server/db.go`, indexes, `ensureColumn`) | Through the upgrade step (Stored data row), not the schema constant: `comments.edited_at`, `comment_versions` with `(comment_id, replaced_at)` index, `comment_reactions` keyed `(comment_id, user_id, reaction)`. Queries short and on the writer; the reactions query drained before the join | backend |
| REST routes (`server/server.go`, middleware) | `PATCH /api/comments/{id}`, `GET /api/comments/{id}/versions`, `PUT /api/comments/{id}/reactions/{reaction}`, `DELETE /api/comments/{id}/reactions/{reaction}`, all behind `auth` (comments are not administrative) | backend |
| MCP tools (`server/mcp*.go`, descriptions, `wrapUntrusted`, read-scope refusal) | `comments`: actions `edit`, `history`, `react`, `unreact`; arguments `reaction`; description names the six and who may edit. `history` and `list` output through `wrapUntrusted`. Read scope: `list`, `history`; the rest refused by the write gate. `delete_comment`: description says author or workspace admin | mcp |
| Closed-to-agents list (`not_available_via_mcp`) | No change: nothing closed | mcp |
| UI components (`web/src/…`, light + dark, keyboard) | `CommentsPanel.tsx`, new `CommentItem.tsx` (edit mode, (edited) popover, reaction picker and chips), `api.ts` (4 calls), `types.ts` (`Comment.editedAt`, `reactions`), `commentReactions.ts` (the six). Light and dark; keyboard per FR-012, Escape closes picker and edit, focus returns to the button that opened them | ui |
| Translations (`t()`, `de.json`/`es.json`/`nl.json`) | About 15: Edit, Save, Cancel, (edited), Edited {time}, Earlier versions, Add reaction, the six reactions' names (for screen readers), "{names} reacted with {reaction}", "Only its author can edit a comment"; de/es/nl | i18n |
| Server error codes (`web/src/serverErrors.ts`) | `comment_not_author` ("Only its author can edit a comment"), `unknown_reaction` | i18n |
| Wiki (`wiki/*.md`, `mcp-tools.md`, stale screenshots, `docs/what-it-does.md`) | `wiki/comments-and-notes.md`: the at-a-glance table ("Can be edited": by its author, earlier versions kept), editing, reactions, deleting (the MCP sentence now matches REST), the MCP table. `wiki/mcp-tools.md`: the actions. `docs/what-it-does.md`: one line. Shot `comments-panel` retaken | wiki |
| Tests (Go incl. refusal paths, Playwright spec, check scripts) | See Technical Context. Every gate's refusal on both doors; new tests mutation-checked | test |
| Performance (query plans, payload size, per-request work) | One extra indexed query per list (`EXPLAIN QUERY PLAN` uses the primary key); versions loaded only on request; payload grows by reactions only | perf |
| Manifest (`capabilities.json`, `gapBudget`, parity acts) | `comments` entry: the three new routes, summary "…, edit, react…". Parity pair for edit and react. `gapBudget` stays 10 | mcp |
| Design system (`web/src/ui/`, tokens, `check-tokens.mjs` budgets, catalogue) | No new component: `Popover`, `Button`, `IconButton`. The panel's raw buttons this touches move to `ui/`; budgets only go down. Chips use existing tokens (`--radius-full`, the accent-soft background) | ui |
| Storage budgets (benchmarks on the seeded workspace, p95 budgets, read time limit) | No hot-path query: the comment list is per page on request, not in the page list; benchmarked anyway (SC-003) | perf |
| Page containers (full page, side peek, centre peek) | The panel is drawn by the shared `Editor` wherever it offers comments today (`commentsOpen && canComment`); the new controls live inside it, so they follow it. The Playwright spec checks the full page and a side peek | ui |
| Aggregation (`server/aggregate.go`) | No change: no property type | backend |
| Stored data (`server/upgrade_steps.go`) | Step 3 `commentEditsAndReactions` with fixture `step-2.db` (written by `TestWriteUpgradeFixture` just before the step), README table row; `check-upgrades.mjs` and `TestUpgradeStepOneIsFrozen` unaffected. Expand only, nothing contracted | backend |
| Outside names (env vars, cookies, storage keys, …) | No change: the reaction keys are new names in the API, documented in `mcp-tools.md`; nothing renamed | backend |
| Menu icons (`ui/Menu`, `menuIcons.ts`, `check-menu-icons.mjs`) | No menu: the picker is a popover of buttons (R6). If the build turns it into a `ui/Menu`, it uses `MenuValues` with its reason | ui |
| View lock (`checkViewsUnlocked`, `auditViewChanges`) | No change: no view written | backend |
| Cross-origin requests (`server/crossorigin.go`) | No change: the new routes are non-GET writes and a GET read; `ServeHTTP` judges the writes | backend |
| Embedded views (`web/src/embedViews.ts`, `server/embedviews.go`) | No change: no view setting | ui |
| Content actions (`web/src/actions/`) | No change: comments are not one of the listed content kinds (page, row, property, view, block, workspace), and the panel's actions sit on each comment, not in a menu | ui |

**New concepts**: None.

**Parity statement**: Agents can do this over MCP via `comments` (`edit`,
`history`, `react`, `unreact`) and `delete_comment`, with the same checks
as `PATCH /api/comments/{id}`, `GET /api/comments/{id}/versions`,
`PUT`/`DELETE /api/comments/{id}/reactions/{reaction}` and `DELETE
/api/comments/{id}`.

## Project Structure

```text
specs/017-comment-edits-reactions/
├── spec.md
├── plan.md        # this file
├── research.md    # R1–R7
├── checklists/requirements.md
└── tasks.md       # /speckit-tasks
```

**Files touched**: `server/comments.go` (new), `server/comments_test.go`
(new), `server/history.go` (handlers move out), `server/upgrade_steps.go`,
`server/testdata/upgrade/step-2.db` (new) and its README, `server/server.go`,
`server/mcp.go`, `server/mcp_merged.go`, `server/mcp_history.go`,
`server/export_html.go`, `server/parity_property_test.go`,
`capabilities.json`, `web/src/components/CommentsPanel.tsx`,
`web/src/components/CommentItem.tsx` (new), `web/src/commentReactions.ts`
(new), `web/src/api.ts`, `web/src/types.ts`, `web/src/serverErrors.ts`,
`web/src/locales/*.json`, `web/scripts/check-comment-reactions.mjs` (new),
`web/tests/comment-edits.mjs` (new), `wiki/comments-and-notes.md`,
`wiki/mcp-tools.md`, `docs/what-it-does.md`.

## Complexity Tracking

No violations.
