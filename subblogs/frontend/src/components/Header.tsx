"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function Header() {
  const [dark, setDark] = useState(false);
  const [siteName, setSiteName] = useState("Nibgate");
  const [routeLabel, setRouteLabel] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    apiFetch<{ site: { name: string } }>("/site").then(d => {
      if (d.site?.name) setSiteName(d.site.name);
    }).catch(() => {});
    const p = window.location.pathname;
    const seg = p.split("/")[1];
    const labels: Record<string, string> = { writing: "Writing", photos: "Photos", music: "Music", video: "Video" };
    if (seg && labels[seg]) setRouteLabel(labels[seg]);
    else if (p === "/") setRouteLabel("Blog");
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <>
      <nav className="flex align-center font-ui">
        <span className="flex-grow" style={{ display: "flex", alignItems: "baseline", gap: "0.3em" }}>
          <Link href="/" className="internal-link plain" style={{ fontSize: "1.15em", fontWeight: 500 }}>{siteName}</Link>
          {routeLabel && <span className="hide-mobile" style={{ color: "var(--accent)", fontSize: "1.15em", fontWeight: 500 }}> /{routeLabel}</span>}
        </span>
        <span className="desktop-nav flex-shrink ssr">
          <Link href="/about" className="muted plain">About</Link>
          <Link href="/admin/login" className="muted plain" style={{ marginLeft: "0.75em", display: "inline-flex", alignItems: "center" }} title="Admin">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" style={{ transform: "translateY(2px)" }}>
              <path d="M6 9V5a4 4 0 118 0v4h1a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2v-5a2 2 0 012-2h1zm6 0V5a2 2 0 10-4 0v4h4z"/>
            </svg>
          </Link>
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
        </span>
        <span className="mobile-hamburger">
          <button onClick={() => setMenuOpen(o => !o)} className="hamburger-btn" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              {menuOpen ? (
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
              ) : (
                <path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/>
              )}
            </svg>
          </button>
        </span>
      </nav>
      {menuOpen && (
        <div className="mobile-menu-overlay" onClick={closeMenu}>
          <div className="mobile-menu" onClick={e => e.stopPropagation()}>
            <Link href="/about" className="plain mobile-menu-item" onClick={closeMenu}>About</Link>
            <Link href="/admin/login" className="plain mobile-menu-item" onClick={closeMenu}>Admin</Link>
            <div className="mobile-menu-item" role="button" onClick={() => { toggleTheme(); closeMenu(); }} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') { toggleTheme(); closeMenu(); }}}>
              {dark ? "Light mode" : "Dark mode"}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
