export const KIND_LABELS: Record<string, string> = {
  pdf: "PDF",
  xlsx: "Excel",
  csv: "CSV",
  ods: "ODS",
  pptx: "PowerPoint",
  docx: "Word",
  text: "Text",
  markdown: "Markdown",
  legacy_excel: "Excel",
  "legacy-excel": "Excel",
  legacy_spreadsheet: "Spreadsheet",
  legacy_word: "Word",
  "legacy-word": "Word",
};

export const SHEET_KINDS = new Set(["xlsx", "csv", "ods", "legacy_excel", "legacy-excel", "legacy_spreadsheet"]);

export const UNIVERSAL_KINDS = new Set(["pdf", "docx", "xlsx", "csv", "ods", "legacy_excel", "legacy-excel", "legacy_spreadsheet", "text", "markdown"]);

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

export function kindFromMeta(name: string | null, contentType: string | null): string | null {
  const byName = kindFromName(name);
  if (byName) return byName;
  if (!contentType) return null;
  const m = contentType.toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("spreadsheetml") || m === "application/vnd.ms-excel") return "xlsx";
  if (m === "text/csv") return "csv";
  if (m.includes("opendocument.spreadsheet")) return "ods";
  if (m.includes("presentationml")) return "pptx";
  if (m.includes("wordprocessingml")) return "docx";
  if (m === "application/msword") return "legacy-word";
  if (m.startsWith("text/")) return "text";
  return null;
}
