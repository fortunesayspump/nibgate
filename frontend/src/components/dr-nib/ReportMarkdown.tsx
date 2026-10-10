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

/** [12] in text becomes a superscript citation chip. */
function remarkCitations() {
  return (tree: any) => {
    visit(tree, "text", (node: any, index: number | undefined, parent: any) => {
      if (!parent || typeof index !== "number") return;
      const parts = String(node.value ?? "").split(/\[(\d{1,3})\]/g);
      if (parts.length < 3) return;
      const nodes: any[] = [];
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          if (parts[i]) nodes.push({ type: "text", value: parts[i] });
        } else {
          nodes.push({
            type: "cite",
            data: { hName: "cite", hProperties: { "data-n": parts[i] } },
            children: [{ type: "text", value: parts[i] }],
          });
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
  // Citations jump to the sources list on the same page — every report view
  // carries a #drnib-sources anchor for this.
  cite: ({ children }: any) => (
    <a href="#drnib-sources" className="no-underline">
      <sup className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 font-mono text-[10px] font-medium not-italic text-white">
        {children}
      </sup>
    </a>
  ),
};

export function ReportArticle({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState(false);
  const normalized = useMemo(() => normalizeReportMd(markdown), [markdown]);
  return (
    <div>
      <article className="relative text-sm">
        <div className={open ? undefined : "max-h-[340px] overflow-hidden"}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkCitations]} components={mdComponents}>
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
