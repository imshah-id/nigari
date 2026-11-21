// A column layout chosen from a menu (spec 021, owner 2026-11-21: "remove it
// and add the functions in the options menu for the columns block"). It was a
// bar of presets over the block. It is now a submenu of the block menu of
// every line inside a layout, and, for the keyboard, entries of the / menu
// while the caret is inside one (slashIcons.tsx). Both act on the nearest
// layout around the line.
//
// Changing the count changes the number of columns, so the blocks follow:
// three columns with two children would be a third track with nothing in it
// and no way to type there.

import { equalWidths, formatWidths, parseWidths, sameWidths } from './columnWidths';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Editor = any;

interface ColumnsLike {
  id: string;
  props: { count?: number | string; widths?: string };
}

/** The columns block a block sits in (itself included), or none. */
export function layoutOf<B extends { id: string; type: string }>(editor: Editor, block: B | undefined): B | undefined {
  let b = block;
  for (let i = 0; b && i < 64; i++) {
    if (b.type === 'columns') return b;
    b = editor.getParentBlock(b.id);
  }
  return undefined;
}

/** The layout a columns block has now: its stored widths, or equal ones. */
export function currentWidths(block: ColumnsLike): number[] {
  const count = Number(block.props.count) === 3 ? 3 : 2;
  return parseWidths(block.props.widths, count) ?? equalWidths(count);
}

/** The preset is the block's layout now. */
export const isCurrent = (block: ColumnsLike, w: readonly number[]) => {
  const now = currentWidths(block);
  return now.length === w.length && sameWidths(w, now);
};

/** Sets a columns block to a preset, in one change. */
export function applyLayout(editor: Editor, block: ColumnsLike, w: readonly number[]) {
  editor.transact(() => {
    const live = editor.getBlock(block.id);
    if (!live) return;
    const n = w.length;
    editor.updateBlock(live, { props: { count: n, widths: formatWidths(w) } });
    const kids = live.children;
    if (n > kids.length) {
      const fresh = Array.from({ length: n - kids.length }, () => ({ type: 'paragraph' }));
      if (kids.length) editor.insertBlocks(fresh, kids[kids.length - 1], 'after');
      else editor.updateBlock(live, { children: fresh });
    } else if (n < kids.length) {
      // Only an empty last column goes. One with something in it stays, and
      // wraps below, rather than a click on a layout deleting someone's text.
      const last = kids[kids.length - 1];
      if (last.type === 'paragraph' && !last.content?.length && !last.children.length) {
        editor.removeBlocks([last]);
      }
    }
  });
}
