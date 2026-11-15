# Feature Specification: A Status property type

**Feature Branch**: `claude/spec-016-status-property`

**Created**: 2026-11-14

**Status**: Draft

**Issues**: #18

**Input**: Owner, #18 (2026-10-25), from comparing nigari with Notion's
developer platform:

> "Workflow state is a plain `select`. Board columns and rollups cannot tell
> an "in progress" option from a "done" one, so "open" has to be spelled out
> as `is_not [done, discarded]` … A `status` type with three fixed groups.
> Filters can say `group is complete`; rollups can count done items; boards
> group by it. Converting a select to a status keeps option ids."

## Context

How workflow state works today, from the code graph and the source
(`codegraph explore` on `validPropTypes`, `PropertyFields`,
`changePropertyType`, `rowsWhere`, `matchesRollupWhere`, `groupableTypes`,
`quickFilterProps`, 2026-11-14):

- **A status is a select.** Every new database starts with a `Status`
  select with the options To do, In progress and Done (`defaultSchema` in
  `server/collections.go`), and its first view is a board grouped by it. A
  CSV import picks a column headed "Status" as the board's grouping
  (`import_csv.go`). Nothing in the schema says which option means
  finished.
- **"Open" has to be spelled out.** A rollup's condition takes a list of
  values for `is`/`is_not` precisely so that "neither done nor discarded"
  can be said (`RollupWhereValues`, `server/derived.go`; the comment there
  names the bug it prevents: `is_not done` counted discarded rows as open).
  A view filter is the same: `is_not` with a list of option ids
  (`rowsWhere`, `server/collections.go`). Adding a new finished option
  (say "Won't do") silently breaks every such filter and rollup until each
  is edited.
- **Charts already expect the type.** `groupableTypes` in
  `server/aggregate.go`, its option-order case, and `chartDefaults.ts` /
  `ChartSettings.tsx` list `status` beside `select` (spec 004 planned for
  it). No other part of the server or the interface knows it:
  `validPropTypes` refuses it, so an agent cannot create one.
- **Places that special-case `select`** and so must answer for a status
  too: the type picker and option editor (`propertyTypes.tsx`,
  `PropertyFields`), the cell and board (`PropertyValue`, `BoardView`,
  `boardLanes.ts`, `cardLayout.ts`), quick filters and board lanes
  (`quickFilters.ts`, `checkViewQuickFilters`/`checkViewSubGroup`), filters
  and sort, view pins for new rows (`viewpins.go`), public forms and public
  tables, CSV import and export, and `update_schema` / `query_rows` over
  MCP.
- **Changing a property's type keeps the stored values**
  (`changePropertyType`, non-destructive): rows keep their option ids, so a
  select turned into a status keeps every row's value.

## Clarifications

### Session 2026-11-14

- Q: What does a new row start with? → A: The first To-do option, as in
  Notion; not empty (owner, "A", recommendation).
- Q: What is a new database's default Status? → A: A status; existing
  databases stay as they are (owner, "A", recommendation).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track work with a Status property (Priority: P1)

A person adds a Status property to a database. It comes with three groups,
**To-do**, **In progress** and **Complete**, each holding options (by
default Not started, In progress, Done). They add, rename, recolour,
reorder and delete options, and move an option into another group. Rows
show the status like a select, and a board grouped by it has one column
per option, in group order.

**Why this priority**: Without the type, nothing else in this spec exists.

**Independent Test**: Add a Status property to a database, set rows to
each option, group a board by it.

**Acceptance Scenarios**:

1. **Given** a database, **When** a person adds a property of type Status,
   **Then** it has the three groups with one default option each, and the
   option editor shows options under their group's heading.
2. **Given** a Status property, **When** a person drags an option from
   To-do to Complete, **Then** the option keeps its id, name and colour, and
   every row that had it now counts as complete.
3. **Given** a board grouped by a Status property, **When** it opens,
   **Then** its columns are the options in group order (To-do, In progress,
   Complete), and dragging a card to a column sets that option.
4. **Given** a group with one option left, **When** a person tries to
   delete it, **Then** it is refused with a sentence saying each group keeps
   at least one option.

