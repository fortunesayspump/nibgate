// Public prototype page renderer, extracted from the verified Worker shell.
const publicationDate = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const types = { article: 'writing', photo: 'photos', video: 'video', music: 'music', document: 'docs' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const text = (value, max = 1000) => typeof value === 'string' ? value.slice(0, max) : '';
const safeImage = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? esc(u.href) : ''; } catch { return ''; } };
const slugOK = s => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(s);
const pathFor = p => `/${types[p.type]}/${p.slug}`;
export const locked = p => p.publicAccess !== true || p.isLocked === true || (p.price != null && String(p.price) !== '0');
const baseHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'X-Nibgate-Renderer': 'lite-article-prototype' };
function shell(cfg, site, title, description, path, content, extra = '') {
  const name = esc(text(site.name, 200)); const canonical = cfg.canonical + path;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="noindex,nofollow"><link rel="canonical" href="${esc(canonical)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Kumbh+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/lite/creator.css"><link rel="stylesheet" href="/lite/prototype.css"><link rel="icon" href="/favicon.ico"><script src="/lite/theme.js"></script>${extra}</head><body>${cfg.network === 'testnet' ? '<div class="lite-banner">TESTNET — PLAY MONEY ONLY, NOTHING HERE IS REAL.</div>' : ''}<nav class="flex align-center font-ui" style="margin-top:20px"><a class="internal-link plain flex-grow" href="/" style="font-size:1.15em;font-weight:500">${name}</a><a class="muted plain" href="${cfg.app}/about">About</a><a class="muted plain" href="${cfg.app}/admin/login" style="margin-left:.75em">Admin</a><button id="lite-theme" type="button" aria-label="Toggle dark mode" style="margin-left:.75em">◐</button></nav>${content}<footer class="bt pn2" style="margin:2em auto;max-width:var(--wrap-wide);width:var(--wrap-normal);text-align:center"><a class="muted plain" href="https://nibgate.xyz/">Powered by <img src="/nibgate-wordmark.svg" alt="Nibgate" style="display:inline-block;width:100px;vertical-align:middle"></a><p class="muted small">Isolated renderer preview</p></footer></body></html>`;
}
function meta(name, value) { return `<meta name="${name}" content="${esc(value)}">`; }
export function articleHTML(cfg, site, post, publicRenderer) {
  const path = pathFor(post); const gated = locked(post); const title = text(post.title, 300); const excerpt = text(post.excerpt, 3000); const price = post.price == null ? '0' : String(post.price); const id = text(post.id, 100);
  const manifest = `${cfg.app}/api/nibgate/manifest?path=${encodeURIComponent(path)}`; const access = cfg.app + '/api' + path;
  const publicResource = { '@context': 'https://schema.org', '@type': 'Article', headline: title, description: excerpt, url: cfg.canonical + path, mainEntityOfPage: cfg.canonical + path, datePublished: text(post.publishedAt, 50), dateModified: text(post.updatedAt || post.publishedAt, 50), author: { '@type': 'Person', name: text(post.author?.name, 200) || text(site.name, 200) }, isAccessibleForFree: !gated };
  const cover = safeImage(post.coverUrl); if (cover) publicResource.image = String(post.coverUrl);
  let body; let readingLabel = '';
  if (gated) {
    // Never read body/media/key fields for any locked or ambiguous-access post.
    body = `<div class="lite-gate"><p style="font-size:24px;font-weight:500">${esc(price)} USDC</p><p>${post.publicAccess === false ? 'Access to this content is restricted.' : 'Pay to unlock this content'}</p><a class="lite-pay" href="${cfg.app}${path}">Continue to payment</a><p class="small muted">Opens the existing creator payment page.</p></div>`;
  } else if (post.type === 'article' && typeof post.bodyMarkdown === 'string') {
    if (post.bodyMarkdown.length > 100000) throw new Error('Public article exceeds prototype budget');
    const md = post.bodyMarkdown.replace(/nibgate-embed:\/\/(\d+)/g, (_m, i) => `${cfg.app}/api/nibgate/media/${encodeURIComponent(id)}/photo?index=${i}`);
    const rendered = publicRenderer(md, {cfg, post});
    if (post.bodyMarkdown.trim()) readingLabel = `${Math.max(1, Math.round(post.bodyMarkdown.trim().split(/\s+/).length / 200))} min read`;
    console.log(JSON.stringify({ publicMarkdownMode: rendered.mode }));
    body = `<div class="prose prose-neutral dark:prose-invert">${rendered.html}</div>`;
  } else {
    body = `<p><a href="${cfg.app}${path}">Read this content on the existing creator page →</a></p>`;
  }
  const date = new Date(post.publishedAt); const dateLabel = Number.isNaN(date.valueOf()) ? '' : publicationDate.format(date);
  const extra = `<meta property="og:type" content="article">${cover ? `<meta property="og:image" content="${cover}"><meta name="twitter:image" content="${cover}">` : ''}${Object.entries({ 'resource-id': id, title, type: post.type, price, path, image: text(post.coverUrl, 2000), access, manifest }).map(([k,v]) => meta('nibgate:'+k,v)).join('')}<script type="application/ld+json">${JSON.stringify(publicResource).replace(/</g,'\\u003c')}</script>`;
  const content = `<article data-nibgate-resource data-nibgate-id="${esc(id)}" data-nibgate-title="${esc(title)}" data-nibgate-type="${esc(post.type)}" data-nibgate-price="${esc(price)}" data-nibgate-image="${cover}" data-nibgate-path="${esc(path)}" data-nibgate-access="${esc(access)}" data-nibgate-manifest="${esc(manifest)}"><link rel="alternate" type="application/json" href="${esc(manifest)}"><div class="wrap" style="max-width:var(--wrap-post);margin:0 auto"><div class="small muted font-ui" style="margin-bottom:.5em">${esc(({article:'✎ Article',photo:'▣ Photo',video:'▶ Video',music:'♫ Music',document:'▤ Document'})[post.type] || post.type)}</div><h1 style="margin-top:0;margin-bottom:.15em">${esc(title)}</h1><div class="small muted font-ui pn1" style="padding-top:.75em"><time>${esc(dateLabel)}</time>${readingLabel ? ` · <span class="reading-time">${readingLabel}</span>` : ''}</div>${excerpt ? `<p class="small muted" style="margin:1em 0 2em">${esc(excerpt)}</p>` : ''}</div><div class="wrap">${cover ? `<img src="${cover}" alt="${esc(title)}" style="width:100%;height:auto;max-height:400px;object-fit:cover;border-radius:6px;margin:1rem 0 2rem">` : ''}${body}</div><div class="wrap"><p class="small muted"><a href="${cfg.app}${path}">Tips, ratings and ${gated ? 'unlocking' : 'interactive features'} on the existing creator page →</a></p></div></article>`;
  return { html: shell(cfg, site, `${title} · ${site.name}`, excerpt, path, content, extra), manifest };
}
