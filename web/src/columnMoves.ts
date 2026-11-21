// What a dragged block does to column layouts (spec 021, PR 2): a new column
// at an edge (FR-006), two blocks put side by side (Q2), and a column emptied
// by a drag going away (FR-008). Called by blockDrop.ts inside the one
// transaction a drop makes, so each drop is one undo step.
//
// A layout is a `columns` block whose children are its columns; a column is
// its first block, and the column's later lines are that block's children
// (#317). So "a column" moves as one block, and a dragged first block carries
// its whole column with it.

import { equalWidths, formatWidths, insertColumnWidths, MAX_COLUMNS, parseWidths, removeColumnWidths } from './columnWidths';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Editor = any;
type Block = any;

/** A layout's widths now, one per column it has. */
export function widthsOf(layout: Block): number[] {
  const n = layout.children.length;
  return parseWidths(layout.props?.widths, n) ?? equalWidths(Math.max(1, n));
}

/** The dragged blocks as one column: the first block, the rest its lines. */
export function asColumn(blocks: Block[]): Block {
  const [first, ...rest] = blocks;
  return { ...first, children: [...(first.children ?? []), ...rest] };
}

export interface Source {
  layout: string;
  index: number;
  widths: number[];
}

/** Which columns the dragged blocks are (a dragged column's first block),
 *  read before anything is removed. */
export function sourcesOf(editor: Editor, ids: string[]): Source[] {
  const out: Source[] = [];
  for (const id of ids) {
    const parent = editor.getParentBlock(id);
    if (parent?.type !== 'columns') continue;
    out.push({ layout: parent.id, index: parent.children.findIndex((c: Block) => c.id === id), widths: widthsOf(parent) });
  }
  return out;
}

/**
 * After the dragged blocks are gone: each layout they left loses those
 * columns, and its widths give their room to the neighbours (FR-008). A
 * layout left with one column turns back into plain blocks, with none it
 * goes. `keep` is a layout the drop then adds a column to: it is not
 * rewritten here, and the widths it is left with are returned for it.
 */
export function closeEmptied(editor: Editor, sources: Source[], keep?: string): number[] | undefined {
  let kept: number[] | undefined;
  const byLayout = new Map<string, Source[]>();
  for (const s of sources) byLayout.set(s.layout, [...(byLayout.get(s.layout) ?? []), s]);
  for (const [id, gone] of byLayout) {
    let w = gone[0].widths;
    for (const s of [...gone].sort((a, b) => b.index - a.index)) w = removeColumnWidths(w, s.index);
    const live = editor.getBlock(id);
    if (!live) continue;
    if (w.length !== live.children.length) w = equalWidths(Math.max(1, live.children.length));
    if (id === keep) {
      kept = w;
      continue;
    }
    if (live.children.length === 0) {
      editor.removeBlocks([live]);
    } else if (live.children.length === 1) {
      const only = live.children[0];
      editor.replaceBlocks([live], [{ ...only, children: [] }, ...only.children]);
    } else {
      editor.updateBlock(live, { props: { count: live.children.length, widths: formatWidths(w) } });
    }
  }
  return kept;
}

/** The dragged blocks become a new column of `layoutId`, before the column
 *  whose first block is `before` (null: last), with the Q3 widths. */
export function insertColumn(editor: Editor, layoutId: string, before: string | null, blocks: Block[], base?: number[]): boolean {
  const live = editor.getBlock(layoutId);
  if (!live || blocks.length === 0) return false;
  const kids: Block[] = live.children;
  if (kids.length === 0 || kids.length >= MAX_COLUMNS) return false;
  let at = before ? kids.findIndex((k) => k.id === before) : kids.length;
  if (at < 0) at = kids.length;
  const widths = base && base.length === kids.length ? base : widthsOf(live);
  if (at < kids.length) editor.insertBlocks([asColumn(blocks)], kids[at], 'before');
  else editor.insertBlocks([asColumn(blocks)], kids[kids.length - 1], 'after');
  const next = insertColumnWidths(widths, at);
  editor.updateBlock(live.id, { props: { count: kids.length + 1, widths: formatWidths(next) } });
  return true;
}

/** The dragged blocks and the block `id` side by side, as a new layout of
 *  two equal columns: the dragged ones on the `edge` side (Q2). */
export function wrapBeside(editor: Editor, id: string, edge: 'left' | 'right', blocks: Block[]): boolean {
  const live = editor.getBlock(id);
  if (!live || blocks.length === 0) return false;
  const dragged = asColumn(blocks);
  const children = edge === 'left' ? [dragged, live] : [live, dragged];
  editor.replaceBlocks([live], [{ type: 'columns', props: { count: 2 }, children }]);
  return true;
}
