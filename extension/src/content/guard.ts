// Only a protocol gate: whether a URL is even a candidate for content. Page
// kind (content vs app/feed/landing) is decided by the JEV page model from
// structure, not by host or keyword deny-lists.
export function isTippableUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
