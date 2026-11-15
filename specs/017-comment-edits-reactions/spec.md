# Feature Specification: Edit comments, and react to them

**Feature Branch**: `claude/spec-017-comment-edits`

**Created**: 2026-11-15

**Status**: Draft

**Issues**: #22

**Input**: Owner, #22 (2026-10-25), from comparing nigari with Notion's
developer platform:

> "Comments cannot be edited, not even by their author. No reactions. …
> The author may edit their own comment (marked edited, previous text kept
> in history); reactions as a small emoji set. Both over MCP through the
> existing `comments` actions. The raw trail stays uneditable on purpose."

## Context

How comments work today, from the code graph and the source
(`codegraph explore` on `CommentsPanel`, `mcpComments`, `createComment`,
the `comments` table, `handleDeleteComment`, 2026-11-15):

- **One table, no history.** `comments` (`server/db.go`) holds id, page,
  block, author id and name, body, created and resolved times, indexed by
  page. Nothing records a change; there is no edited time.
- **Four REST routes** (`server/history.go`): list, create, resolve/reopen,
  delete. Creating and resolving need write permission on the page;
  deleting needs to be the author or a workspace admin, plus the
  credential's workspace gate.
- **Two MCP tools**: `comments` (`mcpComments`, `server/mcp_merged.go`) with
  the actions list, add, resolve, reopen; and `delete_comment`, kept apart
  on purpose ("destroying stays standalone"). Both resolve a comment id to
  its page before the permission check.
