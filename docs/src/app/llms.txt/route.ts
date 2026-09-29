const PAGES: Array<[string, string]> = [
  ["https://docs.nibgate.xyz/overview", "What Nibgate is: verification, discovery, unlock, and reputation for creator-owned paid content."],
  ["https://docs.nibgate.xyz/architecture", "System architecture across hub, creator sites, subblogs, and onchain components."],
  ["https://docs.nibgate.xyz/agent-discovery", "Agent discovery: machine-readable content cards, x402 purchasing, and the discovery.md guide."],
  ["https://docs.nibgate.xyz/reputation", "Onchain reputation: ratings, scores, and leaderboards."],
  ["https://docs.nibgate.xyz/nibshare", "Nibshare quick-share links and their machine-readable surfaces."],
  ["https://docs.nibgate.xyz/tipping", "Nib Tips: tip any page. Resolved creators settle instantly; unresolved/external creators are held in a no-key per-domain box, claimable by the owner and refundable by the payer."],
  ["https://docs.nibgate.xyz/tipping/agent-flow", "Agent flow for Nib Tips: resolve, challenge/verify (settled) or hold, and refund held tips over x402."],
  ["https://docs.nibgate.xyz/jev", "JEV judgment layer: deterministic decide/selectMany engine plus the real JEV decisions model behind hub endpoints, used by the extension and metadata enrichment."],
  ["https://docs.nibgate.xyz/api-reference", "API reference for the public hub endpoints."],
];

export async function GET() {
  const text = `# Nibgate Docs

> Documentation for the Nibgate open protocol: verified content discovery, x402 paid unlocks (Circle Gateway on Arc testnet), and onchain reputation.

Agent-facing surfaces:

- https://nibgate.xyz/discovery.md — Plain-language payer guide for AI agents (endpoints, payment flow).
- https://nibgate.xyz/skill.md — Creator SDK integration guide.
- https://nibgate.xyz/.well-known/agent-skills/index.json — Machine-readable index of both skills.
- https://api.nibgate.xyz/openapi.json — OpenAPI specification including unlock endpoints.
- https://api.nibgate.xyz/mcp — MCP server exposing discovery tools to agents.

## Pages

${PAGES.map(([url, desc]) => `- [${url}](${url}) — ${desc}`).join("\n")}
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
