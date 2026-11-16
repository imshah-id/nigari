---

description: "Tasks for editing comments and reacting to them"
---

# Tasks: Edit comments, and react to them

**Input**: `specs/017-comment-edits-reactions/` (plan.md, spec.md, research.md R1–R7)

**Tests**: required. Go tests on every gate and refusal on both doors, the upgrade fixture, a parity pair, a list benchmark; one pure check; one new browser spec.

**Issues**: parent #22; T001–T026 are #682–#707, in order

**Delivery**: #645 first (its own pull request); then one pull request for these tasks.

**CodeGraph** (before writing these tasks; `codegraph status`: current):

- `codegraph callers listComments` → `CommentsPanel`, `Editor` (the topbar count) **and `CommentsModal` in `PageHistory.tsx`**, a second comments list with its own resolve and post. `codegraph callers CommentsModal` finds no caller and no file names it: dead code, removed (T019) rather than given edits and reactions.
- `codegraph callers printOptionsFor` → `handleExportPage` and `portableExportHTML`: both exports read comments through `pageComments` and get the mark (T012).
- `handleListComments`, `handleResolveComment`, `handleDeleteComment` → their routes in `server.go` only: moving them into `server/comments.go` touches no other caller (T005).
- `mcpComments` → `mcpCall` only; `delete_comment` is inline in `mcpCall` (T009).

## Format: `[ID] [P?] [Story] [surface] Description`

---

## Phase 1: Foundational — storage

**Purpose**: upgrade step 3 (R1). Blocks everything.

- [x] T001 [backend] Write the fixture `server/testdata/upgrade/step-2.db` with `TestWriteUpgradeFixture` on the code before the step; add its row to the README naming the commit
- [x] T002 [backend] Step 3 `commentEditsAndReactions` in `server/upgrade_steps.go`: `comments.edited_at`, `comment_versions` with its index, `comment_reactions` with its primary key (R1)
- [x] T003 [test] `upgrade_fixture_test.go` passes on every fixture with step 3 newest; deleting a comment (and its page) removes its versions and reactions

---

## Phase 2: Foundational — one gate per action

- [x] T004 [backend] New `server/comments.go`: `commentForWrite`, `commentForEdit`, `commentForDelete`, `checkCommentBody` (the #645 check, moved here) (R3)
- [x] T005 [backend] Move the comment handlers and `pageComments` from `server/history.go` into `server/comments.go`; resolve and delete use the gates; no behaviour change for REST
- [x] T006 [P] [backend] `commentReactions` (the six keys and glyphs) in `server/comments.go` (R2)
- [x] T007 [P] [ui] `web/src/commentReactions.ts` (the same six) and `web/scripts/check-comment-reactions.mjs` holding the two lists equal, added to `npm run check`

---

## Phase 3: User Story 1 — fix a comment you wrote (P1) 🎯 MVP

**Independent Test**: edit your comment, see "(edited)" and the earlier text; another person has no Edit.

- [x] T008 [US1] [backend] `editComment` (same text changes nothing; the replaced text into `comment_versions`; `edited_at`; `audit` `comment.edit`, R7), `commentVersions`; routes `PATCH /api/comments/{id}` and `GET /api/comments/{id}/versions` in `server/server.go`
- [x] T009 [US1] [mcp] `comments` actions `edit` and `history` in `server/mcp_merged.go`, through the same gates; `history` through `wrapUntrusted`; description in `server/mcp.go` says who may edit
- [x] T010 [US1] [test] `server/comments_test.go`: edit by author on both doors; refused for another person, a workspace admin, read scope, a person without write, an empty or too long body; same text; versions newest first, read by a reader. Mutation-checked
- [x] T011 [US1] [ui] New `web/src/components/CommentItem.tsx` (the item moved out of `CommentsPanel.tsx`): Edit for the author with the growing textarea, Save/Cancel, ⌘/Ctrl+Enter, Escape; "(edited)" button with a `ui/Popover` of versions; raw buttons it touches move to `ui/`
- [x] T012 [US1] [backend] `printOptionsFor` (both exports) marks edited comments
- [x] T013 [US1] [i18n] Edit, Save, Cancel, (edited), Edited {time}, Earlier versions, "Only its author can edit a comment"; `comment_not_author` in `web/src/serverErrors.ts`; de/es/nl

---

## Phase 4: User Story 2 — react to a comment (P1)

**Independent Test**: react, unreact, a second person's reaction raises the count.

- [x] T014 [US2] [backend] `setReaction` / `removeReaction` (idempotent, unique per person); routes `PUT` and `DELETE /api/comments/{id}/reactions/{reaction}`; `pageComments` adds `editedAt` and reactions with one drained query (R5)
- [x] T015 [US2] [mcp] `comments` actions `react` and `unreact` (key or glyph), `list` carries `edited_at` and reactions; description names the six
- [x] T016 [US2] [test] Go: react/unreact on both doors, unique per person, unknown reaction refused naming the six, glyph accepted over MCP, read scope refused, list shape. Mutation-checked
- [x] T017 [US2] [ui] `CommentItem.tsx`: reaction button with a `ui/Popover` of the six; chips as toggle buttons (`aria-pressed`), label naming who reacted; on resolved comments too
- [x] T018 [US2] [i18n] Add reaction, the six names, "{names} reacted with {reaction}"; `unknown_reaction` in `serverErrors.ts`; de/es/nl
- [x] T019 [US2] [ui] Remove `CommentsModal` from `PageHistory.tsx`: a second comments list with no caller (`codegraph callers CommentsModal`: 0, and no text reference), which would otherwise need edits and reactions too

---

## Phase 5: Who may delete (FR-009) and agent parity

- [x] T020 [mcp] `delete_comment` in `server/mcp.go` calls `commentForDelete` (author or workspace admin); description says so
- [x] T021 [test] Go: a writer who is neither author nor admin is refused over MCP and REST; author and admin allowed on both
- [x] T022 [mcp] `capabilities.json` `comments` entry: the three routes, summary; parity pairs for edit and react in `server/parity_property_test.go`

---

## Phase 6: Polish

- [x] T023 [perf] Benchmark `pageComments` on 200 comments × 3 reactions, before and after (SC-003); numbers in the PR
- [x] T024 [test] New `web/tests/comment-edits.mjs`: edit by keyboard, versions, no Edit for another person, react/unreact, the label, a resolved comment's reactions, in a side peek
- [x] T025 [wiki] `wiki/comments-and-notes.md` (at-a-glance table, editing, reactions, deleting over MCP, the MCP table), `wiki/mcp-tools.md`, `docs/what-it-does.md`; shot `comments-panel` retaken
- [ ] T026 [test] Reviews before the PR: `/code-review`; `ux-ui-audit` light/dark, desktop/phone; `/security-review` (a permission gate changes, FR-009); `codegraph sync` then `codegraph callers` on every exported symbol added or moved

---

## Dependencies

#645 merged → Phase 1 → Phase 2 → Phases 3 and 4 (in either order; both edit `CommentItem.tsx`, so one after the other) → Phase 5 → Phase 6.

## Parallel

T006 and T007. T013 and T018 with their phases' server tasks.
