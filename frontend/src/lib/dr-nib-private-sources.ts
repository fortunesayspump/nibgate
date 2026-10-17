"use client";

// Browser-local source store for confidential runs.
//
// A confidential run's supplied sources are held in this tab's memory only.
// They are never uploaded to the ordinary Dr. Nib API, R2, or the broker:
// the runner seals them straight to the attested guest. Reloading the tab (or
// navigating away in a way that drops JS memory) loses them, exactly like the
// report key — the source must be re-added before a fresh attempt.

import { PRIVATE_FILE_EXTENSIONS, PRIVATE_FILE_LIMIT } from "./dr-nib-private-interaction";

export const CONFIDENTIAL_SOURCE_EXTENSIONS = PRIVATE_FILE_EXTENSIONS;
export const CONFIDENTIAL_SOURCE_LIMIT = PRIVATE_FILE_LIMIT;
export const MAX_CONFIDENTIAL_SOURCES = 5;

export type LocalSource =
  | { id: string; kind: "file"; name: string; size: number; file: File; addedAt: number }
  | { id: string; kind: "text"; name: string; size: number; text: string; addedAt: number };

const store = new Map<string, LocalSource[]>();

function key(runId: string): string {
  if (!runId) throw Error("A run is required to hold confidential sources.");
  return runId;
}

export function listLocalSources(runId: string): LocalSource[] {
  return [...(store.get(key(runId)) ?? [])];
}

export function addLocalFileSource(runId: string, file: File): { ok: true; source: LocalSource } | { ok: false; error: string } {
  if (!CONFIDENTIAL_SOURCE_EXTENSIONS.test(file.name) || file.name.length > 160 ||
      file.size < 1 || file.size > CONFIDENTIAL_SOURCE_LIMIT)
    return { ok: false, error: "Choose a PDF, DOCX, XLSX, CSV, TXT, MD, PNG, JPEG, or WebP file no larger than 2 MB." };
  const rows = store.get(key(runId)) ?? [];
  if (rows.length >= MAX_CONFIDENTIAL_SOURCES)
    return { ok: false, error: `Up to ${MAX_CONFIDENTIAL_SOURCES} sources per run.` };
  const source: LocalSource = { id: crypto.randomUUID(), kind: "file", name: file.name, size: file.size, file, addedAt: Date.now() };
  store.set(key(runId), [...rows, source]);
  return { ok: true, source };
}

export function addLocalTextSource(runId: string, name: string, text: string): { ok: true; source: LocalSource } | { ok: false; error: string } {
  if (text.trim().length < 1) return { ok: false, error: "Paste some text first." };
  const rows = store.get(key(runId)) ?? [];
  if (rows.length >= MAX_CONFIDENTIAL_SOURCES)
    return { ok: false, error: `Up to ${MAX_CONFIDENTIAL_SOURCES} sources per run.` };
  const source: LocalSource = { id: crypto.randomUUID(), kind: "text", name: name.trim() || "Pasted text", size: text.length, text, addedAt: Date.now() };
  store.set(key(runId), [...rows, source]);
  return { ok: true, source };
}

export function removeLocalSource(runId: string, id: string): void {
  const rows = store.get(key(runId)) ?? [];
  store.set(key(runId), rows.filter((row) => row.id !== id));
}

export function clearLocalSources(runId: string): void {
  store.delete(key(runId));
}

/** The single source the guest currently accepts (one source per confidential run). */
export function primaryLocalSource(runId: string): LocalSource | null {
  return listLocalSources(runId)[0] ?? null;
}
