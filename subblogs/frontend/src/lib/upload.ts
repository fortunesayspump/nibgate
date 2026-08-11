export type UploadResult = {
  success?: boolean;
  url?: string;
  filename?: string;
  storageRef?: string;
  encryptedKey?: string;
  contentType?: string;
  name?: string;
  size?: number;
  encrypted?: boolean;
  error?: string;
};

export async function uploadJson<T = UploadResult>(
  url: string,
  body: FormData,
  headers?: Record<string, string>
): Promise<T> {
  const res = await fetch(url, { method: "POST", headers, body });
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
