export const SHEET_VIEWER_KINDS = new Set(["xlsx", "csv", "ods", "legacy_excel", "legacy-excel", "legacy_spreadsheet"]);

export const TEXT_VIEWER_KINDS = new Set(["text", "markdown"]);

export function kindFromName(name?: string | null): string | null {
  if (!name) return null;
  const ext = name.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    pdf: "pdf", xlsx: "xlsx", xls: "legacy_excel", csv: "csv", ods: "ods", pptx: "pptx",
    docx: "docx", doc: "legacy_word", txt: "text", md: "markdown",
  };
  return map[ext] || null;
}
