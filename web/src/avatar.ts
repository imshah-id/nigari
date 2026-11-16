// A person's round avatar when they have no picture: initials on a colour
// derived from the name, so the same person always gets the same one. Used by
// the comments, the presence row and the person property.

export function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hues = [210, 145, 275, 25, 340, 190, 95, 55];
  return `hsl(${hues[h % hues.length]} 55% 45%)`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}
