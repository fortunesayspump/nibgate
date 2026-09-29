// Collect real, random third-party blogs for external content-ID testing.
// Primary source: https://randomblog.rocks/random (302 → a random blog).
// Fallback: the three "Explore these blogs" links on the homepage, refetched
// until enough unique hosts are gathered.
//
// Usage (standalone): node e2e/random-blogs.mjs 20
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BLOCKED_HOST = /(^|\.)(randomblog\.rocks|personalsit\.es|kagi\.com|blogroll\.org|neocities\.org|ooh\.directory|boredbutton\.com|discuvver\.com|yellowbrickring\.com|xn--sr8hvo\.ws|indieblog\.page)$/i;
const BLOCKED_EXT = /\.(pdf|zip|rar|7z|gz|dmg|exe|png|jpe?g|gif|svg|webp|mp4|mp3)(\?|$)/i;
const SOCIAL_HOSTS = new Set([
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'bsky.app',
  'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com', 'reddit.com', 'threads.net',
  'threads.com', 'telegram.org', 't.me', 'whatsapp.com', 'snapchat.com', 'discord.com',
  'twitch.tv', 'tumblr.com', 'vk.com', 'weibo.com', 'line.me', 'quora.com',
]);

function normalize(href) {
  try {
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (BLOCKED_HOST.test(u.hostname)) return null;
    if (SOCIAL_HOSTS.has(u.hostname.replace(/^www\./, '').toLowerCase())) return null;
    if (BLOCKED_EXT.test(u.pathname)) return null;
    if (/\/(intent|sharer|share|login|signin|signup|search|compose|terms|privacy)\b/i.test(u.pathname)) return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('ref') || key.startsWith('utm_')) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchOnce(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, headers: { 'user-agent': UA, ...(init?.headers || {}) } });
  } finally {
    clearTimeout(timer);
  }
}

function homepageLinks(html) {
  const out = [];
  // Only the curated blog cards carry data-umami-event-blog; this excludes the
  // header/footer share buttons (twitter/bsky/facebook) and other chrome.
  for (const m of html.matchAll(/<a\b[^>]*>/g)) {
    const tag = m[0];
    if (!/data-umami-event-blog=/.test(tag)) continue;
    const href = tag.match(/href="(https?:\/\/[^"]+)"/);
    if (!href) continue;
    const url = normalize(href[1]);
    if (url) out.push(url);
  }
  return out;
}

function createCollector(count) {
  const seen = new Set();
  const urls = [];
  const add = (href) => {
    const url = normalize(href);
    if (!url) return false;
    let host;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return false;
    }
    if (seen.has(host)) return false;
    seen.add(host);
    urls.push(url);
    return true;
  };
  return { urls, add, done: () => urls.length >= count };
}

export async function collectRandomBlogs(count = 20) {
  const c = createCollector(count);
  const deadline = Date.now() + 180_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 15, 60);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const res = await fetchOnce('https://randomblog.rocks/random', { redirect: 'manual' });
      const location = res.headers.get('location');
      if (location && c.add(location)) continue;
      if (res.status === 200) {
        const html = await res.text();
        for (const url of homepageLinks(html)) {
          if (c.done()) break;
          c.add(url);
        }
      }
    } catch {
      // transient network error — keep trying until the deadline
    }
    if (!c.done()) {
      try {
        const res = await fetchOnce('https://randomblog.rocks/');
        if (res.ok) {
          const html = await res.text();
          for (const url of homepageLinks(html)) {
            if (c.done()) break;
            c.add(url);
          }
        }
      } catch {}
    }
  }
  return c.urls.slice(0, count);
}

// Wiby indexes small/old/independent sites; /surprise/ returns a meta-refresh
// to a random one — a good source of diverse, non-blog layouts and images.
export async function collectWiby(count = 20) {
  const c = createCollector(count);
  const deadline = Date.now() + 180_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 10, 40);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const res = await fetchOnce('https://wiby.me/surprise/');
      const html = await res.text();
      const m = html.match(/URL=([^"'>\s]+)/i);
      if (m) c.add(m[1]);
    } catch {}
  }
  return c.urls.slice(0, count);
}

