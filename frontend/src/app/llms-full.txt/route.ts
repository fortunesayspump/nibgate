import { readFile } from "node:fs/promises";
import path from "node:path";
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

  const text = `# Nibgate — Full Content

> Verified content discovery, unlock, and reputation layer for creator-owned work. Built on Circle Gateway, ARC testnet, and the x402 protocol.

Nibgate is an open protocol for paid content. Creators keep content on their own domains. Nibgate verifies the source, indexes structured public metadata, records unlock/payment signals, and helps humans and AI agents discover quality content.

## Key pages

- https://nibgate.xyz/explore — Content discovery feed.
- https://nibgate.xyz/ledger — Public activity ledger.
- https://nibgate.xyz/leaderboards — Reputation leaderboards.
- https://docs.nibgate.xyz/api-reference — API reference.
- https://docs.nibgate.xyz/agent-discovery — Agent discovery docs.

## API endpoints

- https://api.nibgate.xyz/hub/explore/content?limit=100 — Explore feed of verified content.
- https://api.nibgate.xyz/hub/ledger?limit=100 — Public ledger.
- https://api.nibgate.xyz/hub/stats — Platform totals.
- https://api.nibgate.xyz/hub/reputation/leaderboards — Ranked reputation leaderboards.
- https://api.nibgate.xyz/openapi.json — OpenAPI specification.
- https://api.nibgate.xyz/mcp — MCP server for AI agents.

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
