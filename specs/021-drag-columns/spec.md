# Feature Specification: Dragging a block makes columns, and shows where it lands

**Feature Branch**: `claude/spec-021-drag-columns`

**Created**: 2026-11-21

**Status**: Draft

**Issues**: epic #812; #824, the rest of #809

**Input**: Owner, 2026-11-21, on #824 (a drop on a column's first line makes
an extra column):

> "As for creating a new column. I want to keep that behaviour but it should
> be clear that column gets created by a vertical target affordance and an
> animation shifting the columns to make room for the new one. Moving away
> would do the reverse."

## Context

How dragging and columns work today, from the code graph and the source
(`codegraph explore` on `columnsSpec`, `ColumnsBlock`, `columnWidths`,
`columnEnter`, BlockNote's `DropCursorExtension` and `SideMenu`, 2026-11-21),
and from the measurements in #812:

- **Columns are nigari's own block** (`columnsSpec`, `web/src/blocks.tsx`),
  not BlockNote's paid one. The columns block holds nothing itself. Each of
  its children is one column, and a column's later lines are that first
  block's children (#317, `columnEnter.ts`). `count` is 2 or 3, `widths` is
  percentages ("70,30", `columnWidths.ts`). The print view, the shared page
  and the Markdown spelling read the same props (`server/columns.go`,
  `server/export.go`).
- **The block's comment says sideways drags were given up** with the paid
  block ("dragging a block SIDEWAYS to open a new column"). The owner now
  wants that behaviour, made visible.
- **It already half-happens, by accident** (#824, measured): a drop on a
  column's first line inserts the block as a sibling of the columns, which is
  a new column. A count-3 block then holds 4 children and the grid wraps the
  4th onto a row of its own. The drop line meanwhile shows a spot inside the
  first column.
- **The drop line is BlockNote's** (`DropCursorExtension`): a horizontal line
  between blocks, drawn from ProseMirror's drop position. Since PR #827 it is
  2px in the focus colour. It can also draw a vertical line at a block's left
  or right edge (`block-vertical-left/right`), and it takes a hook,
  `computeDropPosition`, that may change or refuse the spot. nigari uses
  neither today.
- **Where the line and the drop disagree** (#809, measured in #812):
  - In columns, the line sat one column to the left of where the block
    landed.
  - At the end of a column, the line showed "after the last line" while the
    block landed before it.
  - Between two blocks the line twitched between two spots 1–9px apart
    ("after the text" and "after the block").
- **Dragging is BlockNote's, on HTML drag events**: it moves the block on the
  drop. Nothing else on the page moves while dragging. An animation that
  opens room would be new.
- **Agents already make columns** by writing a `columns` block
  (`write_content`). Dragging is a pointer gesture with no data path of its
  own: the result is the same document an agent can write.

## Clarifications

### Session 2026-11-21

- Q: Sideways drops: keep or drop? → A: Keep, made clear with a vertical
  target line and the columns sliding apart to make room; moving away
  reverses it (owner).
- Q1: A row that already has 3 columns? → A: "Only the right side of the
  most right column would trigger a new column creation" (owner). Confirmed
  ("ok") as Claude read it: a row of 3 takes a 4th column only at the right
  edge of its last column; a row of 2 opens a column at any column edge; 4
  is the most (at 15% per column, the narrowest a column may be, 4 still
  leaves the rest room).
- Q2: A sideways drop beside an ordinary block? → A: Yes, the two go side
  by side as a new two-column layout, as in Notion (owner, "A").
- Q3: Widths after a new column? → A: B, with a rule (owner): "say there are
  3 columns. 1, 2, 3 and 2,3 are the same width, then the new column 4 would
  take the space of 2,3 divided by 3. 1 remains since it was a deviating
  column size." The columns that share one width give up their room, split
  equally with the new column; a column someone made wider or narrower keeps
  its width. Claude's defaults where the owner's rule says nothing: with no
  two columns the same width, every column shrinks in proportion; equal
  columns stay equal (the common case: 3 equal become 4 equal).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dropping between lines lands where the line shows (Priority: P1)

A person drags a block up or down a page, into a column, or out of one. One
steady line shows where it will land, and it lands exactly there.

**Why this priority**: today's mismatch (#809, #824) makes every drag a
guess, and it puts blocks in the wrong place or breaks a columns layout.

**Independent Test**: drag a block to every kind of spot (between plain
blocks, above and below each line of a column, the first and last line of a
column, after the columns block) and compare where the line was with where
the block landed.

**Acceptance Scenarios**:

1. **Given** a three-column layout, **When** a block is dropped on the upper
   half of a column's first line, **Then** it lands above that line in that
   column, and the layout keeps three columns.
2. **Given** a column, **When** a block is dropped on the lower half of the
   column's last line, **Then** it lands below that line, where the line
   showed.
3. **Given** any page, **When** the pointer moves slowly down across a gap
   between two blocks, **Then** the line shows one spot for that gap and does
   not jump between two.

---

### User Story 2 - Dragging sideways opens a new column (Priority: P1)

A person drags a block to the side of a column. A vertical line shows a new
column will be made there, and the columns slide apart to open the room.
Moving the pointer away slides them back. Dropping makes the column.

**Why this priority**: the owner's ask. It turns an accident (#824) into a
visible, deliberate gesture.

**Independent Test**: drag a block to the left and right edge of each column
of a two-column layout; watch the line and the opening; move away; drop on
one edge; check the saved document.

**Acceptance Scenarios**:

1. **Given** a two-column layout, **When** a dragged block is held at the
   right edge of the first column, **Then** a vertical line shows there and
   the columns slide apart to leave a gap the width of a new column.
2. **Given** that opening, **When** the pointer moves back over a column's
   text, **Then** the columns slide back and the horizontal line returns.
3. **Given** that opening, **When** the block is dropped, **Then** it
   becomes a new column in that place, the layout's column count goes up by
   one, and nothing else in the page moves.
4. **Given** a person who has asked their system to reduce motion, **When**
   they drag sideways, **Then** the vertical line shows and the room opens
   without the slide.

---

### User Story 3 - A sideways drop beside an ordinary block (Priority: P2)

A person drags a block to the left or right edge of an ordinary block, not
in columns. The same vertical line shows, the block it is held against makes
room, and the drop puts the two side by side as a new two-column layout.

**Why this priority**: what people know from Notion (owner, Q2 "A"), and the
quickest way to start a layout; second because Story 2 already gives the
gesture.

**Independent Test**: drag a paragraph to the right edge of another
paragraph, drop, and check the saved document holds a columns block of two
with the two paragraphs, in that order.

**Acceptance Scenarios**:

1. **Given** two paragraphs A and B, **When** B is dropped at A's right
   edge, **Then** A and B sit side by side in two equal columns, A first.
2. **Given** the same, **When** B is dropped at A's left edge, **Then** B is
   first.
3. **Given** a block inside a list or nested under another block, **When** a
   block is held at its edge, **Then** no vertical line shows (a new
   layout is made only at the top level of the page; there are no columns
   inside columns or lists).

---

### Edge Cases

- **The layout already has 3 columns**: only the right edge of its last
  column offers a new (4th) column (Q1). A layout of 4 offers none.
- **Widths after a new column** (Q3): the columns that share one width give
  up their room, split equally with the new one; a column of its own width
  keeps it. 40/30/30 plus one becomes 40/20/20/20; 50/50 plus one becomes
  33/33/34; 50/30/20 (no two alike) shrinks in proportion. No column goes
  under 15% (`MIN_PCT`); where the rule would push one under, every column
  shrinks in proportion instead.
- **The last block of a column dragged out**: the column is left empty. The
  rule that only an empty LAST column is removed (`ColumnsBlock.apply`) does
  not cover an empty middle one. It goes, and the count drops by one; a
  layout left with one column becomes plain blocks.
- **A block dragged onto its own column's edge**: no change, no line.
- **The columns block itself dragged** (its own handle): it moves as one
  block and never makes a column inside itself.
- **A page that cannot be edited**: no handle, no drag (as today).
- **A phone-width page**, where columns stack (`server/columns.go`, editor
  CSS): sideways makes no sense there, so only the horizontal line is
  offered.
- **Two people editing** the same page: the drop is one change to the
  document, like any other edit (Yjs).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The drop line MUST show the exact spot the block will land,
  and the drop MUST land there: one decision, used for both.
- **FR-002**: Each gap between blocks MUST have one drop spot; the line
  MUST NOT move between two positions with the same meaning.
- **FR-003**: A drop on or above a column's first line MUST land inside
  that column. It MUST NOT add a column unless the vertical line (FR-004)
  was showing.
- **FR-004**: Holding a dragged block at the left or right edge of a column
  MUST show a vertical line in the focus colour at that edge, marking a new
  column. In a row of 3, only the right edge of the last column does; a row
  of 4 offers none (Q1).
- **FR-004a**: Holding a dragged block at the left or right edge of an
  ordinary top-level block MUST show the same line (inside a column, the
  column's own edges count, FR-004: no columns inside columns);
  the drop puts the two side by side as a new two-column layout (Q2).
- **FR-004b**: The widths after a new column MUST follow Q3: the columns
  sharing one width split their room equally with the new column, a column
  of its own width keeps it, and none goes under 15%.
- **FR-005**: While the vertical line shows, the columns MUST slide apart to
  open the room the new column will take; when the pointer leaves that edge
  they MUST slide back.
- **FR-006**: A drop while the vertical line shows MUST insert the block as
  a new column at that place and raise the layout's column count by one.
- **FR-007**: With reduced motion asked for, FR-005 MUST happen without the
  slide (the room is shown at once, or only the line).
- **FR-008**: A column left with nothing in it after a drag MUST go, and the
  count MUST drop with it; a layout left with one column MUST turn back into
  plain blocks.
- **FR-009**: The result MUST be a document the rest of nigari reads: the
  print view, the shared page, Markdown and agents (`get_page`,
  `write_content`). A 4-column layout is new to all of them (count is 2 or 3
  today), so each MUST take a count of 4.
- **FR-010**: Sideways drops MUST NOT be offered where columns stack (phone
  width).
- **FR-011**: Dragging MUST stay smooth: the opening and the line MUST NOT
  add a noticeable delay to a drag (see SC-003, and #810).

### Key Entities

- **Drop target**: where a dragged block will land. Either *between* (a
  place among blocks, drawn as a horizontal line) or *new column* (an edge
  of a column, drawn as a vertical line with the room opened).
- **Columns block**: `count` (2 to 4, up from 2 or 3) and `widths`.
  Changed only by a drop that makes or empties a column, or as today by the
  layout bar and the grip.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every drop spot in the test page (plain blocks, each line
  of each column, both edges of each column), the block lands where the line
  showed: 100% of cases.
- **SC-002**: No drop changes a columns block's count unless the vertical
  line was showing: 0 cases in the test page.
- **SC-003**: Dragging feels as quick as without the opening. Each drag step
  costs under 4ms of script and style work on a 300-block page (#810
  measured 0.5–1ms per step before this feature).
- **SC-004**: The owner drags a block into a new column in Safari on the
  first try, without explanation.

## Assumptions

- **The slide** takes about as long as the app's other short movements, a
  motion token, not a new number.
- **The vertical line** uses the drop line's colour and width (#809, PR
  #827).
- **An agent needs nothing new**: making columns is already writing a
  `columns` block. The surfaces table in the plan says so per surface.
- **The board and table drags** (database views) are untouched: this is the
  document editor's drag only.
