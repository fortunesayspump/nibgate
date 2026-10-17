// Keep the browser's input and retry rules in one place so failures cannot
// silently fall back to another source or submit a second private job.
export const PRIVATE_FILE_LIMIT = 2 * 1024 * 1024;
export const PRIVATE_FILE_EXTENSIONS = /\.(pdf|docx|xlsx|csv|txt|md|png|jpg|jpeg|webp)$/i;
export const PRIVATE_FILE_ERROR = "Choose a PDF, DOCX, XLSX, CSV, TXT, MD, PNG, JPEG, or WebP file no larger than 2 MB with a filename under 160 characters.";

export function choosePrivateFile<T extends Pick<File, "name" | "size">>(file?: T): {
  sourceFile: T | null; fileName: string; sourceText: string; title: string; error: string;
} | null {
  if (!file) return null; // The user cancelled the picker; keep the current source.
  if (!PRIVATE_FILE_EXTENSIONS.test(file.name) || file.name.length > 160 ||
      file.size < 1 || file.size > PRIVATE_FILE_LIMIT) {
    // A rejected replacement clears the old valid file and any pasted text.
    return { sourceFile: null, fileName: "", sourceText: "", title: "", error: PRIVATE_FILE_ERROR };
  }
  return { sourceFile: file, fileName: file.name, sourceText: "", title: file.name, error: "" };
}

export class PrivateRequestGate {
  private active = false;
  enter(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }
  leave(): void { this.active = false; }
}

export function canRetryPrivateReport(run: unknown, key: unknown, reportId: string): boolean {
  // Closing/reloading the tab discards the in-memory key. No key escrow or
  // persistent browser storage is used, so a report cannot then be reopened.
  return Boolean(run && key && reportId);
}

export function privateFailureStage(executionMayHaveStarted: boolean, receivedReceipt: boolean): string {
  return receivedReceipt ? "Encrypted report unavailable" :
    executionMayHaveStarted ? "Execution outcome unknown" : "Stopped before execution";
}
