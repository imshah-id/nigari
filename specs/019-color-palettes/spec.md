# Feature Specification: Colour palettes by role, each generated from one OKLCH base

**Feature Branch**: `claude/spec-019-palettes` (spec only; the build gets its own branch)

**Created**: 2026-11-17

**Status**: Draft

**Issues**: #379 (the button work that needs it; spec 020 follows)

**Input**: Owner, 2026-11-17, while specifying the buttons of #379:

> "Ensure we have proper token structure for colors (use Oklch base color of
> 500 and generate needed palette colors by changing the relative change in
> lightness)." / "Raspberry would be primary then. I don't want you to use
> color names but create palettes and reference the semantic colors to such
> a palette. So in this case raspberry would be referenced by primary and
> burnt orange thus the destructive one. But I should be able to swap these
> out easily later."

## Context

How colour is stated today, from the token files, `build-tokens.mjs` and
the generated `web/src/tokens.css` (2026-11-17):

- **Three tiers** (spec 001): `primitives.tokens.json` (raw values),
  `semantic.tokens.json` (roles, a light value and a dark one),
  `component.tokens.json`. `build-tokens.mjs` writes `tokens.css` and
  checks aliases, types and the contrast of every text colour that names
  its surfaces (WCAG, both themes). It already reads OKLCH.
- **The primitives are a small set named by colour, in sRGB**, not scales:
  `paper` (0, 50, 100), `ink` (500, 800, 900), `night` (850, 900, 950),
  `mist` (50, 100, 500), `pink` (400–700), `orange` (400, 700), and six
  `rainbow` hues for the brand gradient.
- **The semantic roles** point at them: surfaces (`paper`/`night`), text
  (`ink`/`mist`), the accent (`pink.700` light, `pink.400` dark), danger
  (`orange.700` / `orange.400`), the ink pill. Hover, active and borders
  are raw hex with transparency (today's text colour at a few percent).
- **The colours as OKLCH** (measured):
  - accent: light `#b3123f` = L 0.494, C 0.189, H 14.3; dark `#ff5c80` =
    L 0.698, C 0.198, H 10.6;
  - danger: light `#c2410c` = L 0.553, C 0.174, H 38.4; dark `#ff7a59` =
    L 0.729, C 0.170, H 35.1;
  - the neutrals are warm in light (`ink`, `paper`: H ≈ 90, C ≤ 0.01) and
    cool in dark (`night`, `mist`: H ≈ 286, C ≤ 0.01).

  So accent and danger are each one hue at two lightnesses: one palette
  each can carry both themes. The neutrals are two hues.
- **Chart colours** (`color.chart.*`, spec 004) are already generated in
  OKLCH at the lightness that passes 3:1, as twelve series and families
  named by colour (`blue`, `yellow`, …) because a person picks them by
  name (a select option's colour).

## Clarifications

### Session 2026-11-17

- Primary is the raspberry of today's accent; destructive is the burnt
  orange of today's danger (owner).
- Palettes are named by role, never by colour; semantic tokens reference a
  palette's steps; swapping a palette's base swaps the role everywhere
  (owner).
- Q1: [NEEDS CLARIFICATION: One neutral palette for both themes? A: one
  neutral, warm (today's light hue), so dark mode turns very slightly warm
  (chroma under 0.01, barely visible) (recommended); B: one neutral, cool
  (light mode turns very slightly cool); C: keep both hues, as two neutral
  palettes (`neutral` and a second one for dark), which keeps the look
  exactly but gives the neutral role two bases.]
- Q2: [NEEDS CLARIFICATION: Chart and option colours (series 1–12, the
  colour families a person picks by name) are data colours, not interface
  roles. A: leave them out of this spec, as they are (recommended); B:
  bring them into palettes too.]
- Q3: [NEEDS CLARIFICATION: A generated step will not hit today's dark
  accent and danger exactly. A: use the nearest step and show the
  before/after (recommended: the palette stays one base); B: allow a
  per-step override where it must match.]

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Swap a role's colour in one place (Priority: P1)

The owner decides primary should be another colour. They change the
primary palette's one base value; every primary step, in both themes,
follows, and the build says if any text no longer reaches its contrast.

**Independent Test**: change the primary base in the token file, build,
and see every use of the accent change; a base too light fails the
contrast check.

**Acceptance Scenarios**:

1. **Given** the primary palette's base, **When** it is changed and the
   tokens are built, **Then** every step 50–950 of primary changes and
   nothing else.
2. **Given** a base whose steps no longer give a text colour its contrast,
   **When** the tokens are built, **Then** the build fails naming the token
   and the ratio.

---

### User Story 2 - Nothing looks different (Priority: P1)

After the change, nigari looks as it did, in light and dark (within Q1 and
Q3).

**Independent Test**: retake the wiki screenshots; compare.

---

### User Story 3 - Components name roles, not colours (Priority: P2)

Whoever builds a component (spec 020's button first) uses semantic tokens
(primary, destructive, neutral roles) and never a palette step or a hex.

**Independent Test**: a check refuses a palette step or a colour value used
outside the token files.

---

### Edge Cases

- A step outside the sRGB gamut (bright, saturated steps): its chroma is
  reduced until it fits, hue and lightness kept.
- Transparent colours (hover, borders): a palette step with an alpha, still
  named by role.
- The brand gradient (`rainbow`): decorative, not a role; renamed so no
  token carries a colour name, its values unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The primitives MUST hold palettes named by role: `primary`,
  `destructive`, `neutral` (Q1), each defined by one OKLCH base at step 500.
- **FR-002**: Steps 50, 100, 200 … 900, 950 MUST be generated from the base
  by a relative change in lightness: lighter steps move a set fraction of
  the way from the base's lightness to white, darker steps a set fraction
  of the way to black; hue stays; chroma follows and is reduced only to
  stay in gamut. One table of fractions serves every palette.
- **FR-003**: Every semantic colour MUST reference a palette step (with an
  alpha where it is translucent), in both themes; no hex in the semantic
  tier.
- **FR-004**: No token name MUST carry a colour name (`pink`, `orange`,
  `ink`, `paper`, `night`, `mist`, `rainbow`), outside the chart and
  option colours (Q2).
- **FR-005**: Changing a palette's base MUST be the only edit needed to
  swap that role's colour; the contrast check MUST run on the result.
- **FR-006**: The generated `tokens.css` MUST keep every name the
  stylesheets read today (`--color-accent-default`, `--bg`, …), so the
  app changes look only where Q1 and Q3 allow.
- **FR-007**: A check MUST refuse a palette step or a colour literal used
  in components (budgets go down only, as `check-tokens.mjs` does today).
- **FR-008**: The token README (or the token files' descriptions) MUST say
  how to swap a palette and how the steps are generated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Swapping primary to another hue is a one-line change, and the
  build passes or names what fails.
- **SC-002**: Light mode's accent and danger are exactly today's (each is
  its palette's 500); the other differences are the ones Q1 and Q3 accept,
  shown before and after.
- **SC-003**: No token name in the primitive or semantic tiers is a colour
  name (outside Q2).

## Assumptions

- No new dependency: the build already converts OKLCH.
- More roles (success, warning, info) can be added later as one base each;
  this spec adds only the roles the app uses today.
- The button (spec 020) is built on these roles and follows this spec.
