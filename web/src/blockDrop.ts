// The drop line and the drop of a dragged block use one decision (spec 021,
// R1; the decision is dropTarget.ts).
//
// Two hooks into the editor, both given the same target:
// - BlockNote's drop line is switched off for a block drag
//   (`computeDropPosition` returns null) and this module draws the line
//   itself, from the boxes the decision used. BlockNote draws its line from a
//   ProseMirror position, and in our columns the position before a column's
//   first block is "after the previous column", so its line showed in the
//   column to the left (#809), however right the position was.
// - ProseMirror's drop is taken over (a capture listener on the editor runs
//   first and stops the event) and the block is moved to the target through
//   BlockNote's block calls, so its id, comments and children go with it.
//   Not ProseMirror's handleDrop prop: ProseMirror asks it only when the
//   pointer is over a text position, and gives up silently elsewhere (the gap
//   between two columns), where the line had shown a spot.
//
// Anything that is not a block from the handle (text dragged inside a line, a
// file from the desktop, a block from another editor) is left to BlockNote
// and ProseMirror as before.
//
// The boxes are read once when a drag reaches the editor and again after a
// scroll or resize, not on every pointer step (SC-003): nothing on the page
// moves while a block is dragged, until the drop.

import { dropTarget, lineFor, staysPut, type Box, type Item, type Line, type Target } from './dropTarget';
import { dropLineWidth } from './dropLine';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Editor = any;
type View = any;

const rect = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};

const outerOf = (group: Element | null | undefined): Element[] =>
  group ? Array.from(group.children).filter((c) => c.classList.contains('bn-block-outer')) : [];

const groupOf = (outer: Element): Element | null => outer.querySelector(':scope > .bn-block > .bn-block-group');
// A React block (ours: columns, callouts) has a .react-renderer between the
// block and its content.
const contentOf = (outer: Element): Element | null =>
  outer.querySelector(':scope > .bn-block > .bn-block-content, :scope > .bn-block > * > .bn-block-content');
const isColumns = (outer: Element) => contentOf(outer)?.getAttribute('data-content-type') === 'columns';

/** A block's own row and every nested row under it, in document order. */
function linesOf(outer: Element, path: string[], head: boolean, out: Line[]) {
  const id = outer.getAttribute('data-id');
  const content = contentOf(outer);
  if (!id || !content) return;
  out.push({ id, box: rect(content), path, ...(head ? { head: true } : {}) });
  for (const child of outerOf(groupOf(outer))) linesOf(child, [...path, id], false, out);
}

/** The page as the decision sees it: lines and column layouts. */
export function readItems(root: Element): Item[] {
  const top = root.querySelector(':scope > .bn-block-group') ?? root.querySelector('.bn-block-group');
  const items: Item[] = [];
  for (const outer of outerOf(top)) {
    const id = outer.getAttribute('data-id');
    if (!id) continue;
    if (isColumns(outer)) {
      const group = groupOf(outer);
      const columns = outerOf(group).map((col) => {
        const lines: Line[] = [];
        linesOf(col, [id], true, lines);
        return { box: rect(col), lines };
      });
      // Across the whole block, as tall as its columns: the group is indented
      // like any block's children, and a line above the layout spans the page.
      const o = rect(outer);
      const g = group ? rect(group) : o;
      items.push({ layout: { id, box: { left: o.left, right: o.right, top: g.top, bottom: g.bottom }, columns } });
      continue;
    }
    const lines: Line[] = [];
    linesOf(outer, [], false, lines);
    for (const line of lines) items.push({ line });
  }
  return items;
}

/** The ids of the blocks a drag carries: the node selection made at its start. */
export function draggedIds(state: any): string[] {
  const { from, to } = state.selection;
  const ids: string[] = [];
  state.doc.nodesBetween(from, to, (node: any, pos: number) => {
    if (node.type.name !== 'blockContainer') return true;
    if (pos >= from && pos + node.nodeSize <= to) {
      ids.push(node.attrs.id);
      return false; // its children travel with it
    }
    return true;
  });
  return ids;
}

/** A block from the handle, not text: BlockNote hands it over as whole blocks. */
const isBlockDrag = (view: View) => {
  const slice = view.dragging?.slice;
  return !!slice && slice.openStart === 0 && slice.content.firstChild?.type.name === 'blockContainer';
};

