// Deterministic DOM-block candidates for content identification.
// No LLM needed when the page structure speaks: <article>, <main>, obvious
// content roles. Each block becomes a JEV option (id = index path); JEV picks
// the content block, LLM only arbitrates true ambiguity. Shape matches
// jev/src/schema.ts JevOption (minus scores — the decider or an LLM fills them).
export type DomCandidate = {
  id: string;
  kind: string;
  cost: number;
  context: string;
  selector: string;
  wordCount: number;
  hasHeading: boolean;
  hasMedia: boolean;
  element: Element;
};

const CONTENT_SELECTORS = [
  'article',
  '[role="main"]',
  '[role="article"]',
  'main',
  '.post-content',
  '.entry-content',
  '.article-body',
  '[itemtype*="Article"]',
];

export function domCandidates(root: ParentNode = document): DomCandidate[] {
  const out: DomCandidate[] = [];
  const seen = new Set<Element>();
  CONTENT_SELECTORS.forEach((sel, si) => {
    root.querySelectorAll(sel).forEach((el, ei) => {
      if (seen.has(el)) return;
      seen.add(el);
      const text = (el.textContent || '').trim();
      const words = text ? text.split(/\s+/).length : 0;
      if (words < 50) return; // nav/ads/chrome, not content
      out.push({
        id: `dom-${si}-${ei}`,
        kind: 'content-block',
        cost: 0,
        context: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} :: ${(el.querySelector('h1,h2')?.textContent || '').trim().slice(0, 120)}`,
        selector: sel,
        wordCount: words,
        hasHeading: !!el.querySelector('h1,h2'),
        hasMedia: !!el.querySelector('img,video,audio'),
        element: el,
      });
    });
  });
  return out.sort((a, b) => b.wordCount - a.wordCount);
}

// Rule-based pre-scores (no LLM): structural confidence per block.
export function structuralScores(c: DomCandidate): Record<string, number> {
  const tagBonus = c.selector === 'article' ? 0.3 : c.selector.startsWith('[role') ? 0.2 : 0.1;
  const lengthScore = Math.min(1, c.wordCount / 800);
  return {
    structure: Math.min(1, 0.4 + tagBonus),
    substance: lengthScore,
    completeness: (c.hasHeading ? 0.5 : 0) + (c.hasMedia ? 0.3 : 0) + 0.2,
  };
}
