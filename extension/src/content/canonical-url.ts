function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

export function canonicalContentUrl(canonical: string, pageUrl: string): string {
  try {
    const page = new URL(pageUrl);
    page.hash = '';
    if (!canonical) return page.href;

    const target = new URL(canonical, page);
    if (isLocalHost(target.hostname) && !isLocalHost(page.hostname)) return page.href;
    target.hash = '';
    return target.href;
  } catch {
    return pageUrl.split('#')[0];
  }
}
