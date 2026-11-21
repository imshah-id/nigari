// Where a dragged block lands (spec 021, R1 and R2; #809, #824).
//
// BlockNote drew the drop line from ProseMirror's idea of the spot under the
// pointer, and ProseMirror dropped the block at ITS idea of the spot, and in
// our columns the two disagreed: the line showed in the column to the left,
// and a drop on a column's first line made an extra column. Between two
// blocks the line also twitched between two spots 1–9px apart that mean the
// same thing ("after the text" and "after the block", measured in #812).
//
// So the spot is decided here, once, from the boxes of the lines on the page,
// and both the line and the drop use the answer (blockDrop.ts). Pure, with
// its check beside it (scripts/check-droptarget.mjs).
//
// The rule, in the order it applies:
//   1. The page is a list of LINES (every block's own row, nested ones
//      included, in document order) and of COLUMN LAYOUTS. A pointer over a
//      layout goes into the column nearest to it, and the same rule runs on
//      that column's lines.
//   2. Among lines, the target is "before the first line whose middle is
//      below the pointer", or "after the last line" when there is none. One
//      gap is one target, wherever in the gap the pointer is (R2).
//   3. A target inside a dragged block (its own children) is refused: a block
//      cannot go inside itself.
//   4. A dragged layout is refused inside another layout's column: its
//      columns would become that column's lines, or the column its columns.
//   5. SIDEWAYS (spec 021, PR 2): at a column's left or right edge the target
//      is a new column there. A row of 2 offers every edge, a row of 3 only
//      the right edge of its last column, a row of 4 none (Q1). At the left or
//      right edge of an ordinary top-level block the target is "beside" it: the
//      two become a layout of two (Q2). Never where columns stack, on a narrow
//      page, beside a list item or a nested block, or for a dragged layout
//      (FR-010: no columns inside columns).

import { insertColumnWidths, MAX_COLUMNS } from './columnWidths';

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** One block's own row. */
export interface Line {
  id: string;
  box: Box;
  /** The ids of the blocks it sits inside, outermost first. */
  path: string[];
  /** It is a column's first block: the column itself. */
  head?: boolean;
  /** It is a columns block nested in another block, read as one line. */
  columns?: boolean;
  /** The block's type (BlockNote's data-content-type): lists take no layout. */
  type?: string;
}

/** A columns block: its columns side by side, or stacked on a phone. */
export interface Layout {
  id: string;
  box: Box;
  /** Each column's lines, its first block first. */
  columns: { box: Box; lines: Line[] }[];
}

export type Item = { line: Line } | { layout: Layout };

export type Target =
  | { kind: 'before'; id: string; head: boolean }
  | { kind: 'after'; id: string; head: boolean }
  /** A new column in layout `id`, before the column whose first block is
   *  `before` (null: after the last). `at` is its index among the columns. */
  | { kind: 'column'; id: string; at: number; before: string | null }
  /** Beside the top-level block `id`: the two become a layout of two. */
  | { kind: 'beside'; id: string; edge: 'left' | 'right' };

/** How the decision may answer. */
export interface Options {
  /** Sideways targets are offered (not on a narrow page, FR-010). */
  sideways?: boolean;
}

/** How far from an edge (px) the pointer still means "at the edge". */
export const EDGE = 16;

/** Lists keep their blocks in a column: no layout is made beside one. */
const LIST_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem']);

const middle = (b: Box) => (b.top + b.bottom) / 2;

/** How far a point is from a box (0 inside it). */
export function distance(b: Box, x: number, y: number): number {
  const dx = x < b.left ? b.left - x : x > b.right ? x - b.right : 0;
  const dy = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
  return Math.hypot(dx, dy);
}

function amongLines(lines: Line[], y: number): Target | null {
  if (lines.length === 0) return null;
  for (const l of lines) {
    if (y < middle(l.box)) return { kind: 'before', id: l.id, head: !!l.head };
  }
  const last = lines[lines.length - 1];
  return { kind: 'after', id: last.id, head: !!last.head };
}

/** The layout's columns sit side by side (not stacked on a phone). */
const sideBySide = (layout: Layout) =>
  layout.columns.every((c, i) => i === 0 || c.box.left >= layout.columns[i - 1].box.right - 1);

