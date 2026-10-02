// Stub intake: a deterministic stand-in for the real LLM + JEV loop.
//
// It plays the two roles the real version splits:
//   - the language model PROPOSES the next question and its options
//   - JEV DECIDES whether the brief is whole enough to leave intake
// Here that decision is "the question bank is exhausted", and the questions are
// fixed. The shapes are the part that matters: replace the bodies with llm.js +
// JEV calls and the routes, transcript, and UI stay identical.

export const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function deriveTitle(topic) {
  const t = String(topic || "").trim().replace(/\s+/g, " ");
  if (!t) return "Untitled research";
  const short = t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export function deriveDescription(topic) {
  return `Research opened from: "${String(topic || "").trim()}"`;
}

// Each entry is a question shape Dr. Nib can ask. `type` is one of
// pick_one / pick_any / free; `allowOther` adds the "another answer" exit.
const BANK = [
  {
    key: "intent",
    type: "pick_one",
    prompt: "What is this research actually for?",
    options: [
      { id: "decide", label: "A decision I have to make" },
      { id: "understand", label: "Understanding a space" },
      { id: "write", label: "Writing or briefing something" },
    ],
    allowOther: true,
  },
  {
    key: "time",
    type: "pick_one",
    prompt: "What time range should the evidence cover?",
    options: [
      { id: "30d", label: "Last 30 days" },
      { id: "90d", label: "Last 90 days" },
      { id: "1y", label: "The past year" },
      { id: "all", label: "All time" },
    ],
    allowOther: true,
  },
  {
    key: "angles",
    type: "pick_any",
    prompt: "Which angles matter most? Pick any.",
    options: [
      { id: "cost", label: "Costs and pricing" },
      { id: "shipping", label: "Who is actually shipping" },
      { id: "risks", label: "Risks and criticism" },
      { id: "regulatory", label: "Regulation" },
    ],
    allowOther: true,
  },
  {
    key: "exclude",
    type: "free",
    prompt: "Anything to leave out, or sources to avoid?",
    options: [],
    allowOther: false,
  },
];

export function nextQuestion(answeredKeys) {
  const q = BANK.find((item) => !answeredKeys.includes(item.key));
  return q ? { ...q, options: q.options.map((o) => ({ ...o })) } : null;
}

/** Keys the bank still has open — what JEV weighs against stopping. */
export function remainingKeys(answeredKeys) {
  return BANK.map((item) => item.key).filter((key) => !answeredKeys.includes(key));
}

// One-line human rendering of an answer, for prompts and logs.
export function describeAnswer(question, answer) {
  return labelFor(question, answer);
}

function labelFor(question, answer) {
  const ids = Array.isArray(answer?.optionIds) ? answer.optionIds : [];
  const labels = ids
    .map((id) => question.options.find((o) => o.id === id)?.label || id)
    .filter(Boolean);
  const text = typeof answer?.text === "string" ? answer.text.trim() : "";
  const picked = labels.join(", ");
  if (picked && text) return `${picked}; also "${text}"`;
  return picked || text || "(no answer)";
}

const REASON = {
  intent: (v) =>
    v.startsWith("A decision")
      ? "This is a decision, not a survey — so I'll weight who actually ships over what the discourse says."
      : "This is background, not a decision — so I'll favour scope and current state over arguments.",
  time: (v) =>
    `Bounding the evidence to ${v.toLowerCase()} — older material is context, not evidence, and I won't spend sources on it.`,
  angles: (v) => `Those become the spine of the report: ${v.toLowerCase()}. Everything else is colour.`,
  exclude: (v) => `Leaving that out entirely, and I won't spend a source on it: ${v}.`,
};

export function think({ question, answer }) {
  const value = labelFor(question, answer);
  const line = REASON[question.key]?.(value) || `Noted: ${value}.`;
  return `${line} I'll fold that into the brief and decide what still has to be resolved before planning.`;
}

// Metadata is a living field: each answer sharpens the project's title,
// description, and structured metadata. The real agent rewrites these freely as
// it learns more; this stub just accumulates.
export function applyAnswer({ run, question, answer }) {
  const value = labelFor(question, answer);
  const brief = { ...(run.brief || {}) };
  const metadata = { ...(run.metadata || {}) };

  if (question.key === "intent") metadata.intent = value;
  if (question.key === "time") metadata.timeRange = value;
  if (question.key === "angles") metadata.angles = value;
  if (question.key === "exclude") metadata.exclude = value;

  const parts = [metadata.intent, metadata.timeRange].filter(Boolean);
  const title = run.title || deriveTitle(brief.topic);
  const description = parts.length ? `${parts.join(" · ")} — "${brief.topic}"` : run.description;

  return { brief, metadata, title, description };
}
