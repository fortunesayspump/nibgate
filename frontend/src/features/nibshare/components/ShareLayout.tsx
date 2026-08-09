"use client";

import Link from "next/link";
import "@/styles/nibshare.css";
import Footer from "./Footer";

export function ShareLayout({ children, backHref = "/", backLabel = "Back to blog", right, tight = false }: {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  right?: React.ReactNode;
  tight?: boolean;
}) {
  return (
    <div className={`nibshare-root min-h-screen ${tight ? "px-4 py-8" : "px-5 py-10"}`}>
      <div className="mx-auto" style={{ maxWidth: "540px" }}>
        <div className="flex items-center justify-between">
          <Link href={backHref} className="btn-ghost no-underline inline-flex items-center gap-1 text-xs">
            &larr; {backLabel}
          </Link>
          {right}
        </div>
        {children}
      </div>
      <Footer />
    </div>
  );
}

export function ShareTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <h1 className="text-lg font-semibold mb-6" style={style}>{children}</h1>;
}

export function ShareIntro({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p className="text-xs mt-0.5" style={{ color: "var(--muted)", ...style }}>{children}</p>;
}

export function ShareError({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="nibshare-error-alert" style={style}>{children}</div>;
}

export function ShareBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="btn-primary" {...props}>{children}</button>;
}

export function ShareField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</label>
      {children}
    </div>
  );
}
