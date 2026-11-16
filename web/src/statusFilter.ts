// Group conditions on a status property in the browser (spec 016, US2). Pure,
// no React: web/scripts/check-statusfilter.mjs bundles this file. The server
// rewrites group_is / group_is_not into is / is_not over the ids of the
// options currently in those groups (R3); the browser's second pass over the
// rows (applyView in CollectionView.tsx) does the same from the schema it holds,
// so the rows the server sent and the rows shown here cannot disagree.
import type { Filter, PropDef, StatusGroup } from './types';
import { STATUS_GROUPS } from './statusPick';

export function isGroupOp(op: string | undefined): op is 'group_is' | 'group_is_not' {
  return op === 'group_is' || op === 'group_is_not';
}

/** The group ids a condition names, in workflow order, unknown ids dropped. */
export function groupValues(f: Pick<Filter, 'value' | 'values'>): StatusGroup[] {
  const raw = f.values?.length ? f.values : f.value ? [f.value] : [];
  return STATUS_GROUPS.filter((g) => raw.includes(g));
}

/** The ids of the options that sit in any of the groups. */
export function optionIdsInGroups(prop: PropDef, groups: StatusGroup[]): string[] {
  return (prop.options ?? []).filter((o) => o.group && groups.includes(o.group)).map((o) => o.id);
}

/** Does a stored cell value satisfy a group condition? `undefined` when the
 *  filter is not a group condition at all, so the caller falls back to the
 *  ordinary comparison. A group condition that names no group yet is unfinished
 *  and narrows nothing, as is one on a property that is not a status. */
export function groupFilterMatch(f: Filter, schema: PropDef[], cell: unknown): boolean | undefined {
  if (!isGroupOp(f.op)) return undefined;
  const prop = schema.find((p) => p.id === f.property);
  if (prop?.type !== 'status') return true;
  const groups = groupValues(f);
  if (groups.length === 0) return true;
  const ids = optionIdsInGroups(prop, groups);
  // A status holds one option, stored as "id" (a few older rows as ["id"]).
  const held = Array.isArray(cell) ? cell.map(String) : cell == null || cell === '' ? [] : [String(cell)];
  const inGroup = held.some((x) => ids.includes(x));
  return f.op === 'group_is' ? inGroup : !inGroup;
}
