"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Header() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <nav className="flex align-center font-ui">
      <span className="flex-grow">
        <Link href="/" className="plain" style={{ fontWeight: 500 }}>Nibgate</Link>
      </span>
      <span className="flex-shrink">
        <Link href="/" className="muted plain" style={{ marginRight: "1em" }}>Posts</Link>
        <Link href="/about" className="muted plain" style={{ marginRight: "1em" }}>About</Link>
        <Link href="/admin/posts" className="muted plain">Admin</Link>
      </span>
      <span
        id="theme-toggle"
        title="Toggle dark mode"
        aria-label="Toggle dark mode"
        role="switch"
        onClick={toggleTheme}
        style={{
          height: 20, width: 36, display: "block", position: "relative", border: "none",
          cursor: "pointer", marginLeft: "0.5em", background: "none", padding: 0
        }}
      >
        <div style={{ height: 20, border: "1px solid var(--border)", borderRadius: 24, width: "100%", position: "absolute" }} />
        <div style={{
          position: "absolute", zIndex: 9, top: 1, left: dark ? 16 : 1, width: 18, height: 18,
          transition: "left .1s linear", backgroundColor: "var(--muted)",
          borderRadius: "50%"
        }} />
      </span>
    </nav>
  );
}