- **The doors disagree on two points.** `delete_comment` lets anyone who
  may write on the page delete any comment there (the wiki says so), where
  the REST route allows only the author or a workspace admin. And the MCP
  `add` action does not apply the 10,000-character limit
  (`maxCommentLen`) the REST route does (#645).
- **The panel** (`CommentsPanel.tsx`, one caller, `Editor`) lists open
  comments, can show resolved ones, offers Resolve/Reopen to everyone and
  Delete to the author. The topbar count and board cards read open counts
  from their own route (`handleCommentCounts`).
- **No audit entry and no webhook** for any comment write today.
- **The raw trail** (`server/notelog.go`) is separate and stays uneditable
  (the issue says so; `wiki/comments-and-notes.md` explains why).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fix a comment you wrote (Priority: P1)

A person notices a typo or a wrong number in a comment they posted. They
choose **Edit** on it, change the text in place, and save. The comment shows
**(edited)** beside its time; anyone who can read the page can open the
earlier versions from there.

**Why this priority**: The issue's first ask; today the only way to correct
a comment is to delete it and lose its replies' context.

**Independent Test**: Post a comment, edit it, see "(edited)" and the
earlier text in its history; another person sees no Edit on it.

**Acceptance Scenarios**:

1. **Given** a comment I wrote, **When** I choose Edit, change the text and
   press ⌘/Ctrl+Enter or Save, **Then** the new text shows, marked
   "(edited)" with the time of the last edit on hover.
2. **Given** an edit in progress, **When** I press Escape or Cancel,
   **Then** the text is unchanged and nothing is saved.
3. **Given** an edited comment, **When** anyone who can read the page
   chooses "(edited)", **Then** they see every earlier version with its
   time, newest first.
4. **Given** someone else's comment, **When** I look at it, **Then** there
   is no Edit, and the server refuses an edit sent anyway.
5. **Given** an edit that empties the text or exceeds the length limit,
   **When** I save, **Then** it is refused with the reason and the old text
   stays.

---

### User Story 2 - React to a comment (Priority: P1)

A person agrees with a comment, or wants to say "seen" without writing a
reply. They choose a reaction from a small set; it shows under the comment
with a count. Choosing the same reaction again takes theirs away. Hovering
a reaction names who reacted.

**Why this priority**: The issue's second ask; it cuts the "+1" comments
that bury the discussion.

**Independent Test**: React, see the count, react the same again, see it
gone; a second person's reaction raises the count.

**Acceptance Scenarios**:

1. **Given** a comment, **When** I choose 👍 from its reaction button,
   **Then** 👍 1 shows under it, marked as mine.
2. **Given** my 👍, **When** I choose it again, **Then** my reaction is
   removed and the chip disappears when nobody else has it.
3. **Given** several people's reactions, **When** I hover or focus a chip,
   **Then** it names who reacted.
4. **Given** a resolved comment, **When** I show resolved comments,
   **Then** its reactions show and can still be changed.

---

### User Story 3 - Agents can do the same (Priority: P2)

An agent corrects a comment its own credential wrote, reads a comment's
earlier versions, and adds or removes a reaction, through the existing
`comments` tool, with the same checks as the interface.

**Why this priority**: Agent parity (constitution II); the issue names
the `comments` actions as the way.

**Independent Test**: Through MCP: edit own comment, refused on another's;
react and unreact; list shows edited times and reactions.

**Acceptance Scenarios**:

1. **Given** a comment the agent's person wrote, **When** it calls
   `comments` with action `edit`, **Then** the text changes and the
   earlier version is kept; on someone else's comment it is refused.
2. **Given** a comment, **When** the agent calls `react` / `unreact` with
   one of the set, **Then** the reaction is added or removed for the
   agent's person; an emoji outside the set is refused, naming the set.
3. **Given** a read-only credential, **When** it tries edit or react,
   **Then** it is refused as add is today; list still works and shows
   `edited_at` and reactions.

### Edge Cases

- Editing to the same text: nothing saved, no "(edited)".
- A comment edited, then deleted: its history goes with it.
- The author is deleted as a user: the comment keeps its name, as today;
  nobody can edit it any more (no author to match).
- An author who has lost write permission on the page: cannot edit (edit
  needs write permission and authorship).
- Reactions from a deleted user: kept and shown under the stored name, as
  comment authors are.
- Two people react at once: both kept; one person cannot hold the same
  reaction twice.
- Editing does not reopen a resolved comment and does not change its place
  in the list (ordered by when it was written).
- The topbar count and board card counts are unchanged by edits and
  reactions (they count open comments).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The author of a comment MUST be able to edit its text while
  they may write on the page. Nobody else may, including workspace admins
  (an admin may delete, not put words in someone's mouth).
- **FR-002**: An edit MUST apply the same rules as a new comment (not
  empty, at most the same length) and MUST keep the text it replaces, with
  the time it was replaced.
- **FR-003**: An edited comment MUST show "(edited)"; anyone who can read
  the page MUST be able to see its earlier versions, newest first.
- **FR-004**: Saving text identical to the current text MUST change
  nothing.
- **FR-005**: Anyone who may write on the page MUST be able to add and
  remove their own reaction to any comment on it, from a fixed set of six:
  👍 ❤️ 🎉 😄 👀 ✅. A person holds each reaction at most once per comment.
- **FR-006**: Reactions MUST show under the comment as one chip per
  reaction with its count, marked when one is the reader's own, naming who
  reacted on hover and focus.
- **FR-007**: Agents MUST be able to edit, list earlier versions, react and
  unreact through the `comments` tool (new actions `edit`, `history`,
  `react`, `unreact`) with the same checks as REST; `list` MUST return each
  comment's edited time and reactions.
- **FR-008**: The MCP `add` action MUST apply the same length limit as the
  REST route (#645; fixed in its own pull request first, the edit reuses
  the same check).
- **FR-009**: Who may delete a comment MUST be the same on both doors:
  [NEEDS CLARIFICATION: the REST rule (author or workspace admin) for
  agents too, or anyone who may write, as `delete_comment` allows today?]
- **FR-010**: Edits MUST be recorded in the activity log (who, which
  comment, which page); reactions are not (too small to be activity).
- **FR-011**: The raw trail MUST stay uneditable; nothing in this feature
  touches it.
- **FR-012**: Every new control MUST work by keyboard: Edit, Save, Cancel,
  the reaction button and each chip, Escape closing the reaction picker and
  the edit.

### Key Entities

- **Comment**: as today, plus the time it was last edited.
- **Comment version**: an earlier text of a comment and when it was
  replaced; belongs to one comment, goes when it goes.
- **Reaction**: one person's one emoji on one comment, with when it was
  given; unique per person, comment and emoji.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author fixes a typo in their comment in under 10 seconds
  with no copy, delete and re-post.
- **SC-002**: Every earlier version of an edited comment can be read back
  exactly, by anyone who can read the page.
- **SC-003**: Opening the comments panel on a page with 200 comments and
  their reactions takes no longer than it does today plus 10% (measured
  before and after).
- **SC-004**: Every action in stories 1–2 has an MCP equivalent with the
  same refusals, shown by a REST/MCP pair in the parity test.

## Assumptions

- Replies (threads) do not exist in nigari today and are out of scope.
- The reaction set is fixed, as the issue proposes ("a small emoji set");
  any emoji, custom emoji and a picker are out of scope.
- Reacting needs write permission on the page, as commenting does; nigari
  has no comment-only role.
- Editing is allowed at any time, with no time limit; the history is what
  keeps it honest.
- Comment edits and reactions do not appear live for others (comments are
  not live today; `wiki/comments-and-notes.md`); they show on the next load.
- No notifications for reactions; nigari has no notifications for
  comments today.
