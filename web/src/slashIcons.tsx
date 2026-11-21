import type { ComponentType, ReactElement, ReactNode } from 'react';
import {
  BlockColorsItem,
  DragHandleMenu,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
  RemoveBlockItem,
  SideMenu,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  type SideMenuProps,
} from '@blocknote/react';
import { DRAG_HANDLE_FUNCTIONS, MenuIcon, SLASH_FUNCTIONS, type MenuFunction } from './menuIcons';
import { SideMenuExtension } from '@blocknote/core/extensions';
import { t } from './i18n';
import { PRESETS } from './columnWidths';
import { applyLayout, isCurrent } from './columnLayout';

// The editor's own menus take their icons from the same pairing as every
// other menu (spec 010, research R4). BlockNote draws its / menu with
// react-icons, a second icon set: "the same icon" means nothing across two
// sets, so its items get ours, by the key its dictionary uses. An upgrade that
// adds a block fails check-menu-icons.mjs until it has a function here.

/** The size BlockNote's suggestion menu draws its icon box at. */
const SLASH_ICON_SIZE = 18;

export function slashIcon(fn: MenuFunction): ReactElement {
  return <MenuIcon fn={fn} size={SLASH_ICON_SIZE} />;
}

/** BlockNote's default / items with the pairing's icons. An item whose key
 *  the pairing does not know keeps the library's icon; the check fails the
 *  build on it, so that only happens between an upgrade and its fix. */
export function withPairedIcons<T extends { key?: string; icon?: ReactElement }>(items: T[]): T[] {
  return items.map((item) => {
    const fn = item.key ? (SLASH_FUNCTIONS as Record<string, MenuFunction>)[item.key] : undefined;
    return fn ? { ...item, icon: slashIcon(fn) } : item;
  });
}

/** The block menu (the drag handle's) is built FROM DRAG_HANDLE_FUNCTIONS, so
 *  its items and the pairing cannot drift apart. The table below is typed by
 *  the pairing's keys: a key added there (because check-menu-icons.mjs reported
 *  a new BlockNote item) fails tsc here until it has its component and label,
 *  instead of passing the check and never showing up. */
type DragHandleKey = keyof typeof DRAG_HANDLE_FUNCTIONS;
const DRAG_HANDLE_ITEMS: Record<DragHandleKey, { Item: ComponentType<{ children: ReactNode }>; label: () => string }> = {
  delete_menuitem: { Item: RemoveBlockItem, label: () => t('Delete') },
  colors_menuitem: { Item: BlockColorsItem, label: () => t('Colour') },
  header_row_menuitem: { Item: TableRowHeaderItem, label: () => t('Header row') },
  header_column_menuitem: { Item: TableColumnHeaderItem, label: () => t('Header column') },
};

/** The columns block a block sits in (itself included), or none. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function layoutOf(editor: any, block: { id: string; type: string } | undefined) {
  let b = block;
  for (let i = 0; b && i < 64; i++) {
    if (b.type === 'columns') return b;
    b = editor.getParentBlock(b.id);
  }
  return undefined;
}

/** A layout's presets, as a submenu of the block menu (spec 021; the owner's
 *  call, 2026-11-21: they were a bar floating over the layout). The columns
 *  block itself has no handle of its own (its row is its columns), so the
 *  item is in the menu of every block inside a layout and acts on that
 *  layout; elsewhere it is not shown, as the table items are only for a
 *  table. Built like BlockNote's own Colour item. A choice among values: a
 *  submenu. */
function ColumnLayoutItem() {
  const Components = useComponentsContext()!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useBlockNoteEditor<any, any, any>();
  const handle = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block });
  const block = editor.isEditable ? layoutOf(editor, handle) : undefined;
  if (!block) return null;
  return (
    <Components.Generic.Menu.Root position="right" sub={true}>
      <Components.Generic.Menu.Trigger sub={true}>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger={true}>
          <span className="bn-menu-label">
            <MenuIcon fn="columnLayout" /> {t('Column layout')}
          </span>
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub={true} className="bn-menu-dropdown bn-columns-layouts">
        {PRESETS.map((w) => (
          <Components.Generic.Menu.Item
            key={w.join('-')}
            className="bn-menu-item"
            checked={isCurrent(block as never, w)}
            onClick={() => applyLayout(editor, block as never, w)}
          >
            <span className="bn-menu-label">
              <span className="bn-columns-glyph" aria-hidden="true">
                {w.map((n, i) => (
                  <i key={i} style={{ flex: n }} />
                ))}
              </span>
              {w.join(' / ') /* i18n-ok: column widths in percent, the same in every language */}
            </span>
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

function BlockMenu() {
  return (
    <DragHandleMenu>
      <ColumnLayoutItem />
      {(Object.keys(DRAG_HANDLE_FUNCTIONS) as DragHandleKey[]).map((key) => {
        const { Item, label } = DRAG_HANDLE_ITEMS[key];
        return (
          <Item key={key}>
            <span className="bn-menu-label">
              <MenuIcon fn={DRAG_HANDLE_FUNCTIONS[key]} /> {label()}
            </span>
          </Item>
        );
      })}
    </DragHandleMenu>
  );
}

/** The side menu with the block menu above, for SideMenuController. */
export function SideMenuWithIcons(props: SideMenuProps) {
  return <SideMenu {...props} dragHandleMenu={BlockMenu} />;
}
