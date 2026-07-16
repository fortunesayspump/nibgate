import Link from "next/link";

export default function Header() {
  return (
    <header className="mb-14 flex items-center justify-between">
      <Link href="/" className="text-sm font-semibold text-[var(--fg)] no-underline tracking-tight">
        Nibgate Blog
      </Link>
      <nav className="flex items-center gap-6">
        <Link href="/" className="text-sm text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors">
          Posts
        </Link>
        <Link href="/about" className="text-sm text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors">
          About
        </Link>
        <Link href="/admin/posts" className="text-sm text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors">
          Admin
        </Link>
      </nav>
    </header>
  );
}
