import { db } from '@nibgate/internal/db.js';
import { getAccessToken, request, fetchSiteList, submitSitemapForDomain } from './gsc-sitemap.js';

const INSPECT_BASE = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const DAY_MS = 24 * 60 * 60 * 1000;

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

export async function runIndexSweep({
  dryRun = process.env.GSC_DRY_RUN === '1',
  persist = true,
  cooldownDays = Number.parseInt(process.env.GSC_INDEX_COOLDOWN_DAYS || '3', 10),
} = {}) {
  if (!process.env.GSC_SERVICE_ACCOUNT_JSON) return { disabled: true, reason: 'GSC_SERVICE_ACCOUNT_JSON is not set' };
  const domains = await fetchSiteList();
  const summary = {
    site: process.env.GSC_SITE || 'sc-domain:nibgate.xyz',
    dryRun,
    persist,
    cooldownDays,
    domains: domains.length,
    newSites: 0,
    inspected: 0,
    indexed: 0,
    notIndexed: 0,
    reNudges: 0,
    skippedCooldown: 0,
    notIndexedList: [],
    errors: [],
  };

  for (const domain of domains) {
    const url = `https://${domain}/`;
    try {
      let existing = null;
      if (persist) {
        existing = await db.indexState.findUnique({ where: { url } }).catch(() => null);
      }
      const isNew = !existing;
      if (isNew) summary.newSites += 1;

      if (existing?.isIndexed) continue;

      const cooldownOk = !existing || Date.now() - new Date(existing.lastInspectedAt).getTime() >= cooldownDays * DAY_MS;
      if (!cooldownOk) {
        summary.skippedCooldown += 1;
        continue;
      }

      if (dryRun) {
        summary.inspected += 1;
        continue;
      }

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
          },
          create: {
            url,
            domain,
            coverageState: result.coverageState,
            indexingState: result.indexingState,
            lastCrawlTime: result.lastCrawlTime ? new Date(result.lastCrawlTime) : null,
            isIndexed: indexed,
          },
        });
      }

      summary.inspected += 1;
      if (indexed) {
        summary.indexed += 1;
      } else {
        summary.notIndexed += 1;
        summary.notIndexedList.push({ domain, indexingState: result.indexingState, coverageState: result.coverageState });
      }

      if (persist && !indexed) {
        await submitSitemapForDomain(domain).catch(() => {});
        summary.reNudges += 1;
      }
    } catch (error) {
      summary.errors.push(`${domain}: ${error.message.slice(0, 140)}`);
    }
  }
  return summary;
}
