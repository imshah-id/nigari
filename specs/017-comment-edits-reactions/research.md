# Research: Edit comments, and react to them

Decisions for spec 017, with the options turned down. Read with
[plan.md](plan.md).

## R1 — Storage: upgrade step 3

**Decision**: one new upgrade step (`commentEditsAndReactions`, step 3 in
`server/upgrade_steps.go`), shipped with the fixture `step-2.db` written
just before it:

- `comments.edited_at TEXT` (NULL = never edited).
- `comment_versions (id TEXT PRIMARY KEY, comment_id TEXT NOT NULL
  REFERENCES comments(id) ON DELETE CASCADE, body TEXT NOT NULL,
  replaced_at TEXT NOT NULL)`, index `(comment_id, replaced_at)`.
- `comment_reactions (comment_id TEXT NOT NULL REFERENCES comments(id) ON
  DELETE CASCADE, user_id TEXT NOT NULL, user_name TEXT NOT NULL, reaction
  TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (comment_id, user_id,
  reaction))`. The primary key is the "at most once" rule (FR-005) and the
  index the list query uses.

Foreign keys are on (`foreign_keys(1)` in `db.go`), so deleting a comment,
or its page, removes its versions and reactions (spec edge case).

**Rejected**: versions in the audit log (the log is pruned by admins,
`auditPrune`; FR-003 promises every version to every reader); a JSON column
of versions on `comments` (rewrites the row on every edit, grows without a
bound inside the list query); reactions as a JSON column (two people
reacting at once would lose one; the primary key cannot be expressed).

`user_id` on reactions has no foreign key to `users`, like `author_id`
on comments: a deleted person's reaction stays under the stored name.

## R2 — Reactions are stored as names, not glyphs

**Decision**: six keys, `thumbs_up`, `heart`, `tada`, `smile`, `eyes`,
`check`, mapped to 👍 ❤️ 🎉 😄 👀 ✅ in one list on each side
(`commentReactions` in Go, `COMMENT_REACTIONS` in `web/src/`), a check
keeping the two lists equal. REST and MCP take the key; MCP also accepts
the glyph and converts it.

**Why**: an emoji is not one fixed string (❤ with or without its variation
selector, skin tones), so a glyph in a URL or a primary key would let one
reaction be stored twice. A key is also safe in a path segment.

## R3 — One gate per action, both doors

**Decision**: `server/comments.go` (new; the comment handlers move there
from `history.go`, which holds page revisions): 

- `commentForWrite(u, id)`: the comment's page, `canWrite`,
  `credentialMayEnter`. Used by resolve (as now), react, unreact.
- `commentForEdit(u, id)`: the above plus `author_id == u.ID`. Edit.
- `commentForDelete(u, id)`: the credential's workspace, then author or
  workspace admin (today's REST rule, FR-009). REST and `delete_comment`
  both call it; `delete_comment` loses the "anyone who may write" path.
- `checkCommentBody(body)`: empty and length, shared by add (#645) and edit.

Each refusal answers "comment not found" when the caller may not see the
page (as today, so ids are not probed) and "forbidden" with the reason
otherwise ("only its author can edit a comment").

**Rejected**: checking authorship in the handlers (two copies; the MCP
delete hole is exactly that).

## R4 — Routes and MCP actions

**Decision**:

| Action | REST | MCP |
| --- | --- | --- |
| edit | `PATCH /api/comments/{id}` `{body}` | `comments` action `edit` (`comment_id`, `body`) |
| history | `GET /api/comments/{id}/versions` | `comments` action `history` (`comment_id`) |
| react | `PUT /api/comments/{id}/reactions/{reaction}` | `comments` action `react` (`comment_id`, `reaction`) |
| unreact | `DELETE /api/comments/{id}/reactions/{reaction}` | `comments` action `unreact` |

`list` (both doors) gains `editedAt` and `reactions: [{reaction, count,
users: [{id, name}], mine}]`. History returns versions newest first, text
through `wrapUntrusted` over MCP. Read scope may call `list` and `history`;
the rest need write scope, refused by the existing write gate.

**Why the merged tool**: the issue asks for it, and the tool consolidation
(`mcp_merged.go`) bundles by object; deleting stays its own tool.
React and unreact are separate actions rather than a toggle, so an agent
that retries does not undo itself.

## R5 — The list stays one round trip

**Decision**: `pageComments` runs a second query for the page's
reactions (`SELECT … FROM comment_reactions WHERE comment_id IN (SELECT id
FROM comments WHERE page_id = ?)`), drains it, and joins in memory. Both on
the writer as today (short lookups). Versions are not loaded with the list.

**Measured before and after** on a page with 200 comments and 3 reactions
each (SC-003), in a Go benchmark beside the comment tests.

## R6 — The panel

**Decision**: in `CommentsPanel.tsx`:

- **Edit** (author only) turns the body into the same growing textarea the
  composer uses, with Save and Cancel; ⌘/Ctrl+Enter saves, Escape cancels.
- **(edited)** after the time is a button that opens a `ui/Popover` with
  the versions (fetched on open).
- A reaction button opens a `ui/Popover` with the six as buttons; chips
  under the body are toggle buttons (`aria-pressed` = mine), their tooltip
  naming who reacted.
- The panel's existing raw `<button>`s that this touches move to `ui/`
  `Button`/`IconButton` (the raw-button budget only goes down).

The component is 239 lines; the comment item moves into
`CommentItem.tsx` so the panel does not grow past what one reads at once.

**Rejected**: a ⋯ menu per comment for Edit/Delete (one more click for the
two most common actions; Notion shows them on hover, which a phone does not
have); reactions in a `ui/Menu` (a menu of six glyphs reads as a list, the
popover as a palette).

## R7 — Audit

**Decision**: an edit writes `audit("human"|"agent", …, "comment.edit",
pageID, ws, commentID)`. Reactions, as the spec says, do not. Deleting is
not logged today and this spec does not change that (its own issue if
wanted).

No webhook: no comment write fires one today; comment webhooks would be a
feature of their own.
