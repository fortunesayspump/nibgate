"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function Header() {
  const [dark, setDark] = useState(false);
  const [siteName, setSiteName] = useState("Nibgate");

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    apiFetch<{ site: { name: string } }>("/site").then(d => {
      if (d.site?.name) setSiteName(d.site.name);
    }).catch(() => {});
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
        <Link href="/" className="internal-link plain" style={{ fontSize: "1.15em", fontWeight: 500 }}>{siteName}</Link>
      </span>
      <span className="flex-shrink ssr">
        <Link href="/about" className="muted plain">About</Link>
        <Link href="/admin/login" className="muted plain" style={{ marginLeft: "0.75em", display: "inline-flex", alignItems: "center" }} title="Admin">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ transform: "translateY(2px)" }}>
            <path d="M6 9V5a4 4 0 118 0v4h1a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2v-5a2 2 0 012-2h1zm6 0V5a2 2 0 10-4 0v4h4z"/>
          </svg>
        </Link>
      </span>
      <span
        id="theme-toggle"
        title="Toggle dark mode"
        aria-label="Toggle dark mode"
        role="switch"
        aria-checked={dark ? "true" : "false"}
        onClick={toggleTheme}
        {...{ type: "button" } as any}
      >
        <span className="theme-toggle-slide" />
        <span className="theme-toggle-switch" style={{ left: dark ? 17 : 1 }}>
          {dark ? (
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707z"/>
            </svg>
          )}
        </span>
      </span>
    </nav>
  );
}
