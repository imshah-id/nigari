# Implementation Plan: One button, with properties, from tokens

**Branch**: `claude/spec-020-buttons` (spec and plan); each build pull request gets its own branch from `main` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md) | **Issue**: #379 · follow-up #763

**Input**: Feature specification from `/specs/020-buttons-into-ui/spec.md`

## Summary

`ui/Button` becomes the one button:
- **Properties**: `emphasis` (high, medium, low, link), `tone` (neutral,
  primary, destructive), `size` (sm, md), an icon (with a label, or icon
  only, which takes a required name and tooltip), and `pressed`.
- **Tokens**: its dimensions are component tokens and its colours spec
  019's roles.
- **Radius**: one corner radius for every button.
- **Labels**: centred by fixed height and `text-box-trim`.

`IconButton` folds into it. `ui/Tabs` and `ui/ToggleGroup` are built on its
tokens. Four pull requests, by part (Q3):

1. **The part**: the new `Button` and its tokens. Today's `Button` and
   `IconButton` callers move, and the catalogue shows every combination.
2. **Class-built buttons**: every hand-built `btn`, `btn-sm`, `icon-btn` …
   button moves to `Button`.
3. **Tabs and ToggleGroup**: the two new parts, and the tabs and
   choose-one rows move to them.
4. **The rest that can move**:
   - Every raw button that is a plain button moves to `Button`.
   - `check-tokens.mjs` requires `button-ok: <reason>` on a raw button it
     allows, and only the editor library's own controls carry it.
   - What is left waits for #763 (cards, tree rows, result rows as
     components).

## Technical Context

**Language/Version**: TypeScript 5, React 18; CSS custom properties from the token build

**Primary Dependencies**: Base UI (`@base-ui/react`): Button, Tooltip (already used), Tabs and ToggleGroup (in the same package, not yet used). Nothing new to install.

**Storage**: none.

**Testing**:
- The catalogue (`web/tests/catalog.mjs`: axe, keyboard, reference
  shots).
- A new browser check of the label's centring in the running app (R4).
- The browser tests of every screen a pull request touches, found by text
  search on the classes and labels it changes. `codegraph affected` does
  not link the Playwright specs.
- `check-tokens.mjs` for literals and `rawButtons`.

**Target Platform**: browsers and the Electron shell (Chromium)

**Constraints**:
- Ratchets only go down.
- No literal in `ui/` CSS.
- English source.
- The main bundle under its cap (`budgets.json` `bundleGzip`).

**Scale/Scope**: 4 PRs.
- PR 1: 34 `Button` call sites (16 files) and 8 `IconButton` call sites (6 files) outside `ui/`.
- PR 2: about 130 class-built buttons (the class on the tag or within three lines of it).
- PR 3: about 20 tabs and choose-one controls.
- PR 4: the rest, re-counted then.

## CodeGraph

`codegraph status`: up to date (2026-11-18, `main` c74557a).

- **`codegraph_explore "ui/Button ui/IconButton Button.css …"`**:
  - `Button` has four variants, two sizes and pixel paddings, with three
    corner shapes (`lg`, `sm` for small, `full` for primary).
  - `IconButton` imports `ButtonVariant` and `Button.css` and wraps Base
    UI's Tooltip.
  - `ButtonVariant` has 3 callers, all in `ui/`.
- **`codegraph callers Button`**: 20 callers. `IconButton`: 14 callers
  (`CommentsPanel`, `CommentItem`, `QuickFilters`, `PeekPanel`,
  `ViewSettingsMenu`, `BoardLaneHead` …).
- **Text search for call shapes** (props are not graph edges):
  - `Button` outside `ui/`: 34 call sites in 16 files. On the opening line, 21 are
    `size="sm"`; by variant, 13 `ghost`, 3 `primary`, 1 `secondary`, and
    the rest default (`secondary`). `CommentItem` (7) and `AdminSettings`
    (5) have the most.
  - `IconButton` outside `ui/`: 8 call sites in 6 files, 3 `sm`, 1 `danger`.
