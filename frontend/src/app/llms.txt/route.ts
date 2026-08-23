import { apiUrl } from "@/lib/api";

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
  ["https://nibgate.xyz/explore", "Content discovery feed indexing verified creator content from connected sites."],
  ["https://nibgate.xyz/ledger", "Public activity ledger of every view, unlock, payment, and onchain rating across sites."],
  ["https://nibgate.xyz/leaderboards", "Reputation leaderboards for creators, sites, and content."],
  ["https://nibgate.xyz/discovery.md", "Plain-language agent guidance: endpoints, x402 payment flow (Circle Agent Stack one-liner or raw Gateway), nibshare links, and rating flow."],
  ["https://nibgate.xyz/skill.md", "Integration guide for @nibgate/sdk covering widget install, gating, payments, and admin."],
  ["https://nibgate.xyz/.well-known/agent-skills/index.json", "Machine-readable index of Nibgate agent skills (payer discovery + creator SDK)."],
  ["https://docs.nibgate.xyz/api-reference", "API reference for the Nibgate hub endpoints."],
  ["https://docs.nibgate.xyz/agent-discovery", "Agent discovery documentation for machine-readable content cards and x402 purchasing."],
];

const API_ENDPOINTS: Array<[string, string]> = [
  ["https://api.nibgate.xyz/hub/explore/content?limit=100", "Explore feed of verified content with title, type, price, domain, and reputation signals."],
  ["https://api.nibgate.xyz/hub/ledger?limit=100", "Public ledger of recent views, unlocks, payments, and ratings."],
  ["https://api.nibgate.xyz/hub/stats", "Platform totals for creators, sites, content, views, unlocks, revenue, and protocol fees."],
  ["https://api.nibgate.xyz/ns/{slug}", "Unlock a nibshare link — free shares return the body; paid shares return a 402 x402 challenge, pay and retry to read."],
  ["https://api.nibgate.xyz/nibshare/{slug}/manifest", "Public metadata manifest for a nibshare (title, type, price, access policy)."],
  ["https://api.nibgate.xyz/hub/reputation/leaderboards", "Ranked creators, sites, and content by reputation score."],
  ["https://api.nibgate.xyz/hub/sitemap/content", "All content URLs across verified sites."],
  ["https://api.nibgate.xyz/openapi.json", "Machine-readable OpenAPI specification for the public hub API, including unlock endpoints."],
  ["https://api.nibgate.xyz/mcp", "Model Context Protocol server exposing Nibgate discovery tools to AI agents."],
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

> Verified content discovery, unlock, and reputation layer for creator-owned work. Built on Circle Gateway, ARC testnet, and the x402 protocol.

Nibgate is an open protocol for paid content. Creators keep content on their own domains. Nibgate verifies the source, indexes structured public metadata, records unlock/payment signals, and helps humans and AI agents discover quality content.

## Key pages

${HUB_PAGES.map(([url, desc]) => `- [${url}](${url}) — ${desc}`).join("\n")}

## API endpoints

${API_ENDPOINTS.map(([url, desc]) => `- ${url} — ${desc}`).join("\n")}

## Top content on Nibgate

${content.length ? content.map(contentLine).join("\n") : "- No verified content indexed yet."}

## Optional

- Full flattened content: https://nibgate.xyz/llms-full.txt
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
