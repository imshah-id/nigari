// The width of the drop line (#809), from the token --editor-drop-line-width.
// BlockNote takes the width as a number of pixels when the editor is created,
// not as CSS, so the token is read once from the stylesheet. Reading it keeps
// one place to change it; the fallback is only for a page where tokens.css has
// not applied yet (a test harness), and matches the token today.
export const DROP_LINE_FALLBACK_PX = 2;

export function dropLineWidth(root: Element | null = typeof document === 'undefined' ? null : document.documentElement): number {
  if (!root) return DROP_LINE_FALLBACK_PX;
  const px = parseFloat(getComputedStyle(root).getPropertyValue('--editor-drop-line-width'));
  return Number.isFinite(px) && px > 0 ? px : DROP_LINE_FALLBACK_PX;
}
