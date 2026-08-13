"use client";

import { useRef, useState } from "react";
import { FiX, FiPlus, FiUsers } from "react-icons/fi";
import { ADDR_RE, shortAddress } from "@/lib/wallet";

type StatusOfMap = Record<string, "active" | "revoked" | "banned">;

function splitAddresses(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((w) => w.trim().toLowerCase()).filter(Boolean))];
}

export function WalletListEditor({ value, onChange, disabled = false, compact = false, statusOf }: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
  statusOf?: StatusOfMap;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
    return true;
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(input);
    }
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
            className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-md border pl-8 input-field"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--fg)", width: "100%" }}
          />
        </div>
        <button
          type="button"
          onClick={() => commit(input)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold cursor-pointer shrink-0 input-field"
          style={{ border: "1px solid var(--border)", background: "transparent", color: "var(--fg)" }}
        >
          <FiPlus size={12} /> Add
        </button>
      </div>
      {error && <p className="text-[10px]" style={{ color: "#c44" }}>{error}</p>}
      {!compact && (
        <p className="text-[10px] leading-relaxed" style={{ color: "var(--muted)" }}>
          Paste multiple addresses at once, separated by spaces or commas. Whitelisted wallets pay the whitelist
          tier instead of the public price.
        </p>
      )}
    </div>
  );
}

export { shortAddress };