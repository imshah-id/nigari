import { t } from '../i18n';
import { STATUS_GROUPS, statusGroupLabel } from '../statusGroups';
import type { StatusGroup } from '../types';

// The picker behind "Group is / Group is not" (spec 016, US2): the three
// groups as a tick list, several may be ticked at once, like the option list
// of "is any of". Used by a view's filter row and by a rollup's condition, so
// both draw the same control. The ticked ids come back in workflow order, the
// order the server stores them in.
export default function StatusGroupFilter({
  picked,
  onChange,
}: {
  picked: string[];
  onChange: (groups: StatusGroup[]) => void;
}) {
  const toggle = (g: StatusGroup) =>
    onChange(STATUS_GROUPS.filter((x) => (x === g ? !picked.includes(x) : picked.includes(x))));
  return (
    <div className="fs-checks" role="group" aria-label={t('Groups')}>
      {STATUS_GROUPS.map((g) => (
        <label key={g} className={'fs-check' + (picked.includes(g) ? ' on' : '')}>
          <input type="checkbox" checked={picked.includes(g)} onChange={() => toggle(g)} />
          {statusGroupLabel(g)}
        </label>
      ))}
    </div>
  );
}
