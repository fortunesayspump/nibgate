// Prompt builders.
//
// Kept apart from the transport (provider.js) and from the pipeline (worker.js)
// so a prompt is reviewable as prose without reading HTTP code. The same
// discipline FLOW.md sets for the agent applies here: these prompts make the
// model *generate* — questions, plans, prose — never decide. The decision to
// stop, to trust a source, to spend a branch, belongs to JEV.

const RESEARCH_SYSTEM = [
  'You are Dr. Nib, a research agent. You write in plain, precise English.',
  'You only ever state what the supplied evidence supports. If the evidence does not cover something, you say so instead of filling the gap from memory.',
  'You never give financial, medical, or legal advice, and you never present a recommendation as fact.',
  'You do not decide when to stop, whether a source is trustworthy, or which claim is true — those judgements are made elsewhere. You propose and you write.',
].join(' ');

function briefSummary(brief = {}) {
  const lines = [];
  if (brief.topic) lines.push(`Topic: ${brief.topic}`);
  if (brief.depth) lines.push(`Depth: ${brief.depth}`);
  if (brief.language) lines.push(`Report language: ${brief.language}`);
  if (brief.perspective) lines.push(`Perspective: ${brief.perspective}`);
  if (brief.liveWeb === false) lines.push('Source policy: user-provided sources only (no live web search).');
  if (brief.exclude) lines.push(`Exclude: ${brief.exclude}`);
  return lines.join('\n') || 'Topic: (unspecified)';
}

