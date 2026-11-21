---

description: "Tasks for dragging a block into columns, in two pull requests"
---

# Tasks: Dragging a block makes columns, and shows where it lands

**Input**: `specs/021-drag-columns/` (spec.md Q1–Q3 and the layout bar, plan.md, research.md R1–R6)

**Tests**: required.
- `check-droptarget.mjs` (new): every target kind, Q1, FR-010.
- `check-columnwidths.mjs`: the Q3 rule with the spec's examples and the 15% floor.
- Go: `columns_test.go` and the Markdown import tests for 4 columns.
- Playwright `block-drop.mjs` (new): SC-001, SC-002, SC-005, the opening and its reverse, Q2, reduced motion, a WebKit run.
- Every new test is mutation-checked (it fails with its fix taken out).

**Issues**: parent #830 (part of epic #812); tasks T001–T029 are #831–#859

**Delivery**: two pull requests, each from its own branch off `main`.
- PR 1: the landing spot (US1) and the layout presets in the block menu (US4).
- PR 2: sideways columns, the opening, 4 columns (US2, US3). Start after PR 1 merges: both touch `blocks.tsx`, `styles.css` and `block-drop.mjs`.

**CodeGraph** (before writing these tasks; `codegraph status`: up to date):

- **`ColumnsBlock`**: no graph callers. BlockNote renders it from `columnsSpec`, so its inventory is `blocks.tsx` alone.
- **`holdSideMenuWhileHovered`**: one caller, `BlockContent` in `Editor.tsx:1650`. `blockDrop.ts` is installed beside it (T005).
- **`moveDivider`**: two callers in `ColumnsBlock` (`at`, `onKey`). **`equalWidths`**: `formatWidths` and `ColumnsBlock`. `insertColumnWidths` and `removeColumnWidths` join them in `columnWidths.ts` (T013).
- **`columnsFromSections`**: one caller, `mdLinesToBlocks` (`mdimport.go:193`), which is `write_content`'s path. **`renderPublicBlock`**: one caller, `renderPublicBlocks`.
- **CSS and the Playwright specs are not indexed**: `data-count`, `.bn-columns` and `.bn-columns-bar` come from text search. The specs that touch columns today are `block-handle.mjs` and `column-enter.mjs`.

## Format: `[ID] [P?] [Story] [surface] Description`

---

## PR 1: The line shows where the block lands, and the layouts move to the block menu

### Phase 1: Foundational (the landing decision)

