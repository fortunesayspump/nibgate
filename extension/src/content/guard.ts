// Automatic page controls never run on Nibgate or loopback app surfaces.
// This guard is shared by registration fallbacks and the injected script.
export function isTippableUrl(href: string): boolean {
  try {
    const url = new URL(href);
    if(url.protocol !== 'http:' && url.protocol !== 'https:')return false;
    const host=url.hostname.toLowerCase().replace(/\.$/, '');
    if(host==='nibgate.xyz'||host.endsWith('.nibgate.xyz')||host==='localhost'||host.endsWith('.localhost')||host==='[::1]'||host==='::1'||/^127\./.test(host))return false;
    // Root pages and common navigation/listing/account routes are not creator
    // posts, even when a prose-heavy theme makes them resemble one.
    const path=url.pathname.replace(/\/{2,}/g,'/').replace(/\/$/,'')||'/';
    if(path==='/'||/^\/(?:home|blog|posts|articles|archive|archives|tags|categories|search|feed|rss|about|contact|settings|account|login|signin|signup)$/.test(path))return false;
    // Automatic controls are only for independent creator sites. Social media
    // platforms are hard-blocked even on individual post/video routes.
    const socialRoots = [
      'twitter.com', 'x.com', 'youtube.com', 'youtu.be', 'discord.com', 'discordapp.com',
      'facebook.com', 'fb.com', 'instagram.com', 'threads.net', 'tiktok.com',
      'reddit.com', 'linkedin.com', 'bsky.app', 'twitch.tv',
    ];
    const socialFamily = socialRoots.some((root) => host === root || host.endsWith(`.${root}`));
    if(socialFamily)return false;
    return true;
  } catch {
    return false;
  }
}