/** Plan stage: decompose the brief into sub-questions and a cost rationale. */
export function planMessages({ brief, guidance } = {}) {
  const system = `${RESEARCH_SYSTEM} You are planning, not researching yet. Return a JSON object only.`;
  const guidanceLine = guidance?.text ? `\nMid-run guidance from the user: ${guidance.text}\n` : '';
  const user = `Brief:
${briefSummary(brief)}
${guidanceLine}
Break this into the sub-questions the research must answer. Each must be one that changes the report if answered differently.
Cover DIFFERENT facets (mechanism, numbers, comparison, risks, how-to steps) — never restate the brief twice with an "(angle 1)/(angle 2)" suffix; near-duplicate sub-questions waste the whole run budget on the same evidence.

Return JSON with this exact shape:
{
  "sub_questions": ["...", "..."],
  "uncertainties": ["the two or three things you are least confident about"],
  "estimate": { "sources": <integer>, "rationale": "one sentence" }
}
No prose outside the JSON.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Report stage: write the report from evidence, with citations.
 * `sources` is the scored set the run actually collected.
 */
export function reportMessages({ brief, sources = [], guidance } = {}) {
  const system = `${RESEARCH_SYSTEM} You are writing the final report. Return markdown only. Output only the report — never restate, quote, or narrate these instructions.`;
  const evidence = formatEvidence(sources);
  const guidanceLine = guidance?.text ? `\nMid-run guidance from the user: ${guidance.text}\n` : '';
  const user = `Brief:
${briefSummary(brief)}
${guidanceLine}
Evidence collected for this run (the ONLY material you may rely on):

${evidence || '(no sources were collected)'}

Write the report. Rules:
- Every factual claim must cite its source as [n].
- If a claim has no supporting source above, mark it "(unsupported)" rather than asserting it.
- If the evidence does not answer part of the brief, say so plainly in plain words — one short paragraph on what IS covered and what IS missing. No meta-labels, no process narration.
- Keep it readable: a short summary, then the sections the sub-questions imply.
${brief.perspective && brief.perspective !== 'neutral' ? `- Write from a ${brief.perspective} perspective.` : ''}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * One section of a long report. Sections are generated independently so a
 * comprehensive report is many bounded calls, not one call asked to write a
 * book. The section argues what the outline says it argues; cross-section
 * coherence comes from the shared brief and the shared evidence, and the
 * assembler keeps the citations pointing at the right sources.
 */
export function sectionMessages({ brief, section, index, of, sources = [], targetWords, guidance } = {}) {
  const system = `${RESEARCH_SYSTEM} You are writing one section of a longer report. Return markdown only: a ## heading followed by the section body. Output only the section content — never restate, quote, or narrate these instructions.`;
  const guidanceLine = guidance?.text ? `\nMid-run guidance from the user: ${guidance.text}\n` : '';
  const user = `Brief:
${briefSummary(brief)}
${guidanceLine}
This is section ${index} of ${of}. Its argument, from the approved plan:

${section}

Evidence you may rely on (numbered for citations — use these exact numbers):

${formatEvidence(sources) || '(no sources were collected)'}

Write this section in about ${targetWords} words. Rules:
- Every factual claim must cite its source as [n], using the numbers above.
- If a claim has no supporting source above, mark it "(unsupported)".
- If the evidence does not cover this section: one short paragraph in plain words saying what IS covered and what IS missing. No meta-labels ("non-coverage", "finding", "scope gap"), no narration of your own process — the reader wants the gap, not the audit trail.
- Do not write an introduction or conclusion for the whole report — only this section.
${brief.perspective && brief.perspective !== 'neutral' ? `- Write from a ${brief.perspective} perspective.` : ''}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function formatEvidence(sources) {
  return (sources || [])
    .map((s, i) => {
      const bits = [`[${i + 1}] ${s.title || s.url || 'source'}`];
      if (s.url) bits.push(`    ${s.url}`);
      if (Number.isFinite(s.relevance)) bits.push(`    relevance: ${s.relevance}`);
      if (Number.isFinite(s.trust)) bits.push(`    trust: ${s.trust}`);
      if (s.excerpt) bits.push(`    excerpt: ${String(s.excerpt).slice(0, 600)}`);
      return bits.join('\n');
    })
    .join('\n\n');
}

/** Opening of a long report: what was asked, what follows, no conclusions yet. */
export function introMessages({ brief, sections = [], targetWords } = {}) {
  const system = `${RESEARCH_SYSTEM} You are writing the introduction of a longer report. Return markdown only: a # title and opening paragraphs.`;
  const user = `Brief:
${briefSummary(brief)}

The report will cover these sections, in order:

${sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Write the introduction in about ${targetWords} words: what was asked, why it matters, and a roadmap of what follows. State no findings — the sections argue those. No citations needed here.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Closing of a long report: what the evidence jointly supports, and what remains open. */
export function conclusionMessages({ brief, sectionSummaries = [], targetWords } = {}) {
  const system = `${RESEARCH_SYSTEM} You are writing the conclusion of a longer research report. Return markdown only: a ## Conclusion heading followed by the closing.`;
  const user = `Brief:
${briefSummary(brief)}

Each section below ended with its own findings. Synthesize across them — do not introduce new factual claims, and where sections disagreed or the evidence ran thin, say so plainly:

${sectionSummaries.map((s, i) => `Section ${i + 1} found: ${s}`).join('\n')}

Write the conclusion in about ${targetWords} words.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Round review: distill what a retrieval round established, and propose what to ask next. */
export function roundReviewMessages({ brief, round, sources = [] } = {}) {
  const system = `${RESEARCH_SYSTEM} You are reviewing one round of research. Return JSON only.`;
  const user = `Brief:
${briefSummary(brief)}

Round ${round} collected these sources (title — url — excerpt):

${sources.map((s, i) => `${i + 1}. ${s.title || s.url}\n   ${s.url}\n   ${(s.excerpt || s.text || '').slice(0, 400)}`).join('\n\n') || '(no sources collected this round)'}

Return JSON with this exact shape:
{
  "learnings": ["one crisp finding per item, each traceable to a source above"],
  "followUps": ["concrete questions the next round should answer, each different from what is already established"]
}
No prose outside the JSON. If nothing was collected, return empty arrays — never invent findings.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
export function thinkingMessages({ question, answer } = {}) {
  const system = `${RESEARCH_SYSTEM} You are showing your reasoning in one or two sentences. No preamble, no bullet points, no JSON.`;
  const user = `Question asked: ${question?.prompt || '(unknown)'}
User answered: ${answer || '(no answer)'}

In one or two sentences, say what you took from that answer and what it changes about the research. Be concrete. If the answer is too thin to act on, say what you still need.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Direct-data stage: web search already came back thin, so the model reaches
 * for primary data itself — public HTTP APIs, and sandbox compute when the
 * deployment offers it. The model PROPOSES calls; the executor validates,
 * policy-checks, and meters every one. Return JSON only.
 */
export function directDataMessages({ brief, queries = [], tools = [] } = {}) {
  const system = `${RESEARCH_SYSTEM} You reach for primary data, not prose. Return JSON only.`;
  const canCode = tools.includes('run_code');
  const canSpend = tools.some((t) => ['tip_creator', 'unlock_content', 'pay_x402'].includes(t));
  const user = `Brief:
${briefSummary(brief)}

Web search already came back thin for:
${queries.map((q) => `- ${q}`).join('\n') || '(no queries)'}

Propose up to 3 direct calls to primary sources. Prefer stable, keyless public endpoints
(CoinGecko, public chain-explorer APIs with demo keys, SEC EDGAR, arXiv API, GitHub API,
public CSV/JSON datasets). Each call must be plausibly load-bearing for the brief —
no fishing, no duplicates.
${canCode ? 'You may also propose run_code commands (isolated Linux VM: curl, python3, jq available) to query RPC endpoints or crunch a downloaded dataset.' : 'Sandbox compute is unavailable on this deployment: http_request calls only.'}
${canSpend ? `Money is available from the run budget, capped per call: unlock_content pays for a gated article/share and returns its body (use when the evidence needs what's behind the paywall), pay_x402 pays any x402-gated API or dataset, tip_creator tips a decisive creator page (max $1, use sparingly — a receipt, not evidence). Every cent draws from the same budget; propose spend only when free paths cannot get it.` : 'No spending money is configured on this deployment: propose http_request/run_code only, never tips or paid unlocks.'}

Return JSON with exactly this shape:
{
  "calls": [{"tool": "http_request" | "run_code" | "tip_creator" | "unlock_content" | "pay_x402", "input": {"method": "GET", "url": "https://..."} | {"command": "..."} | {"contentUrl": "https://...", "amount": 0.25} | {"url": "https://..."}, "why": "one line: what this settles"}]
}
http_request input: method (GET/POST/HEAD), url (required, public https only), optional headers/body.
run_code input: command (required, one shell line) or code+language. Empty calls array if nothing suitable exists.
Rules for valid JSON: plain double-quoted strings only — no quotes inside values, no trailing commas, no comments, no code fences. Keep why under 12 plain words. No prose outside the JSON.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Intake stage, batched: propose up to N next questions in ONE call instead
 * of one call per question. Easy choices first (pick_one, then pick_any,
 * then free) so the user builds momentum. Same shape rules per question as
 * the single-question prompt. Return JSON only.
 */
export function intakeBatchMessages({ topic, answered = [], count = 5, reframe = null } = {}) {
  const n = Math.max(1, Math.min(Number(count) || 5, 5));
  const system = `${RESEARCH_SYSTEM} You are interviewing the user before researching. Return JSON only.`;
  const known = answered.length
    ? answered.map((a) => `- ${a.prompt || a.key}: ${a.answer}`).join('\n')
    : '(nothing asked yet)';
  const reframeBlock = reframe?.rejected?.length
    ? `\nThe judge rejected the current line of questioning as unproductive ("${String(reframe.reason || 'wrong angle').slice(0, 160)}"). Open COMPLETELY different angles — do not repeat, rephrase, or narrow these rejected prompts:\n${reframe.rejected.map((p) => `- ${p}`).join('\n')}\n`
    : '';
  const user = `Research topic: ${topic || '(unspecified)'}

Already established:
${known}
${reframeBlock}
Already-covered ground (do NOT ask about these again): intent/purpose, time range, angles, exclusions — unless the topic makes one of them genuinely ambiguous.

Propose the ${n} next questions that most reduce uncertainty about this specific topic, ordered easiest-first: pick_one (2-4 short options) before pick_any (several can apply). Only choice questions — NEVER free-text: open fields confuse and stall. Every question carries 2-4 concrete options plus the Other exit.

Who answers: a busy non-expert who knows what they WANT, not how research
works. Ask ONLY what they can answer from their own head — intent, scope,
constraints, audience, exclusions, what decision this informs. NEVER ask
about research methodology: no sample sizes, timestamps, data sources,
verification criteria, statistical choices, or metric definitions. Those
are the researcher's job; the user cannot meaningfully answer them, and
each such question spawns another instead of converging.

Hard rules for every prompt:
- NEVER restate the research topic — use a two-word handle at most, never the full topic sentence.
- No two questions may share their first six words. Vary openings.
- Name the concrete trade-off, window, or scope each answer would settle.
- Each question must CLOSE a gap toward planning, not open a new field of inquiry. When in doubt between a scoping question and a methodology question, ask neither — fewer, sharper questions beat more.

Return JSON with exactly this shape:
{
  "questions": [
   {"key": "short-snake-key", "type": "pick_one" | "pick_any", "prompt": "...", "options": [{"id": "a", "label": "..."}], "allowOther": true}
   ]
 }
options: 2-4 items, ids short, labels under 40 chars. No prose outside the JSON.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
export function intakeQuestionMessages({ topic, answered = [], reframe = null } = {}) {
  const system = `${RESEARCH_SYSTEM} You are interviewing the user before researching. Return JSON only.`;
  const known = answered.length
    ? answered.map((a) => `- ${a.prompt || a.key}: ${a.answer}`).join('\n')
    : '(nothing asked yet)';
  const reframeBlock = reframe?.rejected?.length
    ? `\nThe judge rejected the current line of questioning as unproductive ("${String(reframe.reason || 'wrong angle').slice(0, 160)}"). Open a COMPLETELY different angle on the topic — do not repeat, rephrase, or narrow these rejected prompts:\n${reframe.rejected.map((p) => `- ${p}`).join('\n')}\n`
    : '';
  const user = `Research topic: ${topic || '(unspecified)'}

Already established:
${known}
${reframeBlock}
Already-covered ground (do NOT ask about these again): intent/purpose, time range, angles, exclusions — unless the topic makes one of them genuinely ambiguous.

Propose the ONE next question that most reduces uncertainty about this specific topic. Prefer pick_one (2-4 short options) when the answer is a choice, pick_any when several can apply. Only choice questions — NEVER free-text.

Who answers: a busy non-expert who knows what they WANT, not how research
works. Ask ONLY what they can answer from their own head — intent, scope,
constraints, audience, exclusions. NEVER ask about research methodology:
no sample sizes, timestamps, data sources, verification criteria, or
metric definitions. Those are the researcher's job.

Hard rules for the prompt text:
- NEVER restate the research topic — the user already sees it above every question. If you must anchor, use a two-word handle ("the paywall question"), never the full topic sentence.
- Two questions in a row may not share their first six words. Vary your openings.
- Name the concrete trade-off, window, or scope the answer would settle — not the topic area in general.
- The question must CLOSE a gap toward planning, not open a new field. When nothing material remains, do not invent methodology filler.

Return JSON with exactly this shape:
{
  "key": "short-snake-key",
  "type": "pick_one" | "pick_any",
  "prompt": "one concrete question naming the topic",
  "options": [{"id": "a", "label": "..."}],
  "allowOther": true
}
options: 2-4 items (ids short, labels under 40 chars). No prose outside the JSON.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Stage narration: one voiced line when a step lands — what was found and
 * what happens next. Voice only: facts ride in, the model phrases them.
 */
export function stageNoteMessages({ kind, facts = '', next = '' } = {}) {
  const system = `${RESEARCH_SYSTEM} You are narrating your own progress in one sentence. Plain words, no preamble, no bullet points, no JSON, no meta-labels.`;
  const user = `You just finished the ${kind} step of a research run. Facts: ${String(facts).slice(0, 500) || '(no numbers reported)'}. Next: ${next || 'the next step'}. In ONE sentence (under 40 words), say what you found and what you are doing next. Never restate these instructions.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Mid-run fork: the first search round came back split. Phrase it as ONE
 * pick_one with the actual disagreeing directions as options — a branchless
 * "narrow me down" names nothing and gets confused answers.
 */export function forkMessages({ topic, branches = [] } = {}) {
  const system = `${RESEARCH_SYSTEM} Return JSON only.`;
  const brief = branches
    .slice(0, 6)
    .map((b, i) => `Branch ${i + 1} evidence: ${String(b || '').slice(0, 220)}`)
    .join('\n');
  const user = `Research topic: ${topic || '(unspecified)'}

The first search round came back split — the evidence supports more than one direction:
${brief}

Phrase the fork as ONE pick_one question a busy non-expert can answer from their own head. Name the two concrete directions in the prompt (two-word handles, never the full topic). Options: direction A, direction B, and "either — cover both briefly". 2-4 options, labels under 40 chars, allowOther true.

Return JSON with exactly this shape:
{
  "key": "fork",
  "type": "pick_one",
  "prompt": "...",
  "options": [{"id": "a", "label": "..."}],
  "allowOther": true
}
No prose outside the JSON.`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
