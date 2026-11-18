import { recordIndexDiagnostic, indexFailure } from '../jobs/index-diagnostics.js';
import crypto from 'node:crypto';
import { discardResponse } from '../lib/http-response.js';
import { db } from '@nibgate/internal/db.js';
import { getAccessToken, request, fetchSiteList, submitSitemapForDomain, assertIndexingDomain } from './gsc-sitemap.js';

const INSPECT_BASE = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

export async function inspectUrl(inspectionUrl, site = process.env.GSC_SITE || 'sc-domain:nibgate.xyz') {
  const token = await getAccessToken();
  const body = JSON.stringify({ inspectionUrl, siteUrl: site, languageCode: 'en-US' });
  const res = await request(INSPECT_BASE, { method: 'POST', body, token });
  const r = res.inspectionResult?.indexStatusResult || {};
  return {
    url: inspectionUrl,
    coverageState: r.coverageState || null,
    indexingState: r.indexingState || null,
    lastCrawlTime: r.lastCrawlTime || null,
    pageFetchState: r.pageFetchState || null,
    robotsTxtState: r.robotsTxtState || null,
    verdict: r.verdict || null,
  };
}

export function isIndexed(result) {
  const coverage = String(result.coverageState || '').toLowerCase();
  return coverage.includes('indexed') && !coverage.includes('not indexed');
}

export async function fetchSitemap(domain) {
  try {
    const result = await fetchSitemapRaw(domain);
    if (result.hash) recordIndexDiagnostic('sitemap_fetch', 'accepted');
    return result;
  } catch (error) { indexFailure('sitemap_fetch', error); throw error; }
}

async function fetchSitemapRaw(domain) {
  const url = `https://${domain}/sitemap.xml`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'NibgateIndexBot/1.0' }, signal: controller.signal });
    if (!res.ok) {
      await discardResponse(res);
      indexFailure('sitemap_fetch', { status: res.status });
      return { body: null, hash: null };
    }
    const body = await res.text();
    return { body, hash: crypto.createHash('sha256').update(body).digest('hex') };
  } finally {
    clearTimeout(timer);
  }
}

export function extractSitemapUrls(xml) {
  const urls = [];
  const re = /<loc>(.*?)<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) urls.push(m[1].trim());
  return urls;
}

export async function submitIndexNow(domain, urls) {
  try {
    const result = await submitIndexNowRaw(domain, urls);
    if (result.ok) recordIndexDiagnostic('indexnow_submit', result.pending ? 'accepted_pending' : 'accepted', result.pending ? 202 : 200);
    else if (!result.skipped) indexFailure('indexnow_submit', result);
    return result;
  } catch (error) { indexFailure('indexnow_submit', error); throw error; }
}

async function submitIndexNowRaw(domain, urls) {
  assertIndexingDomain(domain);
  const key = process.env.INDEXNOW_KEY || '';
  if (!key) return { skipped: 'INDEXNOW_KEY not set' };
  if (!urls.length) return { skipped: 'no urls to submit' };
  const origin = `https://${domain}`;
  const submittedUrls = urls.slice(0, 10000);
  const body = JSON.stringify({ host: domain, key, keyLocation: `${origin}/${key}.txt`, urlList: submittedUrls });
  const res = await fetch(INDEXNOW_ENDPOINT, {
    signal: AbortSignal.timeout(15_000),
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${key}` },
    body,
  });
  if (res.status === 200 || res.status === 202) {
    await discardResponse(res);
    return { ok: true, pending: res.status === 202, urls: submittedUrls.length };
  }
  const text = await res.text().catch(() => '');
  return { ok: false, status: res.status, message: text.slice(0, 200) };
}

export async function runIndexSweep({ dryRun = process.env.GSC_DRY_RUN === '1', persist = true, domains: selectedDomains } = {}) {
  if (!process.env.GSC_SERVICE_ACCOUNT_JSON) return { disabled: true, reason: 'GSC_SERVICE_ACCOUNT_JSON is not set' };
  const domains = selectedDomains ?? await fetchSiteList();
  const summary = {
    site: process.env.GSC_SITE || 'sc-domain:nibgate.xyz',
    dryRun,
    persist,
    domains: domains.length,
    newSites: 0,
    inspected: 0,
    indexed: 0,
    notIndexed: 0,
    changed: 0,
    resubmitted: 0,
    indexNow: 0,
    indexNowErrors: 0,
    indexNowPending: 0,
    notIndexedList: [],
    errors: [],
  };

  for (const domain of domains) {
    const url = `https://${domain}/`;
    try {
      let existing = null;
      if (persist) {
        existing = await db.indexState.findUnique({ where: { url } });
      }
      const isNew = !existing;
      if (isNew) summary.newSites += 1;

      let hashChanged = false;
      let sitemap = { body: null, hash: null };
      if (!dryRun) {
        sitemap = await fetchSitemap(domain);
        if (!sitemap.hash) throw new Error('Sitemap unavailable; retry next cadence');
        hashChanged = Boolean(sitemap.hash) && sitemap.hash !== existing?.sitemapHash;
      } else {
        hashChanged = isNew;
      }

      if (dryRun) {
        summary.inspected += 1;
      } else {
        const result = await inspectUrl(url);
        const indexed = isIndexed(result);

        if (persist) {
          await db.indexState.upsert({
            where: { url },
            update: {
              coverageState: result.coverageState,
              indexingState: result.indexingState,
              lastCrawlTime: result.lastCrawlTime ? new Date(result.lastCrawlTime) : null,
              isIndexed: indexed,
              lastInspectedAt: new Date(),
              // Inspection is not proof of delivery. Preserve the last accepted hash.
            },
            create: {
              url,
              domain,
              coverageState: result.coverageState,
              indexingState: result.indexingState,
              lastCrawlTime: result.lastCrawlTime ? new Date(result.lastCrawlTime) : null,
              isIndexed: indexed,
              sitemapHash: null,
            },
          });
        }

        summary.inspected += 1;
        if (indexed) {
          summary.indexed += 1;
        } else {
          summary.notIndexed += 1;
          summary.notIndexedList.push({ domain, coverageState: result.coverageState, indexingState: result.indexingState });
        }
      }

      if (isNew || hashChanged) {
        summary.changed += 1;
        if (!dryRun && persist) {
          let sitemapSubmitted = false;
          try {
            await submitSitemapForDomain(domain);
            sitemapSubmitted = true;
            summary.resubmitted += 1;
          } catch (error) {
            summary.errors.push(`${domain}: sitemap submission failed: ${error.message.slice(0, 100)}`);
          }

          const urls = sitemap.body ? extractSitemapUrls(sitemap.body) : [url];
          const ix = await submitIndexNow(domain, urls).catch((e) => ({ ok: false, message: e.message }));
          if (ix.ok) {
            summary.indexNow += ix.urls;
            if (ix.pending) summary.indexNowPending += ix.urls;
          }
          else if (!ix.skipped) summary.indexNowErrors += 1;
          // At-least-once delivery: a partial provider failure must remain
          // retryable even when the sitemap is unchanged. Repeating Google
          // sitemap PUT after IndexNow failure is safe; never mark it delivered
          // before all enabled submissions have been accepted.
          if (sitemapSubmitted && (ix.ok || ix.skipped)) {
            await db.indexState.update({ where: { url }, data: { sitemapHash: sitemap.hash } });
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    } catch (error) {
      summary.errors.push(`${domain}: ${error.message.slice(0, 140)}`);
    }
  }
  return summary;
}