/** Which column edges take a new column (Q1). */
export function openEdges(n: number): number[] {
  if (n >= MAX_COLUMNS) return [];
  if (n === 3) return [3];
  return Array.from({ length: n + 1 }, (_, i) => i);
}

/** A new column at the edge under the pointer, if it is one that may open. */
function columnEdge(layout: Layout, x: number, dragged: readonly string[]): Target | 'refuse' | null {
  const cols = layout.columns;
  const n = cols.length;
  if (n < 2 || !sideBySide(layout)) return null;
  for (const at of openEdges(n)) {
    let hit: boolean;
    if (at === 0) hit = x <= cols[0].box.left + EDGE;
    else if (at === n) hit = x >= cols[n - 1].box.right - EDGE;
    else hit = x >= cols[at - 1].box.right - EDGE && x <= cols[at].box.left + EDGE;
    if (!hit) continue;
    // A whole column dragged (its first block, which carries the rest) to
    // one of its own edges: no change, no line.
    const own = cols.findIndex((c) => c.lines.length > 0 && dragged.includes(c.lines[0].id));
    if (own >= 0 && (at === own || at === own + 1)) return 'refuse';
    const head = at < n ? cols[at].lines[0] : undefined;
    return { kind: 'column', id: layout.id, at, before: head ? head.id : null };
  }
  return null;
}

