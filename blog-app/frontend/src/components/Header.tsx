import Link from "next/link";

export default function Header() {
  return (
    <nav className="flex items-center justify-between mb-12">
      <Link href="/" className="text-[var(--fg)] no-underline font-medium">
        Nibgate
      </Link>
      <div className="flex items-center gap-5">
        <Link href="/" className="text-[var(--muted)] no-underline text-sm hover:text-[var(--fg)] transition-colors">
          Posts
        </Link>
        <Link href="/about" className="text-[var(--muted)] no-underline text-sm hover:text-[var(--fg)] transition-colors">
          About
        </Link>
        <Link href="/admin/posts" className="text-[var(--muted)] no-underline text-sm hover:text-[var(--fg)] transition-colors">
          Admin
        </Link>
      </div>
    </nav>
  );
}
