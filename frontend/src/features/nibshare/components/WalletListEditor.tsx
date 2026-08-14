"use client";

import { useRef, useState } from "react";
import { FiX, FiPlus, FiUsers, FiDownload, FiUpload, FiTrash2 } from "react-icons/fi";
import { shortAddress } from "../lib/shares";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

type StatusOfMap = Record<string, "active" | "revoked" | "banned">;

function splitAddresses(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((w) => w.trim().toLowerCase()).filter(Boolean))];
}

function parseCsv(text: string): { wallets: string[]; invalid: string[]; skippedPrice: boolean } {
  const invalid: string[] = [];
  const seen = new Set<string>();
  const wallets: string[] = [];
  let skippedPrice = false;
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^(address|wallet|wallet_address)/i.test(line)) continue;
    const [first, second] = line.split(/[,\t]/).map((c) => c.trim());
    const candidate = first?.toLowerCase() || "";
    if (second) skippedPrice = true;
    if (!ADDR_RE.test(candidate)) {
      invalid.push(first || line);
      continue;
    }
    if (!seen.has(candidate)) {
      seen.add(candidate);
      wallets.push(candidate);
    }
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
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { wallets, invalid, skippedPrice } = parseCsv(String(reader.result || ""));
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
        setError("Could not read that file. Use a .csv or .txt with one address per line.");
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
    reader.readAsText(file);
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
          title="Import wallets from a .csv or .txt file"
        >
          <FiUpload size={11} /> {importing ? "Importing…" : "Import CSV"}
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
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {error && <p className="text-[10px]" style={{ color: "#c44" }}>{error}</p>}
      {notice && <p className="text-[10px]" style={{ color: "#7c9a6d" }}>{notice}</p>}
      {!compact && (
        <p className="text-[10px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Paste multiple addresses at once, separated by spaces or commas — or import a CSV. Whitelisted wallets pay the
          whitelist tier instead of the public price.
        </p>
      )}
    </div>
  );
}

export { shortAddress };