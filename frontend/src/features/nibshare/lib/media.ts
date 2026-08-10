const PROOF_KEY = (slug: string) => `nibgate:payment-proof:${slug}`;

export function storedProofFor(slug: string): string {
  try {
    return localStorage.getItem(PROOF_KEY(slug)) || "";
  } catch {
    return "";
  }
}

export function mediaEndpoint(slug: string, kind: string, index?: number): string {
  const q = index !== undefined ? `?index=${index}` : "";
  return `/nibshare/${slug}/media/${kind}${q}`;
}

export async function fetchMediaObjectUrl(slug: string, kind: string, index?: number): Promise<string> {
  const proof = storedProofFor(slug);
  const res = await fetch(mediaEndpoint(slug, kind, index), {
    headers: proof ? { "x-nibgate-payment-proof": proof } : {},
  });
  if (!res.ok) throw new Error(`Failed to load media (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
