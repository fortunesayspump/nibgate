// Process-local, fixed-cardinality counters. Never retain request/error payloads.
const stages = new Set(['site_list', 'sitemap_fetch', 'oauth', 'inspection', 'google_submit', 'google_list', 'indexnow_submit', 'checkpoint', 'batch']);
const outcomes = new Set(['accepted', 'accepted_pending', 'http_failure', 'timeout', 'network_failure', 'database_failure', 'unknown', 'inherited_failures', 'new_failures']);
const counts = new Map();
const MAX_COUNT = 1_000_000;
export function recordIndexDiagnostic(stage, outcome, status, amount = 1) {
  if (!stages.has(stage) || !outcomes.has(outcome)) return;
  const code = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
  const increment = Number.isSafeInteger(amount) && amount > 0 ? Math.min(amount, MAX_COUNT) : 1;
  const key = `${stage}:${outcome}:${code}`;
  if (!counts.has(key) && counts.size >= 64) return;
  counts.set(key, Math.min(MAX_COUNT, (counts.get(key) || 0) + increment));
}
export function indexFailure(stage, error) {
  const status = error?.status;
  const code = error?.code;
  const outcome = Number.isInteger(status) && status >= 400 && status <= 599 ? 'http_failure'
    : error?.name === 'TimeoutError' || error?.name === 'AbortError' || code === 'ETIMEDOUT' ? 'timeout'
    : stage === 'checkpoint' ? 'database_failure'
    : ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code) ? 'network_failure' : 'unknown';
  recordIndexDiagnostic(stage, outcome, status);
}
export async function observeIndexStage(stage, operation) {
  try { const value = await operation(); recordIndexDiagnostic(stage, 'accepted'); return value; }
  catch (error) { indexFailure(stage, error); throw error; }
}
export function takeIndexDiagnostics() {
  const rows = [...counts].map(([key, count]) => {
    const [stage, outcome, code] = key.split(':');
    return { stage, outcome, status: Number(code) || null, count };
  });
  counts.clear();
  return rows;
}
