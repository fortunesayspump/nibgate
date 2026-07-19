import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)]">
      <p>Powered by <a href="https://nibgate.xyz" target="_blank" className="text-[var(--fg)] no-underline hover:text-[var(--accent)] transition-colors">Nibgate</a></p>
    </footer>
  );
}
