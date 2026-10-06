// Loop policy constants. Every number here is a named, tunable decision —
// not a magic literal scattered through the driver. Each entry records
// WHERE the value comes from:
//   [standard] — published framework default or research finding
//   [heuristic] — our choice, tuned from study traces, safe to change
//
// Rule of thumb from the literature: termination is enforced in code with
// explicit bounds (LangChain max_iterations, OpenAI max_turns, smolagents
// max_steps=20); a visible exit the model can ignore is not a bound.

export const LIMITS = {
  // ——— budgets (checked BEFORE the calls they bound) ———
  // Harbor production envelope: 12 iterations / 120k tokens / $3 / 90s.
  // Ours is a research loop, so the wall clock is roomier; tokens match Harbor.
  maxSteps: 6, // [heuristic] study harness default; smolagents/Vercel default 20
  deadlineMs: 600_000, // [heuristic] 10 min wall clock per task
  maxSpendUsd: 1, // [heuristic] tool-dollar cap (sandbox + chain); LLM tokens budgeted separately below
  maxTokens: 120_000, // [standard] Harbor envelope: cumulative input+output tokens per task

  // ——— failure handling ———
  proposalFails: 2, // [standard] Co-ReAct allows exactly one retry per step, then stops
  failBudget: 3, // [standard] OpenAI: "exceeding failure thresholds → escalate"; 3 consecutive tool failures
  jevRetries: 1, // [heuristic] one retry on transient judge errors only (no HTTP response / 502 / 503 / 504)
  skipRepeats: 2, // [heuristic] 3rd identical skipped proposal means the proposer is stuck, not learning

  // ——— stagnation (Bansal: "two identical calls is a strong signal; three is decisive") ———
  sameToolStreak: 3, // [standard] 3 consecutive same-tool successes → the well is dry
  redundantStreak: 2, // [heuristic] 2 consecutive near-identical observations → re-reading, not researching
  similarityRedundant: 0.85, // [heuristic] token-Jaccard (stricter scale than Harbor's 0.98 cosine on embeddings)

  // ——— evidence checklist (our rubric: model names the target, code decides hits) ———
  checklistMax: 5, // [heuristic] Reflexion bounds episodic memory at 1-3; 5 items keeps the prompt small
  wordMinLen: 3, // [heuristic] matcher detail: ignore 1-2 char noise tokens

  // ——— planning & memory ———
  planInterval: 3, // [standard] smolagents planning_interval, commonly 3-5: re-plan from evidence mid-run
  lessonsMax: 20, // [heuristic] Reflexion-style episodic store, bounded
  lessonSimMin: 0.3, // [heuristic] minimum task similarity before an old lesson is injected

  // ——— decision confidence (TypeSafe's rule: thresholds come from the cost
  // of mistakes, not round numbers. A wrong free search costs ~$0; a wrong
  // spend costs money. So: free tools run on any execute verdict, spends
  // require the judge to actually mean it. Tune from decision+confidence
  // rows, which every verdict records.) ———
  minSpendConfidence: 0.6, // [heuristic] execute verdicts below this on spend tools downgrade to skip

  // ——— parallelism ———
  parallelMax: 3, // [heuristic] max independent fast calls executed concurrently in one turn

  // ——— observation hygiene (Anthropic: context engineering is the discipline) ———
  proposeMaxTokens: 1000, // [heuristic] was 600; truncation rambles observed at 600
  outputTextCap: 2000, // [heuristic] per-observation cap into matcher + history
  hexShortDigits: 16, // [principled] <=16 hex digits fit 64-bit: annotate with decimal
  hexLongDigits: 66, // [principled] 0x + 64 = full hash length; longer is blob noise (logsBloom)
};
