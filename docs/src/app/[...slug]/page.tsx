import { notFound } from "next/navigation";
import DocsShell from "@/components/DocsShell";
import { docPages, getDocPage } from "@/lib/docs";

export function generateStaticParams() {
  return docPages.map((page) => ({ slug: [page.slug] }));
}

export default async function DocRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const page = getDocPage(slug.join("/"));
  if (!page) notFound();

  return (
    <DocsShell page={page}>
      <article className="docs-article">
        <p className="docs-eyebrow">{page.eyebrow}</p>
        <h1>{page.title}</h1>
        <p className="docs-description">{page.description}</p>
        <div className="docs-section-list">
          {page.sections.map((section) => (
            <section key={section.title} className="docs-section">
              <h2>{section.title}</h2>
              <p>{section.body}</p>
              {section.bullets && (
                <ul>
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              )}
              {section.code && <pre><code>{section.code}</code></pre>}
            </section>
          ))}
        </div>
      </article>
    </DocsShell>
  );
}
