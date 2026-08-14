"use client";

import { useRef, useState } from "react";
import { FiX, FiPlus, FiUsers, FiDownload, FiUpload, FiTrash2, FiFileText } from "react-icons/fi";
import * as XLSX from "xlsx";
import { shortAddress } from "../lib/shares";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

type StatusOfMap = Record<string, "active" | "revoked" | "banned">;

function splitAddresses(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((w) => w.trim().toLowerCase()).filter(Boolean))];
}

// Header names that identify the wallet-address column in an import file.
// Matches the convention used by minting/allowlist tools (AutoMinter, Bueno,
// HeyMint, nfts2me): a named `address` / `wallet` / `wallet_address` column.
const ADDR_HEADER_RE = /^(wallet[ _-]*address|wallet|address|recipient|owner|user|account|0x[ _-]*address|ethereum[ _-]*address|evm[ _-]*address|member|holder|collector|minter|to)$/i;
// Header names for a per-wallet price/tier column we can't honor (single tier).
const PRICE_HEADER_RE = /^(price|tier|amount|mintfee|mintprice|whitelistprice|maxmints|mintlimit|allocation|slots|count|quantity|qty|limit)$/i;

// Minimal CSV row splitter that respects double-quoted fields (addresses never
// contain quotes, but a spreadsheet export may quote a label/price cell).
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === "," || ch === "\t" || ch === ";") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Locate the address column by scanning up to the first 5 rows for a header
// cell matching the address header names. Returns the column index or -1.
function findAddressColumn(rows: string[][]): { col: number; headerRow: number } {
  const maxScan = Math.min(rows.length, 5);
  for (let r = 0; r < maxScan; r++) {
    const cells = rows[r];
    const idx = cells.findIndex((h) => ADDR_HEADER_RE.test(String(h ?? "").trim()));
    if (idx >= 0) return { col: idx, headerRow: r };
  }
  return { col: -1, headerRow: -1 };
}

function isPriceHeader(cells: string[]): boolean {
  return cells.some((h) => PRICE_HEADER_RE.test(String(h ?? "").trim()));
}

// Header-aware CSV import: finds the `address`/`wallet` column by header name,
// falls back to the first column when no header row is present. Reports any
// price/tier column that the single-tier model ignores.
function parseCsv(text: string): { wallets: string[]; invalid: string[]; skippedPrice: boolean } {
  const invalid: string[] = [];
  const seen = new Set<string>();
  const wallets: string[] = [];
  let skippedPrice = false;
  const lines = text.split(/\r?\n/);
  const rows: string[][] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    rows.push(parseCsvRow(line));
  }
  if (rows.length === 0) return { wallets, invalid, skippedPrice };
  const { col, headerRow } = findAddressColumn(rows);
  const addressCol = col >= 0 ? col : 0;
  const hasHeader = col >= 0;
  if (hasHeader) {
    if (isPriceHeader(rows[headerRow])) skippedPrice = true;
    rows.splice(headerRow, 1);
  }
  for (const cells of rows) {
    const candidate = (cells[addressCol] ?? "").toLowerCase();
    const nonEmpty = cells.filter((c) => c && c !== "").length;
    if (nonEmpty > 1 && !hasHeader && cells.length > 1) skippedPrice = true;
    if (!candidate) continue;
    if (!ADDR_RE.test(candidate)) {
      invalid.push(candidate);
      continue;
    }
    if (!seen.has(candidate)) {
      seen.add(candidate);
      wallets.push(candidate);
    }
  }
  return { wallets, invalid, skippedPrice };
}

// Header-aware Excel import (.xlsx/.xls). Same column-detection as the CSV
// path: finds the `address`/`wallet` column by header name and pulls addresses
// only from that column — no blind whole-sheet scan that could grab a price
// cell or a hex-ish string from an unrelated column.
function parseExcel(data: Uint8Array): { wallets: string[]; invalid: string[]; skippedPrice: boolean } {
  const invalid: string[] = [];
  const seen = new Set<string>();
  const wallets: string[] = [];
  let skippedPrice = false;
  try {
    const wb = XLSX.read(data, { type: "array" });
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" });
      const stringRows: string[][] = rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []));
      if (stringRows.length === 0) continue;
      const { col, headerRow } = findAddressColumn(stringRows);
      const addressCol = col >= 0 ? col : 0;
      const hasHeader = col >= 0;
      const start = hasHeader ? headerRow + 1 : 0;
      if (hasHeader && isPriceHeader(stringRows[headerRow])) skippedPrice = true;
      for (let r = start; r < stringRows.length; r++) {
        const cells = stringRows[r];
        const candidate = (cells[addressCol] ?? "").toLowerCase();
        const nonEmpty = cells.filter((c) => c !== "").length;
        if (nonEmpty > 1 && !hasHeader) skippedPrice = true;
        if (!candidate) continue;
        if (!ADDR_RE.test(candidate)) {
          invalid.push(candidate);
          continue;
        }
        if (!seen.has(candidate)) {
          seen.add(candidate);
          wallets.push(candidate);
        }
      }
    }
  } catch {
    invalid.push("<unreadable workbook>");
  }
  return { wallets, invalid, skippedPrice };
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "", color: "#7c9a6d", bg: "#7c9a6d" },
  revoked: { label: "revoked", color: "#b45309", bg: "#7c9a6d" },
  banned: { label: "banned", color: "#c44", bg: "#7c9a6d" },
};

