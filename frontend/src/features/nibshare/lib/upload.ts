import { uploadJson as baseUploadJson } from "../../../lib/upload";
import type { ContentMedia } from "../types";

export type UploadResponse = ContentMedia & { success?: boolean; encrypted?: boolean; error?: string };

export function uploadJson<T = UploadResponse>(url: string, body?: FormData | Record<string, unknown>, method?: string): Promise<T> {
  return baseUploadJson<T>(url, body, method);
}
