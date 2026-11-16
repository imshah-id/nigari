// The status groups' ids and the quick-pick encoding of a whole group (spec
// 016). No i18n import on purpose: viewState.ts is bundled by
// check-viewstate.mjs without the translation loader.
import type { StatusGroup } from './types';

/** The groups in workflow order: the order options are kept in (R2). */
export const STATUS_GROUPS: StatusGroup[] = ['todo', 'in_progress', 'complete'];

/** A quick pick of a whole group is stored as "group:<id>" in the one string a
 *  pick holds (quickPicks maps a property to a string); no option id collides
 *  with that in practice. */
const GROUP_PICK = 'group:';

export function groupPick(g: StatusGroup): string {
  return GROUP_PICK + g;
}

/** The group a quick pick names, or null for an option pick. */
export function pickedGroup(pick: string): StatusGroup | null {
  if (!pick.startsWith(GROUP_PICK)) return null;
  const g = pick.slice(GROUP_PICK.length);
  return STATUS_GROUPS.find((x) => x === g) ?? null;
}
