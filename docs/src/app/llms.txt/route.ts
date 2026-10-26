const PAGES: Array<[string, string]> = [
  ["https://docs.nibgate.xyz/overview", "What Nibgate is: verification, discovery, unlock, and reputation for creator-owned paid content."],
  ["https://docs.nibgate.xyz/architecture", "System architecture across hub, creator sites, subblogs, and onchain components."],
  ["https://docs.nibgate.xyz/agent-discovery", "Agent discovery: machine-readable content cards, x402 purchasing, and the discovery.md guide."],
  ["https://docs.nibgate.xyz/reputation", "Onchain reputation: ratings, scores, and leaderboards."],
  ["https://docs.nibgate.xyz/nibshare", "Nibshare quick-share links and their machine-readable surfaces."],
  ["https://docs.nibgate.xyz/tipping", "Nib Tips: tip any page. Resolved tips are recorded after verification; unresolved tips use contract-held per-domain balances with privileged owner/keeper release/refund after Hub authorization checks."],
  ["https://nibgate.xyz/pending-tips", "Check funded, unclaimed tips for any domain, including external sites; the page checks mainnet, while testnet.nibgate.xyz checks testnet."],
  ["https://docs.nibgate.xyz/tipping/agent-flow", "Agent flow for Nib Tips: resolve, challenge/verify (settled) or hold, and refund held tips over x402."],
  ["https://docs.nibgate.xyz/extension", "Browser extension: high-confidence creator-post buttons with SPA cleanup, accessible password visibility controls, recoverable payment proofs, and the live 1.2.0 Tip this page action for HTTP(S) pages and links (testnet default, mainnet confirm-gated)."],
  ["https://docs.nibgate.xyz/jev", "JEV judgment layer: deterministic decide/selectMany engine plus the real JEV decisions model behind hub endpoints, used by the extension and metadata enrichment."],
  ["https://docs.nibgate.xyz/dr-nib", "Dr. Nib research agent: question to cited report, source inputs, budgets, escrow and fresh funding after settlement; operator-hosted attestation trust."],
  ["https://docs.nibgate.xyz/dr-nib/budgets", "Run budgets: capped customer ledger draws, ordinary post-stage charging versus private pre-dispatch reservations, operator-side 1% share and confirmed refunds."],
  ["https://docs.nibgate.xyz/dr-nib/escrow", "Onchain escrow for runs: ERC-8183 jobs, keeper completion, splitter division, testnet and mainnet addresses, and the model-plan funding gate."],
  ["https://docs.nibgate.xyz/dr-nib/agent-spending", "Agent spending: tips, paid unlocks, x402 payments from the run budget with per-call ceilings."],
  ["https://docs.nibgate.xyz/dr-nib/gates", "Spending gates: runtime, verdict, wallet, and onchain enforcement map plus the spender mandate."],
  ["https://docs.nibgate.xyz/dr-nib/agent-loop", "Agent loop: proposal/approval/execution, standalone defaults versus research/private limits, ordinary shared lessons, stop reasons and recovery boundaries."],
  ["https://docs.nibgate.xyz/dr-nib/tools", "Tool reference: research and spend tools with inputs, costs, and the x402 sell surfaces."],
  ["https://docs.nibgate.xyz/dr-nib/retrieval", "Retrieval: web indexes, private R2 inputs (PDF, DOCX, XLSX, CSV, text), owner-only previews, source-only mode, extraction limits, and bot-block honesty."],
  ["https://docs.nibgate.xyz/dr-nib/confidential", "Private research: browser encryption, verified Phala worker, encrypted persistence/recovery and disclosed JEV/Azure/OpenRouter ZDR boundaries."],
  ["https://docs.nibgate.xyz/dr-nib/confidential/architecture", "Private architecture: component/data visibility, encrypted Postgres/R2, hardware verification, client trust and key release."],
  ["https://docs.nibgate.xyz/dr-nib/confidential/recovery", "Private vault/recovery: strong user password plus random backup code, enrolled-browser replacement, older code-only vaults, irreversible loss of all unlock methods, checkpoints and uncertain-outcome fencing."],
  ["https://docs.nibgate.xyz/dr-nib/confidential/models-tools", "Private models/tools: Phala primary, actual JEV, authorized hosted ZDR fallback, approved external arguments, expense accounting and refunds."],
  ["https://docs.nibgate.xyz/dr-nib/confidential/operations", "Worker lifecycle: authenticated wake, fresh verification, idle shutdown, durable state, recovery and infrastructure costs."],
  ["https://docs.nibgate.xyz/dr-nib/jev", "How JEV decides: ordinary Hub versus private direct transport, structured probabilities, actual decision-record fields, confidence gates and stage-specific failure behavior."],
  ["https://docs.nibgate.xyz/api-reference", "API reference for the public hub endpoints."],
  ["https://docs.nibgate.xyz/sdk-reference", "Sourcey-generated, source-mapped reference for 27 implemented @nibgate/sdk client methods and the standalone validateResourceMetadata helper in SDK 0.4.40."],
];

export async function GET() {
  const text = `# Nibgate Docs

> Documentation for the Nibgate open protocol: verified content discovery, x402 paid unlocks on the configured Arc network, and onchain reputation.

Agent-facing surfaces:

- https://nibgate.xyz/discovery.md — Plain-language payer guide for AI agents (endpoints, payment flow).
- https://nibgate.xyz/skill.md — Creator SDK integration guide.
- https://nibgate.xyz/.well-known/agent-skills/index.json — Machine-readable index of both skills.
- https://api.nibgate.xyz/openapi.json — OpenAPI specification including unlock endpoints.
- https://api.nibgate.xyz/mcp — MCP server exposing discovery tools to agents.

Mainnet and testnet: submitted tip proofs are not verified receipts. Retry the original proof and exact request; completed proofs recover the existing receipt. Conflicts and ambiguous settlement require reconciliation, never another payment.

Dr. Nib's ordinary research API/MCP is retired on both networks. Its testnet deployment stopped on 26 Oct 2026; ordinary API examples in the pages below are historical reference. Use the private Dr. Nib app on testnet.nibgate.xyz or nibgate.xyz for new research. Owners can read older plaintext testnet reports and ledgers at https://testnet.nibgate.xyz/dr-nib/legacy; this authenticated archive is read-only and separate from encrypted private projects.

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
