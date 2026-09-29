// External content-ID E2E: load the real built extension and point it at up to
// 20 real third-party blogs from randomblog.rocks. Each blog root often has no
// article, so when the landing page isn't readerable we descend into the most
// article-like same-origin link and assess that. For every assessed page we
// record whether the tip UI was injected, where it landed relative to the
// article region, and what the JEV-style structural candidates looked like —
// the data needed to judge detection accuracy on sites we don't control.
//
// Run: npx playwright test -c extension.config.ts extension-random-blogs
// Knobs: RANDOM_BLOG_COUNT (1..20, default 20), STRICT=1 fails on invariant
//        violations (duplicate cards / card in chrome regions).
import { test, chromium } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { collectRandomUrls } from '../random-blogs.mjs';

const EXT_PATH = path.resolve('extension/dist');
const READABILITY_JS = path.resolve('extension/node_modules/@mozilla/readability/Readability.js');
const READERABLE_JS = path.resolve('extension/node_modules/@mozilla/readability/Readability-readerable.js');
const OUT_DIR = path.resolve('e2e/random-blog-results');

const COUNT = Math.max(1, Math.min(60, Number(process.env.RANDOM_BLOG_COUNT || 20)));
const STRICT = process.env.STRICT === '1';
const EVAL = process.env.RANDOM_BLOG_EVAL === '1';
const LABELS_PATH = path.resolve('e2e/labels.json');

// Platforms/social/apps are not a creator-content target. The harness does not
// walk deeper into them, so the report reflects the extension's real behaviour
// (what it does on the page you are actually on).
const PLATFORM_HOSTS = new Set([
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'bsky.app',
  'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com', 'reddit.com', 'threads.net',
  'threads.com', 'telegram.org', 't.me', 'whatsapp.com', 'snapchat.com', 'discord.com',
  'twitch.tv', 'tumblr.com', 'vk.com', 'weibo.com', 'line.me', 'quora.com',
  'google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'amazon.com', 'ebay.com',
  'paypal.com', 'apple.com', 'microsoft.com', 'github.com',
]);

type Candidate = { sel: string; tag: string; id: string; cls: string; words: number; containsWidget: boolean };

type PageProbe = {
  assessed: boolean;
  kind: string;
  type: string;
  eligible: string;
  reason: string;
  cardLine: string;
  cardSite: string;
  readerable: boolean | null;
  readableTitle: string | null;
  readableLength: number | null;
  pageWords: number;
  inBoilerplate: boolean;
  inRegion: boolean;
  regionTag: string | null;
  proseProgress: number | null;
  inProseAncestor: boolean;
  candidates: Candidate[];
};

type Visit = PageProbe & {
  url: string;
  status: number | null;
  navigated: boolean;
  cardCount: number;
  injected: boolean;
  hostContainsCandidate: boolean;
  error?: string;
};

type SiteResult = {
  host: string;
  landingUrl: string;
  landing: { status: number | null; readerable: boolean | null; cardCount: number; pageWords: number; assessed: boolean; kind: string };
  assessedUrl: string;
  descended: boolean;
  status: number | null;
  assessed: boolean;
  kind: string;
  type: string;
  eligible: string;
  reason: string;
  cardCount: number;
  injected: boolean;
  cardTitle: string;
  cardSite: string;
  readerable: boolean | null;
  readableTitle: string | null;
  pageWords: number;
  inBoilerplate: boolean;
  inRegion: boolean;
  regionTag: string | null;
  proseProgress: number | null;
  inProseAncestor: boolean;
  hostContainsCandidate: boolean;
  topCandidate: { sel: string; tag: string; words: number } | null;
  candidates: Candidate[];
  verdict: 'correct' | 'miss' | 'false-positive' | 'skip' | 'error';
  note: string;
  screenshot?: string;
};

