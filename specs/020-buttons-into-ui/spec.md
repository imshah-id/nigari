# Feature Specification: The hand-built buttons move into the design system's parts

**Feature Branch**: `claude/spec-019-palettes` (spec only; the build gets its own branch)

**Created**: 2026-11-17

**Status**: Draft

**Issues**: #379

**Input**: Owner's issue #379 (2026-11-02):

> "`check-tokens.mjs` counts 332 hand-built `<button>`s outside
> `web/src/ui/` … Each hand-built button can drift on its own: a different
> look, a missing keyboard path, or a missing label. The owner's aim: bring
> the number down **without losing the look**, using a small set of parts
> that reproduce today's buttons."

## Context

How buttons are built today, from the code graph, the source and a census
of every `<button` tag outside `web/src/ui/` (2026-11-17, after specs 010,
012–018 moved menus and several dialogs):

- **The count is 257** (`check-tokens.mjs`, `rawButtons` budget 257), down
  from 332 when the issue was written: spec 010 moved the menus, later
  specs moved what they touched. The census reads 267 tags; the check's 257
  is the official number (it skips a few the census counts).
- **Text buttons are nearly half**: 120 tags carry `btn` or `btn-sm`
  (outline or ink-filled text buttons), spread over 30 files, most in
  settings and dialogs (`AdminSettings`, `UserMenu`, `AgentConnect`,
  `WorkspaceRules`, `BlueprintLibrary`, `TemplateGallery`). `ui/Button` was
  measured off exactly these (`Button.css`: "the look of today's .btn /
  .btn-sm"), so they move with no new part.
- **Icon-only buttons**: about 25 (`icon-btn` 17, `menu-btn` 3, small
  one-offs such as the cover and tag-remove buttons). `ui/IconButton`
  exists; it also gives each one the tooltip and accessible name it must
  have.
- **Tabs**: about 10 (view tabs on the admin page, the icon picker's
  Emoji/Icons/Upload, template categories, the index's modes, the login
  page's switch). Base UI has a Tabs primitive; nigari has no `ui/Tabs`.
- **Pick one of a few**: about 10 (the theme switch, a member's role, a
  filter's "exact", form chips, how an agent connects). Base UI has
  ToggleGroup; nigari has no `ui/ToggleGroup`.
- **Picker options**: about 18 (tag and option colours, relation and person
  options, a select cell's options and Create, cover swatches, profile
  swatches, icon colours, tag suggestions).
- **Clickable cards**: about 6 (blueprint and template library cards, agent
  cards, note cards).
- **The rest, about 60, are part of something larger**: editor blocks
  (`bn-*`: table of contents, mermaid, callout, columns, embed title), board
  cards and their buttons, tree rows (sidebar chevrons, structure items,
  the index's rows), breadcrumbs, links styled as rows (search results,
  backlinks, file rows, page links), the update banner's close.
- **What guards it**: `check-tokens.mjs` counts the tags and fails above
  the budget and below it (until lowered); `web/tests/catalog.mjs` checks
  every `ui/` part has a catalogue section; `ui/README.md` says which part
  for what. Spec 001 FR-016 set the order: dialogs, menus, **buttons**,
  form fields, toasts.
- **Wiki screenshots** list the source files they show
  (`wiki/screenshots.json`); every screen touched makes its shots stale,
  and their retake is the before/after the issue asks for.

## Clarifications

### Session 2026-11-17

- Q1: [NEEDS CLARIFICATION: How strict is "keeping the look"? A: the same
  look, measured: every retaken wiki screenshot compared with the one
  before, and any visible difference named in the pull request
  (recommended); B: pixel-identical, a difference blocks the merge; C: the
  design system's look wins where they differ, as long as nothing looks
  broken.]
- Q2: [NEEDS CLARIFICATION: How is the work cut into pull requests? A: by
  kind of part: first text and icon buttons everywhere (no new part), then
  Tabs and ToggleGroup, then Option and CardButton, then the leftovers
  (recommended: each PR reviews one kind of change); B: screen by screen,
  as the issue said (settings and dialogs first, then the big screens),
  each PR touching every kind on its screens.]
- Q3: [NEEDS CLARIFICATION: How are the buttons that stay hand-built
  marked? A: a marker on each, `button-ok: <reason>`, that
  `check-tokens.mjs` requires, so a new raw button without a reason fails
  and the budget can reach the marked ones only (recommended; a change to
  a check, so the owner's call); B: a comment only, the budget alone
  guards the number, as the issue said.]

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nothing looks different (Priority: P1)

A person using nigari after each pull request sees the same buttons, in
the same places, with the same look in light and dark, at desktop and
phone width.

**Why this priority**: the owner's condition for the whole change.

**Independent Test**: retake the wiki screenshots of every screen a pull
request touches and compare them with the ones before.

**Acceptance Scenarios**:

1. **Given** a screen with text buttons, **When** they move to the shared
   button, **Then** size, colour, border and spacing are as before (per Q1).
2. **Given** dark mode, **When** the same screen is shown, **Then** the
   same holds.

---

### User Story 2 - Every button has a name and a keyboard path (Priority: P1)

A person on a keyboard or a screen reader can reach and name every button:
an icon-only button has a name (also shown as a tooltip), a row of tabs
moves with the arrow keys, a choice of one shows which one is chosen.

**Why this priority**: the issue's reason ("a missing keyboard path, or a
missing label") and the design system's promise.

**Independent Test**: the browser tests of the touched screens, plus the
catalogue's checks of each new part.

**Acceptance Scenarios**:

1. **Given** an icon-only button, **When** it is focused, **Then** a
   screen reader reads its name and a tooltip shows it.
2. **Given** a row of tabs, **When** focus is on one, **Then** the arrow
   keys move between them and the chosen one is marked selected.
3. **Given** a choice of one (theme, role), **When** read by a screen
   reader, **Then** the chosen option is announced as pressed or checked.

---

### User Story 3 - The count stays down (Priority: P2)

Whoever writes the next feature cannot add a hand-built button without
noticing: the budget only goes down, and (per Q3) a button that must stay
hand-built says why.

**Independent Test**: `check-tokens.mjs` fails on one more raw button.

---

### Edge Cases

- A button inside an editor block (BlockNote): stays hand-built; the
  editor's own styles and events drive it.
- A button that is also a drag handle or a whole row (tree rows, board
  cards): stays; the row is the component.
- A button whose look comes from a parent's rule (`.toolbar .btn-sm`):
  the rule is carried over to the shared part's class, or the difference
  is named (Q1).
- A button inside a form (`type="submit"`): the shared button keeps the
  type it is given.
- A button the browser tests find by its class: the test moves to the
  role and name.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every text button (`btn`, `btn-sm`, primary, danger) MUST be
  a `ui/Button`, every icon-only button a `ui/IconButton` with a name.
- **FR-002**: Rows of tabs MUST be a new `ui/Tabs` (arrow keys, selected
  state), styled from today's tabs.
- **FR-003**: A choice of one among a few MUST be a new `ui/ToggleGroup`
  (pressed state announced), styled from today's pill rows.
- **FR-004**: Picker options (colours, relation and person options, a
  select's options) MUST be a new `ui/Option`; clickable cards a new
  `ui/CardButton`.
- **FR-005**: Each new part MUST have a `ui/README.md` entry and a
  catalogue section, light and dark.
- **FR-006**: A button that stays hand-built MUST say why (per Q3).
- **FR-007**: The look MUST be kept (per Q1); each pull request MUST show
  the before and after of every screen it touches, light and dark.
- **FR-008**: `rawButtons` in `web/tokens/budgets.json` MUST be lowered to
  the measured count in every pull request.
- **FR-009**: Nothing a button does MUST change: its action, its keyboard
  shortcut, its disabled state, its place in the tab order.

### Key Entities

None: no data changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The raw-button count falls from 257 to about 60 or fewer,
  each remaining one marked (Q3).
- **SC-002**: No retaken wiki screenshot shows a difference the pull
  request does not name (Q1).
- **SC-003**: Every icon-only button has an accessible name (checked by the
  catalogue and the browser tests of the touched screens).
- **SC-004**: The browser tests and the gate pass after every pull request.

## Assumptions

- No new dependency: Base UI's Tabs and ToggleGroup come with the package
  already in use.
- Agent parity is not touched: buttons are interface only; nothing an
  agent does changes.
- Translations change only where a button gains a name it lacked (an
  icon-only button); those names go to de, es and nl.
- The counts by kind are from a census on 2026-11-17 and move a little as
  other work lands; the plan re-counts.
