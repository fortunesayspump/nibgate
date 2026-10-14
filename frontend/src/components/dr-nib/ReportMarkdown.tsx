"use client";

// Report prose: stored markdown rendered as a real article — every common
// construct covered (headings, bold/italic/strikethrough, bullets, numbered,
// task lists, quotes, code, links, tables, rules) plus [n] citations as
// superscript chips. The writer sometimes misuses single `*` as bullets
// (which swallows the rest of the paragraph as emphasis), so those lines are
// normalized to `-` before parsing.
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { drNibApi } from "@/lib/dr-nib-api";

/** [12] and [1, 2] in text become superscript citation chips. When `sources`
 *  are provided the chip links straight to the cited source URL; otherwise it
 *  jumps to the sources list. Numbering is global per run (see writeStage),
 *  so chip n is sources[n-1]. */
export function remarkCitations() {
  return (tree: any) => {
    visit(tree, "text", (node: any, index: number | undefined, parent: any) => {
      if (!parent || typeof index !== "number") return;
      const parts = String(node.value ?? "").split(/\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g);
      if (parts.length < 3) return;
      const nodes: any[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          if (parts[i]) nodes.push({ type: "text", value: parts[i] });
        } else {
          for (const n of parts[i].split(",").map((s: string) => s.trim()).filter(Boolean)) {
            nodes.push({
              type: "cite",
              data: { hName: "cite", hProperties: { "data-n": n } },
              children: [{ type: "text", value: n }],
            });
          }
        }
      }
      parent.children.splice(index, 1, ...nodes);
      return index + nodes.length;
    });
  };
}

/** Repair writer bullet misuse: `* item` (line-start or after a sentence)
 *  is a list item, never emphasis — a lone `*` followed by space parses as
 *  emphasis-open and eats the paragraph. `**bold**` is untouched. */
