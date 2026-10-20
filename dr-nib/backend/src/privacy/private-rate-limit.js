// Retry timing is admission metadata, never evidence of zero provider usage.
export function privateRetryAfterMs(value,nowMs=Date.now()) {
  if(typeof value!=='string'||value.length>100)return 60000;
  let delay;
  if(/^\d{1,8}$/.test(value))delay=Number(value)*1000;
  else if(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value))delay=Date.parse(value)-nowMs;
  return Number.isFinite(delay)&&delay>=0?Math.min(3600000,Math.max(1000,delay)):60000;
}

// Numeric response headers help distinguish provider quotas from our fallback
// cooldown. Never retain free-form headers or an upstream error body.
export function privateRateLimitEvidence(headers,nowMs=Date.now()) {
  const raw=headers?.get?.('retry-after');
  const valid=typeof raw==='string'&&(/^[0-9]{1,8}$/.test(raw)||
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(raw)&&Number.isFinite(Date.parse(raw))&&Date.parse(raw)>=nowMs);
  const evidence={retryAfterMs:privateRetryAfterMs(raw,nowMs),retryAfterSource:valid?'provider-header':'local-default'};
  for(const [header,key] of [['x-ratelimit-limit-requests','requestLimit'],['x-ratelimit-remaining-requests','requestsRemaining'],['x-ratelimit-limit-tokens','tokenLimit'],['x-ratelimit-remaining-tokens','tokensRemaining']]){
    const value=headers?.get?.(header);
    if(typeof value==='string'&&/^\d{1,12}$/.test(value))evidence[key]=Number(value);
  }
  return Object.freeze(evidence);
}