---

### User Story 2 - Filter and count by group (Priority: P1)

A person filters a view to "Status group is not Complete", and that view
keeps showing the open work when someone later adds a "Won't do" option to
the Complete group. A project's rollup counts its tasks whose status is
complete, and a progress bar shows done/total, without listing options.

**Why this priority**: This is the problem the issue names: "open" has to
be spelled out per option today, and breaks when an option is added.

**Independent Test**: Filter by group, add an option to that group, see
the filter still right; build a percent rollup by group.

**Acceptance Scenarios**:

1. **Given** a view filtered by "Status group is Complete", **When** an
   option is added to or moved into Complete, **Then** rows with that
   option show in the view without the filter being edited.
2. **Given** a relation from projects to tasks, **When** a person makes a
   rollup "percent of tasks whose Status group is Complete", **Then** it
   shows done/total and follows options moved between groups.
3. **Given** a view filtered by group, **When** a new row is made in it,
   **Then** the row gets the group's first option (the view's pin), as a
   select filter fills in its value today.
4. **Given** a Status property, **When** it is offered as a quick filter,
   **Then** its chip lists the groups and the options under them.

---

### User Story 3 - Turn an existing select into a status (Priority: P2)

A person whose database already tracks work with a `Status` select changes
its type to Status. Every option lands in a group by a sensible guess
(names like "Done" and "Complete" in Complete, "In progress" or "Doing" in
In progress, the rest in To-do), which they can then correct. No row loses
its value; views, filters, pins and the board keep working.

**Why this priority**: Every database made so far has a select named
Status; without a clean conversion the new type only helps new databases.

**Independent Test**: Convert the default board's Status select; every row
keeps its column, every filter keeps its rows.

**Acceptance Scenarios**:

1. **Given** a select with To do / In progress / Done, **When** its type is
   changed to Status, **Then** the options keep their ids and land in
   To-do, In progress and Complete, and no row's value changes.
2. **Given** a Status, **When** its type is changed back to select,
   **Then** the options and values stay and only the groups are dropped;
   filters by group are refused with the reason until removed or changed.
3. **Given** a converted property, **When** the conversion leaves a group
   empty, **Then** that group gets a default option, so every group has at
   least one.

---

### User Story 4 - Agents can do the same (Priority: P2)

An agent creates a Status property with groups, moves options between
groups, filters rows by group, and makes a rollup by group, with the same
checks as the interface.

**Why this priority**: Agent parity (constitution II); the issue's own
example (`is_not [done, discarded]`) comes from the `update_schema`
description.

**Independent Test**: Through MCP, create a status, query rows by group,
convert a select.

**Acceptance Scenarios**:

1. **Given** an agent with write access, **When** it calls `update_schema`
   with a `status` property and options carrying a group, **Then** it is
   saved; an unknown group, or a group without options, is refused with
   the reason.
2. **Given** a status property, **When** an agent queries rows with a
   group condition, **Then** it gets the same rows the interface shows.
3. **Given** a read-only credential, **When** it tries to change a status
   property, **Then** it is refused as any schema change is.

### Edge Cases

- A row whose value is an option id that no longer exists (deleted
  option): shown as empty, counted in no group, as a select does today.
- An option deleted that rows still hold: as for a select today, the rows
  keep the old id and show empty; no new behaviour.
- A view filter or rollup by group on a property that is no longer a
  status: refused with a sentence when saved; a stored one narrows nothing
  and the view says why, as other filters on a changed property do.
- Two options with the same name in different groups: refused, as names
  are unique within a property.
- A CSV import: a column headed "Status" stays a select (an import does not
  guess groups); the person converts it.
- A CSV export writes the option's name, as for a select.
- A public form offers the options of a status like a select's.
- Charts group by option (as now) and can also group by the three groups.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer a `status` property type whose options
  each belong to one of three fixed groups: To-do, In progress, Complete.
  Group names are fixed (not renamable) and translated.
- **FR-002**: Every group MUST hold at least one option; removing a group's
  last option, by the interface or an agent, is refused with the reason.
