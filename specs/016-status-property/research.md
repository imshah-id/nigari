# Research: A Status property type

Decisions for spec 016, each with the options turned down. Read with
[plan.md](plan.md).

## R1 — Where an option's group lives

**Decision**: on the option, in the database's schema: `{"id", "name",
"color", "group"}` with `group` one of `todo`, `in_progress`, `complete`.
Rows keep storing only the option id.

**Why**: moving an option to another group (FR-004) is then one schema
write, and every filter, rollup and board reads the new group at once. No
row is ever rewritten.

**Rejected**: the group copied into each row's value (a move would rewrite
every row and two truths could drift); a separate `groups` list on the
property naming its option ids (two lists to keep consistent, and an option
could be in none or two).

## R2 — The options array is kept in group order

**Decision**: every save of a status (both doors) orders its options by
group (To-do, In progress, Complete), keeping their order within a group.
`normalizeStatusOptions` on the server; the option editor applies the same
order as it edits.

**Why**: the board's columns (FR-006), a chart's bars, the quick filter
chip and the option picker all draw options in array order today. Sorted
once at save, none of them needs to know about groups to get the order
right.

**Rejected**: sorting at every reader (five readers in the browser, two on
the server, each a chance to forget).

## R3 — A group condition is resolved to option ids per query

**Decision**: two new operators, `group_is` and `group_is_not`, with
`values` naming groups. `typeFilters` (the one place every rows query, every
chart and `rowMatchesView` types its filters from the schema) rewrites them
to `is` / `is_not` with the ids of the options currently in those groups.
The browser's second pass (`matchesFilter`) does the same with the schema it
holds. A rollup's condition takes the same two operators, resolved against
the related database's schema once per `computeDerived` call into
`RollupWhereValues`.

**Why**: the `is`/`is_not`-with-a-list SQL already exists, is indexed the
same way, and is what the view-match note and charts already share (spec
004 SC-002). Resolving per query means an option moved or added is followed
with no edit to the view (SC-001), and no new SQL is written.

**Rejected**: a `group` column or generated value per row (would need
rewriting on every option move, R1); storing the resolved ids in the view
(goes stale the moment an option is added, which is the bug the issue is
about).

A group condition on a property that is not a status resolves to nothing:
it narrows nothing, as a filter on a deleted property does today. A save
that sends one (REST `views`, `set_view`, rollup in `update_schema`) is
refused with the reason.

## R4 — A new row starts in To-do, in one function

**Decision**: `withStatusDefaults(schema, props)` fills each status property
the row does not set with the first To-do option. It runs after the pins
are merged, so a value the caller gives and a view's pin (FR-008) win.
Called by every door that makes a row of a database: `handleCreatePage`,
`handleRowFromTemplate`, `mcpCreateRows`, `create_page`/`mcpCreateFromTemplate`
(through `propsInRowView`), the public form, the CSV import and the ingest
job. A Go test makes a row through each door and checks the value
(the `TestEveryViewDoorIsRefusedWhileLocked` pattern: the list is the
calls, so a new door without the call fails it).

**Rejected**: a default stored on the property and applied in the browser
(an agent's rows would start empty); putting it inside `mergePins` (the
public form, CSV import and ingest do not merge pins).

A pin from `group_is` with a single group pins that group's first option
(`pinsFromFilters` resolves it as R3 does); several groups pin nothing.

## R5 — Sorting by a status

**Decision**: by group, then by the option's place, both in the rows query
(an `ORDER BY CASE` built from the schema's option ids, on the read pool as
now) and in the browser's `sortComparator` (given the option order). A select
is not changed by this spec.

**Why**: today a select sorts by its stored id's text (`json_extract(props,
'$.x')`, and `sortComparator` compares the raw value), so "doing" sorts
before "todo" before "done" by accident. For a status that order would read
as broken.

**Rejected**: changing select's sort too (a visible change to existing views
nobody asked for; its own issue if wanted); sorting by option name (still
not the workflow order).

The `CASE` lists at most the property's options (tens), so it does not
change the query's plan; benchmarked anyway (Storage budgets).

## R6 — Conversion from a select, one guess shared by both doors

**Decision**: changing a select to a status (in the interface,
`changePropertyType`; for an agent, `update_schema` sending `type: status`
with options lacking `group`) places each option by its name with one word
list (FR-010), then gives any empty group a default option (FR-002). The
list and its cases live in `server/testdata/statusgroups.json`, read by a
Go test and by `check-statusgroups.mjs` against the TypeScript function, so
the two cannot drift (the spec 014 `testdata/embedviews` pattern).

**Rejected**: guessing only on the server (the editor would show options
without groups until saved); asking the person to place each option by hand
before converting (every existing database needs the conversion; the guess
is right for the default options and correctable).

Multi-select → status is offered only when no row holds more than one value;
otherwise refused with how many rows do (a status holds one value).

## R7 — New databases get a status (FR-018)

**Decision**: `defaultSchema` (`server/collections.go`) becomes a status
with today's option ids (`todo`, `doing`, `done`) and names, each with its
group. Existing databases are not touched (FR-016): no upgrade step.

**Why**: keeping the ids keeps the default board view (`groupBy: status`)
and every template or test that names `todo`/`doing`/`done` working.

## R8 — Charts by group

**Decision**: a chart grouped by a status gets one more setting, **Group by:
Option / Group** (`statusGroups: true` on the view's chart settings);
`aggregate.go` maps each row's option id to its group before counting, in
the same pass. Default: by option, as today.

**Rejected**: a separate pseudo-property "Status (group)" in the property
list (a property that does not exist would show up in every picker).

## R9 — Validation, one function on every door

**Decision**: `checkStatusProps(schema)` on `handlePutCollection`,
`mcpUpdateSchema` and `mcpCreateDatabase` (the three doors spec 015 found
for schema writes): every option of a status has a known group, every group
has at least one option, option names are unique. Refused with `400
invalid_status_options` and a sentence naming the property and the group.

## R10 — Places that treat select as a special type

**Decision**: one helper per side, `isOptionType(type)` in
`web/src/types.ts` and `optionTypes` in Go, replacing the `=== 'select'`
checks that mean "has options" (cell, picker, board, lanes, quick filters,
card layout, gallery, chart defaults, public form, public table, view
checks, CSV export). A check (`check-statusgroups.mjs`) fails a new
`=== 'select'` test outside a reviewed list, so the next type with options
does not miss half of them, as `url` and `backrelation` once did
(`validPropTypes` comments).

## R11 — What stays out

Custom groups, a column per group on a board, a formula function for the
group, multi-value status: out of scope (spec Assumptions). A CSV import
keeps a "Status" column a select.
