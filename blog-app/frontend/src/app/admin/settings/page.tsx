"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiAuthFetch } from "@/lib/api";

type SiteSettings = {
  name: string;
  description: string;
  recipientWallet: string;
  defaultPrice: string;
  defaultCurrency: string;
  paymentNetwork: string;
  siteId: string;
  subdomain: string;
  widgetScript: string;
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", recipientWallet: "",
    defaultPrice: "0.01", defaultCurrency: "USDC", paymentNetwork: "eip155:5042002",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", newPw: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState("");
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/admin/login"); return; }
    apiAuthFetch<{ success: boolean; settings: SiteSettings }>("/settings")
      .then((data) => {
        setSettings(data.settings);
        setForm({
          name: data.settings.name,
          description: data.settings.description || "",
          recipientWallet: data.settings.recipientWallet || "",
          defaultPrice: data.settings.defaultPrice || "0.01",
          defaultCurrency: data.settings.defaultCurrency || "USDC",
          paymentNetwork: data.settings.paymentNetwork || "eip155:5042002",
        });
      })
      .catch(() => router.push("/admin/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    try {
      const data = await apiAuthFetch<{ success: boolean; settings: SiteSettings }>("/settings", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setSettings(data.settings);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPwMessage("");
    setPwError("");
    setPwSaving(true);
    try {
      await apiAuthFetch("/settings/password", { method: "PUT", body: JSON.stringify(pwForm) });
      setPwMessage("Password updated.");
      setPwForm({ current: "", newPw: "" });
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setPwSaving(false);
    }
  }

  function copyWidget() {
    if (settings?.widgetScript) {
      navigator.clipboard.writeText(settings.widgetScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">Loading...</div>;
  }

  return (
    <div className="min-h-screen px-5 py-10">
      <div className="mx-auto max-w-lg">
        <button onClick={() => router.push("/admin/posts")} className="mb-6 text-xs text-[var(--muted)] hover:text-[var(--fg)] transition-colors cursor-pointer font-medium">
          &larr; Back to posts
        </button>
        <h1 className="text-lg font-semibold mb-6">Settings</h1>

        {message && <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{message}</div>}
        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

        <div className="space-y-6">
          <div className="border border-[var(--border)] rounded-lg p-4 space-y-1">
            <span className="text-xs font-medium text-[var(--muted)]">Your site</span>
            {settings && <p className="text-sm font-medium">{settings.subdomain}.nibgate.xyz</p>}
          </div>

          <div className="border border-[var(--border)] rounded-lg p-4 space-y-2">
            <span className="text-xs font-medium text-[var(--muted)]">Widget script</span>
            <p className="text-xs text-[var(--muted)]">Add this to your site layout to enable analytics and payments.</p>
            <pre className="text-[11px] font-mono bg-[var(--card-hover)] p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">{settings?.widgetScript}</pre>
            <button onClick={copyWidget} className="text-xs text-[var(--accent)] font-medium hover:underline cursor-pointer">
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold">Site info</h2>
            <Field label="Site name">
              <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" />
            </Field>
            <Field label="Description">
              <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md resize-y" />
            </Field>

            <h2 className="text-sm font-semibold pt-4 border-t border-[var(--border)]">Payment settings</h2>
            <p className="text-xs text-[var(--muted)]">Used by the hosted unlock mode. Can be overridden per-post.</p>
            <Field label="Default wallet (recipient)">
              <input type="text" value={form.recipientWallet} onChange={(e) => setForm((p) => ({ ...p, recipientWallet: e.target.value }))} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md font-mono" placeholder="0x..." />
            </Field>
            <Field label="Default price (USDC)">
              <input type="text" value={form.defaultPrice} onChange={(e) => setForm((p) => ({ ...p, defaultPrice: e.target.value }))} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" placeholder="0.01" />
            </Field>
            <Field label="Payment network">
              <input type="text" value={form.paymentNetwork} onChange={(e) => setForm((p) => ({ ...p, paymentNetwork: e.target.value }))} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md font-mono text-xs" placeholder="eip155:5042002" />
            </Field>

            <button type="submit" disabled={saving} className="bg-[var(--accent-soft)] border border-[var(--accent)] text-sm font-semibold px-4 py-2.5 rounded-md hover:bg-[var(--accent)] hover:text-white transition-all disabled:opacity-40 cursor-pointer">
              {saving ? "Saving..." : "Save settings"}
            </button>
          </form>

          <form onSubmit={handlePasswordChange} className="space-y-4 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-semibold">Change password</h2>
            {pwMessage && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{pwMessage}</div>}
            {pwError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{pwError}</div>}
            <Field label="Current password">
              <input type="password" value={pwForm.current} onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" />
            </Field>
            <Field label="New password">
              <input type="password" value={pwForm.newPw} onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))} className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] transition-colors rounded-md" />
            </Field>
            <button type="submit" disabled={pwSaving} className="border border-[var(--border)] text-sm font-medium px-4 py-2.5 rounded-md hover:bg-[var(--surface)] transition-all disabled:opacity-40 cursor-pointer">
              {pwSaving ? "Updating..." : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-[var(--muted)]">{label}</label>
      {children}
    </div>
  );
}
