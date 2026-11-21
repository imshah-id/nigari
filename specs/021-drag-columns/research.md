# Research: spec 021

## R1: One decision for the line and the drop

**Decision**: `dropTarget.ts` decides the target from the pointer and the boxes of the blocks under it.
- BlockNote's drop line gets the decision through its `computeDropPosition` hook.
- The drop gets it through a ProseMirror `handleDrop` that moves the dragged block there and returns true, so ProseMirror's own `dropPoint` never runs for a block drag.

**Why**: today the line comes from `posAtCoords` + `dropPoint`, and the drop from ProseMirror's drop handling. The two disagree in columns, which is #809 and #824. A shared decision is the only way to keep them in step.

**Turned down**:
- Correcting only the line (the drop stays wrong).
- Correcting only the drop (the line stays wrong).
- Bringing back `xl-multi-column`, which has its own drop handling (still rejected: licence, `columnsSpec`).

## R2: One spot per gap

**Decision**: a gap between two blocks has one target, "before the lower block", wherever the pointer sits in that gap or in the halves either side of it. The pointer's half of a line decides above or below.

**Why**: the measured twitch (#812: 419/422, 443/452, 593/601/602) is two targets with one meaning, "end of the block's children" and "after the block". Mapping both to one removes it.

**Turned down**: debouncing the line. That hides the twitch and leaves the line late.

## R3: The opening without touching editor DOM

**Decision**: while a new-column target is active, `ColumnsBlock` widens the grid with an empty track where the new column will go. It does this through the `<style>` element it already renders. The track animates with a CSS transition on the grid (`--motion-duration-base`, `--motion-easing-out`). Under `prefers-reduced-motion` there is no transition.

For Story 3, two ordinary blocks: a vertical line only, no opening. There are no columns yet to slide.

**Why**: `ColumnsBlock`'s own comment records that writing attributes onto DOM inside the editor makes ProseMirror re-render. Its `<style>` is the safe path, and grid tracks animate in current browsers (Chromium, Safari 18+, Firefox).

**Turned down**:
- A transform on each column, which needs per-column DOM writes.
- A preview column inserted into the document, which would be a real edit undone on every move.

## R4: Widths after a new column (Q3)

**Decision**: `insertColumnWidths(widths, at)` in `columnWidths.ts`:
- **Equal columns:** the largest group of columns with the same width (within 1%) gives up its room, split equally between the group and the new column. The others keep their widths.
  - 40/30/30 + new at the end → 40/20/20/20.
  - 50/50 + new → 33/33/34.
- **No two equal:** every column shrinks in proportion.
- **Floor:** if a column would drop under 15% (`MIN_PCT`), every column shrinks in proportion instead. Rounded to whole percent, summing to 100.

The owner's example and the two defaults are the check's cases. Removing a column (FR-008) gives its room to its neighbours in proportion.

**Turned down**: always equal (Q3 "A", not chosen).

## R5: Up to four columns

**Decision**: `count` is 2–4 in every reader. The layout bar gains a "4 equal" preset, so a 4-column layout shows which layout it is. Going back to 3 or 2 removes only empty last columns, as today.

Markdown import keeps 4 sections and folds only from the 5th, the same way it now folds from the 4th. An older binary reads 4 as 2 and draws the extra columns wrapped below, losing nothing. That goes in the release notes.

**Why**: the owner's Q1 allows a 4th at the far right. Every reader then has to draw it, or the print, shared page and agents see a broken layout.

**Turned down**: allowing 4 in the editor only.

## R6: The layout bar floats

**Decision**: keep the bar and float it. The strip `.bn-columns` that holds it (non-editable, rendered by `ColumnsBlock`) takes no height; the bar is placed absolutely at the strip's top right and lifted over the block's top edge. It shows on hover of the columns block, when the caret is inside it (`:focus-within`, which is how a phone shows it, having no hover), and on its own keyboard focus. Showing it changes only opacity, so no line moves. The bar stays in the same strip, so it keeps out of the editor's DOM like the widths' `<style>` does (R3).

**Why**: the owner asked for it to overlap rather than take space ("better yet"). Removing it would leave no way to pick a layout preset except dragging each divider, and the "4 equal" preset (R5) lives there.

**Turned down**: removing the bar (the owner's first option; the presets would go); moving the presets into the block's menu (one more step, and the menu is BlockNote's).
