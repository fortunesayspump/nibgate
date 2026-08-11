export type UploadResponse = Record<string, unknown> & { success?: boolean; url?: string; error?: string };

export async function uploadJson<T = UploadResponse>(url: string, body?: FormData | Record<string, unknown>, method: string = "POST"): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const hasJson = !isForm && typeof body !== "undefined";
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: hasJson ? { "Content-Type": "application/json" } : undefined,
    body: isForm ? body : hasJson ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) throw new Error((data.error as string) || "Upload failed");
  return data as T;
}