export function normalizeReportMd(md: string): string {
  return String(md || "")
    .replace(/^([ \t]*)\*(?=\s)/gm, "$1-")
    .replace(/([.!?;:]) \* (?=[A-Z0-9"“])/g, "$1 - ");
}

const mdComponents = {
  h1: ({ children }: any) => <h1 className="text-xl font-medium leading-snug md:text-2xl">{children}</h1>,
  h2: ({ children }: any) => <h2 className="mt-5 text-lg font-medium leading-snug">{children}</h2>,
  h3: ({ children }: any) => <h3 className="mt-4 text-[15px] font-medium leading-snug">{children}</h3>,
  h4: ({ children }: any) => <h4 className="mt-3 text-sm font-medium leading-snug">{children}</h4>,
  p: ({ children }: any) => <p className="mt-2.5 leading-7">{children}</p>,
  ul: ({ children }: any) => <ul className="mt-2.5 list-disc space-y-1 pl-5 leading-7">{children}</ul>,
  ol: ({ children }: any) => <ol className="mt-2.5 list-decimal space-y-1 pl-5 leading-7">{children}</ol>,
  li: ({ children }: any) => <li>{children}</li>,
  em: ({ children }: any) => <em className="opacity-90">{children}</em>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  del: ({ children }: any) => <del className="opacity-60">{children}</del>,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">{children}</a>,
  blockquote: ({ children }: any) => <blockquote className="mt-2.5 border-l-2 border-black/60 pl-3 opacity-80">{children}</blockquote>,
  code: ({ children }: any) => <code className="break-all font-mono text-[12px] opacity-80">{children}</code>,
  pre: ({ children, ...props }: any) => <ReportPre {...props}>{children}</ReportPre>,
  hr: () => <hr className="my-4 border-black/20" />,
  table: ({ children }: any) => (
    <div className="mt-2.5 overflow-x-auto rounded-xl border border-dark-gray/40">
      <table className="w-full border-collapse text-[13px] leading-6">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-black/[0.04]">{children}</thead>,
  th: ({ children }: any) => <th className="border-b border-dark-gray/40 px-3 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }: any) => <td className="border-b border-dark-gray/20 px-3 py-1.5 align-top">{children}</td>,
  input: ({ checked }: any) => <input type="checkbox" checked={!!checked} readOnly className="mr-1.5 align-middle" />,
  img: ({ src, alt }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt || "Report image"} loading="lazy" className="mt-2.5 max-h-80 w-auto rounded-xl border border-dark-gray/40" />
  ),
  cite: undefined as any,
};

// Fenced ```chart blocks the writer emits become real figures: deterministic
// SVG bars from the block's own data (no model pixels, nothing to
// hallucinate). Anything off-schema degrades to a plain table so the data
// is never lost to a malformed block.
type ChartDatum = { label: string; value: number };
type ChartSpec = { type: string; title?: string; unit?: string; data: ChartDatum[] };

function parseChart(raw: string): ChartSpec | null {
  try {
    const o = JSON.parse(String(raw || ""));
    if (!o || typeof o !== "object" || !Array.isArray(o.data)) return null;
    const data = o.data
      .slice(0, 8)
      .map((d: any) => ({
        label: String(d?.label ?? "").slice(0, 48),
        value: Number(d?.value),
      }))
      .filter((d: ChartDatum) => d.label && Number.isFinite(d.value));
    if (!data.length) return null;
    return { type: "bar", title: String(o.title || "").slice(0, 120), unit: String(o.unit || "").slice(0, 24), data };
  } catch {
    return null;
  }
}

function ChartFigure({ spec, index }: { spec: ChartSpec; index: number }) {
  const W = 560;
  const labelW = 190;
  const rowH = 34;
  const max = Math.max(...spec.data.map((d) => Math.abs(d.value)), 1e-9);
  const H = spec.data.length * rowH + 8;
  // Small decimals must survive display: 0.001 is not "0.00".
  const fmtVal = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(3))));
  return (
    <figure className="mt-3 rounded-xl border border-dark-gray/40 bg-white p-4">
      <figcaption className="text-[13px] font-medium leading-6">
        Figure {index + 1}{spec.title ? `: ${spec.title}` : ""}
        {spec.unit ? <span className="font-normal opacity-60"> ({spec.unit})</span> : null}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img"
        aria-label={spec.title ? `Bar chart: ${spec.title}. ${spec.data.map((d) => `${d.label}: ${d.value}`).join(", ")}.` : "Bar chart"}>
        {spec.data.map((d, i) => {
          const bw = Math.max(2, (Math.abs(d.value) / max) * (W - labelW - 64));
          const y = 4 + i * rowH;
          return (
            <g key={i}>
              <text x={0} y={y + 15} fontSize={12} fill="currentColor" opacity={0.75}>
                {d.label.length > 26 ? d.label.slice(0, 25) + "…" : d.label}
              </text>
              <rect x={labelW} y={y} width={bw} height={18} rx={4} fill="var(--nib-ink, #111)" opacity={0.85} />
              <text x={labelW + bw + 6} y={y + 14} fontSize={12} fill="currentColor" opacity={0.75}>
                {fmtVal(d.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function ChartTable({ spec }: { spec: ChartSpec }) {
  return (
    <div className="mt-2.5 overflow-x-auto rounded-xl border border-dark-gray/40">
      <table className="w-full border-collapse text-[13px] leading-6">
        <thead className="bg-black/[0.04]">
          <tr>
            <th className="px-3 py-1.5 text-left font-semibold">{spec.title || "Data"}</th>
            <th className="px-3 py-1.5 text-left font-semibold">{spec.unit || "Value"}</th>
          </tr>
        </thead>
        <tbody>
          {spec.data.map((d, i) => (
            <tr key={i}>
              <td className="border-b border-dark-gray/20 px-3 py-1.5 align-top">{d.label}</td>
              <td className="border-b border-dark-gray/20 px-3 py-1.5 align-top">{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Chart blocks need stable figure numbers per render: a remark pass rewrites
// fenced ```chart blocks into figureChart nodes with an index assigned in
// document order (single traversal — no global counters, StrictMode-safe).
export function remarkChartFigures() {
  return (tree: any) => {
    let index = 0;
    visit(tree, "code", (node: any) => {
      if (String(node?.lang || "").toLowerCase() !== "chart") return;
      // Payload lives in the fence BODY normally — but models (and our own
      // prompt format) often emit it inline on the fence line, which remark
      // parses as `meta`, not `value`. Read both or charts silently vanish.
      const raw = String(node.value ?? "") || String(node.meta ?? "");
      node.data = {
        hName: "figureChart",
        hProperties: { payload: raw, index },
      };
      index += 1;
    });
  };
}

function FigureChart({ payload, index }: any) {
  const spec = parseChart(payload);
  if (spec) return <ChartFigure spec={spec} index={Number(index) || 0} />;
  // Malformed block: keep the raw text over dropping data silently.
  return (
    <pre className="mt-2.5 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-black/[0.04] p-3 font-mono text-[12px] leading-6">
      {String(payload || "")}
    </pre>
  );
}

// Unwrap the default <pre> around rendered figures so charts are not boxed
// twice; ordinary code blocks keep the wrapper.
function ReportPre({ children }: any) {
  const kids: any[] = Array.isArray(children) ? children : [children];
  if (kids.length === 1 && (kids[0] as any)?.type === FigureChart) return <>{children}</>;
  return <pre className="mt-2.5 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-black/[0.04] p-3 font-mono text-[12px] leading-6">{children}</pre>;
}

function citeFor(sources: { url?: string }[]) {  return ({ children, ...props }: any) => {
    const n = Number(props?.["data-n"] ?? children);
    const url = sources[n - 1]?.url;
    const chip = (
      <sup className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 font-mono text-[10px] font-medium not-italic text-white">
        {children}
      </sup>
    );
    if (url) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className="no-underline" title={url}>
          {chip}
        </a>
      );
    }
    return (
      <a href="#drnib-sources" className="no-underline">
        {chip}
      </a>
    );
  };
}

export function ReportArticle({ markdown, sources }: { markdown: string; sources?: { url?: string }[] }) {  const [open, setOpen] = useState(false);
  const normalized = useMemo(() => normalizeReportMd(markdown), [markdown]);
  const components = useMemo(
    () => ({ ...mdComponents, cite: citeFor(Array.isArray(sources) ? sources : []), figureChart: FigureChart }),
    [sources],
  );
  return (
    <div>
      <article className="relative text-sm">
        <div className={open ? undefined : "max-h-[340px] overflow-hidden"}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkCitations, remarkChartFigures]} components={components}>
            {normalized}
          </ReactMarkdown>
        </div>
        {!open && (
          <div className="drnib-fade-mask pointer-events-none absolute inset-x-0 bottom-0 h-28" aria-hidden="true" />
        )}
      </article>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-3 border border-dark-gray/60 px-4 py-1.5 text-sm font-medium hover:bg-black hover:text-white"
      >
        {open ? "Show less ↑" : "Read full report ↓"}
      </button>
    </div>
  );
}

// Coverage badge + claim×source matrix, read straight from the run's verify
// pass (claims with JEV-scored statuses and their best passages). No new
// pipeline, no borrowed chrome: supported/total answers "how much of this
// held up", and each claim names the source that carried it.
export function ReportEvidence({ claims, sources }: { claims?: any[]; sources?: { url?: string; title?: string }[] }) {
  const list: any[] = Array.isArray(claims) ? claims : [];
  const srcs: any[] = Array.isArray(sources) ? sources : [];
  if (!list.length) return null;
  const supported = list.filter((c) => c.status === "supported").length;
  const withEv = list.filter((c) => Array.isArray(c.passages) && c.passages.length > 0).length;
  const pct = Math.round((supported / list.length) * 100);
  const srcIndex = (url: string) => {
    const i = srcs.findIndex((s) => s?.url === url);
    return i >= 0 ? i + 1 : null;
  };
  return (
    <div className="mt-4">
      {supported < list.length / 2 ? <p role="status" className="mb-3 rounded-xl border border-dark-gray/50 bg-gray p-3 text-sm leading-6"><strong>Limited evidence support.</strong> Most checked claims were not confirmed by the collected passages. Review the source matrix below before relying on this report; an unknown verdict does not mean a claim is false.</p> : null}
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-black px-2.5 py-0.5 font-medium text-white">{supported}/{list.length} supported</span>
        <span className="opacity-60">evidence on {withEv}/{list.length} · {pct}% held up under verification</span>
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium underline opacity-70 hover:opacity-100">
          Claim × source matrix ({list.length})
        </summary>
        <div className="mt-2 overflow-x-auto rounded-xl border border-dark-gray/40">
          <table className="w-full border-collapse text-[12px] leading-5">
            <thead className="bg-black/[0.04]">
              <tr>
                <th className="px-3 py-1.5 text-left font-semibold">Claim</th>
                <th className="px-3 py-1.5 text-left font-semibold">Verdict</th>
                <th className="px-3 py-1.5 text-left font-semibold">Carried by</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c: any, i: number) => {
                const p = (Array.isArray(c.passages) ? c.passages : [])[0];
                const n = p?.url ? srcIndex(String(p.url)) : null;
                const copied = (Array.isArray(c.passages) ? c.passages : []).some((q: any) => Number(q?.overlap ?? 0) >= 0.8);
                return (
                  <tr key={i} className="border-t border-dark-gray/20 align-top">
                    <td className="px-3 py-1.5">{String(c.text || "").slice(0, 160)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className={c.status === "supported" ? "font-medium text-emerald-800" : "opacity-60"}>
                        {c.status === "supported" ? "✓ supported" : "? unknown"}
                      </span>
                      {copied ? <span className="ml-1 font-medium text-red-700" title="Phrasing matches the source nearly word-for-word — paraphrase, don't paste">⚠ copied</span> : null}
                    </td>
                    <td className="px-3 py-1.5">
                      {p?.url ? (
                        <a href={String(p.url)} target="_blank" rel="noreferrer" title={String(p.title || p.url)} className="underline">
                          {n != null ? `[${n}] ` : ""}{String(p.title || p.url).slice(0, 60)}
                        </a>
                      ) : (
                        <span className="opacity-50">no passage</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// Post-report discussion: free follow-up questions about a finished report.
// The books are closed — no ledger draw, no deposit. Each finished run gets
// a small free allowance (see POST /v1/runs/:id/discuss); the server returns
// the remaining count with every answer and the run's metadata carries the
// thread, so the allowance is shown before a single question is asked.
export function DiscussThread({ runId, initial }: { runId: string; initial?: any }) {
  const max = Number(initial?.max ?? 10);
  const [used, setUsed] = useState<number>(Number(initial?.used ?? 0));
  // The server stores { used, tokens, log } — remaining derives from the
  // allowance until the first answer returns the authoritative count.
  const [remaining, setRemaining] = useState<number>(Number(initial?.remaining ?? Math.max(0, max - (Number(initial?.used ?? 0)))));
  const [thread, setThread] = useState<{ q: string; a: string }[]>(
    Array.isArray(initial?.log) ? initial.log.map((t: any) => ({ q: String(t.q || ""), a: String(t.a || "") })) : []
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask() {
    const question = draft.trim();
    if (!question || busy || remaining <= 0) return;
    setBusy(true);
    setError("");
    try {
      const out: any = await drNibApi.discussReport(runId, question);
      setThread((h) => [...h, { q: question, a: String(out.answer || "") }]);
      setRemaining(Number(out.remaining ?? 0));
      setUsed(Number(out.used ?? used + 1));
      setDraft("");
    } catch (e: any) {
      setError(e?.message || "Could not answer that.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wider opacity-60">
        Discuss this report{max > 0 ? ` · ${remaining} of ${max} free follow-ups left` : ""}
      </p>
      {thread.length > 0 && (
        <ul className="mt-2 space-y-2">
          {thread.map((h, i) => (
            <li key={i} className="border-l-2 border-black/60 pl-2.5 text-[13px] leading-6">
              <p className="text-xs font-medium opacity-60">{h.q}</p>
              <p className="whitespace-pre-line">{h.a}</p>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 ? (
        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
            placeholder="Ask a follow-up about this report…"
            aria-label="Ask a follow-up about this report"
            disabled={busy}
            className="w-full border border-dark-gray/50 bg-white px-3 py-2 text-xs"
          />
          <button
            onClick={ask}
            disabled={busy || !draft.trim()}
            className="shrink-0 bg-black px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            {busy ? "…" : "Ask"}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs opacity-60">Free follow-ups used up ({used} of {max}) — reprompt the run for a deeper pass.</p>
      )}
      {error ? <p className="mt-1.5 text-xs text-red-700">{error}</p> : null}
      <p className="mt-1.5 text-[11px] opacity-50">Free — no budget drawn, no deposit needed. Answers come from this report and its sources only.</p>
    </div>
  );
}
// Ask-about-this-report, answered deterministically from the run's own
// verify pass — no model call, no budget, no reopened books. "Weakest
// claim?" is a min over scored support, not a judgement; "why trust X?" is
// the source's own trust row. Anything the tables cannot answer, the panel
// says so instead of guessing.
export function ReportQA({ claims, sources }: { claims?: any[]; sources?: { url?: string; title?: string; domain?: string; trust?: number; relevance?: number }[] }) {
  const list: any[] = Array.isArray(claims) ? claims : [];
  const srcs: any[] = Array.isArray(sources) ? sources : [];
  const [history, setHistory] = useState<{ q: string; a: string }[]>([]);
  const [picked, setPicked] = useState("");
  if (!list.length) return null;
  const withEv = list.filter((c) => Array.isArray(c.passages) && c.passages.length > 0);
  const scored = withEv
    .map((c) => ({ c, s: Number(c.passages[0]?.support ?? 0) }))
    .sort((a, b) => a.s - b.s);
  const unknown = list.filter((c) => c.status !== "supported");
  const byUrl = new Map<string, number>();
  for (const c of list) {
    for (const p of (Array.isArray(c.passages) ? c.passages : [])) {
      if (p?.url) byUrl.set(String(p.url), (byUrl.get(String(p.url)) || 0) + 1);
    }
  }
  const topEntry = [...byUrl.entries()].sort((a, b) => b[1] - a[1])[0];
  const topSrc = topEntry ? srcs.find((s) => s?.url === topEntry[0]) : null;
  const fmt = (c: any) => `“${String(c.text || "").slice(0, 140)}”`;
  const presets: { q: string; a: () => string }[] = [
    {
      q: "Weakest claim?",
      a: () => scored.length
        ? `${fmt(scored[0].c)} — support ${(scored[0].s * 100).toFixed(0)}%${scored[0].c.status !== "supported" ? " (marked unknown, not asserted)" : ""}.`
        : "No scored passages on this report — nothing to rank.",
    },
    {
      q: "Strongest support?",
      a: () => scored.length
        ? `${fmt(scored[scored.length - 1].c)} — support ${(scored[scored.length - 1].s * 100).toFixed(0)}%.`
        : "No scored passages on this report — nothing to rank.",
    },
    {
      q: "What's unsupported?",
      a: () => unknown.length === 0
        ? "Everything extracted held up — no unknown claims."
        : unknown.slice(0, 3).map((c) => `• ${fmt(c)}`).join("\n") + (unknown.length > 3 ? `\n…plus ${unknown.length - 3} more.` : ""),
    },
    {
      q: "Which source carried most?",
      a: () => {
        if (!topEntry) return "No claim passages recorded — nothing carried anything.";
        const t = topSrc;
        return `${t?.title || topEntry[0]} — ${topEntry[1]} claim${topEntry[1] === 1 ? "" : "s"}${typeof t?.trust === "number" ? `, trust ${(t.trust * 100).toFixed(0)}%` : ""}${typeof t?.relevance === "number" ? `, relevance ${(t.relevance * 100).toFixed(0)}%` : ""}${t?.domain ? ` (${t.domain})` : ""}.`;
      },
    },
  ];
  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wider opacity-60">Ask about this report</p>
      <select
        value={picked}
        onChange={(e) => {
          const q = e.target.value;
          if (!q) return;
          const preset = presets.find((p) => p.q === q);
          if (preset) setHistory((h) => [...h, { q, a: preset.a() }]);
          setPicked("");
        }}
        className="mt-2 w-full max-w-md border border-dark-gray/50 bg-white px-3 py-2 text-xs"
        aria-label="Ask about this report"
      >
        <option value="">Choose a question…</option>
        {presets.map((p) => (
          <option key={p.q} value={p.q}>
            {p.q}
          </option>
        ))}
      </select>
      {history.length > 0 && (
        <ul className="mt-2 space-y-2">
          {history.map((h, i) => (
            <li key={i} className="border-l-2 border-black/60 pl-2.5 text-[13px] leading-6">
              <p className="text-xs font-medium opacity-60">{h.q}</p>
              <p className="whitespace-pre-line">{h.a}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
