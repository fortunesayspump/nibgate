# dr-nib references

Reference implementations we learn from. **Not committed** (see
`.gitignore`) — re-fetch with the commands below. Each was read in full;
the mechanisms we stole are specified in `../ANALYSIS.md` Section 12.

| Dir | Repo | License | Why it's here |
|---|---|---|---|
| `gpt-researcher/` | `assafelovic/gpt-researcher` | MIT | Retriever abstraction, tiered cost routing, bounded revisions, MCP both directions, export converters |
| `open-deep-research/` | `langchain-ai/open_deep_research` | MIT | Brief-as-artifact, compress-with-retry, supervisor fan-out caps, clarify gate |
| `storm/` | `stanford-oval/storm` | MIT | Perspective discovery, trust filter before judgment, outline draft-then-refine, Co-STORM moderator |

```bash
git clone --depth 1 https://github.com/assafelovic/gpt-researcher dr-nib/references/gpt-researcher
git clone --depth 1 https://github.com/langchain-ai/open_deep_research dr-nib/references/open-deep-research
git clone --depth 1 https://github.com/stanford-oval/storm dr-nib/references/storm
```

Strip `.git` after cloning; these are reading material, not dependencies.
