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
        {posts.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-10">No posts yet.</p>
        ) : (
          <section>
            {posts[0] && (
              <div className="mb-10">
                <p className="text-xs text-[var(--muted)] font-medium mb-3">Latest</p>
                <a href={`/posts/${posts[0].slug}`} className="no-underline text-[var(--fg)] group">
                  <h2 className="text-xl font-medium leading-snug mb-2 group-hover:text-[var(--accent)] transition-colors">{posts[0].title}</h2>
                  <p className="text-sm text-[var(--muted)] leading-relaxed">{posts[0].excerpt}</p>
                  <p className="text-xs text-[var(--faint)] mt-2 font-ui">
                    {new Date(posts[0].publishedAt).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })} · read
                  </p>
                </a>
              </div>
            )}

            <hr className="border-0 h-px bg-[var(--border)] my-8" />

            <p className="text-xs text-[var(--muted)] font-medium mb-5">Writing</p>
            <BlogList posts={posts.slice(1)} featuredIndex={1} />
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