export function WalletListEditor({ value, onChange, disabled = false, compact = false, statusOf }: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
  statusOf?: StatusOfMap;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const rawList = splitAddresses(raw);
    if (rawList.length === 0) {
      setError("Paste a 0x wallet address");
      return false;
    }
    const invalid = rawList.filter((w) => !ADDR_RE.test(w));
    if (invalid.length > 0) {
      setError(`Invalid address: ${invalid[0]}`);
      return false;
    }
    const existing = new Set(value);
    const fresh = rawList.filter((w) => !existing.has(w));
    if (fresh.length === 0) {
      setError("That wallet is already in the list");
      return false;
    }
    onChange([...value, ...fresh]);
    setInput("");
    setError("");
    setNotice("");
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(input);
    }
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setError("");
    setNotice("");
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = isExcel
          ? parseExcel(new Uint8Array(reader.result as ArrayBuffer))
          : parseCsv(String(reader.result || ""));
        const { wallets, invalid, skippedPrice } = parsed;
        if (wallets.length === 0 && invalid.length === 0) {
          setError("No wallet addresses found in that file.");
          return;
        }
        const existing = new Set(value);
        const fresh = wallets.filter((w) => !existing.has(w));
        const duplicates = wallets.length - fresh.length;
        if (fresh.length > 0) onChange([...value, ...fresh]);
        const parts: string[] = [];
        if (fresh.length > 0) parts.push(`Added ${fresh.length} wallet${fresh.length !== 1 ? "s" : ""}`);
        if (duplicates > 0) parts.push(`${duplicates} already in the list`);
        if (invalid.length > 0) parts.push(`skipped ${invalid.length} invalid row${invalid.length !== 1 ? "s" : ""} (${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""})`);
        if (skippedPrice) parts.push("price column ignored — one whitelist tier applies to all");
        setNotice(parts.join(" · "));
      } catch {
        setError("Could not read that file. Use a .csv, .txt, .xlsx, or .xls file.");
      } finally {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.onerror = () => {
      setError("Could not read that file.");
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    };
    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }

  function handleExport() {
    const csv = value.join("\n");
    const blob = new Blob([csv + (csv ? "\n" : "")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "whitelist.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Download a sample file showing the expected import format. Uses the same
  // `address` header convention as allowlist tools so users can fill it in.
  function handleTemplate() {
    const sample = [
      "address",
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      "",
    ].join("\n");
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "whitelist-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleClearAll() {
    if (value.length === 0) return;
    if (!window.confirm(`Remove all ${value.length} wallet${value.length !== 1 ? "s" : ""} from the whitelist?`)) return;
    onChange([]);
    setNotice("");
  }

  const chip = (w: string) => {
    const st = statusOf && statusOf[w];
    return (
      <span
        key={w}
        className="inline-flex items-center gap-1 rounded-full text-[11px] font-semibold pl-1.5 pr-1 py-0.5"
        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
      >
        {st && (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: st === "banned" ? "#c44" : st === "revoked" ? "#b45309" : "#7c9a6d" }}
            title={st}
          />
        )}
        <span className="font-mono">{shortAddress(w)}</span>
        {st && st !== "active" && (
          <span className="pr-0.5" style={{ color: st === "banned" ? "#c44" : "#b45309" }}>{st}</span>
        )}
        {!disabled && statusOf?.[w] !== "banned" && (
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== w))}
            className="inline-flex items-center justify-center rounded-full cursor-pointer"
            style={{ width: 15, height: 15, background: "#ffffff88", color: "var(--accent)" }}
            aria-label={`Remove ${shortAddress(w)}`}
          >
            <FiX size={10} />
          </button>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(chip)}
        </div>
      )}
      <div className="flex gap-1.5">
        <div className="relative flex-1 min-w-0">
          <FiUsers className="absolute left-2.5 top-1/2 -translate-y-1/2" size={12} style={{ color: "var(--muted)" }} />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(""); }}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData("text");
              if (commit(text)) inputRef.current?.focus();
            }}
            placeholder="0x… — paste one or many wallets"
            spellCheck={false}
            disabled={disabled}
            className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-md border pl-8"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--fg)", width: "100%" }}
          />
        </div>
        <button
          type="button"
          onClick={() => commit(input)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold cursor-pointer shrink-0"
          style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--fg)" }}
        >
          <FiPlus size={12} /> Add
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || importing}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold cursor-pointer shrink-0"
          style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--fg)" }}
          title="Import wallets from a .csv, .txt, .xlsx, or .xls file"
        >
          <FiUpload size={11} /> {importing ? "Importing…" : "Import CSV / Excel"}
        </button>
        <button
          type="button"
          onClick={handleTemplate}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold cursor-pointer shrink-0"
          style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--fg)" }}
          title="Download a sample .csv showing the expected address column"
        >
          <FiFileText size={11} /> Template
        </button>
        {value.length > 0 && (
          <button
            type="button"
            onClick={handleExport}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold cursor-pointer shrink-0"
            style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--fg)" }}
            title="Download the current whitelist as CSV"
          >
            <FiDownload size={11} /> Export
          </button>
        )}
        {value.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold cursor-pointer shrink-0"
            style={{ border: "1px solid #c446", background: "transparent", color: "#c44" }}
            title="Remove every wallet from the whitelist"
          >
            <FiTrash2 size={11} /> Clear all
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {error && <p className="text-[10px]" style={{ color: "#c44" }}>{error}</p>}
      {notice && <p className="text-[10px]" style={{ color: "#7c9a6d" }}>{notice}</p>}
      {!compact && (
        <p className="text-[10px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Paste multiple addresses at once, separated by spaces or commas — or import a CSV / Excel file with an
          `address` (or `wallet`) column. Any price/tier column is ignored since one whitelist tier applies to all.
          Whitelisted wallets pay the whitelist tier instead of the public price.
        </p>
      )}
    </div>
  );
}

export { shortAddress };