async function probe(page: import('@playwright/test').Page): Promise<PageProbe> {
  await page.addScriptTag({ path: READABILITY_JS }).catch(() => {});
  await page.addScriptTag({ path: READERABLE_JS }).catch(() => {});
  return page.evaluate(() => {
    const w = window as any;
    const host = document.querySelector('[data-nibgate-widget]');
    const shadow = (host as HTMLElement | null)?.shadowRoot;
    const cardLine = shadow?.querySelector('.line')?.textContent?.trim() || '';
    const cardSite = shadow?.querySelector('.site')?.textContent?.trim() || '';

    let readerable: boolean | null = null;
    try {
      readerable = typeof w.isProbablyReaderable === 'function'
        ? w.isProbablyReaderable(document, { minContentLength: 240, minScore: 24 })
        : null;
    } catch {}

    let readableTitle: string | null = null;
    let readableLength: number | null = null;
    try {
      const parsed = w.Readability ? new w.Readability(document.cloneNode(true)).parse() : null;
      readableTitle = parsed?.title ?? null;
      readableLength = parsed?.length ?? null;
    } catch {}

    const pageWords = (document.body?.innerText || '').trim().split(/\s+/).filter(Boolean).length;
    const boiler = host
      ? host.closest('header,nav,footer,aside,[role=navigation],[role=complementary],[role=contentinfo]')
      : null;
    const region = host ? host.closest('article,[role=article],main,[role=main]') : null;

    // Generic placement metric, independent of semantic tags: how far through
    // the page's prose does the widget sit, and does it live in a prose-rich
    // ancestor? A native "after the article" widget should score near 1 and sit
    // inside an ancestor holding most of the text.
    let wordsBeforeHost = 0;
    let totalProse = 0;
    let inProseAncestor = false;
    if (host) {
      // Scope to the content region so sidebars/comments/related text don't
      // distort the placement metric.
      const scope = host.closest('article, [role="main"], main') || document;
      for (const b of Array.from(scope.querySelectorAll('p, blockquote, li'))) {
        if (b.closest('[data-nibgate-widget]')) continue;
        const n = ((b.textContent || '').trim() || '').split(/\s+/).filter(Boolean).length;
        totalProse += n;
        if (host.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) wordsBeforeHost += n;
      }
      let anc: Element | null = host.parentElement;
      while (anc) {
        const w = ((anc.textContent || '').trim() || '').split(/\s+/).filter(Boolean).length;
        if (w >= 150) {
          inProseAncestor = true;
          break;
        }
        anc = anc.parentElement;
      }
    }
    const proseProgress = totalProse > 0 ? wordsBeforeHost / totalProse : null;

    const sels = ['article', '[role="main"]', '[role="article"]', 'main', '.post-content', '.entry-content', '.article-body', '[itemtype*="Article"]'];
    const seen = new Set<Element>();
    const candidates: Candidate[] = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const words = ((el.textContent || '').trim() || '').split(/\s+/).filter(Boolean).length;
        if (words < 50) continue;
        candidates.push({
          sel,
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          cls: (el.getAttribute('class') || '').slice(0, 60),
          words,
          containsWidget: host ? el.contains(host) : false,
        });
      }
    }
    candidates.sort((a, b) => b.words - a.words);

    return {
      assessed: document.documentElement.getAttribute('data-nibgate-assessed') === '1',
      kind: document.documentElement.getAttribute('data-nibgate-kind') || '',
      type: document.documentElement.getAttribute('data-nibgate-type') || '',
      eligible: document.documentElement.getAttribute('data-nibgate-eligible') || '',
      reason: document.documentElement.getAttribute('data-nibgate-reason') || '',
      cardLine,
      cardSite,
      readerable,
      readableTitle,
      readableLength,
      pageWords,
      inBoilerplate: Boolean(boiler),
      inRegion: Boolean(region),
      regionTag: region?.tagName?.toLowerCase() ?? null,
      proseProgress,
      inProseAncestor,
      candidates: candidates.slice(0, 6),
    };
  });
}

