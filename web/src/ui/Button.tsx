import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { Tooltip } from '@base-ui/react/tooltip';
import { chordFor } from '../keys';
import './Button.css';

// The one button (spec 020). Its look is set by properties, never by a class:
// how much it stands out (emphasis), what it does (tone), how big it is, and
// whether it carries an icon. Before this, 356 hand-built <button>s chose a
// look from class combinations (btn, btn-sm, primary, danger) whose rules were
// stated four times over in styles.css and theme.css, and the first ui/Button
// had three corner shapes. Every value now comes from a token: the button's
// own (component.tokens.json, `button`) and spec 019's colour roles.
// Behaviour comes from Base UI: a disabled button stays out of the tab order
// and ignores clicks, with data-disabled for the look (spec 001, FR-009).

/** high: filled, the one main action of a screen. medium: an outline, the
 *  default. low: a background on hover only, for toolbars. link: text only. */
export type ButtonEmphasis = 'high' | 'medium' | 'low' | 'link';
/** neutral: most buttons. primary: the accent. destructive: deletes or removes
 *  something that cannot simply be undone. */
export type ButtonTone = 'neutral' | 'primary' | 'destructive';

type Common = Omit<ComponentPropsWithoutRef<typeof BaseButton>, 'className' | 'children'> & {
  emphasis?: ButtonEmphasis;
  tone?: ButtonTone;
  size?: 'sm' | 'md';
  /** A toggle that stays on (aria-pressed): the faint primary tint, whatever
   *  the tone (owner, spec 020 Q2). Leave it undefined for a plain button. */
  pressed?: boolean;
  /** A shortcut id from keys.ts. Its live chord is shown after the label, and
   *  disappears when the shortcut is not bound here (FR-010). */
  shortcut?: string;
  className?: string;
};

/** With a label: `icon` is optional and shown before it. Without one, the
 *  button is a square holding only the icon, and must still have a name:
 *  `label` is required, read by a screen reader and shown as a tooltip, and
 *  arrives already translated (spec 001, FR-008). */
export type ButtonProps = Common &
  ({ children: ReactNode; icon?: ReactNode; label?: never } | { children?: undefined; icon: ReactNode; label: string });

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { emphasis = 'medium', tone = 'neutral', size = 'md', pressed, shortcut, className, children, icon, label, type = 'button', ...rest },
  ref,
) {
  const iconOnly = children === undefined || children === null || children === false;
  const chord = shortcut ? chordFor(shortcut) : '';
  const look = {
    className: 'ui-button' + (className ? ' ' + className : ''),
    'data-emphasis': emphasis,
    'data-tone': tone,
    'data-size': size,
    'data-icon-only': iconOnly ? '' : undefined,
    'data-pressed': pressed ? '' : undefined,
    'aria-pressed': pressed === undefined ? undefined : pressed,
  };
  const glyph = icon ? (
    <span aria-hidden="true" className="ui-button-icon">
      {icon}
    </span>
  ) : null;

  if (iconOnly) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger
          ref={ref}
          type={type}
          aria-label={label}
          {...look}
          {...(rest as ComponentPropsWithoutRef<'button'>)}
        >
          {glyph}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner sideOffset={6} className="ui-tooltip-positioner">
            <Tooltip.Popup className="ui-tooltip">{label}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }
  return (
    <BaseButton ref={ref} type={type} {...look} {...rest}>
      {glyph}
      <span className="ui-button-label">{children}</span>
      {chord && <kbd className="ui-button-kbd">{chord}</kbd>}
    </BaseButton>
  );
});
