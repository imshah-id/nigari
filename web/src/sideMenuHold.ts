// The block handle stays put while the pointer is on it (#808).
//
// BlockNote decides which block the + and drag handle belong to on every
// mousemove, from what lies under the pointer, and it looks THROUGH its own
// side menu to do so (the menu is a floating layer outside the editor's DOM).
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
// Turned down, both tried:
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

const inMenu = (node: EventTarget | null): boolean =>
  node instanceof Element && node.closest(SIDE_MENU_SELECTOR) !== null;

/** The block menu behind the handle is open: BlockNote froze the side menu
 *  itself and unfreezes it when the menu closes, so the hold leaves it be. */
const blockMenuOpen = (doc: Document): boolean =>
  doc.querySelector(`${SIDE_MENU_SELECTOR} [aria-expanded="true"]`) !== null;

/** What a pointer move onto `target` does to the hold, given whether it is
 *  held now. Decided on every move, not on enter and leave: around a drag the
 *  browser sends a stray pointerover for where the pointer was when the drag
 *  began (measured: it re-froze the handle after every drop). */
export function holdDecision(held: boolean, target: EventTarget | null): 'hold' | 'release' | null {
  const isIn = inMenu(target);
  if (isIn && !held) return 'hold';
  if (!isIn && held) return 'release';
  return null;
}

/** Installs the hold on a document; returns the function that removes it. */
export function holdSideMenuWhileHovered(menu: SideMenuFreeze | undefined, doc: Document = document): () => void {
  if (!menu) return () => {};
  let held = false;
  const release = () => {
    if (!held) return;
    held = false;
    if (!blockMenuOpen(doc)) menu.unfreezeMenu();
  };
  // pointermove comes before the mousemove BlockNote listens to, so the
  // freeze is in place by the time BlockNote looks.
  const onMove = (e: PointerEvent) => {
    const decision = holdDecision(held, e.target);
    if (decision === 'hold') {
      held = true;
      menu.freezeMenu();
    } else if (decision === 'release') release();
  };
  doc.addEventListener('pointermove', onMove, true);
  return () => doc.removeEventListener('pointermove', onMove, true);
}
