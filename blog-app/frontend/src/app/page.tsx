import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { apiUrl, type BlogPost } from "@/lib/api";
import { BlogList } from "./blog-list";

async function getPosts() {
  try {
    const res = await fetch(apiUrl("/blog/posts"), { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.posts || []) as BlogPost[];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const posts = await getPosts();

  return (
    <>
      <Header />
      <main>
        <section className="mb-12">
          <h1 className="text-2xl font-semibold tracking-tight leading-tight">Nibgate Blog</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Product updates, creator guides, and thinking behind the reputation layer.
          </p>
        </section>

        {posts.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-10">No posts yet. Check back soon.</p>
        ) : (
          <BlogList posts={posts} />
        )}
      </main>
      <Footer />
    </>
  );
}
