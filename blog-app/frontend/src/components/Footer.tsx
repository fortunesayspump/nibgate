export default function Footer() {
  return (
    <footer className="mt-20 pt-6 text-xs text-[var(--muted)]">
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-6">
        <span className="font-medium">Nibgate Blog</span>
        <a
          href="https://nibgate.xyz"
          target="_blank"
          className="hover:text-[var(--fg)] transition-colors"
        >
          nibgate.xyz
        </a>
      </div>
    </footer>
  );
}
