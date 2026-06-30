import Link from "next/link";
import { primaryDocs, type DocPage } from "@/lib/docs";

export default function DocsShell({ page, children }: { page: DocPage; children: React.ReactNode }) {
  return (
    <div className="docs-shell">
      <aside className="docs-sidebar">
        <Link className="docs-brand" href="/">
          <span className="docs-mark">N</span>
          <span>Nibgate Docs</span>
        </Link>
        <nav aria-label="Documentation">
          {primaryDocs.map((item) => (
            <Link key={item.slug} className={`docs-nav-link ${item.slug === page.slug ? "is-active" : ""}`} href={`/${item.slug}`}>
              {item.title}
            </Link>
          ))}
        </nav>
        <a className="docs-main-link" href="https://nibgate.xyz">Back to Nibgate</a>
      </aside>
      <main className="docs-main">{children}</main>
    </div>
  );
}