async function visit(page: import('@playwright/test').Page, url: string): Promise<Visit> {
  const out: Visit = {
    url,
    status: null,
    navigated: false,
    assessed: false,
    kind: '',
    type: '',
    eligible: '',
    reason: '',
    cardCount: 0,
    injected: false,
    cardLine: '',
    cardSite: '',
    readerable: null,
    readableTitle: null,
    readableLength: null,
    pageWords: 0,
    inBoilerplate: false,
    inRegion: false,
    regionTag: null,
    proseProgress: null,
    inProseAncestor: false,
    hostContainsCandidate: false,
    candidates: [],
  };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    out.status = resp?.status() ?? null;
    out.navigated = true;
    await page
      .waitForFunction(() => document.documentElement.getAttribute('data-nibgate-assessed') === '1', null, { timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    const measured = await probe(page);
    Object.assign(out, measured);
    out.cardCount = await page.locator('#nibgate-card').count();
    out.injected = out.cardCount === 1;
    out.hostContainsCandidate = measured.candidates.some((c) => c.containsWidget);
  } catch (e) {
    out.error = (e as Error)?.message || String(e);
  }
  return out;
}

async function findArticleLinks(page: import('@playwright/test').Page, max = 5): Promise<string[]> {
  return page.evaluate((limit) => {
    const origin = location.origin;
    const bad = /(tag|category|author|page|about|contact|archive|feed|rss|login|signin|subscribe|privacy|terms|search|comment|share|donate|shop|cart|index)/i;
    const anchors = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => ({ a, url: (a as HTMLAnchorElement).href }))
      .filter(({ url }) => {
        try {
          const u = new URL(url);
          return (
            u.origin === origin &&
            !bad.test(u.pathname) &&
            u.pathname.replace(/\/$/, '').split('/').filter(Boolean).length >= 1
          );
        } catch {
          return false;
        }
      });
    const inArticle = anchors.filter(({ a }) => a.closest('article,main,.post,.entry-content,.post-content,.entry'));
    const pool = (inArticle.length ? inArticle : anchors)
      .map(({ a, url }) => {
        const u = new URL(url);
        const seg = u.pathname.replace(/\/$/, '').split('/').filter(Boolean).pop() || '';
        const slug = seg.length >= 8 && /[-_]/.test(seg) ? 2 : seg.length >= 6 ? 1 : 0;
        return { url, slug, text: (a.textContent || '').trim().length };
      })
      .sort((x, y) => y.slug - x.slug || y.text - x.text);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of pool) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      out.push(p.url);
      if (out.length >= limit) break;
    }
    return out;
  }, max);
}

async function captureScreenshot(page: import('@playwright/test').Page, file: string, kind: string): Promise<void> {
  const hasWidget = await page
    .evaluate((kindLabel) => {
      const host = document.querySelector('[data-nibgate-widget]') as HTMLElement | null;
      const badge = document.createElement('div');
      badge.setAttribute('data-nibgate-shot-badge', '');
      badge.style.cssText =
        'position:fixed;top:8px;left:8px;z-index:2147483647;color:#fff;' +
        "font:700 12px system-ui,sans-serif;padding:6px 10px;border-radius:999px;" +
        'box-shadow:0 2px 8px rgba(0,0,0,.35);';
      if (!host) {
        // Skipped page: label it so the screenshot is self-explanatory.
        badge.textContent = `Nibgate: no tip (kind=${kindLabel || 'n/a'})`;
        badge.style.background = '#6b7280';
        document.body.appendChild(badge);
        window.scrollTo(0, 0);
        return false;
      }
      host.style.outline = '4px dashed #ff3e30';
      host.style.outlineOffset = '4px';
      badge.textContent = 'Nibgate tip UI ↓';
      badge.style.background = '#ff3e30';
      document.body.appendChild(badge);
      host.scrollIntoView({ block: 'center', inline: 'center' });
      return true;
    }, kind)
    .catch(() => false);

  await page.waitForTimeout(hasWidget ? 500 : 200);
  await page.screenshot({ path: file, fullPage: false, timeout: 20000 }).catch(() => {});

  await page
    .evaluate(() => {
      document.querySelector('[data-nibgate-shot-badge]')?.remove();
      const host = document.querySelector('[data-nibgate-widget]') as HTMLElement | null;
      if (host) {
        host.style.outline = '';
        host.style.outlineOffset = '';
      }
    })
    .catch(() => {});
}

