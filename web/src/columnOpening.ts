// Which layout is opening for a new column right now, and where (spec 021,
// R3). blockDrop.ts sets it while a dragged block is held at a column's edge;
// that layout's ColumnsBlock reads it and opens an empty track there through
// its own <style>, never by writing to editor DOM. One at a time on the page.

export interface Opening {
  /** The columns block's id. */
  id: string;
  /** Where the new column goes, among the columns. */
  at: number;
}

let current: Opening | null = null;
const listeners = new Set<() => void>();

export function setOpening(next: Opening | null) {
  if (current?.id === next?.id && current?.at === next?.at) return;
  current = next;
  for (const l of listeners) l();
}

export const getOpening = () => current;

export function subscribeOpening(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
