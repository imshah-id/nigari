# Research: A view's layout can be changed

Decisions for spec 018, with the options turned down. Read with
[plan.md](plan.md).

## R1 — A type change is a view change, nothing more

**Decision**: changing the layout sets the view's `type` and fills the new
type's missing settings (R2); every other key stays in the view as it is
(FR-002, FR-003). It is saved by the doors that already save views: REST
`PUT /api/collections/{id}` (views half), `set_view` on a database view,
`set_view` with `embed_id` on an embed's view, and the browser's write of
an embed's views into the document. Each already runs the lock
(`checkViewsUnlocked`, database views) and the log (`auditViewChanges`).

**Rejected**: dropping the settings of the type left behind (the round trip
in SC-002 would lose a table's widths and order); a separate "layout"
route (a fifth door to the lock and the log for no gain).

## R2 — Defaults for the new type, one rule for both sides

**Decision**: `switchLayout(view, type, schema)` in the browser
(`web/src/viewLayout.ts`, new, pure) and `switchViewLayout` in Go
(`server/viewlayout.go`, new) return the view with its new type and:

- board: `groupBy` kept if it names a property a board groups by, else the
  first select (or status, spec 016) property, else none;
- calendar, timeline: `dateProp` kept if it is a date property, else the
  first date property; none → R3;
- chart: settings kept if the view has a `chartKind`, else
  `defaultChartView('bar', …)`'s settings (`chartDefaults.ts`), which the
  Go side mirrors;
- table, list, gallery, form: nothing to fill.

The cases (schema, view, type → expected view) are one file,
`server/testdata/viewlayout/cases.json`, read by a Go test and by
`check-viewlayout.mjs` against the TypeScript function (the spec 014
`testdata/embedviews` pattern), so the interface and `set_view` cannot give
different defaults.

**Why both sides**: the browser saves the views it changes (REST takes a
whole views array, it does not compute defaults), while `set_view` changes
one view on the server. A rule in each, held level by shared cases, is what
spec 014 did for embeds.

**Rejected**: computing defaults only on the server (the REST views save
would have to know which view changed type and rewrite it: a hidden write
inside a save); only in the browser (an agent's `set_view` would get a
board with no columns chosen).

## R3 — No date property: add one and switch in one save (owner, "B")

**Decision**: picking Calendar or Timeline with no date property asks
(`confirm`) "Add a date property named Date?"; on yes the browser sends one
`PUT /api/collections/{id}` with both halves, the schema with the new
property and the views with the switched view, so the two land together
or not at all. The name is "Date", or "Date 2" and so on if taken. The
property is the plain date type with no settings.

Who may: changing the database's properties needs write on the database
(`canWriteReq`); an embed's views need write on the document. In an embed
of a database the person can only read, the choice explains that a date
property is needed and that someone who can edit the database can add one,
and changes nothing.

An agent's `set_view` to calendar or timeline with no date property is
refused: "this database has no date property; add one with update_schema
first". Two calls for an agent, one for a person: the same capability with
the same checks; an agent has no confirmation dialog to stand in for.

**Rejected**: two saves (a property added and the switch failing would
leave a stray property); adding the property silently without asking (a
schema change the person did not see coming, the owner's rule for embeds:
a change to the source goes through a confirmation, 2026-11-03).

## R4 — Lifting the refusal on both MCP paths

**Decision**: `mcpUpdateView` and `mcpUpdateEmbedView` stop refusing a
`type`; a known type goes through `switchViewLayout` before
`applyViewSpec`, so the other arguments in the same call (a `group_by`, a
`date_prop`) win over the defaults. Unknown types are refused with the
existing sentence; `form` on an embed with the existing embed sentence.
The answer names the defaults chosen ("Now a board grouped by Status").

`TestUpdateViewMergesAndCanClear` and the embed tests that assert the old
refusal are changed to assert the switch.

## R5 — The REST views save checks types like set_view

**Decision**: `normalizeViews` refuses a view whose type is not in
`validViewTypes` (`400 invalid_view_type`), in one function `set_view`
calls too (FR-010). Today REST stores any type string.

An embed's views live in the document and the server does not validate the
document's content; `readEmbedLocal` already drops a view whose type an
embed cannot show (`embedViewType`), so the interface simply never offers
Form there (FR-001).

## R6 — The interface

**Decision**: **Layout** is the first item of `ViewSettingsMenu`, a
`MenuSubmenu` whose value is the current type, holding the type list the
add-view menu draws (`CollectionMenus.tsx`'s `MenuValueItem`s with each
type's icon), checked on the current one. After a switch the default the
new type was given is said, with where it is changed (FR-006): a board's
grouping lives in the toolbar's **Group** button (not in Settings), so a
toast says "Grouped by Status — change it with Group"; a calendar's or
timeline's date, in Settings → Start date; a chart's settings, in the
chart's own settings. A switch away from the only form view asks first when
the database has a public form link (FR-008), which the browser asks with
`formShareStatus` just before it.

`ViewSettingsMenu`'s comment about R9 of spec 012 is replaced.
