import {sanitizePaidData} from '../paid-evidence.js';

/** SDK payment responses may grant access rather than include the article.
 * Redeem the proof once through the caller's exact-URL transport. Neither the
 * proof nor the signed payment authorization becomes research evidence. */
export async function privatePaidContent(data, readUnlocked) {
  if (!data || typeof data !== 'object' || !Object.hasOwn(data, 'unlockProof'))
    return {data: sanitizePaidData(data), contentUnavailable: false};
  const proof = data.unlockProof;
  if (typeof proof !== 'string' || !proof || proof.length > 16000)
    return {data: null, contentUnavailable: true};
  try {
    const response = await readUnlocked(proof);
    if (!response.ok) return {data: null, contentUnavailable: true};
    const raw = await response.text();
    let unlocked;
    try { unlocked = JSON.parse(raw); } catch { unlocked = raw; }
    const clean = sanitizePaidData(unlocked);
    const content = typeof clean === 'string' ? clean :
      [clean?.content, clean?.markdown, clean?.text, clean?.body, clean?.article?.content]
        .find(value => typeof value === 'string' && value.trim());
    return typeof content === 'string' && content.trim()
      ? {data: clean, contentUnavailable: false}
      : {data: null, contentUnavailable: true};
  } catch { return {data: null, contentUnavailable: true}; }
}
