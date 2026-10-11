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
  pre: ({ children }: any) => <pre className="mt-2.5 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-black/[0.04] p-3 font-mono text-[12px] leading-6">{children}</pre>,
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

function citeFor(sources: { url?: string }[]) {
  return ({ children, ...props }: any) => {
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
    () => ({ ...mdComponents, cite: citeFor(Array.isArray(sources) ? sources : []) }),
    [sources],
  );
  return (
    <div>
      <article className="relative text-sm">
        <div className={open ? undefined : "max-h-[340px] overflow-hidden"}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkCitations]} components={components}>
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
                return (
                  <tr key={i} className="border-t border-dark-gray/20 align-top">
                    <td className="px-3 py-1.5">{String(c.text || "").slice(0, 160)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className={c.status === "supported" ? "font-medium text-emerald-800" : "opacity-60"}>
                        {c.status === "supported" ? "✓ supported" : "? unknown"}
                      </span>
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

// Ask-about-this-report, answered deterministically from the run's own
// verify pass — no model call, no new balance, no reopened books. "Weakest
// claim?" is a min over scored support, not a judgement; "why trust X?" is
// the source's own trust row. Anything the tables cannot answer, the panel
// says so instead of guessing.
export function ReportQA({ claims, sources }: { claims?: any[]; sources?: { url?: string; title?: string; domain?: string; trust?: number; relevance?: number }[] }) {
  const list: any[] = Array.isArray(claims) ? claims : [];
  const srcs: any[] = Array.isArray(sources) ? sources : [];
  const [history, setHistory] = useState<{ q: string; a: string }[]>([]);
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
      <div className="mt-2 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.q}
            onClick={() => setHistory((h) => [...h, { q: p.q, a: p.a() }])}
            className="border border-dark-gray/50 bg-white px-3 py-1.5 text-xs hover:border-black"
          >
            {p.q}
          </button>
        ))}
      </div>
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