- **Text search for the hand-built kinds** (CSS classes are not indexed; counted on the tag's own line),
  for PR 2's inventory:

  | Class | Buttons |
  |---|---|
  | `btn-sm` | 42 |
  | `btn primary` | 29 |
  | `btn` | 24 |
  | `btn dialog-close` | 10 |
  | `btn-sm danger` | 5 |
  | `btn-sm primary` | 4 |
  | `btn danger` | 3 |
  | others (`form-submit`, `oauth-btn`, `split-btn-arrow` …) | 2 or fewer each |

  Plus `icon-btn` 7 and `menu-btn` 3.
- **Tabs**: `role="tab"` appears only in `TabBar.tsx` (the page tabs,
  which are not this kind: they are documents, with close buttons, and
  stay as they are). The tab rows that are hand-built buttons have no role
  today: `settings-tabs`, `icon-picker-tabs`, the template categories, the
  index's modes, and the login switch (R6).
- **`aria-pressed`** outside `ui/`: `blocks.tsx` 1, `ChartFigure` 1,
  `CommentItem` 2. They become `pressed` on `Button` where they are
  buttons.
- **Files with the most raw buttons**: `Editor.tsx` 29, `UserMenu` 27,
  `CollectionView` 21, `AdminSettings` 21, `Sidebar` 19,
  `PropertyValue` 18, `IconPicker` 11, `blocks.tsx` 8. Most of
  `Editor.tsx` and all of `blocks.tsx` are the editor library's controls
  (PR 4's marker).
- **Ratchet**: `rawButtons` budget 257 (`check-tokens.mjs --measure`).

## Decisions

### R1 — The properties and their mapping from today

Today's looks map onto the properties without a visual surprise except
the ones the owner chose:

| Today | New | Change |
|---|---|---|
| `Button variant="primary"` (ink pill) | high · neutral | the radius (R3) |
| `secondary` (hairline, default) | medium · neutral | height 32, not 34 (R2) |
| `ghost` | low · neutral | none beyond R2/R3 |
| `danger` | medium · destructive | **red outline at rest** (Q1) |
| `IconButton` (ghost) | icon-only · low · neutral | square of the size's height |
| `IconButton variant="danger"` | icon-only · low · destructive | |
| `btn`, `btn-sm` | medium · neutral, md / sm | |
| `btn primary`, `btn-sm primary` | high · neutral | |
| `btn danger`, `btn-sm danger` | medium · destructive | (Q1) |
| `btn dialog-close` (×) | icon-only · low · neutral | |

**Defaults** (Claude's, not the owner's):
- **Default properties**: medium, neutral, md. A plain `<Button>` is
  today's default hairline.
- **High · primary** (filled raspberry) and **link** exist for what comes
  next. Nothing moves onto them in this spec unless a screen already uses
  a raspberry fill or a text link as a button.

**API**: `<Button emphasis tone size icon pressed>` with children as the
label. `IconButton` is removed. `<Button icon={…} label="…" />` with no
children is icon-only. A type overload makes `label` required then. The
tooltip and `aria-label` come from `label`, as today.

**Turned down**:
- Keeping `variant` beside the new properties: two vocabularies for one
  thing.
- Keeping `IconButton` as its own part: it duplicated the button's states
  and size rules.

### R2 — Dimensions as component tokens

New group `button` in `component.tokens.json`. Every rule in `Button.css`
reads one of these or a role:

| Token | Value | Why |
|---|---|---|
| `button.height.md` | `{control.height}` (32px) | lines up with inputs, as `control.height` says; today's 34px did not |
| `button.height.sm` | 28px | today's small button is about 26px; 28 keeps it small and gives a better pointer target |
| `button.padding.x.md` | `{space.300}` (12px) | on the space scale; today 14px, off it |
| `button.padding.x.sm` | `{space.200}` (8px) | today 11px, off the scale |
| `button.gap` | `{space.150}` (6px) | today's gap |
| `button.radius` | `{radius.scale.md}` (6px) | **one radius** (R3) |
| `button.border.width` | 1px | today's hairline |
| `button.font.weight` | 500 | one weight for every emphasis; high stands out by its fill |
| `button.font.size.md` / `.sm` | `{font.size.sm}` / `{font.size.xs}` | today's |
| `button.icon.size.md` / `.sm` | 16px / 14px | today's icon sizes in toolbars |
| `button.disabled.opacity` | 0.5 | today's |

**Defaults** (Claude's, shown before and after in PR 1's catalogue and
screenshots, and changed with one token edit if the owner wants
otherwise):
- the 6px radius, a midpoint of today's 4, 8 and pill;
- 28px for small;
- weight 500.

### R3 — One radius

Every emphasis, size and the icon-only square use `button.radius`. The
ink pill loses its full rounding. That is the owner's rule, and the most
visible change on screens with a primary action. Tabs and the ToggleGroup's
items use it too. The ToggleGroup's frame uses the radius plus its 2px
inset, so the corners stay concentric.

### R4 — Centring the label

**Decision**:
- **Fixed height** from R2, no vertical padding.
- **Flex centring.**
- **`text-box: trim-both cap alphabetic`** on the label, so the box is the
  capital height and flex centres what the eye sees.

**Fallback**: where `text-box` is not supported, measured in PR 1,
- **Chromium and Safari**: Chrome and Edge 133+ and Safari 18.2+ have
  `text-box`. The Electron shell is Chromium.
- **Firefox**: had not shipped it when this plan was written. Re-check when
  PR 1 is built.

`@supports not (text-box: trim-both cap alphabetic)` then nudges the
label by a per-font offset token. Its value is measured in the running
app, in Chromium with `text-box` switched off, for the brand mono and
Inter. If the offset is under 1px, the fallback is just flex centring and
no token.

**The check** (SC-003): a browser test opens the catalogue served by the
built app, with its fonts loaded (`document.fonts.ready`). For each font ×
size it measures the label's ink box against the button's box: the
rendered capital top and baseline, from a canvas read of the button's
pixels. It fails above 1px.

**Turned down**: a preview page without the app's fonts. That is where
the owner saw it go wrong.

### R5 — Colours per emphasis × tone × state

Only spec 019's roles, through `data-emphasis`, `data-tone` and
`data-pressed` attributes:

| | rest | hover | pressed (`:active`) |
|---|---|---|---|
| high · neutral | `pill-default` / `pill-text` | `pill-hover` (+ today's glow and lift) | `pill-default` |
| high · primary | `primary` / `on-primary` | `primary-hover` | `primary-pressed` |
| high · destructive | `destructive` / `on-destructive` | `destructive-hover` | `destructive-pressed` |
| medium · neutral | frame `border-default`, text `text-default` | `hover` behind, frame `border-strong` | `active` behind |
| medium · primary | frame and text `primary` | `primary-subtle` behind | `primary-subtle` |
| medium · destructive | frame and text `destructive` (Q1) | `destructive-subtle` behind | `destructive-subtle` |
| low · neutral | text `text-default` | `hover` behind | `active` behind |
| low · primary / destructive | text in the tone | `*-subtle` behind | `*-subtle` |
| link · any | text in the tone, no frame, no height | underline | — |

- **`pressed` (a toggle that is on)**: `primary-subtle` behind `primary`
  text, whatever the tone (Q2).
- **Focus**: today's 2px `focus` ring.
- **Disabled**: the opacity token.

A contrast pair is added in the token build for each text role on its own
`*-subtle`, both themes. The build then refuses a palette swap that makes
a pressed label unreadable.

### R6 — Tabs and ToggleGroup

- **`ui/Tabs`**: Base UI Tabs, for a row of panels.
  - Each tab is low · neutral, size sm.
  - The selected tab is `pressed` (the tint), with `aria-selected` from
    Base UI.
  - The arrow keys move between tabs.
- **`ui/ToggleGroup`**: Base UI ToggleGroup, for choose-one rows. It has a
  hairline frame and items with the tint for the chosen one, which
  Base UI announces as pressed.
- **What moves in PR 3**:
  - **Tabs**: the settings dialog's tabs, the icon picker's
    Emoji/Icons/Upload, the template categories, the index's modes and the
    login switch.
  - **ToggleGroup**: the theme switch, a member's role, a filter's
    "exact", form chips and how an agent connects.
  - **Not moving**: a database's **view tabs**, because they are dragged
    and carry a menu. They are looked at there: they move if Base UI Tabs
    keeps the drag and the menu, else they go to #763 with the reason.

**Turned down**: an underlined tab bar (today's look on some screens). The
owner asked for tabs built on the button's look.

### R7 — What stays a raw button (PR 4)

- **Every raw button left after PR 3 is one of two kinds**:
  - **Part of something larger** (a card, a tree row, a result row):
    listed in #763 by file and line.
  - **The editor library's own control** (BlockNote: `blocks.tsx` and the
    `bn-*` controls in `Editor.tsx`): carries `button-ok: <reason>`.
- **The check**: `check-tokens.mjs` counts the marked ones separately and
  fails on a marker without a reason. Its test cases live in a self-test
  like spec 019's.
- **The budget**: `rawButtons` falls to the measured count of both kinds.

## Constitution Check

- **I. One binary, no services**: ✅ frontend only.
- **II. Agent parity**: ✅ buttons are interface. No route or tool.
- **III. Gates are one function**: ✅ N/A.
- **IV. Derive from code**:
  - ✅ The values are tokens.
  - ✅ The marker is enforced by a check.
  - ✅ Lean: no data-model, contracts or quickstart.
- **V. English source**: ✅ new strings (names for icon-only buttons that
  lacked one) go through `t()`, with de, es and nl.
- **VI. Every surface**: ✅ table below.
- **VII. Measured**:
  - ✅ The census and call sites above.
  - ✅ The centring is measured in the real app.
  - ✅ Before and after screenshots per PR.

Re-checked after design: unchanged.

## Surfaces

| Surface | Changes | Owner |
|---------|---------|-------|
| Domain logic and gates (`canRead`/`canWrite`, `credentialMayEnter`, validation, `audit`, `fireWebhook`) | No change: no server code | backend |
| Schema and queries | No change | backend |
| REST routes | No change | backend |
| MCP tools | No change: buttons are not an agent capability | mcp |
| Closed-to-agents list | No change | mcp |
| UI components | `ui/Button` rewritten, `ui/IconButton` removed, `ui/Tabs` and `ui/ToggleGroup` new. Every touched screen in light and dark, desktop and phone, keyboard path unchanged (FR-010) | ui |
| Translations | Names for icon-only buttons that had none, in de, es and nl; no other string changes | i18n |
| Server error codes | No change | i18n |
| Wiki | Screenshots of every touched screen retaken and compared; `wiki/` text that names a button's look ("the black button") checked by text search in each PR | wiki |
| Tests | Catalogue: every combination, axe, keyboard; the centring check (R4); `check-tokens.mjs` self-test for the marker (R7); browser tests of touched screens moved from class to role and name where they find a button by class | test |
| Performance | No change at runtime. The main bundle checked per PR (Base UI Tabs and ToggleGroup load with the screens that use them) | perf |
| Manifest | No change | mcp |
| Design system | The button tokens (R2); `Button.css` with no literal; README and catalogue sections for Button, Tabs, ToggleGroup; `rawButtons` lowered every PR; a contrast pair per pressed label (R5); the registry entry gains the button rule (New concepts) | ui |
| Storage budgets | No change | perf |
| Page containers | No change: a button looks the same in a full page, side peek and centre peek; the touched screens' peeks are in the before/after | ui |
| Aggregation | No change | backend |
| Stored data | No change | backend |
| Outside names | The CSS classes `btn`, `btn-sm`, `icon-btn` stay defined while any raw button uses them, removed in the PR that moves the last; no stored or external name | ui |
| Menu icons | No change: menus are `ui/Menu`; an icon in a button is not a menu item | ui |
| View lock | No change | backend |
| Cross-origin requests | No change | backend |
| Embedded views | No change: an embed's toolbar buttons move with the database's (same component) | ui |
| Content actions | No change: the action lists are unchanged, only the buttons that show them | ui |

**New concepts**: the button rule, added to the registry's Design system
entry in PR 1: "a button is `ui/Button` set by emphasis, tone, size, icon
and pressed; a new look is a new property value with its tokens, never a
class; a raw `<button>` needs `button-ok: <reason>` (editor library only)."

**Parity statement**: No agent capability: buttons are how a person acts
in the interface; the actions behind them are unchanged on both doors.

## Project Structure

```text
specs/020-buttons-into-ui/
├── spec.md
├── plan.md        # this file
├── checklists/requirements.md
└── tasks.md       # /speckit-tasks
```

## Complexity Tracking

No violations.