/** Moves the blocks to the target, in one change. */
export function moveTo(editor: Editor, target: Target, ids: string[]) {
  editor.transact(() => {
    const blocks = ids.map((id) => editor.getBlock(id)).filter(Boolean);
    if (blocks.length === 0) return;
    editor.removeBlocks(ids);
    const at = editor.getBlock(target.id);
    if (!at) return;
    if (!target.head) {
      editor.insertBlocks(blocks, at, target.kind);
      return;
    }
    if (target.kind === 'after') {
      // Below a column's first line is still that column: the head's first
      // child, not a sibling (a sibling of a column is a new column, #824).
      if (at.children.length) editor.insertBlocks(blocks, at.children[0], 'before');
      else editor.updateBlock(at, { children: blocks });
      return;
    }
    // Above a column's first line: the dragged block becomes the column's
    // first line, and the old one and the rest of the column its next lines.
    const [first, ...rest] = blocks;
    const column = {
      ...first,
      children: [...(first.children ?? []), ...rest, { ...at, children: [] }, ...at.children],
    };
    editor.replaceBlocks([at], [column]);
  });
}

/** BlockNote's own line is off for a block drag: blockDrop draws it. */
export const computeDropPosition = <P,>({ view, defaultPosition }: { view: View; defaultPosition: P }): P | null =>
  isBlockDrag(view) ? null : defaultPosition;

/** A drop that copies rather than moves (Alt, or Ctrl off a Mac): ProseMirror's. */
const copies = (e: DragEvent) => e.altKey || (!/Mac/.test(navigator.platform) && e.ctrlKey);

/**
 * Installs the decision for one editor; returns the function that removes it.
 * `editor` is asked on each event because the editor mounts after this runs.
 */
export function blockDrop(editor: Editor): () => void {
  let items: Item[] | null = null;
  let line: HTMLElement | null = null;
  let shown = '';
  const view = (): View | undefined => editor.prosemirrorView;

  const hide = () => {
    line?.remove();
    line = null;
    shown = '';
  };
  const decide = (v: View, x: number, y: number) => {
    if (!items) items = readItems(v.dom);
    const ids = draggedIds(v.state);
    const target = dropTarget(items, x, y, ids);
    return target ? { target, all: items, ids } : null;
  };
  const draw = (box: Box | null, key: string) => {
    if (key === shown) return;
    shown = key;
    if (!box) {
      line?.remove();
      line = null;
      return;
    }
    if (!line) {
      line = document.createElement('div');
      line.className = 'nigari-drop-line';
      line.setAttribute('aria-hidden', 'true');
      document.body.append(line);
    }
    line.style.left = `${box.left}px`;
    line.style.top = `${box.top}px`;
    line.style.width = `${box.right - box.left}px`;
    line.style.height = `${box.bottom - box.top}px`;
  };

  const onOver = (e: DragEvent) => {
    const v = view();
    if (!v || !v.editable || !isBlockDrag(v)) return;
    const d = decide(v, e.clientX, e.clientY);
    if (!d) draw(null, 'none');
    else draw(lineFor(d.all, d.target, dropLineWidth()), `${d.target.kind}:${d.target.id}`);
  };
  const onLeave = (e: DragEvent) => {
    const v = view();
    if (!v || !(e.relatedTarget instanceof Node) || !v.dom.contains(e.relatedTarget)) hide();
  };
  const onEnd = () => {
    items = null;
    hide();
  };
  const onDrop = (e: DragEvent) => {
    const v = view();
    if (!v || !v.editable || !isBlockDrag(v) || copies(e)) return;
    items = null; // fresh boxes for the drop itself
    const d = decide(v, e.clientX, e.clientY);
    items = null;
    hide();
    e.preventDefault();
    e.stopPropagation();
    v.dragging = null;
    if (d && !staysPut(d.all, d.target, d.ids)) moveTo(editor, d.target, d.ids);
  };
  // A scroll or resize moves every box: read them again on the next step.
  const onScroll = () => {
    items = null;
    hide();
  };

  // On the document, in the capture phase: ahead of ProseMirror's own drop
  // handler on the editor, and in place before the editor has mounted. Each
  // editor on the page answers only for events inside itself.
  const mine = (e: Event) => {
    const v = view();
    return v && e.target instanceof Node && v.dom.contains(e.target) ? v : undefined;
  };
  const over = (e: DragEvent) => mine(e) && onOver(e);
  const leave = (e: DragEvent) => mine(e) && onLeave(e);
  const drop = (e: DragEvent) => mine(e) && onDrop(e);
  document.addEventListener('dragover', over, true);
  document.addEventListener('dragleave', leave, true);
  document.addEventListener('drop', drop, true);
  document.addEventListener('dragend', onEnd, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
  return () => {
    document.removeEventListener('dragover', over, true);
    document.removeEventListener('dragleave', leave, true);
    document.removeEventListener('drop', drop, true);
    document.removeEventListener('dragend', onEnd, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    hide();
  };
}
