import type { ReactNode } from 'react';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import './Tabs.css';

// A row of tabs: one of several views of the same place (spec 020, R6). Each
// tab wears the Button's look (low, neutral, small) and the selected one its
// pressed tint, so a tab row and a toolbar are visibly the same family; the
// owner asked for tabs built on the button rather than an underlined bar.
// Behaviour comes from Base UI: role="tab" and aria-selected, the arrow keys
// move between tabs (and select, activateOnFocus), Home and End jump.
//
// Before this, each tab row was hand-built buttons with an `on` or `active`
// class and no tab role at all, so a screen reader heard a heap of buttons and
// the arrow keys did nothing.

export type TabItem<V extends string> = {
  value: V;
  /** Text, or text with a count beside it. */
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

export type TabsProps<V extends string> = {
  value: V;
  onValueChange: (value: V) => void;
  items: readonly TabItem<V>[];
  /** The row's accessible name, translated ("Settings sections"). */
  label: string;
  className?: string;
  /** The selected tab's content. Left out when the content lives elsewhere
   *  on the screen; then only the row is rendered. */
  children?: ReactNode;
};

export function Tabs<V extends string>({ value, onValueChange, items, label, className, children }: TabsProps<V>) {
  return (
    <BaseTabs.Root value={value} onValueChange={(v) => onValueChange(v as V)} className={'ui-tabs' + (className ? ' ' + className : '')}>
      {/* data-nav-skip: the arrows are the row's own. Without it nav.ts's way
          in took ArrowRight first and moved focus out of the row, even out of
          the dialog the row sat in (found by tab-rows.mjs). */}
      <BaseTabs.List className="ui-tabs-list" aria-label={label} activateOnFocus data-nav-skip="">
        {items.map((it) => (
          <BaseTabs.Tab
            key={it.value}
            value={it.value}
            disabled={it.disabled}
            className="ui-button ui-tab"
            data-emphasis="low"
            data-tone="neutral"
            data-size="sm"
          >
            {it.icon && (
              <span aria-hidden="true" className="ui-button-icon">
                {it.icon}
              </span>
            )}
            {typeof it.label === 'string' ? <span className="ui-button-label">{it.label}</span> : it.label}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {children !== undefined && (
        <BaseTabs.Panel value={value} className="ui-tabs-panel">
          {children}
        </BaseTabs.Panel>
      )}
    </BaseTabs.Root>
  );
}
