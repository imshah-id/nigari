import { compare } from './format';
import type { PropDef, Sort } from './types';

// How a view's sort orders its rows. Every view type sorts with this (applyView
// in CollectionView.tsx), and the board's drop marker (dropIndex in
// boardDrag.ts) places a dragged card with it, so the marker and the sorted
// result cannot disagree (spec 012, research R7).

/** The comparator a view's sort orders rows with. Ties, and a view without a
 *  sort, keep the rows' own order: Array.sort is stable.
 *
 *  `schema` lets a status sort in its workflow order: by the option's place
 *  in the stored options, which are kept in group order, so group first, then
 *  place in the group (spec 016, R5). The rows query sorts the same way
 *  (statusSortExpr in server/status.go); a row without a value, or with an
 *  option no longer offered, comes after every option. Without the schema, or
 *  for any other type, the value's text is compared as before. */
export function sortComparator<T extends { props: Record<string, unknown> }>(sort: Sort | null | undefined, schema?: readonly PropDef[]) {
  const prop = sort ? schema?.find((p) => p.id === sort.property) : undefined;
  const place = prop?.type === 'status' ? new Map((prop.options ?? []).map((o, i) => [o.id, i])) : null;
  return (a: T, b: T): number => {
    if (!sort) return 0;
    const av = a.props[sort.property];
    const bv = b.props[sort.property];
    if (place) {
      // A status converted from a single-value multi-select keeps ["id"].
      const rank = (v: unknown) => place.get(String(Array.isArray(v) ? v[0] : v ?? '')) ?? place.size;
      const ra = rank(av);
      const rb = rank(bv);
      // No status last in both directions, as the rows query puts it.
      if ((ra === place.size) !== (rb === place.size)) return ra === place.size ? 1 : -1;
      const cmp = ra - rb;
      return sort.dir === 'desc' ? -cmp : cmp;
    }
    const as = Array.isArray(av) ? av.join(',') : String(av ?? '');
    const bs = Array.isArray(bv) ? bv.join(',') : String(bv ?? '');
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : compare(as, bs);
    return sort.dir === 'desc' ? -cmp : cmp;
  };
}
