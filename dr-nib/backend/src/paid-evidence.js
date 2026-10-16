// A paid endpoint may return a payment authorization alongside the purchased
// content. The research model needs the content, never reusable proof bytes.
const PRIVATE_PAYMENT_FIELD = /^(?:payment|paymentId|paymentSignature|authorization|signature|unlockProof|token|secret)$/i;

export function paidEvidenceText(data) {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object') {
    for (const value of [data.content, data.markdown, data.text, data.body, data.article?.content]) {
      if (typeof value === 'string' && value.trim()) return value;
    }
    return JSON.stringify(data, (key, value) => PRIVATE_PAYMENT_FIELD.test(key) ? undefined : value) || '';
  }
  return '';
}
