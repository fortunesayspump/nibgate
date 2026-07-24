"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiAuthFetch } from "@/lib/api";
import MarkdownEditor from "@/components/MarkdownEditor";

type SiteSettings = {
  name: string;
  description: string;
  aboutMarkdown: string;
  recipientWallet: string;
  defaultPrice: string;
  defaultCurrency: string;
  paymentNetwork: string;
  siteId: string;
  subdomain: string;
  widgetScript: string;
  hubSiteId?: string;
  hubToken?: string;
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", aboutMarkdown: "", recipientWallet: "",
    defaultPrice: "0.01", defaultCurrency: "USDC", paymentNetwork: "eip155:5042002",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pwForm, setPwForm] = useState({ current: "", newPw: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState("");
  const [pwError, setPwError] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [hubError, setHubError] = useState("");
  const [hubSuccess, setHubSuccess] = useState("");
  const [hubStatus, setHubStatus] = useState<{ hubSiteId?: string }>({});
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/admin/login"); return; }
    apiAuthFetch<{ success: boolean; settings: SiteSettings }>("/settings")
      .then((data) => {
        setSettings(data.settings);
        setForm({
          name: data.settings.name,
          description: data.settings.description || "",
          aboutMarkdown: data.settings.aboutMarkdown || "",
          recipientWallet: data.settings.recipientWallet || "",
          defaultPrice: data.settings.defaultPrice || "0.01",
          defaultCurrency: data.settings.defaultCurrency || "USDC",
          paymentNetwork: data.settings.paymentNetwork || "eip155:5042002",
        });
        if (data.settings && (data.settings as any).hubSiteId) {
          setHubStatus({ hubSiteId: (data.settings as any).hubSiteId });
        }
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

  async function handleLinkHub() {
    setHubError("");
    setHubSuccess("");
    setLinking(true);
    try {
      const data = await apiAuthFetch<{ success: boolean; siteId: string }>("/settings/link-hub", {
        method: "POST", body: JSON.stringify({ linkToken: linkCode }),
      });
      setHubStatus({ hubSiteId: data.siteId });
      setHubSuccess("Blog linked to hub successfully.");
      setLinkCode("");
    } catch (err) {
      setHubError(err instanceof Error ? err.message : "Failed to link hub");
    } finally {
      setLinking(false);
    }
  }

  async function handleDisconnectHub() {
    setHubError("");
    setDisconnecting(true);
    try {
      await apiAuthFetch("/settings/link-hub/disconnect", { method: "POST" });
      setHubStatus({});
      setHubSuccess("Disconnected from hub.");
    } catch (err) {
      setHubError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;
  }

  return (
    <div className="min-h-screen px-5 py-10">
      <div className="mx-auto" style={{ maxWidth: "540px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "1rem" }}>
          <button onClick={() => router.push("/admin/posts")} className="btn-ghost inline-flex items-center gap-1">
            &larr; Posts
          </button>
          <span style={{ color: "var(--muted)", fontSize: "13px" }}>/</span>
          <button onClick={() => router.push("/admin/gateway")} className="btn-ghost inline-flex items-center gap-1">
            Gateway
          </button>
        </div>
        <h1 className="text-lg font-semibold mb-6">Settings</h1>

        {message && <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{message}</div>}
        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>}

        <div className="space-y-6">
          <div className="border rounded-lg p-4 space-y-1" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>Your site</span>
            {settings && <p className="text-sm font-medium">{settings.subdomain}.nibgate.xyz</p>}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 border-t pt-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-sm font-semibold">Site info</h2>
            <Field label="Site name">
              <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="input-field" />
            </Field>
            <Field label="Description">
              <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} className="input-field" />
            </Field>

            <div className="pt-4">
              <MarkdownEditor label="About page" value={form.aboutMarkdown} onChange={(v) => setForm((p) => ({ ...p, aboutMarkdown: v }))} />
            </div>

            <h2 className="text-sm font-semibold pt-4 border-t" style={{ borderColor: "var(--border)" }}>Payment settings</h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Used by the hosted unlock mode. Can be overridden per-post.</p>
            <Field label="Default wallet (recipient)">
              <input type="text" value={form.recipientWallet} onChange={(e) => setForm((p) => ({ ...p, recipientWallet: e.target.value }))} className="input-field font-mono" placeholder="0x..." />
            </Field>
            <Field label="Default price (USDC)">
              <input type="text" value={form.defaultPrice} onChange={(e) => setForm((p) => ({ ...p, defaultPrice: e.target.value }))} className="input-field" placeholder="0.01" />
            </Field>

            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Save settings"}
            </button>
          </form>

          <div className="space-y-4 border-t pt-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-sm font-semibold">Connect to Nibgate Hub</h2>
            {hubStatus.hubSiteId ? (
              <div className="border border-green-200 bg-green-50 rounded-md px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-xs text-green-700">✅ Connected to Nibgate Hub</span>
                <button onClick={handleDisconnectHub} disabled={disconnecting}
                  className="text-xs text-red-600 hover:text-red-700 underline whitespace-nowrap">
                  {disconnecting ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs leading-6" style={{ color: "var(--muted)" }}>
                  Connect this blog to your Nibgate Hub account so it appears in your dashboard alongside your other sites.
                  Analytics, earnings, and explore presence all flow through the hub.
                </p>
                <div className="rounded-md p-3 space-y-2" style={{ background: "var(--card-hover)" }}>
                  <p className="text-xs font-medium">How to connect:</p>
                  <ol className="text-xs space-y-1 list-decimal pl-4" style={{ color: "var(--muted)" }}>
                    <li>Sign in at <a href="https://nibgate.xyz" target="_blank" className="underline">nibgate.xyz</a> with your wallet</li>
                    <li>Go to <strong>Dashboard → Sites</strong></li>
                    <li>Click <strong>Link a blog</strong> → <strong>Generate linking code</strong></li>
                    <li>Copy the code and paste it below</li>
                  </ol>
                </div>
                <div className="flex gap-2">
                  <input type="text" value={linkCode} onChange={(e) => setLinkCode(e.target.value)}
                    className="input-field flex-1 font-mono text-xs"
                    placeholder="Paste your linking code..." />
                  <button onClick={handleLinkHub} disabled={linking || !linkCode}
                    className="btn-primary whitespace-nowrap">
                    {linking ? "Connecting..." : "Connect"}
                  </button>
                </div>
              </>
            )}
            {hubError && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{hubError}</div>}
            {hubSuccess && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{hubSuccess}</div>}
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4 border-t pt-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-sm font-semibold">Change password</h2>
            {pwMessage && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{pwMessage}</div>}
            {pwError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">{pwError}</div>}
            <Field label="Current password">
              <input type="password" value={pwForm.current} onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} className="input-field" />
            </Field>
            <Field label="New password">
              <input type="password" value={pwForm.newPw} onChange={(e) => setPwForm((p) => ({ ...p, newPw: e.target.value }))} className="input-field" />
            </Field>
            <button type="submit" disabled={pwSaving} className="btn-secondary">
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
      <label className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</label>
      {children}
    </div>
  );
}
