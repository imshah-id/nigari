# Feature Specification: A view's layout can be changed

**Feature Branch**: `claude/spec-018-view-layout`

**Created**: 2026-11-15

**Status**: Draft

**Issues**: #469

**Input**: Owner's issue #469 (2026-11-02), from planning spec 012:

> "Today a view keeps the type it was created with: a table cannot become a
> board. … Wanted: a **Layout** item in a view's Settings menu that switches
> the view's type, keeping what carries over (filters, sort, hidden
> properties) and asking for what the new type needs (a board's group-by, a
> timeline's dates). Agents get the same through `set_view`."

## Context

How a view's type works today, from the code graph and the source
(`codegraph explore` on `set_view`, `validViewTypes`, `ViewSettingsMenu`,
`normalizeViews`, `ViewDef`, `embedViewType`, 2026-11-15):

- **A view is one object with a type and every setting beside it**
  (`ViewDef`, `web/src/types.ts`): filters, sort, hidden properties, quick
  filters and how rows open apply to every type; group-by (board, chart),
  dates (calendar, timeline), column widths and order and sub-items
  (table), sub-group lanes (board), form texts (form) and the chart's
  settings belong to one type. Eight types (`validViewTypes`).
- **The type is fixed after creation.** `set_view` refuses a type on an
  update ("a view's type cannot be changed — delete it and create the new
  one", `mcpUpdateView`); the interface offers no way. The REST views save
  (`normalizeViews`, `PUT /api/collections/{id}`) stores whatever type is
  sent, so the only check is in the MCP path.
- **Each type already copes with a missing setting**: a board without a
  group-by uses the first select (`checkViewSubGroup`, `BoardView`), a
  timeline without a start uses the first date property (the Settings
  menu says so). A calendar and a timeline need a date property to show
  anything; a chart is checked by `checkChartView` when its settings change.
- **The Settings menu** (`ViewSettingsMenu.tsx`, spec 012) is titled
  "{name} view settings"; its comment says there is no Layout item because
  of research R9 of spec 012, which filed this issue.
- **Embeds have views of their own** (spec 014), in the document, with the
  same Settings menu; they cannot show a form (`embedViewType`).
- **Locked views** (spec 013) refuse every view change on every door
  (`checkViewsUnlocked`), and changes are logged (`auditViewChanges`).
- **Personal state** (each person's own filter and sort, spec 013) is kept
  per view id, so it is not touched by a change of type.

## Clarifications

### Session 2026-11-15

- Q: Calendar or Timeline on a database with no date property? → A:
  Picking it offers to add a "Date" property, then switches (owner, "B";
  the recommendation was a disabled choice with "Add a date property
  first").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn a table into a board, and back (Priority: P1)

A person has a table of tasks and wants to see it as a board. They open the
view's Settings, choose **Layout**, and pick **Board**. The view becomes a
board grouped by the first select (or status) property, with its filters,
sort, hidden properties and quick filters as they were. Later they switch
back to **Table**, and the table's column widths and order are as they left
them.

**Why this priority**: The issue's core ask; today the person has to delete
the view and rebuild every filter by hand.

**Independent Test**: Make a table with a filter and a hidden column,
switch it to a board and back.

**Acceptance Scenarios**:

1. **Given** a table view with filters, a sort and hidden properties,
   **When** a person chooses Layout → Board, **Then** the view is a board
   with the same filters, sort and hidden properties, and its name and
   place among the views are unchanged.
2. **Given** a board made from a table, **When** the person switches back
   to Table, **Then** its column widths, column order and sub-items are
   those it had before.
3. **Given** the Settings menu, **When** it opens, **Then** **Layout**
   shows the view's current type as its value, and lists every type with
   its icon, the current one marked.
4. **Given** a person who may not change the views (reader, or the views
   locked), **When** they open Settings, **Then** Layout is not offered or
   is shown disabled with the reason, as other view settings are.

---

### User Story 2 - Switch to a layout that needs something (Priority: P1)

A person switches a table to a **Calendar** or **Timeline**. The view uses
the first date property; the Settings then show its date choice so they can
change it. A switch to **Board** uses the first select or status property
and shows the group-by choice. A switch to **Chart** makes a count chart by
the first property a chart can group by. Where the database has nothing the
layout needs (no date property for a calendar), the person is told what is
missing.

**Why this priority**: The issue asks for "asking for what the new type
needs"; without it a switch can land on an empty view.

**Independent Test**: Switch a table to each layout on a database with and
without a date property.

**Acceptance Scenarios**:

1. **Given** a database with a date property, **When** a view becomes a
   calendar or timeline, **Then** it shows rows by the first date property,
   unless the view already had one chosen from an earlier time as that
   type.
2. **Given** a database without a date property, **When** a person picks
   Calendar or Timeline, **Then** they are asked whether to add a date
   property named "Date"; on yes it is added and the view switches to it;
   on no nothing changes. Someone who may change the view but not the
   database's properties (an embed in a document they edit, of a database
   they only read) is told a date property is needed, and nothing changes.
3. **Given** a view becoming a chart, **When** it has no chart settings yet,
   **Then** it is a bar chart counting rows by the first property a chart
   can group by (or a number chart when there is none), as a new chart view
   starts today.
4. **Given** a view becoming a board on a database with no property a board
   can group by, **When** it shows, **Then** it shows the one "no group"
   column, as a board without a group-by does today.

---

### User Story 3 - The same in an embed (Priority: P2)

A person changes the layout of an embed's own view in a document. Only that
embed's view changes; the database's views are untouched. A form is not
offered, as an embed cannot show one.

**Why this priority**: Embeds have views of their own (spec 014); a setting
missing there is the gap the Embedded views surface exists to prevent.

**Independent Test**: In an embed, switch its view to a board; the
database's own views are unchanged.

**Acceptance Scenarios**:

1. **Given** an embed's view, **When** a person switches it to Board,
   **Then** the embed shows a board, and the database's view of the same
   name (if any) is still a table.
2. **Given** an embed, **When** Layout opens, **Then** Form is not in the
   list.

---

### User Story 4 - Agents can do the same (Priority: P2)

An agent changes a view's type with `set_view` on an existing view,
database's or embed's, with the same defaults and refusals as the
interface.

**Why this priority**: Agent parity; the issue names `set_view`.

**Independent Test**: Through MCP, change a table to a board and a
calendar; refusals on a locked view and on an embed's form.

**Acceptance Scenarios**:

1. **Given** a table view, **When** an agent calls `set_view` with
   `type: board` on it, **Then** the view becomes a board with the same
   defaults the interface would give, and the answer says what was
   chosen ("grouped by Status").
2. **Given** locked views, **When** an agent changes a type, **Then** it is
   refused as any view change is.
3. **Given** an embed's view, **When** an agent asks for `type: form`,
   **Then** it is refused with the reason.

### Edge Cases

- Switching to the type the view already has: nothing changes.
- A filter or sort on a property the new type does not show (a hidden
  property): kept; filters apply to every type.
- A board's sub-group lanes after switching to a table and back: kept and
  shown again.
- A chart's group-by is shared with the board's (`groupBy`): switching
  board → chart keeps the grouping; a chart then checks it can group by
  it, and if not, falls back to its own default and says so.
- A form view to a table: the form's texts are kept, unused, and come back
  if it becomes a form again. A public form link shows the database's
  first form view (`handlePublicFormConfig`); when the view switched away
  was the only one, the link answers "no form view" until there is one
  again, and the switch says so before it happens.
- A view opened in a side peek setting (openIn): kept for every type.
- A database view open by another person while it changes: they see the new
  type on their next load, as for any view change today.
- Two settings with the same meaning for two types (a calendar's date and a
  timeline's start, both `dateProp`): shared, so a calendar → timeline
  switch keeps the date.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A view's Settings MUST offer **Layout**, a choice among the
  view types (all eight for a database's view; all but Form for an embed's),
  showing the current type.
- **FR-002**: Changing the layout MUST keep the view's id, name, place,
  filters, sort, hidden properties, quick filters and how rows open, and
  each person's own filter and sort for it.
- **FR-003**: Settings that belong to one type MUST be kept when the view
  leaves that type and used again when it returns (column widths and order,
  sub-items, sub-group, form texts, chart settings, dates, group-by).
- **FR-004**: A layout that needs a setting the view does not have MUST get
  a default the same way a new view of that type does: a board the first
  select or status property, a calendar or timeline the first date
  property, a chart a count by the first property it can group by.
- **FR-004a**: Picking Calendar or Timeline on a database with no date
  property MUST ask to add one ("Date", or a name not taken); on yes the
  property is added (a schema change, with that door's checks and log) and
  the view switches to it in the same step; if the person may not change
  the database's properties, the choice says why and nothing changes. An
  agent asking `set_view` for such a type is refused with the reason and
  told to add a date property with `update_schema` first.
- **FR-005**: A switch MUST NOT leave the view in a state the server would
  refuse on its next save (a chart's settings are checked as a new chart's
  are).
- **FR-006**: After the switch the menu MUST show the setting the new
  layout depends on (board: group-by; calendar, timeline: dates; chart: the
  chart settings), so the person can change the default.
- **FR-007**: Changing a layout MUST be refused where any view change is:
  without write permission on the database (for its views) or the
  document (for an embed's views), and while the database's views are
  locked; it MUST be logged as a view change.
- **FR-008**: Switching the database's only form view to another layout,
  while a public form link exists, MUST say before it happens that the link
  stops working until the database has a form view again.
- **FR-009**: Agents MUST be able to change the type with `set_view` on an
  existing view (database or embed), getting the same defaults (FR-004) and
  refusals, and an answer naming the defaults chosen.
- **FR-010**: The REST views save MUST apply the same type rules as
  `set_view` (a known type; no form in an embed), in one function both call.
- **FR-011**: Layout MUST work by keyboard like the other Settings
  submenus.

### Key Entities

- **View**: as today; its type becomes changeable. No new stored setting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Turning a table into a board takes 3 clicks or fewer from the
  view, with no filter, sort or hidden property re-entered.
- **SC-002**: A table → board → table round trip leaves the view's stored
  settings identical to before (checked by comparing them).
- **SC-003**: Every type change in stories 1–3 has an MCP equivalent with
  the same refusals, shown by a REST/MCP pair in the parity test.

## Assumptions

- No new view type; the eight types stay as they are.
- Settings of other types are kept in the view (FR-003) rather than
  dropped, as Notion does; the stored view grows by a few keys at most.
- A board grouped by status depends on spec 016 only for the word "status"
  in FR-004; until 016 ships the first select is used.
- Converting a chart's settings to a board's beyond the shared group-by
  (colours, sort) is out of scope; those settings are kept for the chart.
