// The block handle stays put while the pointer is on it (#808).
//
// BlockNote decides which block the + and drag handle belong to on every
// mousemove, from what lies under the pointer, and it looks THROUGH its own
// side menu to do so (the menu is a floating layer outside the editor's text).
// Next to a plain block that is harmless: under the handle there is the same
// block. In a columns layout the handle sits in the gap before a column, where
// what lies underneath is the columns block itself or the column to the left,
// so the handle jumped away the moment the pointer reached it and a block in
// a column could not be dragged at all. (BlockNote's paid column block works
// around it by looking 50px to the right; ours is not that block.)
//
// The fix is the one every editor with a handle has: while the pointer is on
// the handle, the handle does not move. BlockNote has that switch already, the
// one it throws while the block menu is open: freezeMenu / unfreezeMenu. It is
// thrown here when the pointer moves onto the side menu and released on the
// first move off it. A drag from the handle keeps it thrown (no pointer events
// fire during a drag), which is right: the handle belongs to the dragged block
// until the drop, and the next move after the drop releases it.
//
// Each editor holds only its OWN side menu: a page can have two editors (the
// page and a peek panel, a database and the template dialog), and freezing the
// other one's menu made it show a handle out of nowhere, or threw when that
// editor had never shown one (review of the first version).
//
// Turned down, all three tried:
// - Widening each column's hover area over its handle (padding plus a negative
//   margin). BlockNote double-checks the block at its right edge, and with the
//   columns overlapping that check landed in the next column.
// - Keeping the mousemove from BlockNote (stopImmediatePropagation on the
//   window). Other code listens to the same events; Playwright, for one, no
//   longer saw a drag start.
// - Holding on pointerover and releasing on pointerout. Around a drag the
//   browser sends a stray pointerover for where the drag began, which froze
//   the handle again after every drop.

export const SIDE_MENU_SELECTOR = '.bn-side-menu';

/** The part of BlockNote's SideMenuExtension this uses. */
export interface SideMenuFreeze {
  freezeMenu(): void;
  unfreezeMenu(): void;
}

export interface HoldInput {
  /** Whether this hold has frozen the side menu. */
  held: boolean;
  /** The pointer is on this editor's own side menu. */
  onOwnMenu: boolean;
  /** The block menu behind the handle is open. */
  blockMenuOpen: boolean;
  /** PointerEvent.pointerType. */
  pointerType: string;
}

/**
 * What one pointer move does to the hold. Decided on every move, not on
 * enter and leave: around a drag the browser sends a stray pointerover for
 * where the drag began (measured: it re-froze the handle after every drop).
 *
 * - 'hold': freeze the side menu where it is.
 * - 'release': unfreeze it.
 * - 'yield': the block menu is open, so BlockNote froze the side menu itself
 *   and unfreezes it when the menu closes. The hold lets go without touching
 *   it, so that after the menu closes the next move onto the handle holds it
 *   again (a hold that kept believing it held never did, and #808 was back).
 * - null: nothing changes.
 *
 * A finger is left alone: a touch is captured to where it began, so its moves
 * all report the handle, and a lifted finger sends no move to release it.
 */
export function holdDecision({ held, onOwnMenu, blockMenuOpen, pointerType }: HoldInput): 'hold' | 'release' | 'yield' | null {
  if (pointerType === 'touch') return null;
  if (blockMenuOpen) return held ? 'yield' : null;
  if (onOwnMenu && !held) return 'hold';
  if (!onOwnMenu && held) return 'release';
  return null;
}

/**
 * Installs the hold for one editor; returns the function that removes it.
 * `container` finds that editor's .bn-container, where BlockNote puts its side
 * menu; it is asked on each move because the editor mounts after this runs.
 */
export function holdSideMenuWhileHovered(
  menu: SideMenuFreeze | undefined,
  container: () => Element | null | undefined,
  doc: Document = document,
): () => void {
  if (!menu) return () => {};
  let held = false;
  const onMove = (e: PointerEvent) => {
    const root = container();
    if (!root) return;
    const target = e.target instanceof Element ? e.target.closest(SIDE_MENU_SELECTOR) : null;
    const decision = holdDecision({
      held,
      onOwnMenu: target !== null && root.contains(target),
      blockMenuOpen: root.querySelector(`${SIDE_MENU_SELECTOR} [aria-expanded="true"]`) !== null,
      pointerType: e.pointerType,
    });
    if (decision === 'hold') {
      held = true;
      menu.freezeMenu();
    } else if (decision === 'release') {
      held = false;
      menu.unfreezeMenu();
    } else if (decision === 'yield') {
      held = false;
    }
  };
  // pointermove comes before the mousemove BlockNote listens to, so the
  // freeze is in place by the time BlockNote looks.
  doc.addEventListener('pointermove', onMove, true);
  return () => doc.removeEventListener('pointermove', onMove, true);
}
