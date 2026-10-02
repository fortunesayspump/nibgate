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
  const system = `${RESEARCH_SYSTEM} You are writing the final report. Return markdown only.`;
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
- If the evidence does not answer part of the brief, say so plainly.
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
  const system = `${RESEARCH_SYSTEM} You are writing one section of a longer report. Return markdown only: a ## heading followed by the section body.`;
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
- If the evidence does not cover this section, say so in one paragraph instead of inventing coverage.
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
