import { readFile } from "node:fs/promises";
import path from "node:path";
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

async function topContent(): Promise<ExploreContent[]> {
  try {
    const res = await fetch(apiUrl("/hub/explore/content?limit=50"), { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.content) ? data.content : [];
  } catch {
    return [];
  }
}

async function readPublic(file: string): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), "public", file), "utf-8");
  } catch {
    return "";
  }
}

export async function GET() {
  const [discovery, skill, content] = await Promise.all([readPublic("discovery.md"), readPublic("skill.md"), topContent()]);

  const discoverySection = discovery ? `\n## Agent discovery guide\n\n${discovery}` : "";
  const skillSection = skill ? `\n## Integration skill guide\n\n${skill}` : "";
  const contentSection = content.length
    ? content
        .map(
          (item) =>
            `- [${item.title || "Untitled content"}](${item.url || ""}) — ${item.websiteName || item.websiteDomain || "Creator"}${Number(item.price || 0) > 0 ? ` ${Number(item.price).toFixed(3)} ${item.currency || "USDC"}` : ""}. ${item.description || ""}`
        )
        .join("\n")
    : "- No verified content indexed yet.";

  const site = siteOrigin();
  const api = apiBaseUrl();
  const text = `# Nibgate — Full Content

> Verified content discovery, unlock, and reputation layer for creator-owned work. Built on Circle Gateway, Arc, and the x402 protocol.

Nibgate is an open protocol for paid content. Creators keep content on their own domains. Nibgate verifies the source, indexes structured public metadata, records unlock/payment signals, and helps humans and AI agents discover quality content.

## Key pages

- ${site}/explore — Content discovery feed.
- ${site}/ledger — Public activity ledger.
- ${site}/pending-tips — Check funded, unclaimed tips for any site domain across mainnet and testnet; the checker identifies the network and links to claiming guidance.
- ${site}/pending-tips/claim — Guide to connecting and verifying a site, then claiming its pending held tips from the creator dashboard.
- ${site}/leaderboards — Reputation leaderboards.
- ${site}/.well-known/agent-skills/index.json — Machine-readable index of Nibgate agent skills.
- https://docs.nibgate.xyz/api-reference — API reference.
- https://docs.nibgate.xyz/agent-discovery — Agent discovery docs.

Mainnet and testnet tip verification: reuse the original proof and exact request. A completed matching proof recovers the existing receipt; HTTP 409 pending/conflicting proofs require reconciliation, not another payment.

## Dr. Nib privacy scope

Optional guest planning: when explicitly enabled, text-only intake/configuration/genuine planning uses the same verified Phala worker before account sign-in. Encrypted device-local drafts are not account backups. Private uploads require an account. Guest capabilities on the private broker's /v1/guest-planning namespace cannot execute research, use paid tools or prepare funding. Saving requires authenticated idempotent adoption with fresh account AAD/keys and worker validation of the existing plan/input/quote/expiry before escrow. Sign-in never funds or starts research. Guest request/action/replan/expiry/cost limits include sponsored calls. Never send guest tokens or keys to ordinary Hub/MCP tools. Details: https://docs.nibgate.xyz/dr-nib/guest-planning.

The private architecture uses browser encryption, a verified Phala worker and encrypted persistence. Nibgate-operated attestation uses the official dstack-verifier; its verdict is an operator-trusted service, not independent operator verification. Actual JEV and authorized Azure/OpenRouter ZDR fallback are provider-visible exceptions. The ordinary Dr. Nib API/MCP is retired on both networks; drnib.testnet.nibgate.xyz no longer serves it. Owner-authenticated, read-only older plaintext testnet reports and ledgers are available at https://testnet.nibgate.xyz/dr-nib/legacy through the private broker; this archive is not an encrypted vault or a new-research endpoint. New private vaults require a strong user-chosen password and independent random backup code. Either unlocks on a new browser after sign-in; an unlocked vault can optionally enroll a WebAuthn PRF recovery passkey in Help. Older code-only vaults remain supported. Replacing lost credentials requires an enrolled browser or another previously enrolled unlock method; wallet sign-in alone cannot decrypt old projects. Projects are grouped into vault folders. Owners can create a fresh vault if an older vault is locked, then switch folders; old encrypted projects remain intact and a new vault cannot decrypt them. Vault creation and switching need no onchain transaction. Never send vault/password/backup-code secrets to ordinary discovery or payment tools. Full architecture, recovery and operations: https://docs.nibgate.xyz/dr-nib/confidential.

## API endpoints

- ${api}/hub/explore/content?limit=100 — Explore feed of verified content.
- ${api}/hub/ledger?limit=100 — Public ledger (views, unlocks, payments, tips including pending funded holds, ratings, nibshares; refunds are negative entries; no share links).
- ${api}/hub/tips/held?domain={domain} — Exact-domain lookup for funded, unclaimed tips (including external sites); claimable by the site owner, refundable by the payer. Results are specific to this API deployment's network.
- ${api}/hub/tips/refund — Payer-signed exact refund of unclaimed held tips (no fee); accepts EOA personal_sign or deployed ERC-1271 wallets with a one-shot network/domain/payer/amount/expiry/nonce authorization.
- ${api}/hub/stats — Platform totals (revenue incl. tips + nibshares, protocol fees).
- ${api}/ns/{slug} — Unlock a nibshare: free → body; paid → 402 x402 challenge, pay and retry to read.
- ${api}/nibshare/{slug}/manifest — Public manifest for a nibshare.
- ${api}/hub/reputation/leaderboards — Ranked reputation leaderboards.
- ${api}/openapi.json — OpenAPI specification (includes unlock endpoints).
- ${api}/mcp — MCP server for AI agents.

## Top content on Nibgate

${contentSection}
${discoverySection}
${skillSection}
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
