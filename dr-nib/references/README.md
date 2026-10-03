# dr-nib references

Reference implementations we learn from. **Not committed** (see
`.gitignore`) — re-fetch with the commands below. Each was read in full;
the mechanisms we stole are specified in `../ANALYSIS.md` Section 12.

| Dir | Repo | License | Why it's here |
|---|---|---|---|
| `gpt-researcher/` | `assafelovic/gpt-researcher` | MIT | Retriever abstraction, tiered cost routing, bounded revisions, MCP both directions, export converters |
| `open-deep-research/` | `langchain-ai/open_deep_research` | MIT | Brief-as-artifact, compress-with-retry, supervisor fan-out caps, clarify gate |
| `storm/` | `stanford-oval/storm` | MIT | Perspective discovery, trust filter before judgment, outline draft-then-refine, Co-STORM moderator |
| `erc8183-reference/` | `erc8183/erc8183-reference` | MIT | Stock AgenticCommerce core, hook interfaces, evaluator guide — deployed unmodified as our escrow |
| `agentkit/` | `coinbase/agentkit` | MIT | Action-provider pattern (wallet + fund-moving actions), spend-permission model, guardrails-middleware note |
| `x402/` | `coinbase/x402` | MIT | Protocol reference: 402 challenge/response shapes, facilitator verify+settle flow |
| `circle-nanopayment-sample/` | `BlockRunAI/circle-nanopayment-sample` | MIT | GatewayClient buyer pattern: getBalances → deposit → pay, EIP-3009 against GatewayWallet |

```bash
git clone --depth 1 https://github.com/assafelovic/gpt-researcher dr-nib/references/gpt-researcher
git clone --depth 1 https://github.com/langchain-ai/open_deep_research dr-nib/references/open-deep-research
git clone --depth 1 https://github.com/stanford-oval/storm dr-nib/references/storm
git clone --depth 1 https://github.com/coinbase/agentkit dr-nib/references/agentkit
git clone --depth 1 https://github.com/coinbase/x402 dr-nib/references/x402
git clone --depth 1 https://github.com/BlockRunAI/circle-nanopayment-sample dr-nib/references/circle-nanopayment-sample
git clone --depth 1 https://github.com/erc8183/erc8183-reference dr-nib/references/erc8183-reference
```

Strip `.git` after cloning; these are reading material, not dependencies.
