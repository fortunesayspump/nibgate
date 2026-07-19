import Link from "next/link";

export default function Header() {
  return (
    <nav className="flex items-center justify-between" style={{ margin: "0 auto 3em", maxWidth: "666px" }}>
      <Link href="/" className="text-[var(--fg)] no-underline font-medium">
        Nibgate
      </Link>
      <div className="flex items-center gap-5">
        <Link href="/" className="text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors small">
          Posts
        </Link>
        <Link href="/about" className="text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors small">
          About
        </Link>
        <Link href="/admin/posts" className="text-[var(--muted)] no-underline hover:text-[var(--fg)] transition-colors small">
          Admin
        </Link>
      </div>
    </nav>
  );
}
