import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

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

function renderMarkdown(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const nodes = [] as ReactNode[];
  let listItems = [] as string[];

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`list-${nodes.length}`} className="my-6 list-disc space-y-2 pl-6 text-lg leading-8 md:text-xl md:leading-9">
          {listItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((line, index) => {
    const value = line.trim();
    if (!value) {
      flushList();
      return;
    }
    if (value.startsWith("### ")) {
      flushList();
      nodes.push(<h3 key={index} className="mt-10 text-3xl font-medium leading-none">{value.slice(4)}</h3>);
      return;
    }
    if (value.startsWith("## ")) {
      flushList();
      nodes.push(<h2 key={index} className="mt-12 text-4xl font-medium leading-none md:text-5xl">{value.slice(3)}</h2>);
      return;
    }
    if (value.startsWith("# ")) {
      flushList();
      nodes.push(<h2 key={index} className="mt-12 text-4xl font-medium leading-none md:text-5xl">{value.slice(2)}</h2>);
      return;
    }
    if (value.startsWith("- ")) {
      listItems.push(value.slice(2));
      return;
    }
    flushList();
    nodes.push(<p key={index} className="my-6 text-lg leading-8 md:text-xl md:leading-9">{value}</p>);
  });

  flushList();
  return nodes;
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
                <h1 className="nibgate-display-title text-5xl font-medium md:text-7xl lg:text-8xl">{post.title}</h1>
                <p className="max-w-3xl text-xl leading-8 md:text-2xl md:leading-9">{post.excerpt}</p>
              </div>
            </div>
          </section>

          {post.coverUrl && (
            <section className="bg-gray px-4 pb-12 md:px-8 lg:px-[4vw]">
              <div className="mx-auto max-w-5xl border border-dark-gray/50 bg-white p-3">
                <img src={post.coverUrl} alt="" className="max-h-[32rem] w-full object-cover" />
              </div>
            </section>
          )}

          <section className="bg-gray px-8 pb-24 lg:px-[4vw]">
            <div className="mx-auto max-w-3xl border border-dark-gray/50 bg-white p-6 md:p-10">
              {renderMarkdown(post.bodyMarkdown)}
            </div>
          </section>
        </article>
      </main>
      <Footer showThemeToggle={true} />
    </div>
  );
}
