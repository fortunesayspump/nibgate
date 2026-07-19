import Link from "next/link";

export default function Footer() {
  return (
    <footer style={{ margin: "2em auto", paddingTop: "1em", maxWidth: "54em", width: "37em" }}>
      <div className="bt" style={{ borderTop: "1px solid var(--border)", paddingTop: "1em" }}>
        <p className="small" style={{ color: "var(--muted)" }}>
          Powered by <a href="https://nibgate.xyz" target="_blank" className="hover:text-[var(--accent)]" style={{ color: "var(--fg)" }}>Nibgate</a>
        </p>
      </div>
    </footer>
  );
}
