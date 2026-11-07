import { apiBaseUrl, apiUrl, siteOrigin } from "@/lib/api";

export const dynamic = "force-dynamic";

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
  [`${siteOrigin()}/explore`, "Current published-and-public creator articles, newest publication first, latest 20 per site."],
  [`${siteOrigin()}/ledger`, "Historical public activity unavailable: event-visibility-unavailable."],
  [`${siteOrigin()}/pending-tips`, "Check funded, unclaimed tips for any site domain across mainnet and testnet; the checker identifies the network and links to claiming guidance."],
  [`${siteOrigin()}/pending-tips/claim`, "Guide to connecting and verifying a site, then claiming its pending held tips from the creator dashboard."],
  [`${siteOrigin()}/leaderboards`, "Historical rankings are unavailable without event-time public visibility proof."],
  [`${siteOrigin()}/discovery.md`, "Plain-language agent guidance: endpoints, x402 payment flow (Circle Agent Stack one-liner or raw Gateway), nibshare links, and rating flow."],
  [`${siteOrigin()}/skill.md`, "Integration guide for @nibgate/sdk covering widget install, gating, payments, and admin."],
  [`${siteOrigin()}/.well-known/agent-skills/index.json`, "Machine-readable index of Nibgate agent skills (payer discovery + creator SDK)."],
  ["https://docs.nibgate.xyz/dr-nib/guest-planning", "Optional text-only guest planning through the same verified worker; encrypted device drafts, authenticated adoption, private-file gate, plan validation and explicit funding boundaries."],
  ["https://docs.nibgate.xyz/dr-nib/confidential", "Dr. Nib private architecture: browser encryption, verified Phala orchestration, operator-hosted verifier trust, encrypted persistence and disclosed hosted JEV/ZDR fallback."],
  ["https://docs.nibgate.xyz/api-reference", "API reference for the Nibgate hub endpoints."],
  ["https://docs.nibgate.xyz/agent-discovery", "Agent discovery documentation for machine-readable content cards and x402 purchasing."],
  ["https://docs.nibgate.xyz/extension", "Browser extension: high-confidence creator-post buttons with SPA cleanup, accessible password visibility controls, recoverable payment proofs, and the live 1.2.0 Tip this page action for HTTP(S) pages and links."],
];

const API_ENDPOINTS: Array<[string, string]> = [
  [`${apiBaseUrl()}/hub/pay`, "x402 unlock endpoint for hub-tracked content: POST bare for a 402 challenge, then retry with the payment header."],
  [`${apiBaseUrl()}/hub/preflight`, "Optional free dry run for the direct-USDC rail: verifies price, recipient, and payer balance BEFORE an irreversible transfer. Never charges."],
  [`${apiBaseUrl()}/hub/explore/content?limit=100`, "Current published-and-public creator articles from fresh public-home-v2 and manifest sources; latest 20 per site; historical metrics are null. Discovery id uses identityScope=creator-publication and is not a legacy Hub Content payment ID. Follow the returned current manifestUrl and its payment challenge; do not pass this id as a Hub Content payment ID."],
  [`${apiBaseUrl()}/hub/ledger?limit=100`, "Historical public activity unavailable: event-visibility-unavailable."],
  [`${apiBaseUrl()}/hub/tips/held?domain={domain}`, "Public exact-domain lookup for funded, unclaimed tips, including tips to external sites; claimable by the site owner and refundable by the payer. API host selects mainnet or testnet."],
  [`${apiBaseUrl()}/hub/tips/refund`, "Payer-signed exact refund of unclaimed held tips (no fee); supports EOA personal_sign and deployed ERC-1271 wallets with a one-shot network/domain/payer/amount/expiry/nonce authorization."],
  [`${apiBaseUrl()}/hub/stats`, "Current public listing site/article counts only; creator count and historical metrics are null."],
  [`${apiBaseUrl()}/ns/{slug}`, "Unlock a nibshare link — free shares return the body; paid shares return a 402 x402 challenge, pay and retry to read."],
  [`${apiBaseUrl()}/nibshare/{slug}/manifest`, "Public metadata manifest for a nibshare (title, type, price, access policy)."],
  [`${apiBaseUrl()}/hub/reputation/leaderboards`, "Historical rankings unavailable: event-visibility-unavailable."],
  [`${apiBaseUrl()}/hub/sitemap/content`, "Current public creator article URLs; latest 20 articles per site."],
  [`${apiBaseUrl()}/openapi.json`, "Machine-readable OpenAPI specification for the public hub API, including unlock endpoints."],
  [`${apiBaseUrl()}/mcp`, "Model Context Protocol server exposing Nibgate discovery tools to AI agents."],
  [`${apiBaseUrl()}/.well-known/x402`, "x402 discovery fan-out: live paid resource URLs and payment instructions."],
];

async function topContent(): Promise<ExploreContent[]> {
  try {
    const res = await fetch(apiUrl("/hub/explore/content?limit=20"), { cache: "no-store" });
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

> Current public creator article discovery and unlocks for creator-owned work. Built on Circle Gateway, Arc, and the x402 protocol.

Nibgate is an open protocol for paid content. Creators keep content on their own domains. Nibgate verifies the source, indexes structured public metadata, records unlock/payment signals, and helps humans and AI agents discover quality content.

Mainnet and testnet: submitted tip proofs are not verified receipts. Retry the original proof and exact request; completed proofs recover the existing receipt. Conflicts and ambiguous settlement require reconciliation, never another payment.

## Key pages

${HUB_PAGES.map(([url, desc]) => `- [${url}](${url}) — ${desc}`).join("\n")}

## API endpoints

${API_ENDPOINTS.map(([url, desc]) => `- ${url} — ${desc}`).join("\n")}

## Current public creator articles

${content.length ? content.map(contentLine).join("\n") : "- Current public articles are unavailable or the current listing is empty."}

## Optional

- Full flattened content: ${siteOrigin()}/llms-full.txt
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Llms-Txt": "/llms.txt",
      "Link": `</llms.txt>; rel="llms-txt", </llms-full.txt>; rel="llms-full-txt"`,
    },
  });
}
