import Link from "next/link";

export default function Footer() {
  return (
    <footer>
      <div className="bt" style={{ paddingTop: "1em" }}>
        <p className="small muted" style={{ color: "var(--muted)" }}>
          Powered by <a href="https://nibgate.xyz" target="_blank" className="hover:text-[var(--accent)]" style={{ color: "var(--fg)" }}>Nibgate</a>
        </p>
      </div>
    </footer>
  );
}
