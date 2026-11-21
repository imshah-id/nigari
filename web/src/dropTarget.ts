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
  | { kind: 'after'; id: string; head: boolean };

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
export function dropTarget(items: Item[], x: number, y: number, dragged: readonly string[] = []): Target | null {
  let target: Target | null = null;
  for (const item of items) {
    if ('layout' in item) {
      const { box } = item.layout;
      if (y < box.top) {
        target = { kind: 'before', id: item.layout.id, head: false };
        break;
      }
      if (y <= box.bottom) {
        target = inLayout(item.layout, x, y);
        break;
      }
      target = { kind: 'after', id: item.layout.id, head: false };
      continue;
    }
    const { line } = item;
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
