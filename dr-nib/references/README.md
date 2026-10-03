# dr-nib references

Reference implementations we learn from. **Not committed** (see
`.gitignore`) — re-fetch with the commands below. Each was read in full;
the mechanisms we stole are specified in `../ANALYSIS.md` Section 12.

| Dir | Repo | License | Why it's here |
|---|---|---|---|
| `gpt-researcher/` | `assafelovic/gpt-researcher` | MIT | Retriever abstraction, tiered cost routing, bounded revisions, MCP both directions, export converters |
| `open-deep-research/` | `langchain-ai/open_deep_research` | MIT | Brief-as-artifact, compress-with-retry, supervisor fan-out caps, clarify gate |
| `storm/` | `stanford-oval/storm` | MIT | Perspective discovery, trust filter before judgment, outline draft-then-refine, Co-STORM moderator |
| `keryx/` | `tang-vu/keryx` | no license file (read-only reference, do not copy code verbatim) | Free-first retrieval (SearXNG, scholarly, RSS), isolated-reader workers, SSRF-hardened fetch, block-page honesty |

```bash
git clone --depth 1 https://github.com/assafelovic/gpt-researcher dr-nib/references/gpt-researcher
git clone --depth 1 https://github.com/langchain-ai/open_deep_research dr-nib/references/open-deep-research
git clone --depth 1 https://github.com/stanford-oval/storm dr-nib/references/storm
git clone --depth 1 https://github.com/tang-vu/keryx dr-nib/references/keryx
```

Strip `.git` after cloning; these are reading material, not dependencies.