test('external random blogs: tip UI injection + content placement', async () => {
  test.setTimeout(COUNT * 90_000 + 240_000);
  await mkdir(OUT_DIR, { recursive: true });

  const labels: Record<string, { inject: boolean; type?: string; why?: string }> = EVAL
    ? JSON.parse(await readFile(LABELS_PATH, 'utf8'))
    : {};
  const explicit = (process.env.RANDOM_BLOG_URLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const urls = EVAL
    ? Object.keys(labels)
    : explicit.length
      ? explicit.slice(0, 60)
      : await collectRandomUrls(COUNT, process.env.RANDOM_BLOG_SOURCE || 'randomblog');
  console.error(`\n[random-blogs] ${EVAL ? 'eval' : explicit.length ? 'explicit' : process.env.RANDOM_BLOG_SOURCE || 'randomblog'} ${urls.length} hosts`);

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'nib-ext-rand-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });

  const results: SiteResult[] = [];
  try {
    for (let i = 0; i < urls.length; i++) {
      const landingUrl = urls[i];
      const host = new URL(landingUrl).hostname.replace(/^www\./, '');
      const page = await context.newPage();
      page.on('dialog', (d) => d.dismiss().catch(() => {}));
      const result: SiteResult = {
        host,
        landingUrl,
        landing: { status: null, readerable: null, cardCount: 0, pageWords: 0, assessed: false, kind: '' },
        assessedUrl: landingUrl,
        descended: false,
        status: null,
        assessed: false,
        kind: '',
        type: '',
        eligible: '',
        reason: '',
        cardCount: 0,
        injected: false,
        cardTitle: '',
        cardSite: '',
        readerable: null,
        readableTitle: null,
        pageWords: 0,
        inBoilerplate: false,
        inRegion: false,
        regionTag: null,
        proseProgress: null,
        inProseAncestor: false,
        hostContainsCandidate: false,
        topCandidate: null,
        candidates: [],
        verdict: 'error',
        note: '',
      };

      try {
        const landing = await visit(page, landingUrl);
        result.landing = {
          status: landing.status,
          readerable: landing.readerable,
          cardCount: landing.cardCount,
          pageWords: landing.pageWords,
          assessed: landing.assessed,
          kind: landing.kind,
        };

        let final = landing;
        if (landing.navigated && !landing.injected && !PLATFORM_HOSTS.has(host) && !EVAL) {
          const links = await findArticleLinks(page).catch(() => [] as string[]);
          for (const article of links) {
            if (!article || article === landingUrl) continue;
            const attempt = await visit(page, article);
            result.descended = true;
            final = attempt;
            if (attempt.injected || attempt.kind === 'content') break;
          }
        }
        result.assessedUrl = final.url;
        result.status = final.status;
        result.assessed = final.assessed;
        result.kind = final.kind;
        result.type = final.type;
        result.eligible = final.eligible;
        result.reason = final.reason;
        result.cardCount = final.cardCount;
        result.injected = final.injected;
        result.cardTitle = final.cardLine;
        result.cardSite = final.cardSite;
        result.readerable = final.readerable;
        result.readableTitle = final.readableTitle;
        result.pageWords = final.pageWords;
        result.inBoilerplate = final.inBoilerplate;
        result.inRegion = final.inRegion;
        result.regionTag = final.regionTag;
        result.proseProgress = final.proseProgress;
        result.inProseAncestor = final.inProseAncestor;
        result.hostContainsCandidate = final.hostContainsCandidate;
        result.candidates = final.candidates;
        result.topCandidate = final.candidates[0]
          ? { sel: final.candidates[0].sel, tag: final.candidates[0].tag, words: final.candidates[0].words }
          : null;

        if (!final.navigated) {
          result.note = final.error || 'navigation failed';
        } else if (result.injected) {
          if (result.inBoilerplate) {
            result.verdict = 'false-positive';
            result.note = 'card landed in nav/header/footer/aside';
          } else if (result.pageWords > 0 && result.pageWords < 200) {
            result.verdict = 'false-positive';
            result.note = `card injected on a thin page (${result.pageWords} words)`;
          } else {
            result.verdict = 'correct';
          }
        } else if (result.assessed) {
          if (result.kind === 'content') {
            result.verdict = 'miss';
            result.note = 'content page but no card injected';
          } else {
            result.verdict = 'skip';
            result.note = `correctly stayed out (kind=${result.kind})`;
          }
        } else {
          result.note = 'assessment never signalled (content script blocked/slow?)';
        }

        const shot = path.join(OUT_DIR, `${String(i + 1).padStart(2, '0')}-${host}.png`);
        await captureScreenshot(page, shot, result.kind);
        result.screenshot = path.relative(process.cwd(), shot);
      } catch (e) {
        result.note = `probe error: ${(e as Error)?.message || e}`;
      } finally {
        await page.close().catch(() => {});
      }

      results.push(result);
      const icon = result.verdict === 'correct' ? 'OK ' : result.verdict === 'skip' ? '—  ' : '!! ';
      console.error(
        `${icon}${String(i + 1).padStart(2, '0')}/${urls.length} ${result.verdict.padEnd(14)} cards=${result.cardCount} kind=${result.kind} type=${result.type} eligible=${result.eligible} descended=${result.descended} ${host}${result.note ? ` (${result.note})` : ''}`,
      );
    }
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }

  const focused: Record<string, number> = { correct: 0, miss: 0, 'false-positive': 0, skip: 0, error: 0 };
  for (const r of results) focused[r.verdict] = (focused[r.verdict] || 0) + 1;
  const report = { generatedAt: new Date().toISOString(), count: results.length, focused, results };

  const reportPath = path.join(OUT_DIR, `report-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  const injected = results.filter((r) => r.injected).length;
  const duplicates = results.filter((r) => r.cardCount > 1);
  const boilerplate = results.filter((r) => r.injected && r.inBoilerplate);
  const readerable = results.filter((r) => r.readerable === true);
  const readerableInjected = readerable.filter((r) => r.injected).length;
  const placedInRegion = results.filter((r) => r.injected && (r.inRegion || r.hostContainsCandidate || r.inProseAncestor)).length;
  const placedAfterProse = results.filter((r) => r.injected && r.proseProgress !== null && r.proseProgress >= 0.6).length;

  console.error('\n==== random-blog scan summary ====');
  console.error(`sites visited       : ${results.length}`);
  console.error(`cards injected      : ${injected}`);
  console.error(`correct             : ${focused.correct}`);
  console.error(`misses              : ${focused.miss}`);
  console.error(`false positives     : ${focused['false-positive']}`);
  console.error(`correct skips       : ${focused.skip}`);
  console.error(`errors/timeouts     : ${focused.error}`);
  console.error(`readerable pages    : ${readerable.length} (injected on ${readerableInjected} = ${readerable.length ? Math.round((readerableInjected / readerable.length) * 100) : 0}%)`);
  console.error(`placed in region    : ${injected ? Math.round((placedInRegion / injected) * 100) : 0}% of injected cards`);
  console.error(`placed after prose  : ${injected ? Math.round((placedAfterProse / injected) * 100) : 0}% of injected cards`);
  console.error(`duplicate cards     : ${duplicates.length}`);
  console.error(`cards in boilerplate: ${boilerplate.length}`);
  console.error(`report              : ${path.relative(process.cwd(), reportPath)}`);

  let evalPrecision = 1;
  let evalRecall = 1;
  if (EVAL) {
    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;
    let excluded = 0;
    const mismatches: string[] = [];
    for (const r of results) {
      const expected = labels[r.landingUrl]?.inject;
      if (expected === undefined) continue;
      // Network failures (bad cert/DNS/timeout) are not detection errors.
      if (r.landing.status === null) {
        excluded += 1;
        continue;
      }
      const actual = r.landing.cardCount === 1;
      if (expected && actual) tp += 1;
      else if (expected && !actual) {
        fn += 1;
        mismatches.push(`${r.landingUrl} — expected inject, got skip (kind=${r.landing.kind})`);
      } else if (!expected && actual) {
        fp += 1;
        mismatches.push(`${r.landingUrl} — expected skip, got inject (kind=${r.landing.kind})`);
      } else {
        tn += 1;
      }
    }
    evalPrecision = tp + fp ? tp / (tp + fp) : 1;
    evalRecall = tp + fn ? tp / (tp + fn) : 1;
    const f1 = evalPrecision + evalRecall ? (2 * evalPrecision * evalRecall) / (evalPrecision + evalRecall) : 0;
    console.error('\n==== golden-set eval (precision/recall) ====');
    console.error(`tp=${tp} fp=${fp} tn=${tn} fn=${fn} excluded=${excluded}`);
    console.error(
      `precision=${(evalPrecision * 100).toFixed(1)}%  recall=${(evalRecall * 100).toFixed(1)}%  f1=${(f1 * 100).toFixed(1)}%`,
    );
    if (mismatches.length) console.error('mismatches:\n  ' + mismatches.join('\n  '));
  }

  if (STRICT) {
    const { expect } = await import('@playwright/test');
    expect(duplicates, 'never inject more than one card').toHaveLength(0);
    expect(boilerplate, 'never inject the card into nav/header/footer/aside').toHaveLength(0);
    if (EVAL) {
      expect(evalPrecision, 'golden-set precision >= 0.9').toBeGreaterThanOrEqual(0.9);
      expect(evalRecall, 'golden-set recall >= 0.9').toBeGreaterThanOrEqual(0.9);
    }
  }
});
