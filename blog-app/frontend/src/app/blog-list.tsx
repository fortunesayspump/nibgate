"use client";

import { motion, type Variants } from "motion/react";
import Link from "next/link";
import type { BlogPost } from "@/lib/api";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function readTime(body: string): string {
  const words = body.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

export function BlogList({ posts }: { posts: BlogPost[] }) {
  return (
    <motion.div
      className="flex flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {posts.map((post) => (
        <motion.div key={post.id} variants={itemVariants}>
          <Link
            href={`/posts/${post.slug}`}
            className="group -mx-4 rounded-lg px-4 py-5 no-underline block transition-colors hover:bg-[var(--card-hover)]"
          >
            <article>
              <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-1.5">
                <span>{formatDate(post.publishedAt)}</span>
                <span className="opacity-30">&middot;</span>
                <span>{readTime(post.bodyMarkdown)}</span>
                <span className="opacity-30">&middot;</span>
                <span>{post.tag || "General"}</span>
              </div>
              <h2 className="text-base font-semibold leading-snug text-[var(--fg)]">
                {post.title}
              </h2>
              {post.excerpt && (
                <p className="mt-1.5 text-sm leading-6 text-[var(--muted)] line-clamp-2">
                  {post.excerpt}
                </p>
              )}
            </article>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
