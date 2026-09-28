// JEV schema: the contract between LLM proposers and the decision engine.
// Domain-agnostic by design — spend decisions, metadata picks, rankings, and
// content-ID judgments all speak this shape.

/** One candidate proposed by an LLM (or any producer). */
export interface JevOption {
  /** Stable id within this decision round (used for deterministic ties). */
  id: string;
  /** Domain action label, opaque to the engine: 'unlock' | 'tip' | 'skip' | tag | rank-slot … */
  kind: string;
  /** Cost in the round's currency (USDC for spend, 0 for free picks). */
  cost: number;
  /** Named signals in [0,1]: relevance, uniqueness, confidence, reputation … */
  scores: Record<string, number>;
  /** Untouched payload carried into the decision + trace. */
  meta?: unknown;
}

/** Policy for one decision round. */
export interface JevPolicy {
  /** Budget remaining in the round's currency. Options costing more are ineligible. */
  budgetRemaining: number;
  /** Hard per-option cap. Defaults to budgetRemaining. */
  maxCost?: number;
  /** Minimum `confidence` score; options below escalate instead of executing. */
  minConfidence?: number;
  /** Signal weights for value. Missing signals score 0. Should sum ~1. */
  weights: Record<string, number>;
  /** Penalty per unit cost (default 1): value -= costPenalty * cost. */
  costPenalty?: number;
}

/** A decided round. */
export interface JevDecision {
  /** 'select' | 'skip_all' | 'escalate' */
  kind: 'select' | 'skip_all' | 'escalate';
  /** Winning option id (select) or null. */
  optionId: string | null;
  /** Winning option kind (select) or 'skip' / 'escalate'. */
  action: string;
  /** Computed value of the winner (select) or 0. */
  value: number;
  /** Human-readable reasons, strongest factor first. */
  reasons: string[];
  /** Budget after applying the winner's cost (select) or unchanged. */
  budgetAfter: number;
  /** True when the round escalated to a human. */
  escalated: boolean;
}
