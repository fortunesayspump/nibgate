// Payment eligibility is deterministic; the model/JEV still chooses whether
// paying an eligible source is worthwhile. A reference-list entry alone is
// not evidence that the report used the source.
export function citedTipCandidates(report) {
  const body=String(report?.markdown || '').split(/\n#{1,6}\s+(?:references|sources|bibliography)\b/i)[0];
  const cited=new Set([...body.matchAll(/\[([\d\s,]+)\]/g)].flatMap(m=>m[1].split(',').map(n=>Number(n.trim()))));
  return (report?.citations || []).filter((s,i)=>cited.has(Number(s.citationIndex)||i+1) && Number(s.trust)>=0.7 && /^https:\/\//i.test(s.url));
}
