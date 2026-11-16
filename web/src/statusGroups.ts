// The status property's groups in the browser (spec 016). Pure on purpose, no
// React: web/scripts/check-statusgroups.mjs bundles this file and runs it
// against server/testdata/statusgroups.json, the same cases server/status.go
// is tested with, so the two guesses cannot drift apart (R6).
import { t } from './i18n';
import type { PropOption, StatusGroup } from './types';

import { STATUS_GROUPS } from './statusPick';
export { STATUS_GROUPS };

export function statusGroupLabel(g: StatusGroup): string {
  switch (g) {
    case 'todo':
      return t('To-do');
    case 'in_progress':
      return t('In progress');
    case 'complete':
      return t('Complete');
  }
}

// Must equal "words" in server/testdata/statusgroups.json: the check compares
// the two, so a word added on one side and not the other fails the build.
export const STATUS_WORDS: Record<'complete' | 'in_progress', string[]> = {
  complete: ['done', 'complete', 'completed', 'finished', 'closed', 'shipped', "won't do", 'wont do', 'cancelled', 'canceled', 'discarded'],
  in_progress: ['in progress', 'doing', 'started', 'active', 'review', 'in review'],
};

/** How a name is compared with the word list: lower case, straight
 *  apostrophes, hyphens and underscores as spaces, single spaces, no
 *  surrounding punctuation. Identical to normalizeStatusName in server/status.go. */
export function normalizeStatusName(name: string): string {
  let s = name.trim().toLowerCase();
  s = s.replace(/[’‘]/g, "'").replace(/[-_]/g, ' ');
  s = s.split(/\s+/).filter(Boolean).join(' ');
  return s.replace(/^[.!?:;,]+/, '').replace(/[.!?:;,]+$/, '');
}

const WORD_GROUP: Map<string, StatusGroup> = new Map(
  (Object.keys(STATUS_WORDS) as Array<keyof typeof STATUS_WORDS>).flatMap((g) =>
    STATUS_WORDS[g].map((w): [string, StatusGroup] => [normalizeStatusName(w), g]),
  ),
);

/** Places an option by its name: a whole-name match on the word list, else
 *  To-do ("Not started" holds "started" and is still to-do). */
export function guessStatusGroup(name: string): StatusGroup {
  return WORD_GROUP.get(normalizeStatusName(name)) ?? 'todo';
}

/** Makes an option id from a name; `taken` holds the ids already used. */
export type NewOptionId = (name: string, taken: string[]) => string;

function defaultName(g: StatusGroup): string {
  switch (g) {
    case 'todo':
      return t('Not started');
    case 'in_progress':
      return t('In progress');
    case 'complete':
      return t('Done');
  }
}

function addDefault(options: PropOption[], g: StatusGroup, newId: NewOptionId): PropOption[] {
  let name = defaultName(g);
  // "In progress" may already exist in another group: names stay unique.
  if (options.some((o) => o.name.trim().toLowerCase() === name.toLowerCase())) name = statusGroupLabel(g);
  const id = newId(name, options.map((o) => o.id));
  return [...options, { id, name, color: '', group: g }];
}

/** The options of a brand-new status: one per group. */
export function defaultStatusOptions(newId: NewOptionId): PropOption[] {
  let out: PropOption[] = [];
  for (const g of STATUS_GROUPS) out = addDefault(out, g, newId);
  return out;
}

/** What a select becomes when its type is changed to status. With no group on
 *  any option each is placed by its name and every empty group gets its
 *  default option; with some groups already set only the missing ones are
 *  guessed, nothing is added (the server's rule, prepareStatusProp). */
export function fillEmptyGroups(options: PropOption[], newId: NewOptionId): PropOption[] {
  const grouped = options.some((o) => o.group);
  let out = options.map((o) => (o.group ? o : { ...o, group: guessStatusGroup(o.name) }));
  if (!grouped) {
    for (const g of STATUS_GROUPS) {
      if (!out.some((o) => o.group === g)) out = addDefault(out, g, newId);
    }
  }
  return out;
}

/** Is a chart drawn by group? Only a status grouping can be (R8); the flag
 *  left over from a grouping that has changed means nothing. */
export function chartByGroup(view: { statusGroups?: boolean }, groupProp: { type: string } | undefined): boolean {
  return !!view.statusGroups && groupProp?.type === 'status';
}

/** Options in group order, their order inside a group unchanged (R2). An
 *  option with no known group goes last. */
export function orderByGroup(options: PropOption[]): PropOption[] {
  const rank = (o: PropOption) => {
    const i = o.group ? STATUS_GROUPS.indexOf(o.group) : -1;
    return i < 0 ? STATUS_GROUPS.length : i;
  };
  return options
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .map((x) => x.o);
}
