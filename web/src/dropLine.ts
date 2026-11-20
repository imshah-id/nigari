// The width of the drop line (#809), from the token --editor-drop-line-width.
// BlockNote takes the width as a number of pixels when the editor is created,
// not as CSS, so the token is read from the stylesheet, once: the editor's
// options are rebuilt on every render, and each read forces a style pass.
// The fallback is only for a page where tokens.css has not applied yet (a test
// harness), and matches the token today.
export const DROP_LINE_FALLBACK_PX = 2;

let measured: number | undefined;

export function dropLineWidth(): number {
  if (measured !== undefined) return measured;
  if (typeof document === 'undefined') return DROP_LINE_FALLBACK_PX;
  const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--editor-drop-line-width'));
  if (!(Number.isFinite(px) && px > 0)) return DROP_LINE_FALLBACK_PX;
  measured = px;
  return px;
}