function inLayout(layout: Layout, x: number, y: number): Target | null {
  let best: { box: Box; lines: Line[] } | null = null;
  let bestD = Infinity;
  for (const c of layout.columns) {
    const d = distance(c.box, x, y);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best ? amongLines(best.lines, y) : null;
}

/**
 * The spot a block dragged to (x, y) lands on, or null where it may not go.
 * `items` are the page's top-level lines and layouts in document order, with
 * nested lines flattened in; `dragged` are the ids of the blocks being moved.
 */
export function dropTarget(items: Item[], x: number, y: number, dragged: readonly string[] = [], options: Options = {}): Target | null {
  let target: Target | null = null;
  const draggingLayout = dragged.some((id) => isLayout(items, id));
  const sideways = !!options.sideways && !draggingLayout && dragged.length > 0;
  for (const item of items) {
    if ('layout' in item) {
      const { box } = item.layout;
      if (y < box.top) {
        target = { kind: 'before', id: item.layout.id, head: false };
        break;
      }
      if (y <= box.bottom) {
        if (draggingLayout) return null;
        const edge = sideways ? columnEdge(item.layout, x, dragged) : null;
        if (edge === 'refuse') return null;
        target = edge ?? inLayout(item.layout, x, y);
        break;
      }
      target = { kind: 'after', id: item.layout.id, head: false };
      continue;
    }
    const { line } = item;
    // Beside an ordinary top-level block (Q2): its own row, at an edge.
    if (sideways && line.path.length === 0 && !line.columns && !LIST_TYPES.has(line.type ?? '') && !dragged.includes(line.id) && y >= line.box.top && y <= line.box.bottom) {
      if (x <= line.box.left + EDGE) return { kind: 'beside', id: line.id, edge: 'left' };
      if (x >= line.box.right - EDGE) return { kind: 'beside', id: line.id, edge: 'right' };
    }
    if (y < middle(line.box)) {
      target = { kind: 'before', id: line.id, head: false };
      break;
    }
    target = { kind: 'after', id: line.id, head: false };
  }
  if (!target) return null;
  if (inside(items, target.id, dragged)) return null;
  return target;
}

/** The block is a columns block, at the top or nested. */
function isLayout(items: Item[], id: string): boolean {
  for (const item of items) {
    if ('layout' in item) {
      if (item.layout.id === id) return true;
      for (const c of item.layout.columns) for (const l of c.lines) if (l.id === id) return !!l.columns;
    } else if (item.line.id === id) return !!item.line.columns;
  }
  return false;
}

/** The target's line sits inside one of the dragged blocks. */
function inside(items: Item[], id: string, dragged: readonly string[]): boolean {
  if (dragged.length === 0) return false;
  const path = pathOf(items, id);
  return path !== null && path.some((p) => dragged.includes(p));
}

function pathOf(items: Item[], id: string): string[] | null {
  for (const item of items) {
    if ('line' in item) {
      if (item.line.id === id) return item.line.path;
      continue;
    }
    if (item.layout.id === id) return [];
    for (const c of item.layout.columns) for (const l of c.lines) if (l.id === id) return l.path;
  }
  return null;
}

/** Where the line is drawn for a target: a horizontal line in the gap. */
export function lineFor(items: Item[], target: Target, thickness: number): Box | null {
  const half0 = thickness / 2;
  if (target.kind === 'column') {
    const layout = items.map((it) => ('layout' in it ? it.layout : null)).find((l) => l?.id === target.id);
    if (!layout) return null;
    const x = openingCentre(layout, target.at);
    return { left: x - half0, right: x + half0, top: layout.box.top, bottom: layout.box.bottom };
  }
  if (target.kind === 'beside') {
    const line = flatten(items).find((l) => l.line.id === target.id)?.line;
    if (!line) return null;
    const x = target.edge === 'left' ? line.box.left - 4 : line.box.right - 2;
    return { left: x - half0, right: x + half0, top: line.box.top, bottom: line.box.bottom };
  }
  const lines = flatten(items);
  const i = lines.findIndex((l) => l.line.id === target.id);
  if (i < 0) return null;
  const { line, siblings } = lines[i];
  const half = thickness / 2;
  const j = siblings.indexOf(line);
  let y: number;
  if (target.kind === 'before') {
    const prev = j > 0 ? siblings[j - 1] : null;
    y = prev ? (prev.box.bottom + line.box.top) / 2 : line.box.top - 2;
  } else {
    const next = j < siblings.length - 1 ? siblings[j + 1] : null;
    y = next ? (line.box.bottom + next.box.top) / 2 : line.box.bottom + 2;
  }
  return { left: line.box.left, right: line.box.right, top: y - half, bottom: y + half };
}

/** The widths a layout's columns have now, in percent, from their boxes. */
export function boxWidths(layout: Layout): number[] {
  const w = layout.columns.map((c) => c.box.right - c.box.left);
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((n) => Math.round((n * 100) / sum));
}

/** The middle of the room a new column at `at` takes once the layout opens
 *  (spec 021, R3): where the line goes, so it sits in the opened gap. */
export function openingCentre(layout: Layout, at: number): number {
  const cols = layout.columns;
  const n = cols.length;
  const left = cols[0].box.left;
  const right = cols[n - 1].box.right;
  const gap = n > 1 ? Math.max(0, cols[1].box.left - cols[0].box.right) : 0;
  const next = insertColumnWidths(boxWidths(layout), at);
  const room = right - left - gap * n;
  const before = next.slice(0, at).reduce((a, b) => a + b, 0);
  return left + (before / 100) * room + gap * at + ((next[at] / 100) * room) / 2;
}

/** Every line (layouts count as one line, their box), with the run it sits in. */
function flatten(items: Item[]): { line: Line; siblings: Line[] }[] {
  const top: Line[] = items.map((it) => ('line' in it ? it.line : { id: it.layout.id, box: it.layout.box, path: [] }));
  const out: { line: Line; siblings: Line[] }[] = top.map((line) => ({ line, siblings: top }));
  for (const it of items) {
    if (!('layout' in it)) continue;
    for (const c of it.layout.columns) for (const line of c.lines) out.push({ line, siblings: c.lines });
  }
  return out;
}

/** The target changes nothing: the dragged block would land where it is. */
export function staysPut(items: Item[], target: Target, dragged: readonly string[]): boolean {
  if (dragged.length === 0) return false;
  if (target.kind === 'column' || target.kind === 'beside') return false;
  if (dragged.includes(target.id)) return true;
  const runs = flatten(items);
  const at = runs.find((r) => r.line.id === target.id);
  if (!at) return false;
  const j = at.siblings.indexOf(at.line);
  // Before the block right after the dragged one, at the same level: skip
  // back over the dragged block's own children to the block itself.
  if (target.kind === 'before') {
    let k = j - 1;
    while (k >= 0 && at.siblings[k].path.some((p) => dragged.includes(p))) k--;
    const prev = k >= 0 ? at.siblings[k] : null;
    if (prev && dragged.includes(prev.id) && prev.path.length === at.line.path.length) return true;
  }
  return false;
}
