import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function AboutPage() {
  return (
    <>
      <Header />
      <main>
        <Link href="/" className="text-xs text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors">
          &larr; Back to posts
        </Link>
        <section className="mt-6 mb-12">
          <h1 className="text-2xl font-semibold tracking-tight leading-tight">About</h1>
        </section>

        <div className="space-y-5 text-[15px] leading-7 text-[var(--muted)]">
          <p>
            This blog is powered by <strong className="text-[var(--fg)] font-semibold">Nibgate</strong> — a verified content
            discovery, unlock, and reputation layer for creator-owned work.
          </p>

          <p>
            Nibgate enables creators to keep content on their own domains while verifying the source, indexing
            structured public metadata, recording unlock and payment signals, and helping humans and AI agents
            discover quality content — without moving it into a closed marketplace.
          </p>

          <p>
            This blog demonstrates what a Nibgate-powered publication looks like. Posts are stored in a
            PostgreSQL database, served through a clean reading experience, and can optionally be gated behind
            premium content unlocks using the Nibgate SDK.
          </p>

          <h2 className="text-[var(--fg)] font-semibold text-base pt-6">The Stack</h2>

          <ul className="space-y-1.5 list-disc pl-5 text-[15px]">
            <li><strong className="text-[var(--fg)] font-semibold">Frontend</strong> — Next.js 15, React 19, Tailwind CSS 4</li>
            <li><strong className="text-[var(--fg)] font-semibold">Backend</strong> — Express.js, Prisma ORM, PostgreSQL</li>
            <li><strong className="text-[var(--fg)] font-semibold">Auth</strong> — JWT (email and password)</li>
            <li><strong className="text-[var(--fg)] font-semibold">Content</strong> — Markdown with react-markdown</li>
            <li><strong className="text-[var(--fg)] font-semibold">Monetization</strong> — Optional Nibgate SDK for premium content gating</li>
          </ul>

          <h2 className="text-[var(--fg)] font-semibold text-base pt-6">Get Started</h2>

          <p>
            Want to build your own blog? Deploy this template and start writing. Set up the Nibgate SDK
            to gate premium content and earn payments directly from your readers.
          </p>
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--border)]">
          <h3 className="text-sm font-semibold text-[var(--fg)] mb-3">Connect</h3>
          <div className="flex items-center gap-4">
            <a href="https://nibgate.xyz" target="_blank" className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
              Website
            </a>
            <span className="text-[var(--border)]">/</span>
            <a href="https://github.com/anomalyco/nibgate" target="_blank" className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
              GitHub
            </a>
            <span className="text-[var(--border)]">/</span>
            <a href="/api/feed" className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
              RSS
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
