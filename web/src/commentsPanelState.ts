// What the rest of the app needs to know about the comments panel without
// loading it: whether it is open, and the event it fires when a page's comments
// change. Kept apart from CommentsPanel.tsx so the panel itself can load only
// when it opens (it is lazy in Editor.tsx), out of the main chunk.

/** Fired after anything about this page's comments changed, so the count in the
 *  topbar stays right without the panel owning it. */
export const COMMENTS_CHANGED = 'nigari:comments-changed';

const PANEL_KEY = 'nigari-comments-open';

export function commentsPanelOpen(): boolean {
  return localStorage.getItem(PANEL_KEY) === '1';
}

export function setCommentsPanelOpen(open: boolean): void {
  if (open) localStorage.setItem(PANEL_KEY, '1');
  else localStorage.removeItem(PANEL_KEY);
}
