import type { ContentMedia } from "../types";

type UploadResponse = ContentMedia & { success?: boolean; encrypted?: boolean; error?: string };

export async function uploadJson<T = UploadResponse>(url: string, body: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", credentials: "include", body });
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
