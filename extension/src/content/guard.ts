// Automatic page controls never run on Nibgate or loopback app surfaces.
// This guard is shared by registration fallbacks and the injected script.
export function isTippableUrl(href: string): boolean {
  try {
    const url = new URL(href);
    if(url.protocol !== 'http:' && url.protocol !== 'https:')return false;
    const host=url.hostname.toLowerCase().replace(/\.$/, '');
    return host!=='nibgate.xyz'&&!host.endsWith('.nibgate.xyz')&&host!=='localhost'&&!host.endsWith('.localhost')&&host!=='[::1]'&&host!=='::1'&&!/^127\./.test(host);
  } catch {
    return false;
  }
}
