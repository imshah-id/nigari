import type { ReactNode } from 'react';
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import { Tooltip } from '@base-ui/react/tooltip';
import './ToggleGroup.css';

// A row of choices inside a hairline frame (spec 020, R6): choose one (the
// theme, a member's role, how a filter matches) or, with `multiple`, choose
// several (a form's chips). Each item wears the Button's look (low, neutral)
// and the chosen ones its pressed tint. Base UI announces each as a toggle
// button, pressed or not, and moves between them with the arrow keys.
//
// Before this, each row was hand-built buttons with an `on` or `active`
// class: one of them said nothing about which item was chosen, and the theme
// switch rebuilt radio semantics by hand.

export type ToggleItem<V extends string> = {
  value: V;
  /** Translated. The item's text, or its name and tooltip when iconOnly. */
  label: string;
  icon?: ReactNode;
  /** Show only the icon; the label is the accessible name and tooltip. */
  iconOnly?: boolean;
  disabled?: boolean;
  /** Why an item is disabled, as a native tooltip. */
  title?: string;
  /** A level the item stands for (a workspace role). Pressed, it is filled
   *  in that level's colour (--color-rank-*) instead of the tint, so the
   *  chosen level and how far it reaches both show (owner, spec 020). */
  rank?: 'none' | 'viewer' | 'member' | 'admin';
};

type Common<V extends string> = {
  items: readonly ToggleItem<V>[];
  /** The group's accessible name, translated ("Appearance"). */
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
};

export type ToggleGroupProps<V extends string> = Common<V> & // i18n-ok: a type expression, not text
  (
    | { multiple?: false; value: V; onValueChange: (value: V) => void }
    | { multiple: true; value: readonly V[]; onValueChange: (value: V[]) => void }
  );

export function ToggleGroup<V extends string>(props: ToggleGroupProps<V>) {
  const { items, label, size = 'sm', disabled, className } = props;
  const value = props.multiple ? props.value : [props.value];
  const change = (next: V[]) => {
    if (props.multiple) props.onValueChange(next);
    // Choose one keeps a choice: Base UI lets the pressed item be pressed
    // again to empty the group, which a theme or a role cannot be.
    else if (next.length) props.onValueChange(next[next.length - 1]);
  };
  return (
    <BaseToggleGroup
      value={value as V[]}
      onValueChange={(next) => change(next as V[])}
      multiple={props.multiple}
      disabled={disabled}
      aria-label={label}
      // The arrows are the group's own (see ui/Tabs).
      data-nav-skip=""
      className={'ui-toggle-group' + (className ? ' ' + className : '')}
    >
      {items.map((it) => {
        const look = {
          className: 'ui-button ui-toggle',
          'data-emphasis': 'low',
          'data-tone': 'neutral',
          'data-size': size,
          'data-icon-only': it.iconOnly ? '' : undefined,
          'data-rank': it.rank,
        };
        const glyph = it.icon ? (
          <span aria-hidden="true" className="ui-button-icon">
            {it.icon}
          </span>
        ) : null;
        if (it.iconOnly) {
          return (
            <Tooltip.Root key={it.value}>
              <Tooltip.Trigger
                render={<Toggle value={it.value} disabled={it.disabled} aria-label={it.label} {...look} />}
              >
                {glyph}
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner sideOffset={6} className="ui-tooltip-positioner">
                  <Tooltip.Popup className="ui-tooltip">{it.label}</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        }
        return (
          <Toggle key={it.value} value={it.value} disabled={it.disabled} title={it.title} {...look}>
            {glyph}
            <span className="ui-button-label">{it.label}</span>
          </Toggle>
        );
      })}
    </BaseToggleGroup>
  );
}