- **FR-003**: A new status property MUST start with one option per group:
  Not started (To-do), In progress (In progress), Done (Complete).
- **FR-004**: Options MUST be added, renamed, recoloured, reordered within
  a group, moved to another group and deleted, keeping their ids. Moving an
  option changes the group of every row that holds it, without writing the
  rows.
- **FR-005**: A row's status MUST be set and cleared like a select's, in a
  cell, on a row's page, on a card and by dragging a card between board
  columns.
- **FR-006**: A board grouped by a status MUST draw one column per option,
  ordered by group then by the option's place in its group.
- **FR-007**: A view filter and a rollup's condition MUST accept "group is"
  and "group is not" with one or more groups, alongside the existing
  per-option conditions, and evaluate them from the property's current
  groups.
- **FR-008**: A view filtered by group MUST pin a new row to the first
  option of the (single) group it requires, as a select filter pins today;
  a filter that allows several groups pins nothing.
- **FR-009**: Quick filters and board lanes MUST accept a status property;
  a quick filter chip offers the groups and their options.
- **FR-010**: Changing a select (or multi-select with single values) to a
  status MUST keep option ids and every row's value, and place each option
  in a group by its name (Complete: done, complete, finished, closed,
  shipped, won't do, cancelled, discarded; In progress: in progress, doing,
  started, active, review; else To-do), leaving no group empty.
- **FR-011**: Changing a status to a select MUST keep options and values
  and drop the groups. A filter or rollup by group on it MUST be refused on
  save with a sentence, and a stored one narrows nothing.
- **FR-012**: Charts MUST be able to group a status by option (as today)
  and by group.
- **FR-013**: Agents MUST be able to do everything above over MCP with the
  same checks as REST: `update_schema` (type, groups, options, conversion),
  `query_rows`/`set_view` (group conditions), rollups by group. The tool
  descriptions say what a group condition is, replacing the
  `is_not [done, discarded]` advice.
- **FR-014**: Sorting by a status MUST order rows by group, then by the
  option's place in its group (a select today sorts by its stored id's
  text; that is not changed here).
- **FR-015**: Public forms, public tables, CSV export and templates MUST
  treat a status as a select with fixed groups (show and write the option's
  name).
- **FR-016**: Existing databases MUST NOT change when nigari upgrades: a
  select named Status stays a select until a person or agent converts it.
- **FR-017**: A new row MUST start with the first option of the To-do
  group, by the interface, an agent, a template without a status value, a
  public form and an import row with an empty status; a value the caller
  gives, or a view's pin (FR-008), wins.
- **FR-018**: A newly created database's default Status property MUST be a
  status (To do, In progress, Done in their groups, keeping today's option
  ids); databases that exist already are not touched (FR-016).

### Key Entities

- **Status property**: a property of type `status`; its options as a
  select's (id, name, colour), each with a group.
- **Status group**: one of three fixed values, `todo`, `in_progress`,
  `complete`, with a translated label. Not stored per database.
- **Group condition**: a filter or rollup condition on a status property
  that names groups rather than options.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A view filtered by "group is not Complete" shows the same
  rows before and after an option is added to Complete, with no edit to the
  view.
- **SC-002**: Converting the default database's Status select to a status
  changes no row's value and no board column's cards (checked on a seeded
  database).
- **SC-003**: A group condition on a database of the seeded size stays
  within the rows query's existing p95 budget (spec 002).
- **SC-004**: Every action in stories 1–3 has an MCP equivalent with the
  same refusals, shown by a REST/MCP pair in the parity test.

## Assumptions

- Group names are fixed, as in Notion and as the issue proposes; custom
  groups are out of scope.
- An option's group lives on the option in the schema; rows keep storing
  only the option id, so moving an option never rewrites rows.
- A status holds one value (no multi-status), as Notion's does.
- A board grouped by status shows columns per option; collapsing columns
  into one per group is out of scope (a later view setting if wanted).
- Formulas compute numbers only (`evalFormula`) and do not read a select
  today, so they do not read a status either; a formula function for the
  group is out of scope.
