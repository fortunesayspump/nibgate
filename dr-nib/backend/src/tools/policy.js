// Tool policy — the permission layer.
//
// Every tool call passes through here before it executes. The run's brief may
// carry domain allow/deny lists (the configure screen's Advanced drawer); when
// present they are enforced, not advisory. Robots and paywalls are enforced
// inside the web tools themselves — policy here is about *where* the run may
// go, not *how* it reads once there.

function hostOf(url) {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/\.$/, ''); } catch { return ''; }
}

// A rule matches the host itself or any subdomain beneath it.
function matchesRule(host, rule) {
  const r = String(rule || '').toLowerCase().trim().replace(/^\*\./, '').replace(/\.$/, '');
  if (!r) return false;
  return host === r || host.endsWith(`.${r}`);
}

export function normalizePolicy(policy = {}) {
  const list = (v) => (Array.isArray(v) ? v : []).map((s) => String(s || '').trim()).filter(Boolean);
  return { allow: list(policy.allowDomains ?? policy.allow), deny: list(policy.denyDomains ?? policy.deny) };
}

/**
 * Decide whether a URL may be fetched. Deny wins over allow: an explicit deny
 * always refuses, and a non-empty allow list refuses everything not on it.
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
export function checkUrlPolicy(url, policy = {}) {
  const { allow, deny } = normalizePolicy(policy);
  const host = hostOf(url);
  if (!host) return { ok: false, reason: 'unparseable-url' };
  if (deny.some((r) => matchesRule(host, r))) return { ok: false, reason: `domain-denied: ${host}` };
  if (allow.length && !allow.some((r) => matchesRule(host, r))) return { ok: false, reason: `domain-not-allowed: ${host}` };
  return { ok: true };
}

/** Filter a candidate list to policy-allowed URLs, reporting what was cut. */
export function applyUrlPolicy(items, policy = {}) {
  const kept = [];
  const cut = [];
  for (const item of items || []) {
    const verdict = checkUrlPolicy(item?.url, policy);
    if (verdict.ok) kept.push(item);
    else cut.push({ url: item?.url || null, reason: verdict.reason });
  }
  return { kept, cut };
}
