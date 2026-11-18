# Feature Specification: One button, with properties, from tokens

**Feature Branch**: `claude/spec-020-buttons` (spec and plan; each build pull request gets its own branch)

**Created**: 2026-11-17 · **Rewritten**: 2026-11-18, to the owner's button model

**Status**: Draft

**Issues**: #379

**Input**: The owner's issue #379 (2026-11-02): bring the hand-built
buttons (`check-tokens.mjs` `rawButtons`) into the design system's parts.
The owner widened it on 2026-11-17, while it was being specified: not
"keep today's look" but **one button, defined by properties, every value a
token**, the way shadcn names its button. That work was split in two: the
colour roles came first (spec 019, merged in #762), and this spec builds
the button on them.

## Context

What the code says today (2026-11-18, `main` at c74557a):

- **`ui/Button`** has four looks: `primary` (the ink pill, fully rounded,
  bold), `secondary` (a hairline, the default), `ghost` (no frame), and
  `danger` (red text, red frame on hover). It has two sizes, and paddings
  written as pixels (`7px 14px`, `5px 11px`). Its radius is `lg`, but
  `sm` for the small size and `full` for primary: **three corner shapes**.
  Height comes from padding and line height, so text sits where the
  font's line box puts it.
- **`ui/IconButton`** is a separate part: a frameless square with a
  required name, shown as a tooltip.
- **Callers today**: `Button` 20, `IconButton` 14 (code graph). 257
  hand-built `<button>`s remain (`check-tokens.mjs`).
- **Colour roles exist now** (spec 019): `primary`, `primary-hover`,
  `primary-pressed`, `primary-subtle`, `on-primary`, the same five for
  `destructive`, and the neutral roles (`text`, `border`, `hover`,
  `active`, `pill`).
- **Tabs** (about 10, e.g. the admin page, the icon picker,
  template categories) and **choose-one rows** (about 10, e.g. the theme
  switch, a member's role) are hand-built; Base UI has Tabs and
  ToggleGroup, nigari has neither part.

## Clarifications

### Session 2026-11-17 (owner, while specifying #379)

- **One `Button`, four properties.** shadcn's model is the reference for
  the names (shadcn/ui itself stays rejected).
  - **Emphasis**:
    - **high**: filled.
    - **medium**: an outline.
    - **low**: a background on hover only.
    - **link**: text only.
  - **Tone**: neutral, primary (the accent) or destructive.
  - **Size**: sm or md. An icon-only button is a square of that size.
  - **Icon**: none, icon and label, or icon only.

  A button can also be **pressed** (a toggle that stays on).
- **One corner radius** for every button: no pill next to rounded.
- **Every value from a token**: height, padding, border width, radius,
  font weight, colours.
- **Text optically centred**: fixed heights from tokens and `text-box-trim`.
  It is checked in the real app with its own fonts, not in a preview page.
  The owner saw misaligned text in a preview that never loaded the app's
  fonts.
- **Tabs** get their own part (`ui/Tabs`), built on the button's look.
  Choose-one rows become a **`ToggleGroup`**.
- So the look **changes on purpose**. The old aim, "keep today's look"
  (#379's first wording), is replaced. Every changed screen is shown before
  and after.

### Open (to be asked)

- Q1: [NEEDS CLARIFICATION: What does a destructive button look like at
  rest? **A**, a red outline, medium emphasis (recommended: it reads as
  "careful" before the pointer reaches it, and it is the same as every other
  outline button, only red). **B**, today's look: neutral at rest, red
  text, red frame on hover.]
- Q2: [NEEDS CLARIFICATION: What does the chosen item of a ToggleGroup
  (and a pressed button) look like? **A**, a quiet tint: `primary-subtle`
  behind `primary` text (recommended: the choice is visible without
  shouting, and the one filled button on a screen stays the main action).
  **B**, today's solid pink (`primary` filled, `on-primary` text).]
- Q3 (owner, 2026-11-18, "1"): **by part**. (1) The new `Button` and its
  tokens, with today's `Button` and `IconButton` callers moved. (2) The
  hand-built text and icon buttons everywhere. (3) `Tabs` and `ToggleGroup`.
  (4) The rest. Each PR reviews one kind of change. Turned down: screen by
  screen.
- Q4: [NEEDS CLARIFICATION: How is a button that stays hand-built marked?
  **A**, a marker on the line, `button-ok: <reason>`, that
  `check-tokens.mjs` requires (recommended: a new raw button without a
  reason fails, and the budget can only reach the marked ones; it is a
  change to a check, so the owner's call). **B**, a comment only, and the
  budget alone guards the number.]

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every button is one part, set by its properties (Priority: P1)

Whoever builds a screen picks a button by what it is (how much emphasis, which tone,
what size, whether it has an icon), not by a class combination. Two
buttons with the same properties look the same everywhere, in light and
dark.

**Why this priority**: the owner's model, and what ends the drift the
issue describes.

**Independent Test**: the catalogue shows every combination of emphasis
× tone × size × icon, plus pressed, disabled and focus, in light and dark.
The browser test checks that each has its tokens' values.

**Acceptance Scenarios**:

1. **Given** two buttons with the same properties on two screens, **When**
   their computed styles are compared, **Then** height, padding, radius,
   border, font weight and colours are equal.
2. **Given** any button, **When** its corners are measured, **Then** the
   radius is the one button radius token.
3. **Given** a token changed (e.g. the button radius), **When** the tokens
   are built, **Then** every button follows, with no stylesheet edit.

---

### User Story 2 - The label sits in the middle (Priority: P1)

The text of every button is optically centred, top to bottom, in the app's
own fonts (the brand mono and Inter), at both sizes.

**Why this priority**: the owner saw it fail in a preview. It is the most
visible sign of a button built carelessly.

**Independent Test**: in the running app with its fonts loaded, measure
each size's label ink. The space above the capitals and below the baseline
differs by at most 1 CSS px.

**Acceptance Scenarios**:

1. **Given** a medium and a small button in each font, **When** measured
   in the real app, **Then** the label is centred within 1px.
2. **Given** a browser without `text-box-trim`, **When** the same is
   measured, **Then** the label is still within 1px, or the plan names the
   browser and its offset.

---

### User Story 3 - Every button has a name and a keyboard path (Priority: P1)

A person on a keyboard or a screen reader can reach and name every button:
- **Icon-only buttons** have a name, also shown as a tooltip.
- **Tabs** move with the arrow keys.
- **Choose-one rows** announce the chosen option.
- **Pressed buttons** announce that they are pressed.

**Why this priority**: the issue's reason ("a missing keyboard path, or a
missing label").

**Independent Test**: axe and the keyboard checks of the catalogue, plus
the browser tests of the screens a pull request touches.

**Acceptance Scenarios**:

1. **Given** an icon-only button, **When** focused, **Then** a screen
   reader reads its name and a tooltip shows it.
2. **Given** a row of tabs, **When** focus is on one, **Then** the arrow
   keys move between them and the chosen tab is marked selected.
3. **Given** a choose-one row, **When** read by a screen reader, **Then**
   the chosen option is announced as pressed.

---

### User Story 4 - The count stays down (Priority: P2)

Whoever writes the next feature cannot add a hand-built button without
noticing: the budget only goes down, and (per Q4) a button that must stay
hand-built says why.

**Independent Test**: `check-tokens.mjs` fails on one more raw button.

---

### Edge Cases

- **Inside an editor block** (BlockNote's own controls, `bn-*`): stays
  hand-built. The editor's styles and events drive it.
- **A drag handle or a whole row** (tree rows, board cards): stays. The row
  is the component.
- **A look from a parent's rule** (`.toolbar .btn-sm`): the property that
  matches is chosen. Where none matches, the plan names it.
- **`type="submit"` in a form**: keeps its type.
- **Found by its class in a browser test**: the test moves to role and
  name.
- **A long label at phone width**: wraps or truncates as today, never
  grows the button's height.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `ui/Button` MUST take `emphasis` (high, medium, low, link),
  `tone` (neutral, primary, destructive), `size` (sm, md) and an icon
  (none, with a label, icon only), and MAY be `pressed`. An icon-only
  button MUST have a name, shown as a tooltip.
- **FR-002**: Every value of a button MUST come from a token:
  - height per size, horizontal padding per size, gap, border width,
    radius, font weight;
  - colours from spec 019's roles per emphasis × tone × state (rest,
    hover, pressed, disabled, focus).

  No pixel or colour literal is allowed in the button's CSS.
- **FR-003**: Every button MUST use the one button radius.
- **FR-004**: A label MUST be optically centred (US2): fixed height from
  tokens and `text-box-trim`, with a fallback for browsers without it.
- **FR-005**: The four looks of today's `Button` and `IconButton` MUST
  map onto the properties. The plan states the mapping (e.g. today's
  `primary` ink pill is high, neutral). Their callers move in the first
  pull request.
- **FR-006**: `ui/Tabs` (arrow keys, selected state) and `ui/ToggleGroup`
  (pressed state announced) MUST be built on the button's tokens.
- **FR-007**: Hand-built text and icon buttons, tabs and choose-one rows
  MUST move to these parts. A button that stays hand-built MUST say why
  (per Q4).
- **FR-008**: Each new or changed part MUST have a `ui/README.md` entry and
  a catalogue section, light and dark.
- **FR-009**: Each pull request MUST show before and after for every
  screen it changes, light and dark, desktop and phone. It MUST lower
  `rawButtons` in `web/tokens/budgets.json` to the measured count.
- **FR-010**: Nothing a button does MUST change: its action, shortcut,
  disabled state, or place in the tab order.

### Key Entities

None: no data changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One corner radius across all buttons (measured in the
  catalogue and on the touched screens).
- **SC-002**: No length or colour literal in the CSS of `ui/Button`,
  `ui/Tabs` and `ui/ToggleGroup` (`check-tokens.mjs` on `web/src/ui/`).
- **SC-003**: Labels centred within 1px at both sizes, in both fonts, in
  the real app (US2).
- **SC-004**: The raw-button count falls from 257 to the hand-built ones
  that must stay (about 60 by the census), each marked (Q4).
- **SC-005**: Every icon-only button has a name (axe in the catalogue and
  the touched screens' browser tests).

## Assumptions

- **No new dependency**: Base UI's Tabs and ToggleGroup come with the
  package already in use.
- **Agent parity is not touched**: buttons are interface only.
- **Translations** change only where a button gains a name it lacked; those
  names go to de, es and nl.
- **More tones** (success, warning) can be added later as roles (spec 019)
  and tones. This spec adds only the three the app uses.
- **The counts by kind** move as other work lands; the plan re-counts with
  the code graph and a census.