// arXiv: random research papers across categories (content type: paper).
export async function collectArxiv(count = 20) {
  const c = createCollector(count);
  const deadline = Date.now() + 180_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 6, 30);
  const cats = ['cs.AI', 'cs.CL', 'cs.LG', 'math.CO', 'physics.gen-ph', 'q-bio.NC', 'econ.GN', 'stat.ML'];
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const cat = cats[Math.floor(Math.random() * cats.length)];
      const start = Math.floor(Math.random() * 800);
      const res = await fetchOnce(
        `https://export.arxiv.org/api/query?search_query=cat:${cat}&start=${start}&max_results=1`,
      );
      const xml = await res.text();
      const m = xml.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/);
      if (m) c.add(`https://arxiv.org/abs/${m[1]}`);
    } catch {}
  }
  return c.urls.slice(0, count);
}

// Wikimedia Commons: random image description pages (content type: gallery/image).
export async function collectCommons(count = 20) {
  const c = createCollector(count);
  const deadline = Date.now() + 180_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 10, 40);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const res = await fetchOnce('https://commons.wikimedia.org/wiki/Special:Random/File', { redirect: 'follow' });
      const finalUrl = res.url;
      if (finalUrl && /\/wiki\/File:/.test(finalUrl)) c.add(finalUrl);
    } catch {}
  }
  return c.urls.slice(0, count);
}

// Generic "302 → random page" sources (Wikipedia/Wikisource/Wiktionary).
async function collectRedirect(count, url) {
  const c = createCollector(count);
  const deadline = Date.now() + 120_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 8, 30);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const res = await fetchOnce(url, { redirect: 'manual' });
      const location = res.headers.get('location');
      if (location) c.add(new URL(location, url).toString());
      else if (res.status === 200 && res.url && res.url !== url) c.add(res.url);
    } catch {}
  }
  return c.urls.slice(0, count);
}

// Internet Archive: random item of a given mediatype. Covered mediatypes:
// audio, movies (video), texts (books/papers), image, software (code).
async function collectArchive(count, mediatype) {
  const c = createCollector(count);
  const deadline = Date.now() + 120_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 6, 24);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const page = 1 + Math.floor(Math.random() * 50);
      const res = await fetchOnce(
        `https://archive.org/advancedsearch.php?q=mediatype%3A${mediatype}&fl%5B%5D=identifier&rows=1&page=${page}&sort%5B%5D=random&output=json`,
      );
      const data = await res.json();
      const id = data?.response?.docs?.[0]?.identifier;
      if (id) c.add(`https://archive.org/details/${id}`);
    } catch {}
  }
  return c.urls.slice(0, count);
}

// PeerTube (federated video): random recent/ranged video from a random instance.
async function collectPeertube(count) {
  const c = createCollector(count);
  const instances = ['https://framatube.org', 'https://tube.tchncs.de', 'https://tilvids.com', 'https://peertube.tv', 'https://video.ploud.fr'];
  const deadline = Date.now() + 120_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 6, 24);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const base = instances[Math.floor(Math.random() * instances.length)];
      const start = Math.floor(Math.random() * 4000);
      const res = await fetchOnce(`${base}/api/v1/videos?count=1&start=${start}`);
      const data = await res.json();
      const url = data?.data?.[0]?.url;
      if (url) c.add(url);
    } catch {}
  }
  return c.urls.slice(0, count);
}

async function collectXkcd(count) {
  const c = createCollector(count);
  let max = 3000;
  try {
    const info = await (await fetchOnce('https://xkcd.com/info.0.json')).json();
    if (info?.num) max = info.num;
  } catch {}
  const deadline = Date.now() + 60_000;
  while (!c.done() && Date.now() < deadline) {
    c.add(`https://xkcd.com/${1 + Math.floor(Math.random() * max)}/`);
  }
  return c.urls.slice(0, count);
}

async function collectHn(count) {
  const c = createCollector(count);
  let max = 40_000_000;
  try {
    max = Number(await (await fetchOnce('https://hacker-news.firebaseio.com/v0/maxitem.json')).text()) || max;
  } catch {}
  const deadline = Date.now() + 90_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 12, 40);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const id = 1 + Math.floor(Math.random() * max);
      const item = await (await fetchOnce(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json();
      if (item && item.type === 'story' && !item.deleted) c.add(`https://news.ycombinator.com/item?id=${id}`);
    } catch {}
  }
  return c.urls.slice(0, count);
}

async function collectLobsters(count) {
  const c = createCollector(count);
  try {
    const items = await (await fetchOnce('https://lobste.rs/newest.json')).json();
    if (Array.isArray(items)) {
      for (const item of items.sort(() => Math.random() - 0.5)) {
        if (c.done()) break;
        if (item?.short_id_url) c.add(item.short_id_url);
      }
    }
  } catch {}
  return c.urls.slice(0, count);
}

