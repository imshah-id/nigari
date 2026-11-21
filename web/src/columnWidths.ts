// How wide each column of a Columns block is.
//
// Its own module, with no imports, so scripts/check-columnwidths.mjs can run
// the arithmetic without a browser. The server reads the same prop with the
// same rule (server/columns.go) — change one, change the other.
//
// A layout is the widths in PERCENT of the row, one per column, written as
// "70,30" on the block's `widths` prop. Empty means equal columns, which is also
// what every block written before this existed has. Percent rather than pixels
// because a column row follows the page: a page that is narrower on a phone, or
// printed on A4, keeps its proportions.

/** No column is dragged narrower than this. At the page's usual width it is
 *  still a readable ~130px; below it a column is a sliver you cannot grab back. */
export const MIN_PCT = 15;

/** The most columns a layout has (spec 021, R5): every reader draws 2 to 4. */
export const MAX_COLUMNS = 4;

/** The layouts offered in the column layout menus (columnLayout.ts). */
export const PRESETS: readonly (readonly number[])[] = [
  [50, 50],
  [70, 30],
  [30, 70],
  [33, 33, 34],
  [25, 50, 25],
  [25, 25, 25, 25],
];

export function equalWidths(count: number): number[] {
  const base = Math.floor(100 / count);
  const w = Array<number>(count).fill(base);
  w[count - 1] += 100 - base * count; // the remainder goes to the last: 33,33,34 reads as thirds
  return w;
}

/** The stored string as numbers, or null when it is empty, belongs to another
 *  column count, or is not a layout — in which case the columns are equal. */
export function parseWidths(raw: unknown, count: number): number[] | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const parts = raw.split(',').map((s) => Number(s));
  if (parts.length !== count) return null;
  if (!parts.every((n) => Number.isFinite(n) && n >= 5 && n <= 95)) return null;
  return parts;
}

/** What gets stored: nothing at all for equal columns, so the common case stays
 *  a block with no extra prop to carry. */
export function formatWidths(w: readonly number[]): string {
  const eq = equalWidths(w.length);
  return w.every((n, i) => n === eq[i]) ? '' : w.join(',');
}

export function sameWidths(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/** Move the divider after column i by `delta` percent. The two columns beside it
 *  trade width, the rest stay put, and neither goes under MIN_PCT. */
export function moveDivider(w: readonly number[], i: number, delta: number): number[] {
  const out = [...w];
  const d = Math.max(MIN_PCT - w[i], Math.min(w[i + 1] - MIN_PCT, Math.round(delta)));
  out[i] = w[i] + d;
  out[i + 1] = w[i + 1] - d;
  return out;
}

/** CSS for the row, from the widths. `fr` rather than %, because the row also
 *  has gaps and percentages would overflow by exactly their sum. */
export function gridTemplate(w: readonly number[]): string {
  return w.map((n) => `minmax(0,${n}fr)`).join(' ');
}

/** Whole percents summing to 100, as close to `raw` as they can be: each is
 *  rounded down, and the points left over go to the largest remainders (the
 *  later column on a tie, so thirds read 33/33/34 like equalWidths). */
function wholePercents(raw: readonly number[]): number[] {
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  const exact = raw.map((n) => (n * 100) / total);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((n, i) => ({ i, f: n - Math.floor(n) })).sort((a, b) => b.f - a.f || b.i - a.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/** Columns this close (in percent) count as the same width: a layout made
 *  equal by hand is rarely exact. */
const SAME = 1;

/**
 * The widths after a new column is put in at index `at` (0 = first, the
 * count = last). The owner's rule (spec 021, Q3): the columns that share one
 * width give up their room, split equally with the new one; a column of its
 * own width keeps it. 40/30/30 + one at the end → 40/20/20/20; 50/50 + one →
 * 33/33/34. Claude's defaults where the rule says nothing: with no two
 * columns alike every column shrinks in proportion, and where the rule would
 * push one under MIN_PCT every column shrinks in proportion instead; if even
 * that leaves one under it, the columns become equal.
 */
export function insertColumnWidths(w: readonly number[], at: number): number[] {
  const n = w.length;
  const place = Math.max(0, Math.min(n, at));
  // The largest group of same-width columns.
  let group: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = w.map((x, j) => (Math.abs(x - w[i]) <= SAME ? j : -1)).filter((j) => j >= 0);
    if (g.length > group.length) group = g;
  }
  const proportional = () => {
    const share = 100 / (n + 1);
    const scaled = w.map((x) => (x * (100 - share)) / 100);
    const out = wholePercents([...scaled.slice(0, place), share, ...scaled.slice(place)]);
    // Still a column under the floor (a narrow one shrunk further): equal
    // columns, which never are.
    return out.some((x) => x < MIN_PCT) ? equalWidths(n + 1) : out;
  };
  if (group.length < 2) return proportional();
  const room = group.reduce((a, j) => a + w[j], 0);
  const each = room / (group.length + 1);
  if (each < MIN_PCT) return proportional();
  const raw = w.map((x, j) => (group.includes(j) ? each : x));
  const out = wholePercents([...raw.slice(0, place), each, ...raw.slice(place)]);
  return out;
}

/**
 * The widths after the column at index `at` goes (FR-008): its room goes to
 * the columns beside it, in proportion to their widths. One column left is
 * 100.
 */
export function removeColumnWidths(w: readonly number[], at: number): number[] {
  if (w.length <= 1) return [100];
  const raw = [...w];
  const gone = raw[at];
  const near = [at - 1, at + 1].filter((j) => j >= 0 && j < w.length);
  const sum = near.reduce((a, j) => a + w[j], 0) || 1;
  for (const j of near) raw[j] += (gone * w[j]) / sum;
  raw.splice(at, 1);
  return wholePercents(raw);
}
