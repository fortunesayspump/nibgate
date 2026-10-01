import { apiBaseUrl, apiUrl, siteOrigin } from "@/lib/api";

export const revalidate = 3600;

type ExploreContent = {
  title?: string;
  description?: string;
  url?: string;
  websiteDomain?: string;
  websiteName?: string;
  price?: number;
  currency?: string;
};

const HUB_PAGES: Array<[string, string]> = [
  [`${siteOrigin()}/explore`, "Content discovery feed indexing verified creator content from connected sites."],
  [`${siteOrigin()}/ledger`, "Public activity ledger of every view, unlock, payment, tip, onchain rating, and nibshare across sites (nibshare links stay private)."],
  [`${siteOrigin()}/leaderboards`, "Reputation leaderboards for creators, sites, and content."],
  [`${siteOrigin()}/discovery.md`, "Plain-language agent guidance: endpoints, x402 payment flow (Circle Agent Stack one-liner or raw Gateway), nibshare links, and rating flow."],
  [`${siteOrigin()}/skill.md`, "Integration guide for @nibgate/sdk covering widget install, gating, payments, and admin."],
  [`${siteOrigin()}/.well-known/agent-skills/index.json`, "Machine-readable index of Nibgate agent skills (payer discovery + creator SDK)."],
  ["https://docs.nibgate.xyz/api-reference", "API reference for the Nibgate hub endpoints."],
  ["https://docs.nibgate.xyz/agent-discovery", "Agent discovery documentation for machine-readable content cards and x402 purchasing."],
];

const API_ENDPOINTS: Array<[string, string]> = [
  [`${apiBaseUrl()}/hub/pay`, "x402 unlock endpoint for hub-tracked content: POST bare for a 402 challenge, then retry with the payment header."],
  [`${apiBaseUrl()}/hub/preflight`, "Optional free dry run for the direct-USDC rail: verifies price, recipient, and payer balance BEFORE an irreversible transfer. Never charges."],
  [`${apiBaseUrl()}/hub/explore/content?limit=100`, "Explore feed of verified content with title, type, price, domain, and reputation signals."],
  [`${apiBaseUrl()}/hub/ledger?limit=100`, "Public ledger of recent views, unlocks, payments, tips, ratings, and nibshares (privacy-safe: no share links)."],
  [`${apiBaseUrl()}/hub/tips/held?domain={domain}`, "Tips waiting in a domain's no-key holding box (creator not yet on Nibgate); claimable by the site owner, refundable by the payer."],
  [`${apiBaseUrl()}/hub/tips/refund`, "Payer-signed refund of unclaimed held tips (full amount, no fee)."],
  [`${apiBaseUrl()}/hub/stats`, "Platform totals for creators, sites, content, views, unlocks, revenue (unlocks + tips + nibshares), and protocol fees."],
  [`${apiBaseUrl()}/ns/{slug}`, "Unlock a nibshare link — free shares return the body; paid shares return a 402 x402 challenge, pay and retry to read."],
  [`${apiBaseUrl()}/nibshare/{slug}/manifest`, "Public metadata manifest for a nibshare (title, type, price, access policy)."],
  [`${apiBaseUrl()}/hub/reputation/leaderboards`, "Ranked creators, sites, and content by reputation score; revenue includes unlocks, tips, and nibshares."],
  [`${apiBaseUrl()}/hub/sitemap/content`, "All content URLs across verified sites."],
  [`${apiBaseUrl()}/openapi.json`, "Machine-readable OpenAPI specification for the public hub API, including unlock endpoints."],
  [`${apiBaseUrl()}/mcp`, "Model Context Protocol server exposing Nibgate discovery tools to AI agents."],
  [`${apiBaseUrl()}/.well-known/x402`, "x402 discovery fan-out: live paid resource URLs and payment instructions."],
];

async function topContent(): Promise<ExploreContent[]> {
  try {
    const res = await fetch(apiUrl("/hub/explore/content?limit=20"), { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.content) ? data.content : [];
  } catch {
    return [];
  }
}

function contentLine(item: ExploreContent) {
  const price = Number(item.price || 0) > 0 ? ` ${Number(item.price).toFixed(3)} ${item.currency || "USDC"}` : "";
  return `- [${item.title || "Untitled content"}](${item.url || ""}) — ${item.websiteName || item.websiteDomain || "Creator"}${price}. ${item.description || ""}`;
}

export async function GET() {
  const content = await topContent();

  const text = `# Nibgate

> Verified content discovery, unlock, and reputation layer for creator-owned work. Built on Circle Gateway, Arc, and the x402 protocol.

Nibgate is an open protocol for paid content. Creators keep content on their own domains. Nibgate verifies the source, indexes structured public metadata, records unlock/payment signals, and helps humans and AI agents discover quality content.

## Key pages

${HUB_PAGES.map(([url, desc]) => `- [${url}](${url}) — ${desc}`).join("\n")}

## API endpoints

${API_ENDPOINTS.map(([url, desc]) => `- ${url} — ${desc}`).join("\n")}

## Top content on Nibgate

${content.length ? content.map(contentLine).join("\n") : "- No verified content indexed yet."}

## Optional

- Full flattened content: ${siteOrigin()}/llms-full.txt
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Llms-Txt": "/llms.txt",
      "Link": `</llms.txt>; rel="llms-txt", </llms-full.txt>; rel="llms-full-txt"`,
    },
  });
}