async function collectStackExchange(count) {
  const c = createCollector(count);
  const sites = ['stackoverflow', 'superuser', 'askubuntu', 'math', 'physics', 'unix', 'serverfault', 'english'];
  const deadline = Date.now() + 90_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 6, 24);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const site = sites[Math.floor(Math.random() * sites.length)];
      const page = 1 + Math.floor(Math.random() * 40);
      const res = await fetchOnce(
        `https://api.stackexchange.com/2.3/questions?site=${site}&sort=votes&order=desc&pagesize=20&page=${page}`,
      );
      const data = await res.json();
      const items = data?.items || [];
      const pick = items[Math.floor(Math.random() * items.length)];
      if (pick?.link) c.add(pick.link);
    } catch {}
  }
  return c.urls.slice(0, count);
}

async function collectGithub(count) {
  const c = createCollector(count);
  const deadline = Date.now() + 90_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 6, 24);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const since = 1 + Math.floor(Math.random() * 80_000_000);
      const res = await fetchOnce(`https://api.github.com/repositories?since=${since}`, {
        headers: { accept: 'application/vnd.github+json' },
      });
      const repos = await res.json();
      if (Array.isArray(repos)) {
        const pick = repos[Math.floor(Math.random() * repos.length)];
        if (pick?.html_url) c.add(pick.html_url);
      }
    } catch {}
  }
  return c.urls.slice(0, count);
}

// Personal-blog-only sources (indie web): random post/site from curated rings.
async function collectIndieblog(count) {
  return collectRedirect(count, 'https://indieblog.page/random');
}
async function collectIndiewebring(count) {
  return collectRedirect(count, 'https://xn--sr8hvo.ws/random');
}
async function collectYellowbrick(count) {
  return collectRedirect(count, 'https://yellowbrickring.com/random');
}

// Harvest external links from a random-link page (boredbutton, ooh.directory)
// and pick one, excluding the host and known non-target domains.
const HARVEST_EXCLUDE = /(boredbutton|discuvver|ooh\.directory|indieblog|yellowbrick|randomblog\.rocks|xn--sr8hvo|fonts\.googleapis|gstatic|googleapis|google\.com|cloudflare|jquery|schema\.org|w3\.org|facebook|twitter|instagram)/i;
function harvestLinks(html) {
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const url = m[1];
    if (HARVEST_EXCLUDE.test(url)) continue;
    if (!/^https?:/.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

async function collectOoh(count) {
  const c = createCollector(count);
  const deadline = Date.now() + 90_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 6, 24);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const res = await fetchOnce('https://ooh.directory/random/');
      const links = harvestLinks(await res.text()).sort(() => Math.random() - 0.5);
      for (const url of links) {
        if (c.done()) break;
        c.add(url);
      }
    } catch {}
  }
  return c.urls.slice(0, count);
}

async function collectBoredbutton(count) {
  const c = createCollector(count);
  const deadline = Date.now() + 90_000;
  let attempts = 0;
  const maxAttempts = Math.max(count * 6, 24);
  while (!c.done() && attempts < maxAttempts && Date.now() < deadline) {
    attempts += 1;
    try {
      const res = await fetchOnce('https://www.boredbutton.com/random');
      const links = harvestLinks(await res.text());
      if (links[0]) c.add(links[0]);
    } catch {}
  }
  return c.urls.slice(0, count);
}

// Personal-site directory with a random redirect (personalsit.es).
async function collectPersonalsit(count) {
  return collectRedirect(count, 'https://personalsit.es/random');
}

// Kagi Small Web: Atom feed of recent posts from small/personal sites.
async function collectKagi(count) {
  const c = createCollector(count);
  const deadline = Date.now() + 90_000;
  while (!c.done() && Date.now() < deadline) {
    try {
      const xml = await (await fetchOnce('https://kagi.com/api/v1/smallweb/feed/')).text();
      const links = feedLinks(xml).sort(() => Math.random() - 0.5);
      for (const url of links) {
        if (c.done()) break;
        c.add(url);
      }
    } catch {}
    if (!c.done()) await new Promise((r) => setTimeout(r, 500));
  }
  return c.urls.slice(0, count);
}

// Ye Olde Blogroll firehose: RSS of personal blogs.
async function collectBlogroll(count) {
  const c = createCollector(count);
  const deadline = Date.now() + 90_000;
  while (!c.done() && Date.now() < deadline) {
    try {
      const xml = await (await fetchOnce('https://blogroll.org/feed')).text();
      const links = feedLinks(xml).sort(() => Math.random() - 0.5);
      for (const url of links) {
        if (c.done()) break;
        c.add(url);
      }
    } catch {}
    if (!c.done()) await new Promise((r) => setTimeout(r, 500));
  }
  return c.urls.slice(0, count);
}

