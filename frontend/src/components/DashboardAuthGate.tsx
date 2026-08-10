"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type GateState = "checking" | "allowed" | "blocked";

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export default function DashboardAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const res = await fetch("/auth/me", { credentials: "include" });
        const data = await safeJson(res);
        if (!cancelled && res.ok && data.authenticated) {
          setState("allowed");
          return;
        }
      } catch {
        // Fall through to sign-in redirect.
      }

      if (!cancelled) {
        setState("blocked");
        router.replace(`/signin?next=${encodeURIComponent(pathname)}`);
      }
    }

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (state !== "allowed") {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center p-8" style={{ background: "var(--nib-page-bg)", color: "var(--nib-page-fg)" }}>
        <div className="rounded-2xl border p-8 text-center shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
          <p className="text-sm font-medium uppercase tracking-[0.12em] opacity-60">{state === "blocked" ? "Redirecting" : "Checking session"}</p>
          <p className="mt-3 text-2xl font-medium">Preparing your creator dashboard</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
