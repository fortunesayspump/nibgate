import Header from "@/components/Header";
import { apiUrl } from "@/lib/api";
import ReactMarkdown from "react-markdown";

async function getSite() {
  try {
    const res = await fetch(apiUrl("/site"), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export default async function AboutPage() {
  const data = await getSite();
  const name = data?.site?.name || "Nibgate Blog";
  const aboutMarkdown = data?.aboutMarkdown || "";

  return (
    <>
      <Header />
      <main>
        <div className="wrap" style={{ marginBottom: "2rem" }}>
          <a href="/" className="btn-ghost no-underline inline-flex items-center gap-1">
            &larr; Back to posts
          </a>
          <section className="mt-6 mb-12">
            <h1 className="text-2xl font-semibold tracking-tight leading-tight">About {name}</h1>
          </section>
        </div>

        {aboutMarkdown ? (
          <article>
            <div className="prose prose-neutral dark:prose-invert" style={{ lineHeight: 1.6, color: "var(--fg)" }}>
              <ReactMarkdown>{aboutMarkdown}</ReactMarkdown>
            </div>
          </article>
        ) : (
          <div className="wrap">
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No about page written yet. Add one in{" "}
              <a href="/admin/settings" style={{ color: "var(--accent)" }}>settings</a>.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
