"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Library, ListChecks, Menu, Microscope, Settings, X } from "lucide-react";

const ITEMS = [
  { href: "/dr-nib/research", label: "Research", desc: "Start something new", icon: Microscope, match: (p: string) => p === "/dr-nib/research" || p.startsWith("/dr-nib/research/") },
  { href: "/dr-nib/projects", label: "Projects", desc: "Active + ended", icon: ListChecks, match: (p: string) => p.startsWith("/dr-nib/projects") },
  { href: "/dr-nib/sources", label: "Sources", desc: "Library", icon: Library, match: (p: string) => p.startsWith("/dr-nib/sources") },
  { href: "/dr-nib/settings", label: "Settings", desc: "Budget + provider", icon: Settings, match: (p: string) => p.startsWith("/dr-nib/settings") || p.startsWith("/dr-nib/budget") },
];

function Boxes({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {ITEMS.map((item, index) => {
        const Icon = item.icon;
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`dashboard-box box-${index} flex-1 w-full ${active ? "active" : ""}`}
            data-tab={item.label.toLowerCase()}
            aria-current={active ? "page" : undefined}
          >
            <span className="dashboard-box-slot">
              <Icon className="dashboard-box-icon" aria-hidden="true" strokeWidth={1.8} />
            </span>
            <span className="dashboard-box-text">
              <span className="dashboard-box-label">{item.label}</span>
              <span className="dashboard-box-description">{item.desc}</span>
            </span>
          </Link>
        );
      })}
    </>
  );
}

export default function DrNibShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const mainRef = useRef<HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDetail = /^\/dr-nib\/research\/.+/.test(pathname);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    setMobileOpen(false);
  }, [pathname]);

  const shellStyle = { background: 'var(--nib-page-bg)', color: 'var(--nib-page-fg)', borderColor: 'var(--nib-border-soft)' } as const;
  const railStyle = { background: 'var(--nib-page-bg)', borderColor: 'var(--nib-border-soft)' } as const;

  return (
    <div className="flex flex-1 flex-col lg:flex-row h-[calc(100vh-80px-var(--testnet-banner-h,0px))] border-t" style={shellStyle}>
      <button className="dashboard-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open sidebar">
        <Menu size={20} />
      </button>
      {mobileOpen && <div className="dashboard-mobile-overlay" onClick={() => setMobileOpen(false)} />}
      {isDetail ? (
        <>
          <nav aria-label="Dr. Nib" className="flex w-full shrink-0 flex-col border-b lg:hidden" style={railStyle}>
            <Boxes pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </nav>
          <div className="drnib-rail">
            <div className="drnib-rail-mini">
              {ITEMS.map((item, index) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link key={item.href} href={item.href} title={item.label} aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    className={`dashboard-box box-${index} flex-1 w-full ${active ? "active" : ""}`}>
                    <span className="dashboard-box-slot">
                      <Icon className="dashboard-box-icon" aria-hidden="true" strokeWidth={1.8} />
                    </span>
                    <span className="dashboard-box-text">
                      <span className="dashboard-box-label">{item.label}</span>
                      <span className="dashboard-box-description">{item.desc}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <nav aria-label="Dr. Nib" className="drnib-rail-panel" style={railStyle}>
              <Boxes pathname={pathname} />
            </nav>
          </div>
        </>
      ) : (
        <nav aria-label="Dr. Nib" className={`flex flex-col dashboard-sidebar ${mobileOpen ? "mobile-open" : ""}`} style={{ background: 'var(--nib-page-bg)' }}>
          <button className="dashboard-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close sidebar">
            <X size={20} />
          </button>
          <Boxes pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </nav>
      )}
      <main ref={mainRef} className="flex flex-col overflow-y-auto dashboard-main-content" style={{ background: 'var(--nib-page-bg)' }}>
        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