// Neocities: random-tagged member sites.
async function collectNeocities(count) {
  const c = createCollector(count);
  const deadline = Date.now() + 90_000;
  while (!c.done() && Date.now() < deadline) {
    try {
      const html = await (await fetchOnce('https://neocities.org/browse?tag=random')).text();
      const names = new Set();
      for (const m of html.matchAll(/href="(?:\/sites\/([a-z0-9_-]+)|\/\/([a-z0-9_-]+)\.neocities\.org|https?:\/\/([a-z0-9_-]+)\.neocities\.org)/gi)) {
        const name = m[1] || m[2] || m[3];
        if (name && !/^(www|api|blog|browse|site|sites|assets|cdn)$/i.test(name)) names.add(name);
      }
      for (const name of [...names].sort(() => Math.random() - 0.5)) {
        if (c.done()) break;
        c.add(`https://${name}.neocities.org/`);
      }
    } catch {}
    if (!c.done()) await new Promise((r) => setTimeout(r, 500));
  }
  return c.urls.slice(0, count);
}

function feedLinks(xml) {
  const out = [];
  for (const m of xml.matchAll(/<link[^>]*href="([^"]+)"/g)) out.push(m[1]);
  for (const m of xml.matchAll(/<link>([^<]+)<\/link>/g)) out.push(m[1]);
  return [...new Set(out)].filter((u) => /^https?:/.test(u));
}

const PROVIDERS = {
  randomblog: collectRandomBlogs,
  wiby: collectWiby,
  indieblog: collectIndieblog,
  indiewebring: collectIndiewebring,
  yellowbrick: collectYellowbrick,
  ooh: collectOoh,
  boredbutton: collectBoredbutton,
  personalsit: collectPersonalsit,
  kagi: collectKagi,
  blogroll: collectBlogroll,
  neocities: collectNeocities,
  arxiv: collectArxiv,
  commons: collectCommons,
  wikipedia: (n) => collectRedirect(n, 'https://en.wikipedia.org/wiki/Special:Random'),
  wikisource: (n) => collectRedirect(n, 'https://en.wikisource.org/wiki/Special:Random'),
  wiktionary: (n) => collectRedirect(n, 'https://en.wiktionary.org/wiki/Special:Random'),
  archiveAudio: (n) => collectArchive(n, 'audio'),
  archiveMovies: (n) => collectArchive(n, 'movies'),
  archiveTexts: (n) => collectArchive(n, 'texts'),
  archiveImage: (n) => collectArchive(n, 'image'),
  archiveSoftware: (n) => collectArchive(n, 'software'),
  peertube: collectPeertube,
  xkcd: collectXkcd,
  hn: collectHn,
  lobsters: collectLobsters,
  stackexchange: collectStackExchange,
  github: collectGithub,
};

// 'mixed' = personal blogs/indie web only (the product target: creators, not
// brands or platforms).
const MIXED = [
  'randomblog',
  'indieblog',
  'indiewebring',
  'yellowbrick',
  'ooh',
  'boredbutton',
  'personalsit',
  'kagi',
  'blogroll',
  'wiby',
];

// source: 'randomblog' (default) | a provider key | 'mixed'.
export async function collectRandomUrls(count = 20, source = 'randomblog') {
  if (source === 'mixed') {
    const per = Math.max(1, Math.ceil(count / MIXED.length));
    const batches = await Promise.all(MIXED.map((n) => PROVIDERS[n](per)));
    const merged = [];
    const seen = new Set();
    for (let i = 0; i < per && merged.length < count; i++) {
      for (const list of batches) {
        const url = list[i];
        if (!url) continue;
        let host;
        try {
          host = new URL(url).hostname;
        } catch {
          continue;
        }
        if (seen.has(host)) continue;
        seen.add(host);
        merged.push(url);
        if (merged.length >= count) break;
      }
    }
    return merged.slice(0, count);
  }
  return (PROVIDERS[source] || collectRandomBlogs)(count);
}

import { pathToFileURL } from 'node:url';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = Math.max(1, Number(process.argv[2] || 20));
  const source = process.argv[3] || 'randomblog';
  collectRandomUrls(count, source).then((urls) => {
    console.log(JSON.stringify(urls, null, 2));
    console.error(`collected ${urls.length}/${count} (${source})`);
  });
}
