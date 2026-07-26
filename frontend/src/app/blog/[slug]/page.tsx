import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiUrl } from "@/lib/api";

type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  tag: string;
  tags: string[];
  coverUrl: string;
  publishedAt: string;
  bodyMarkdown: string;
  author: {
    username: string;
    walletAddress: string;
  };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

async function getPost(slug: string) {
  try {
    const res = await fetch(apiUrl(`/api/blog/posts/${slug}`), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.post as BlogPost;
  } catch {
    return null;
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <article>
          <section className="bg-gray px-8 py-16 md:py-24 lg:px-[4vw]">
            <div className="mx-auto max-w-5xl">
              <Link href="/blog" className="mb-10 inline-flex text-lg no-underline text-black">&lt;- Back to blog</Link>
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3 text-lg">
                  <span>{post.tag}</span>
                  <span className="opacity-45">/</span>
                  <span>{formatDate(post.publishedAt)}</span>
                </div>
                <h1 className="nibgate-display-title text-3xl font-medium md:text-4xl lg:text-5xl">{post.title}</h1>
                <p className="max-w-3xl text-xl leading-8 md:text-2xl md:leading-9">{post.excerpt}</p>
              </div>
            </div>
          </section>

          {post.coverUrl && (
            <section className="bg-gray px-4 pb-12 md:px-8 lg:px-[4vw]">
              <div className="mx-auto max-w-5xl border border-dark-gray/50 bg-white p-3">
                <img src={post.coverUrl} alt="" className="max-h-[32rem] w-full object-cover" loading="eager" fetchpriority="high" />
              </div>
            </section>
          )}

          <section className="bg-gray px-8 pb-24 lg:px-[4vw]">
            <div className="mx-auto max-w-3xl border border-dark-gray/50 bg-white p-6 md:p-10">
            <div className="max-w-none text-lg leading-8 md:text-xl md:leading-9">
                <ReactMarkdown components={{
                  h2: ({ children }) => <h2 className="mt-12 mb-4 text-4xl font-medium leading-none md:text-5xl">{children}</h2>,
                  h3: ({ children }) => <h3 className="mt-10 mb-3 text-3xl font-medium leading-none">{children}</h3>,
                  p: ({ children }) => <p className="my-6">{children}</p>,
                  ul: ({ children }) => <ul className="my-6 list-disc space-y-2 pl-6">{children}</ul>,
                  ol: ({ children }) => <ol className="my-6 list-decimal space-y-2 pl-6">{children}</ol>,
                  img: ({ src, alt }) => <img src={src} alt={alt} className="my-8 w-full rounded-lg" />,
                  a: ({ href, children }) => <a href={href} className="underline" style={{ color: "var(--nib-teal)" }} target="_blank" rel="noopener noreferrer">{children}</a>,
                  code: ({ children }) => <code className="rounded bg-black/5 px-1.5 py-0.5 text-sm font-mono">{children}</code>,
                  pre: ({ children }) => <pre className="my-6 overflow-x-auto rounded-lg bg-black/5 p-4 text-sm">{children}</pre>,
                  blockquote: ({ children }) => <blockquote className="my-6 border-l-4 pl-4 opacity-75" style={{ borderColor: "var(--nib-teal)" }}>{children}</blockquote>,
                  hr: () => <hr className="my-12 opacity-25" />,
                }}>{post.bodyMarkdown}</ReactMarkdown>
              </div>
            </div>
          </section>
        </article>
      </main>
      <Footer showThemeToggle={true} />
    </div>
  );
}
