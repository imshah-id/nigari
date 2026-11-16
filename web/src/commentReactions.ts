import { t } from './i18n';

// The six reactions a comment takes (spec 017, R2), in the order the picker
// shows them. Stored and sent by key, not glyph: an emoji is not one fixed
// string (❤ with or without its variation selector), so a glyph as a key
// would let one reaction be stored twice. The server's copy is
// commentReactions in server/comments.go; check-comment-reactions.mjs keeps
// the two equal.
export const COMMENT_REACTIONS = [
  { key: 'thumbs_up', glyph: '👍' }, // i18n-ok: an emoji, the same in every language
  { key: 'heart', glyph: '❤️' }, // i18n-ok: an emoji
  { key: 'tada', glyph: '🎉' }, // i18n-ok: an emoji
  { key: 'smile', glyph: '😄' }, // i18n-ok: an emoji
  { key: 'eyes', glyph: '👀' }, // i18n-ok: an emoji
  { key: 'check', glyph: '✅' }, // i18n-ok: an emoji
] as const;

export type CommentReactionKey = (typeof COMMENT_REACTIONS)[number]['key'];

export function reactionGlyph(key: string): string {
  return COMMENT_REACTIONS.find((r) => r.key === key)?.glyph ?? '';
}

/** The reaction's name, for a screen reader and the chip's tooltip: a glyph
 *  alone is read out differently by every reader, or not at all. */
export function reactionName(key: string): string {
  switch (key) {
    case 'thumbs_up':
      return t('Thumbs up');
    case 'heart':
      return t('Heart');
    case 'tada':
      return t('Celebrate');
    case 'smile':
      return t('Smile');
    case 'eyes':
      return t('Eyes');
    case 'check':
      return t('Done');
  }
  return key;
}
