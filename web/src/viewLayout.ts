// Changing a view's layout (spec 018, R2). A view keeps every setting it has
// when its type changes, the settings of the type it leaves included, so a
// table → board → table round trip gives the table back exactly (SC-002); what
// the new type needs and does not have is filled in the way a new view of
// that type gets it.
//
// The server applies the same rule to set_view (switchViewLayout in
// server/viewlayout.go). server/testdata/viewlayout/cases.json holds the two
// to the same answers: check-viewlayout.mjs runs this module against it.
//
// Pure: no t(), no React.

import { chartSettingsFor } from './chartDefaults';
import type { ChartKind } from './chartLayout';
import { isSingleOptionType, type PropDef, type ViewDef } from './types';

/** Every layout, in the order the add-view menu lists them. */
export const LAYOUT_TYPES: ViewDef['type'][] = ['table', 'board', 'list', 'gallery', 'calendar', 'timeline', 'form', 'chart'];

/** The property types a board makes columns from (applyViewSpec's list). */
const BOARD_GROUP_TYPES = ['select', 'status', 'multiselect', 'relation'];

export interface LayoutSwitch {
  view: ViewDef;
  /** A calendar or timeline on a database with no date property: the view
   *  has nothing to show by, and the caller offers to add one (FR-004a). */
  needsDate: boolean;
}

export function switchLayout(view: ViewDef, type: ViewDef['type'], schema: PropDef[]): LayoutSwitch {
  if (view.type === type) return { view, needsDate: false };
  const out: ViewDef = { ...view, type };
  const typeOf = (id: string | undefined) => (id ? schema.find((p) => p.id === id)?.type : undefined);
  const first = (ok: (t: string) => boolean, skip?: string) => schema.find((p) => p.id !== skip && ok(p.type))?.id;
  const isDate = (t: string) => t === 'date';
  const setOrDrop = (key: 'groupBy' | 'dateProp' | 'endDateProp', id: string | undefined) => {
    if (id) out[key] = id;
    else delete out[key];
  };
  switch (type) {
    case 'board':
      if (!BOARD_GROUP_TYPES.includes(typeOf(out.groupBy) ?? '')) {
        setOrDrop('groupBy', first(isSingleOptionType) ?? first((t) => BOARD_GROUP_TYPES.includes(t)));
      }
      break;
    case 'calendar':
    case 'timeline': {
      if (typeOf(out.dateProp) !== 'date') setOrDrop('dateProp', first(isDate));
      const start = out.dateProp;
      if (!start) return { view: out, needsDate: true };
      if (type === 'timeline') {
        // The end, as a new timeline gets it: the next date property, when
        // there is one. One that is no longer a date is dropped.
        if ('endDateProp' in out && (typeOf(out.endDateProp) !== 'date' || out.endDateProp === start)) delete out.endDateProp;
        if (!('endDateProp' in out)) setOrDrop('endDateProp', first(isDate, start));
      }
      break;
    }
    case 'chart': {
      const settings = chartSettingsFor((out.chartKind ?? 'bar') as ChartKind, schema, out);
      for (const [k, v] of Object.entries(settings) as [keyof ViewDef, unknown][]) {
        if (v === undefined) delete out[k];
        else (out as unknown as Record<string, unknown>)[k] = v;
      }
      break;
    }
  }
  return { view: out, needsDate: false };
}

/** The name of a date property added for a calendar or timeline (FR-004a):
 *  "Date", or "Date 2", "Date 3"… when the name is taken. name is the
 *  translated word, so the property reads in the person's language. */
export function newDateName(schema: PropDef[], name: string): string {
  const taken = new Set(schema.map((p) => p.name.trim().toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** The date property added for a calendar or timeline (FR-004a): the plain
 *  date type, named by newDateName, with an id no property has. */
export function newDateProperty(schema: PropDef[], name: string): PropDef {
  let id = 'date';
  while (schema.some((p) => p.id === id)) id += '_';
  return { id, name: newDateName(schema, name), type: 'date' };
}
