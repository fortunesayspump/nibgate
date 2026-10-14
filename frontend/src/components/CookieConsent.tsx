"use client";

// Cookie consent for the hub frontend. Best-practice shape, no dark patterns:
// bottom floating card (never blocks content), Accept and Essential-only at
// equal visual weight, plain-language purpose list, granular analytics toggle
// behind Customize, and a reversible choice (see CookieResetButton, mounted on
// /cookies). Essential cookies — SIWE session + nonce on sign-in, theme,
// wallet connection state — are strictly necessary and always on; the toggle
// only governs optional product analytics. Choice persists in localStorage
// and is broadcast as a `nibgate-consent` event so any analytics loader can
// listen for it.
import { useEffect, useState } from "react";

export const CONSENT_KEY = "nibgate-cookie-consent";
export const CONSENT_EVENT = "nibgate-consent";
export const RESET_EVENT = "nibgate-reset-consent";

export type Consent = { essential: true; analytics: boolean; at: string };

export function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (typeof c !== "object" || !c) return null;
    return { essential: true, analytics: c.analytics === true, at: String(c.at || "") };
  } catch {
    return null;
  }
}

export function saveConsent(analytics: boolean) {
  const c: Consent = { essential: true, analytics, at: new Date().toISOString() };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: c }));
  } catch {}
  return c;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(true);

  useEffect(() => {
    if (!readConsent()) setVisible(true);
    const onReset = () => {
      setCustomizing(false);
      setAnalytics(readConsent()?.analytics ?? true);
      setVisible(true);
    };
    window.addEventListener(RESET_EVENT, onReset);
    return () => window.removeEventListener(RESET_EVENT, onReset);
  }, []);

  if (!visible) return null;

  const choose = (v: boolean) => {
    saveConsent(v);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-4 left-4 right-4 z-[90] mx-auto max-w-md rounded-2xl border p-5 md:left-6 md:right-auto"
      style={{ background: "var(--nib-surface-raised)", color: "var(--nib-page-fg)", borderColor: "var(--nib-border-soft)", boxShadow: "var(--nib-shadow-3)" }}
    >
      <div className="flex items-center gap-3">
        <svg className="h-10 w-10 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <g fill="currentColor" stroke="none"><circle cx="8" cy="8" r="1.5" /><circle cx="15" cy="7" r="1" /><circle cx="12" cy="13" r="1.5" /><circle cx="7" cy="16" r="1" /><circle cx="17" cy="16" r="1.5" /></g>
        </svg>
        <p className="text-sm font-medium">Cookies, your call</p>
      </div>
      <p className="mt-1.5 text-[13px] leading-6 opacity-70">
        Essential cookies keep you signed in and remember theme and wallet state. Optional analytics help us
        understand whether setup, Explore, and dashboard flows work.{" "}
        <a href="/cookies" className="underline underline-offset-2">Cookie policy</a>
      </p>
      {customizing && (
        <div className="mt-3 space-y-2 rounded-xl p-3 text-[13px]" style={{ background: "var(--nib-surface-soft)", accentColor: "var(--nib-focus)" }}>
          <label className="flex items-center justify-between gap-3">
            <span>Essential — sign-in, theme, wallet <span className="opacity-60">(always on)</span></span>
            <input type="checkbox" checked disabled aria-label="Essential cookies, always on" />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>Analytics — product usage metrics</span>
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
              aria-label="Analytics cookies"
            />
          </label>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => choose(true)}
          className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-surface-soft)" }}
        >
          Accept all
        </button>
        <button
          onClick={() => choose(false)}
          className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-surface-soft)" }}
        >
          Essential only
        </button>
      </div>
      <div className="mt-2 text-center">
        {customizing ? (
          <button onClick={() => choose(analytics)} className="text-xs font-medium underline underline-offset-2 opacity-70 hover:opacity-100">
            Save my choice
          </button>
        ) : (
          <button onClick={() => setCustomizing(true)} className="text-xs font-medium underline underline-offset-2 opacity-70 hover:opacity-100">
            Customize
          </button>
        )}
      </div>
    </div>
  );
}

// Withdraw / revisit control, mounted on the /cookies page. Clears the stored
// choice and re-opens the banner — consent is reversible in one click.
export function CookieResetButton() {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => {
          try {
            localStorage.removeItem(CONSENT_KEY);
          } catch {}
          try {
            window.dispatchEvent(new Event(RESET_EVENT));
          } catch {}
          setDone(true);
          setTimeout(() => setDone(false), 2500);
        }}
        className="border border-dark-gray/60 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white"
      >
        Reset cookie choice
      </button>
      {done ? <p className="mt-1.5 text-xs opacity-60">Choice cleared — pick again in the banner.</p> : null}
    </div>
  );
}