- [x] T001 [ui] `web/src/dropTarget.ts` (new): a pure function from the pointer and the block boxes under it to a target, `between` (a block and above or below) or `newColumn` (a columns block or an ordinary block, and an edge). One target per gap (R2). In PR 1 it returns only `between`; the `newColumn` branch comes in T010
- [x] T002 [P] [test] `web/scripts/check-droptarget.mjs` (new), in `npm run check`: the `between` cases of US1 (the upper and lower half of a column's first and last line, after the columns block, the gap between two plain blocks giving one target). Mutation-check it

**Checkpoint**: the decision exists and is checked; nothing in the editor uses it yet.

### Phase 2: User Story 1, dropping between lines lands where the line shows (P1) 🎯 MVP

**Goal**: one steady line, and the block lands on it (FR-001 to FR-003, #809, #824).

**Independent Test**: drag a block to every kind of spot and compare the line with where the block landed.

- [x] T003 [US1] [ui] `web/src/blockDrop.ts` (new): draws the line from the target and handles the drop, moving the dragged block to the same target (R1). As built: BlockNote's line is switched off for a block drag through `computeDropPosition` and nigari draws its own, and the drop is taken in a capture listener rather than ProseMirror's `handleDrop` (why: `docs/decisions.md`, 2026-11-21)
- [x] T004 [US1] [ui] Cache the block boxes when a drag starts and on scroll, not per pointer step (SC-003)
- [x] T005 [US1] [ui] `web/src/components/Editor.tsx`: one line installing `blockDrop.ts`, next to `holdSideMenuWhileHovered` in `BlockContent` (no behaviour inline in `Editor.tsx`)
- [x] T006 [US1] [test] `web/tests/block-drop.mjs` (new), in the test script: a test page with plain blocks and a 3-column layout; SC-001 (every spot lands where the line showed) and SC-002 (no count change without the vertical line); also run in WebKit. Mutation-check it (remove the `handleDrop`)
- [x] T007 [US1] [perf] Measure a drag step with the #810 probe on a 300-block page, in Chromium and WebKit, before and after; under 4 ms (SC-003). The numbers go in the PR

### Phase 3: User Story 4, the layout presets move into the block menu (P2)

**Goal**: a columns block takes no extra line, and its layouts are in the block menu (FR-012, R6). First built as a floating bar; the owner then asked to remove it and put the layouts in the block menu (2026-11-21).

**Independent Test**: the gap between a paragraph and a columns block equals the gap between two paragraphs; a line in a layout offers "Column layout" in its block menu.

- [x] T008 [P] [US4] [ui] `web/src/styles.css`: `.bn-columns` takes no height and the bar is removed. As changed by the owner: the presets are a "Column layout" submenu of the block menu (`slashIcons.tsx`), shown for every block inside a layout and acting on the nearest layout (`columnLayout.ts`), with its own icon (`menuIcons.ts`). Light and dark; no new literal (`check-tokens.mjs`)
- [x] T009 [US4] [test] `block-drop.mjs`: SC-005 (the paragraph-to-columns gap equals paragraph-to-paragraph, measured; nothing drawn over the line above); the block menu of a line in a layout offers the five layouts and picking one changes the layout; a plain block's menu does not offer it. Mutation-check it

### Phase 4: PR 1 polish

- [x] T010 [wiki] `wiki/editor-blocks.md`: the "Not right yet" note from PR #827 goes; the layouts are in the block menu. Retake the screenshots that list the touched files and look at each
- [x] T011 [test] Reviews: `/code-review` (a fresh review agent writing to a scratchpad file), `ux-ui-audit` light and dark, desktop and phone; `codegraph sync`, then `codegraph callers` on every exported symbol added. `docs/decisions.md` entry. `scripts/agent-gate.sh` green

**Checkpoint**: PR 1 can ship on its own.

---

## PR 2: Dragging sideways makes a column (start after PR 1 merges)

### Phase 5: Foundational (widths and four columns)

- [ ] T012 [ui] `dropTarget.ts`: the `newColumn` branch. A column's left or right edge in a row of 2, only the far right edge in a row of 3, none in a row of 4 (Q1); an ordinary top-level block's edges (Q2); no sideways target inside a list or a nested block, on a block's own column, or where columns stack (FR-010)
- [ ] T013 [P] [ui] `web/src/columnWidths.ts`: `insertColumnWidths(widths, at)` (R4: the largest group of equal columns, within 1%, splits its room with the new column; others keep theirs; no two equal shrinks all in proportion; the 15% floor `MIN_PCT`; whole percent summing to 100) and `removeColumnWidths(widths, at)` (its room goes to its neighbours in proportion)
- [ ] T014 [P] [test] `check-droptarget.mjs`: the `newColumn` cases, Q1 and FR-010. `check-columnwidths.mjs`: 40/30/30 → 40/20/20/20, 50/50 → 33/33/34, 50/30/20 in proportion, the floor, removal. Mutation-check both
- [ ] T015 [P] [backend] Four columns in every server reader: `renderPublicBlock` (`server/public_blocks.go`), the print view in `renderBlockHTML` (`server/export_html.go`) and its CSS; `server/columns_test.go` with 4 columns in print, public and the Markdown round trip
- [ ] T016 [P] [mcp] `columnsFromSections` (`server/mdimport.go`) keeps up to 4 sections and folds from the 5th; the `write_content` spelling text says up to four; tests for 4 kept and a 5th folded. `wiki/mcp-tools.md`: columns up to 4

**Checkpoint**: 4 columns read and write everywhere; the drag can now make them.

### Phase 6: User Story 2, dragging sideways opens a new column (P1)

**Goal**: a vertical line at a column's edge, the columns slide apart, moving away slides them back, and a drop makes the column (FR-004 to FR-008).

**Independent Test**: drag to each edge of a 2-column layout, watch the line and the opening, move away, drop, check the saved document.

- [ ] T017 [US2] [ui] `blocks.tsx` `ColumnsBlock`: `count` from 2 to 4 (was `count === 3 ? 3 : 2`); a "4 equal" preset in `PRESETS` (the block menu's layout submenu); editor CSS for `data-count='4'`
- [ ] T018 [US2] [ui] The vertical line at the target edge in `--color-focus` and `--editor-drop-line-width`, through `computeDropPosition`'s vertical positions
- [ ] T019 [US2] [ui] The opening (R3): while a `newColumn` target is active, `ColumnsBlock`'s own `<style>` adds an empty track where the new column goes, with a transition on `--motion-duration-base` and `--motion-easing-out`; none under `prefers-reduced-motion` (FR-007). The style changes only when the target changes (SC-003)
- [ ] T020 [US2] [ui] `blockDrop.ts`: a drop on a `newColumn` target inserts the block as a new column at that place, raises `count` by one and sets the widths with `insertColumnWidths`, in one document change
- [ ] T021 [US2] [ui] FR-008: a column left empty after a drag goes, with `removeColumnWidths`; a layout left with one column turns back into plain blocks
- [ ] T022 [P] [US2] [i18n] The screen-reader announcement when a new column will be made, and the "4 equal" preset label: `t()` with de, es and nl
- [ ] T023 [US2] [test] `block-drop.mjs`: the opening and its reverse, a drop making a column with the Q3 widths, the 3-column far-right case, an emptied middle column going, reduced motion, phone width offering no vertical line; WebKit run. Mutation-check it

### Phase 7: User Story 3, a sideways drop beside an ordinary block (P2)

**Goal**: two ordinary blocks go side by side as a new 2-column layout (Q2).

**Independent Test**: drop a paragraph at another's right edge; the saved document holds a columns block of two, in that order.

- [ ] T024 [US3] [ui] `blockDrop.ts`: a drop at an ordinary top-level block's edge wraps the two in a new columns block of two equal columns, the dropped block left or right by edge; the vertical line only, no opening (R3)
- [ ] T025 [US3] [test] `block-drop.mjs`: the left and right edge cases, and no line inside a list or a nested block. Mutation-check it

### Phase 8: PR 2 polish, release and Umbrel

- [ ] T026 [wiki] `wiki/editor-blocks.md`: dragging (the two lines, sideways columns, up to 4, the widths rule). Retake the screenshots that list the touched files and look at each
- [ ] T027 [perf] SC-003 again with the opening on: the #810 probe, Chromium and WebKit, under 4 ms per step
- [ ] T028 [test] Reviews: `/code-review` (fresh agent), `ux-ui-audit` light and dark, desktop and phone; `codegraph sync`, then `codegraph callers` on every exported symbol added or moved. `docs/decisions.md` entry. The PR says a page with 4 columns shows as 2 in an older version (release notes). `scripts/agent-gate.sh` green
- [ ] T029 [backend] After PR 2 merges (owner, 2026-11-21: "after this big change to update the nigari umbrel version"): check the release and its `umbrel-store` job, which opens the store pull request on `neatlittlemacapps/yokogaki-umbrel` (rule 32), and give the owner its link to merge; then confirm the Umbrel runs the new version. Nigari's own `umbrel/` pin stays as it is (rule 32)

---

## Dependencies

- T001 → T002, T003. T003 → T004, T005 → T006, T007.
- US4 (T008, T009) needs nothing from US1 and can run beside it.
- PR 2 starts after PR 1 merges.
- T012, T013 → T014. T015 and T016 are independent of the editor work.
- T017 → T018, T019 → T020 → T021 → T023. US3 (T024) needs T012 and T020.
- T029 comes last, after PR 2's release.

## Parallel work

- PR 1: T002 beside T003; T008 (CSS) beside T003–T005 (drop logic). A Sonnet helper can take T010's screenshots.
- PR 2: T013, T015 and T016 are in separate files (`columnWidths.ts`, `server/public_blocks.go` + `export_html.go`, `server/mdimport.go`). A Sonnet helper can do T015/T016 and T022's translations; review its diff.

## Implementation strategy

- **MVP**: PR 1. Dragging becomes predictable (US1) and a columns block no longer takes a line for its layout bar, whose layouts move to the block menu (US4), before anything new is added.
- **Then** PR 2: the sideways gesture (US2) with 4 columns everywhere, and Notion-style side by side (US3).
