import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Model output is untrusted. An image URL, HTML resource, or clickable link
// could send private report text to an attacker-controlled host.
export function PrivateReport({ markdown }: { markdown: string }) {
  return <div className="prose prose-neutral mt-5 max-w-none break-words text-sm leading-7">
    <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{
      img: ({ alt }) => <span>[Image omitted{alt ? `: ${alt}` : ""}]</span>,
      a: ({ children }) => <span className="underline underline-offset-2">{children}</span>,
    }}>{markdown}</ReactMarkdown>
  </div>;
}
