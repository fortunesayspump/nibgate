import Link from "next/link";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiUrl } from "@/lib/api";

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tag: string;
  tags: string[];
  coverUrl: string;
  publishedAt: string;
  author: {
    username: string;
    walletAddress: string;
  };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

async function getPosts() {
  try {
    const res = await fetch(apiUrl("/api/blog/posts"), { next: { revalidate: 60 } });
    if (!res.ok) return [] as BlogPost[];
    const data = await res.json();
    return (data.posts || []) as BlogPost[];
  } catch {
    return [] as BlogPost[];
  }
}

export default async function BlogPage() {
  const posts = await getPosts();
  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 px-6 py-16 md:px-10 lg:px-[4vw]">
        <section className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xl font-medium">Blog</p>
              <h1 className="nibgate-display-title mt-4 max-w-4xl text-5xl font-medium md:text-7xl">Blog updates</h1>
              <p className="mt-6 max-w-3xl text-xl leading-8 opacity-75">
                Product updates, creator guides, payment notes, discovery thinking, and the reputation layer behind Nibgate.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-12 max-w-7xl">
            {posts.length === 0 ? (
              <div className="border border-dark-gray/50 bg-white p-8 md:p-12">
                <p className="text-xl font-medium">No posts yet.</p>
                <p className="mt-4 max-w-2xl text-lg leading-8">
                  Product updates, creator notes, and discovery essays will show up here soon.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {featured && (
                  <Link href={`/blog/${featured.slug}`} className="group no-underline text-black border border-dark-gray/50 bg-white transition-colors hover:bg-gray lg:col-span-2">
                    <article className="grid min-h-[30rem] gap-8 p-6 md:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
                      <div className="flex h-full flex-col justify-between gap-12">
                        <div className="flex flex-wrap items-center gap-3 text-base">
                          <span>{featured.tag}</span>
                          <span className="opacity-45">/</span>
                          <span>{formatDate(featured.publishedAt)}</span>
                        </div>
                        <div>
                          <h2 className="text-5xl font-medium leading-none text-balance md:text-6xl lg:text-7xl">{featured.title}</h2>
                          <p className="mt-6 max-w-3xl text-xl leading-8">{featured.excerpt}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xl font-medium">
                          <span>Read post</span>
                          <span className="transition-transform group-hover:translate-x-1">-&gt;</span>
                        </div>
                      </div>
                      <div className="min-h-72 border border-dark-gray/50 bg-black p-6 text-white">
                        {featured.coverUrl ? (
                          <img src={featured.coverUrl} alt="" className="h-full min-h-72 w-full object-cover" />
                        ) : (
                          <div className="flex h-full min-h-72 flex-col justify-between">
                            <span className="text-lg">Nibgate</span>
                            <span className="text-6xl font-medium leading-none">{featured.tag}</span>
                          </div>
                        )}
                      </div>
                    </article>
                  </Link>
                )}

                {rest.map((post) => (
                  <Link key={post.id} href={`/blog/${post.slug}`} className="group no-underline text-black border border-dark-gray/50 bg-white transition-colors hover:bg-gray">
                    <article className="flex h-full min-h-80 flex-col justify-between gap-10 p-6 md:p-8">
                      <div className="flex flex-wrap items-center gap-3 text-base">
                        <span>{post.tag}</span>
                        <span className="opacity-45">/</span>
                        <span>{formatDate(post.publishedAt)}</span>
                      </div>
                      <div>
                        <h2 className="text-3xl font-medium leading-none text-balance md:text-4xl">{post.title}</h2>
                        <p className="mt-5 text-lg leading-8">{post.excerpt}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xl font-medium">
                        <span>Read post</span>
                        <span className="transition-transform group-hover:translate-x-1">-&gt;</span>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            )}
        </section>
      </main>
      <Footer showThemeToggle={true} />
    </div>
  );
}
