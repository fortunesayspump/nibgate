"use client";

import { motion, type Variants } from "motion/react";
import Link from "next/link";
import type { BlogPost } from "@/lib/api";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(3px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.25, ease: "easeOut" } },
};

function postHref(post: { type: string; slug: string }) {
  const m: Record<string, string> = { article: 'writing', photo: 'photos', music: 'music', video: 'video' };
  return `/${m[post.type] || 'posts'}/${post.slug}`;
}

function formatYear(value: string) {
  return new Date(value).getFullYear().toString();
}

function postNumber(value: string, index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function BlogList({ posts, featuredIndex }: { posts: BlogPost[]; featuredIndex?: number }) {
  const startNum = typeof featuredIndex === "number" ? featuredIndex + 1 : 1;

  return (
    <motion.ul className="list-none p-0 m-0" variants={containerVariants} initial="hidden" animate="visible">
      {posts.map((post, i) => (
        <motion.li key={post.id} variants={itemVariants} className="mb-3">
          <Link href={postHref(post)} className="group no-underline text-[var(--fg)] block py-1">
            <div className="flex items-baseline gap-3 text-sm">
              <span className="text-[var(--faint)] tabular-nums shrink-0 font-medium">
                {formatYear(post.publishedAt)} · {postNumber(post.publishedAt, i + startNum - 1)}
              </span>
              <span className="group-hover:text-[var(--accent)] transition-colors">
                {post.title}
              </span>
            </div>
          </Link>
        </motion.li>
      ))}
    </motion.ul>
  );
}
