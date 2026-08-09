"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard, ExternalLink, Globe2, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { apiBaseUrl } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

type DashboardSite = {
  id: string;
  name: string;
  domain: string;
  description: string;
  isVerified: boolean;
  verificationStatus: string;
  lastVerifiedAt: string | null;
  lastVerificationCheckAt: string | null;
  verificationFailureReason: string;
  verifyToken: string;
  faviconUrl: string;
  ogImageUrl: string;
  trackingScript?: string;
  lastScanAt: string | null;
  lastScanStatus: string;
  lastScanError: string;
  lastSyncAt: string | null;
  createdAt: string;
  _count: {
    content: number;
    metrics: number;
  };
};

type DrawerTab = "setup" | "health" | "tracking" | "danger";

function statusCopy(site: DashboardSite) {
  if (site.verificationStatus === "missing_widget") return "Widget missing. Re-add the script to resume tracking.";
  if (site.verificationStatus === "failed") return "Verification check failed. Recheck when the site is reachable.";
  if (site.isVerified) return "Widget active. Events can stream from your site.";
  return "Waiting for the widget script on your homepage.";
}

function statusBadge(site: DashboardSite) {
  if (site.verificationStatus === "missing_widget") return { label: "Widget missing", className: "bg-red-100 text-red-800" };
  if (site.verificationStatus === "failed") return { label: "Check failed", className: "bg-red-100 text-red-800" };
  if (site.isVerified) return { label: "Verified", className: "bg-green-100 text-green-800" };
  return { label: "Pending", className: "bg-yellow-100 text-yellow-800" };
}

function cleanDomain(domain = "") {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function widgetScript(site: DashboardSite) {
  const hubOrigin = typeof window === "undefined" ? "https://www.nibgate.xyz" : window.location.origin;
  return `<script async src="${hubOrigin}/widget.js" data-nibgate-site="${site.id}" data-nibgate-token="${site.verifyToken}" data-nibgate-api="${apiBaseUrl()}"></script>`;
}

function contentMetaSnippet() {
  return `<article
  data-nibgate-resource
  data-nibgate-id="premium-guide"
  data-nibgate-title="Premium Guide"
  data-nibgate-type="article"
  data-nibgate-price="0.01"
>
  ...
</article>`;
}

function packageTrackSnippet() {
  return `import { createGate } from "@nibgate/sdk";

const premiumGuide = createGate({
  id: "premium-guide",
  title: "Premium Guide",
  type: "article",
  price: "0.01",
  path: "/premium-guide"
});

premiumGuide.content();

await premiumGuide.unlock(async () => {
  // Run your payment flow here.
  return {
    paymentId: "payment_123",
    paymentProvider: "arc-testnet",
    txHash: "0x...",
    chainExplorerUrl: "https://testnet.arcscan.app/tx/0x...",
    revenue: 0.01,
    currency: "USDC"
  };
});`;
}

async function copyText(value: string, onDone: (message: string) => void, label = "Copied") {
  const copied = await copyToClipboard(value);
  onDone(copied ? label : "Copy failed. Select the snippet and copy it manually.");
  return copied;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readApiJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  const text = await res.text();
  const shortText = text.replace(/\s+/g, " ").slice(0, 160);
  throw new Error(
    res.status === 404
      ? "Nibgate backend route is not live yet. The API returned a 404 HTML page instead of JSON."
      : `Nibgate backend returned ${res.status || "a non-JSON response"}: ${shortText}`
  );
}

export default function SitesPage() {
  const [sites, setSites] = useState<DashboardSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("setup");
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [successSiteId, setSuccessSiteId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState("");
  const [syncingId, setSyncingId] = useState("");
  const [removingId, setRemovingId] = useState("");
  const [removeSiteId, setRemoveSiteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkCodeDisplay, setLinkCodeDisplay] = useState("");
  const [linkError, setLinkError] = useState("");
  const [copied, setCopied] = useState(false);

  const visibleSites = sites;
  const selectedSite = visibleSites.find((site) => site.id === selectedSiteId) || null;
  const removeSite = visibleSites.find((site) => site.id === removeSiteId) || null;

  const openSiteDrawer = (site: DashboardSite, tab?: DrawerTab) => {
    setDrawerTab(tab || (site.isVerified ? "health" : "setup"));
    setSelectedSiteId(site.id);
  };

  const loadSites = async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/hub/sites");
      const data = await readApiJson(res);
      if (!data.success) throw new Error(data.error || "Failed to load sites");
      const nextSites = data.websites || [];
      setSites(nextSites);
      return nextSites as DashboardSite[];
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sites");
      return [] as DashboardSite[];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSites({ showLoading: false });
  }, []);

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setMessage("");
    setRegistering(true);
    setRegisterSuccess(false);
    setSuccessSiteId(null);

    const formData = new FormData(form);
    const domain = String(formData.get("domain") || "");
    const name = String(formData.get("name") || "");
    const description = String(formData.get("description") || "");

    try {
      const [res] = await Promise.all([
        fetch("/api/hub/sites/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, name, description }),
        }),
        wait(850),
      ]);
      const data = await readApiJson(res);
      if (!data.success) throw new Error(data.error || "Failed to register website");
      setMessage(data.restored || data.reclaimed ? "Site connected with a fresh verification token. Paste the new widget script to verify again." : data.alreadyExisted ? "That site is already connected. Opening setup instructions now." : "Site added as pending. Paste the widget script into your site, deploy, then verify ownership.");
      form.reset();
      const nextSites = await loadSites({ showLoading: false });
      const selected = data.website || nextSites.find((site) => cleanDomain(site.domain) === cleanDomain(domain));
      if (selected?.id) {
        setRegistering(false);
        setRegisterSuccess(true);
        await wait(650);
        setSuccessSiteId(selected.id);
        setRegisterSuccess(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to register website";
      if (message.includes("Domain is already registered")) {
        const nextSites = await loadSites({ showLoading: false });
        const existing = nextSites.find((site) => cleanDomain(site.domain) === cleanDomain(domain));
        if (existing) {
          setMessage("That site is already connected. Opening setup instructions now.");
          openSiteDrawer(existing, "setup");
        } else {
          setError("That domain is already registered under another account.");
        }
      } else {
        setError(message);
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleVerify = async (id: string) => {
    setError("");
    setMessage("");
    setVerifyingId(id);

    try {
      const res = await fetch(`/api/hub/sites/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await readApiJson(res);
      if (!data.success) throw new Error(data.error || "Verification failed");
      setMessage("Website verified. Nibgate can now receive page, content, and unlock events from your widget.");
      await loadSites({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifyingId("");
    }
  };

  const handleGenerateLinkCode = async () => {
    setGeneratingLink(true);
    setLinkError("");
    setLinkCodeDisplay("");
    try {
      const res = await fetch(`/api/hub/blog/link/generate`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to generate code");
      setLinkCodeDisplay(data.linkToken);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleRecheck = async (id: string) => {
    setError("");
    setMessage("");
    setVerifyingId(id);

    try {
      const res = await fetch(`/api/hub/sites/${id}/recheck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await readApiJson(res);
      if (!data.success) throw new Error(data.error || "Verification check failed");
      setMessage("Widget rechecked. Your site is verified.");
      await loadSites({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification check failed");
      await loadSites({ showLoading: false });
    } finally {
      setVerifyingId("");
    }
  };

  const handleSyncMetadata = async (id: string) => {
    setError("");
    setMessage("");
    setSyncingId(id);

    try {
      const res = await fetch(`/api/hub/sites/${id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await readApiJson(res);
      if (!data.success) throw new Error(data.error || "Metadata refresh failed");
      const count = typeof data.content === "number" ? data.content : 0;
      setMessage(count === 1 ? "Metadata refreshed. 1 content item was synced." : `Metadata refreshed. ${count} content items were synced.`);
      await loadSites({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Metadata refresh failed");
      await loadSites({ showLoading: false });
    } finally {
      setSyncingId("");
    }
  };

  const handleRemoveSite = async (id: string) => {
    setError("");
    setMessage("");
    setRemovingId(id);

    try {
      const res = await fetch(`/api/hub/sites/${id}`, {
        method: "DELETE",
      });
      const data = await readApiJson(res);
      if (!data.success) throw new Error(data.error || "Failed to remove site");
      setMessage("Site removed from your dashboard. Historical metrics are archived.");
      setRemoveSiteId(null);
      if (selectedSiteId === id) setSelectedSiteId(null);
      await loadSites({ showLoading: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove site");
    } finally {
      setRemovingId("");
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] opacity-60">Dashboard</p>
          <h2 className="mt-2 text-4xl font-medium tracking-tight md:text-5xl">Connected Sites</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 opacity-70">
            Register your domain, paste one widget script, then stream page, content, and unlock activity into Nibgate.
          </p>
        </div>
        <button onClick={() => loadSites()} className="inline-flex items-center gap-2 rounded-full border px-5 py-3 font-medium transition hover:-translate-y-0.5" style={{ borderColor: "var(--nib-border-soft)" }}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {(message || error) ? (
        <div className={`rounded-3xl border p-4 text-sm font-medium ${error ? "text-red-700" : "text-green-700"}`} style={{ background: error ? "#fff1f1" : "#eef8ef", borderColor: "var(--nib-border-soft)" }}>
          {error || message}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-[24px] border p-5 shadow-1 md:p-6" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white">
              <Globe2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-medium">Connect a site</h3>
              <p className="mt-2 text-sm leading-6 opacity-70">Add the origin where your protected content lives.</p>
            </div>
          </div>

          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <input name="name" type="text" placeholder="Site name, e.g. Creator Studio" required className="w-full rounded-2xl border bg-transparent p-4 outline-none transition focus:ring-2 focus:ring-black/20" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
            <input name="domain" type="text" placeholder="Domain, e.g. creator.example.com" required className="w-full rounded-2xl border bg-transparent p-4 outline-none transition focus:ring-2 focus:ring-black/20" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
            <textarea name="description" placeholder="Short description for discovery and metadata" className="min-h-28 w-full resize-none rounded-2xl border bg-transparent p-4 outline-none transition focus:ring-2 focus:ring-black/20" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
            <button type="submit" disabled={registering} className="w-full rounded-full bg-black px-6 py-3 font-medium text-white transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50">
              <span className="inline-flex items-center justify-center gap-2">
                {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : registerSuccess ? <Check className="h-4 w-4" /> : null}
                {registering ? "Adding site..." : registerSuccess ? "Site added" : "Add site"}
              </span>
            </button>
          </form>
        </div>

        <div className="rounded-[24px] border p-5 shadow-1 md:p-6" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
          <p className="text-sm font-medium uppercase tracking-[0.14em] opacity-60">How setup works</p>
          <div className="mt-5 grid gap-3">
            {[
              ["1", "Register the domain", "Nibgate creates a site id and verification token."],
              ["2", "Paste one script", "Add the widget to your site HTML so the hub can verify ownership."],
              ["3", "Stream activity", "The script records page views and the package can emit content/unlock events."],
            ].map(([step, title, copy]) => (
              <div key={step} className="flex gap-4 rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)" }}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-sm font-medium text-white">{step}</div>
                <div>
                  <div className="font-medium">{title}</div>
                  <p className="mt-1 text-sm leading-6 opacity-70">{copy}</p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowLinkPopup(true)} className="mt-4 w-full rounded-full border px-5 py-3 text-sm font-medium transition hover:-translate-y-0.5" style={{ borderColor: "var(--nib-border-soft)" }}>
            Link a blog
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-medium">Your origins</h3>
          <p className="text-sm opacity-60">{visibleSites.length} connected</p>
        </div>

        {loading ? (
          <div className="rounded-[24px] border p-8 text-center opacity-70" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>Loading your sites...</div>
        ) : visibleSites.length === 0 ? (
          <div className="rounded-[24px] border p-10 text-center shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white"><Globe2 /></div>
            <h3 className="mt-5 text-2xl font-medium">No sites connected yet</h3>
            <p className="mx-auto mt-2 max-w-lg leading-7 opacity-70">Add your first origin to start syncing protected content and earning from unlocks.</p>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {visibleSites.map((site) => (
              <article key={site.id} className="rounded-[24px] border p-5 shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black text-white">
                    {site.faviconUrl ? <img src={site.faviconUrl} alt="" className="h-full w-full object-cover" /> : <Globe2 className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-2xl font-medium">{site.name}</h4>
                        <a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
                          {site.domain} <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${statusBadge(site).className}`}>
                        {statusBadge(site).label}
                      </span>
                    </div>
                    {site.description ? <p className="mt-3 line-clamp-2 text-sm leading-6 opacity-70">{site.description}</p> : null}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)" }}>
                    <div className="text-sm font-medium opacity-60">Content</div>
                    <div className="mt-1 text-2xl font-medium">{site._count.content}</div>
                  </div>
                  <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)" }}>
                    <div className="text-sm font-medium opacity-60">Events</div>
                    <div className="mt-1 text-2xl font-medium">{site._count.metrics}</div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-sm opacity-60">{statusCopy(site)}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    {!site.isVerified ? (
                      <button onClick={() => setRemoveSiteId(site.id)} className="rounded-full border px-4 py-2 text-sm font-medium text-red-800 transition hover:-translate-y-0.5 hover:bg-red-50" style={{ borderColor: "rgba(185, 28, 28, 0.28)" }}>
                        Remove
                      </button>
                    ) : null}
                    {(site.isVerified || site.verificationStatus === "missing_widget" || site.verificationStatus === "failed") ? (
                      <button onClick={() => handleRecheck(site.id)} disabled={verifyingId === site.id} className="rounded-full border px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 disabled:opacity-60" style={{ borderColor: "var(--nib-border-soft)" }}>
                        {verifyingId === site.id ? "Checking..." : "Recheck"}
                      </button>
                    ) : null}
                    <button onClick={() => openSiteDrawer(site)} className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5">
                      {site.isVerified ? "Manage events" : "Complete setup"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── Blog linking popup ──────────────────────────────────────── */}
      {showLinkPopup && (
        <div className="dashboard-modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" onClick={() => setShowLinkPopup(false)}>
          <div className="dashboard-modal-card w-full max-w-md rounded-[28px] border p-6 shadow-2xl" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-2xl font-medium">Link a blog</h3>
            <p className="mt-2 text-sm leading-6 opacity-70">Link one of your Nibgate Blog sites to your hub dashboard. The blog appears here alongside your other sites.</p>
            {linkCodeDisplay ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm font-medium">Your linking code (expires in 15 min):</p>
                <pre className="overflow-auto rounded-2xl bg-black p-4 text-xs leading-5 text-white break-all select-all"><code>{linkCodeDisplay}</code></pre>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(linkCodeDisplay); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5">
                    {copied ? "Copied!" : "Copy code"}
                  </button>
                  <button onClick={() => { setShowLinkPopup(false); setLinkCodeDisplay(""); }} className="rounded-full border px-5 py-3 text-sm font-medium" style={{ borderColor: "var(--nib-border-soft)" }}>
                    Close
                  </button>
                </div>
                <div className="rounded-2xl border p-3 text-xs leading-6 opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>
                  <strong>Next step:</strong> Go to your blog admin → Settings → <strong>Connect to Nibgate Hub</strong> → paste this code → click Connect.
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <p className="text-sm leading-6 opacity-70">This generates a one-time code that you paste into your blog admin settings to link them together.</p>
                <button onClick={handleGenerateLinkCode} disabled={generatingLink} className="w-full rounded-full bg-black px-5 py-3 font-medium text-white transition hover:-translate-y-0.5 disabled:opacity-60">
                  {generatingLink ? "Generating..." : "Generate linking code"}
                </button>
                {linkError && <p className="mt-3 text-sm text-red-600">{linkError}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {successSiteId ? (
        <div className="dashboard-modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4" onClick={() => setSuccessSiteId(null)}>
          <div className="dashboard-modal-card w-full max-w-lg rounded-[28px] border p-6 shadow-2xl" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-800">
              <Check className="h-7 w-7" />
            </div>
            <h3 className="mt-5 text-3xl font-medium">Site connected</h3>
            <p className="mt-3 leading-7 opacity-70">
              Your site is saved as pending. Next, paste the Nibgate widget script into your website, deploy it, then come back here to verify ownership.
            </p>
            <div className="mt-5 grid gap-3 text-sm">
              {[
                "Copy the widget script from setup.",
                "Paste it into your site HTML.",
                "Deploy the site.",
                "Click Verify ownership in Nibgate.",
              ].map((step, index) => (
                <div key={step} className="flex gap-3 rounded-2xl border p-3" style={{ borderColor: "var(--nib-border-soft)" }}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-medium text-white">{index + 1}</span>
                  <span className="pt-1">{step}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => { setDrawerTab("setup"); setSelectedSiteId(successSiteId); setSuccessSiteId(null); }} className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5">
                Show setup instructions
              </button>
              <button onClick={() => setSuccessSiteId(null)} className="rounded-full border px-5 py-3 text-sm font-medium" style={{ borderColor: "var(--nib-border-soft)" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedSite ? (
        <div className="dashboard-drawer-backdrop fixed inset-0 z-[80] flex justify-end bg-black/35 p-0" onClick={() => setSelectedSiteId(null)}>
          <aside className="dashboard-drawer-panel h-full w-full overflow-y-auto border-l p-5 shadow-2xl md:max-w-2xl" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black text-white">
                  {selectedSite.faviconUrl ? <img src={selectedSite.faviconUrl} alt="" className="h-full w-full object-cover" /> : <Globe2 className="h-5 w-5" />}
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.14em] opacity-60">Site settings</p>
                  <h3 className="mt-1 text-3xl font-medium">{selectedSite.name}</h3>
                  <p className="mt-1 break-all font-mono text-sm opacity-60">{selectedSite.domain}</p>
                </div>
              </div>
              <button onClick={() => setSelectedSiteId(null)} className="rounded-full border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--nib-border-soft)" }}>Close</button>
            </div>

            <div className="mt-6 flex gap-2 overflow-x-auto border-b pb-3" style={{ borderColor: "var(--nib-border-soft)" }}>
              {(["setup", "health", "tracking", "danger"] as DrawerTab[]).map((tab) => (
                <button key={tab} onClick={() => setDrawerTab(tab)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium capitalize transition ${drawerTab === tab ? "bg-black text-white" : "border"}`} style={drawerTab === tab ? undefined : { borderColor: "var(--nib-border-soft)" }}>
                  {tab}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-5">
              {drawerTab === "setup" ? (
                <SetupSection site={selectedSite} verifyingId={verifyingId} onVerify={handleVerify} onCopy={setMessage} />
              ) : null}
              {drawerTab === "health" ? (
                <HealthSection site={selectedSite} verifyingId={verifyingId} syncingId={syncingId} onRecheck={handleRecheck} onSyncMetadata={handleSyncMetadata} />
              ) : null}
              {drawerTab === "tracking" ? (
                <TrackingSection />
              ) : null}
              {drawerTab === "danger" ? (
                <DangerRemoveSite site={selectedSite} onRemove={() => setRemoveSiteId(selectedSite.id)} />
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {removeSite ? (
        <div className="dashboard-modal-backdrop fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4" onClick={() => setRemoveSiteId(null)}>
          <div className="dashboard-modal-card w-full max-w-lg rounded-[28px] border p-6 shadow-2xl" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} onClick={(event) => event.stopPropagation()}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-800">
              <Trash2 className="h-7 w-7" />
            </div>
            <h3 className="mt-5 text-3xl font-medium">Remove this site?</h3>
            <p className="mt-3 leading-7 opacity-70">
              {removeSite.domain} will disappear from your dashboard and Explore, and its widget events will stop being accepted. Historical metrics stay archived.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => handleRemoveSite(removeSite.id)} disabled={removingId === removeSite.id} className="inline-flex items-center justify-center gap-2 rounded-full bg-red-700 px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60">
                {removingId === removeSite.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {removingId === removeSite.id ? "Removing..." : "Remove site"}
              </button>
              <button onClick={() => setRemoveSiteId(null)} className="rounded-full border px-5 py-3 text-sm font-medium" style={{ borderColor: "var(--nib-border-soft)" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DangerRemoveSite({ site, onRemove }: { site: DashboardSite; onRemove: () => void }) {
  return (
    <div className="rounded-3xl border p-5" style={{ borderColor: "rgba(185, 28, 28, 0.25)", background: "var(--nib-page-bg)" }}>
      <h4 className="flex items-center gap-2 text-xl font-medium text-red-800"><Trash2 className="h-5 w-5" /> Danger zone</h4>
      <p className="mt-2 text-sm leading-6 opacity-70">
        Remove {site.domain} from this profile. This hides the site and stops accepting widget events, but keeps historical metrics archived.
      </p>
      <button onClick={onRemove} className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-700 px-4 py-2 text-sm font-medium text-red-800 transition hover:-translate-y-0.5 hover:bg-red-50">
        <Trash2 className="h-4 w-4" /> Remove site
      </button>
    </div>
  );
}

function SetupSection({ site, verifyingId, onVerify, onCopy }: { site: DashboardSite; verifyingId: string; onVerify: (id: string) => void; onCopy: (message: string) => void }) {
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    setCopyStatus("");
  }, [site.id]);

  async function handleCopyScript() {
    const didCopy = await copyText(widgetScript(site), onCopy, "Widget script copied.");
    setCopyStatus(didCopy ? "Copied" : "Copy failed. Select the snippet and copy it manually.");
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  return (
    <>
      {(site.verificationStatus === "missing_widget" || site.verificationStatus === "failed") ? (
        <div className="rounded-3xl border p-5 text-sm leading-6 text-red-800" style={{ borderColor: "rgba(185, 28, 28, 0.25)", background: "#fff1f1" }}>
          <div className="text-lg font-medium">{statusBadge(site).label}</div>
          <p className="mt-2">{site.verificationFailureReason || "Nibgate could not confirm the widget on your homepage."}</p>
        </div>
      ) : null}
      <div className="rounded-3xl border p-5" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
        <h4 className="text-xl font-medium">1. Paste this script into your site</h4>
        <p className="mt-2 text-sm leading-6 opacity-70">
          Put it before the closing <span className="font-mono">&lt;/head&gt;</span> tag or anywhere in your page HTML. It works with Next.js, plain HTML, Webflow-style exports, custom backends, and most site engines.
        </p>
        <pre className="mt-4 overflow-auto rounded-2xl bg-black p-4 text-xs leading-5 text-white"><code>{widgetScript(site)}</code></pre>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleCopyScript} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--nib-border-soft)" }}>
            <Clipboard className="h-4 w-4" /> Copy script
          </button>
          {copyStatus ? <p className="text-sm font-medium opacity-70" role="alert">{copyStatus}</p> : null}
        </div>
      </div>
      <div className="rounded-3xl border p-5" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
        <h4 className="text-xl font-medium">2. Deploy and verify</h4>
        <p className="mt-2 text-sm leading-6 opacity-70">After deploy, Nibgate checks your homepage for the script and token. Once found, the site becomes verified and event streaming can begin.</p>
        <button type="button" onClick={() => onVerify(site.id)} disabled={verifyingId === site.id} className="mt-4 rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{verifyingId === site.id ? "Checking..." : "Verify ownership"}</button>
      </div>
    </>
  );
}

function HealthSection({
  site,
  verifyingId,
  syncingId,
  onRecheck,
  onSyncMetadata,
}: {
  site: DashboardSite;
  verifyingId: string;
  syncingId: string;
  onRecheck: (id: string) => void;
  onSyncMetadata: (id: string) => void;
}) {
  const syncStatus = site.lastScanStatus || (site.lastSyncAt ? "synced" : "Not synced yet");

  return (
    <>
      <div className="rounded-3xl border p-5" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xl font-medium">Verification health</h4>
            <p className="mt-2 text-sm leading-6 opacity-70">{statusCopy(site)}</p>
          </div>
          <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusBadge(site).className}`}>{statusBadge(site).label}</span>
        </div>
        <div className="mt-5 grid gap-3 text-sm">
          <HealthRow label="Last verified" value={site.lastVerifiedAt ? new Date(site.lastVerifiedAt).toLocaleString() : "Not verified yet"} />
          <HealthRow label="Last checked" value={site.lastVerificationCheckAt ? new Date(site.lastVerificationCheckAt).toLocaleString() : "Not checked yet"} />
          <HealthRow label="Failure reason" value={site.verificationFailureReason || "None"} />
        </div>
        <button type="button" onClick={() => onRecheck(site.id)} disabled={verifyingId === site.id} className="mt-5 rounded-full bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-60">{verifyingId === site.id ? "Checking..." : "Recheck widget"}</button>
      </div>
      <div className="rounded-3xl border p-5" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-xl font-medium">Content metadata</h4>
            <p className="mt-2 text-sm leading-6 opacity-70">
              Pull the latest manifest from this site after changing titles, descriptions, prices, images, tags, or routes.
            </p>
          </div>
          <button type="button" onClick={() => onSyncMetadata(site.id)} disabled={syncingId === site.id} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-medium transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60" style={{ borderColor: "var(--nib-border-soft)" }}>
            {syncingId === site.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncingId === site.id ? "Refreshing..." : "Refresh metadata"}
          </button>
        </div>
        <div className="mt-5 grid gap-3 text-sm">
          <HealthRow label="Last metadata refresh" value={site.lastScanAt ? new Date(site.lastScanAt).toLocaleString() : "Not refreshed yet"} />
          <HealthRow label="Sync status" value={syncStatus} />
          {site.lastScanError ? <HealthRow label="Last sync issue" value={site.lastScanError} /> : null}
        </div>
      </div>
      <div className="rounded-3xl border p-5" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
        <h4 className="text-xl font-medium">Widget snippet</h4>
        <p className="mt-2 text-sm leading-6 opacity-70">Keep this exact script on your site. If it is removed, the next check marks the site as missing the widget and pauses tracking.</p>
        <pre className="mt-4 overflow-auto rounded-2xl bg-black p-4 text-xs leading-5 text-white"><code>{widgetScript(site)}</code></pre>
      </div>
    </>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)" }}>
      <div className="font-medium opacity-60">{label}</div>
      <div className="mt-1 break-words">{value}</div>
    </div>
  );
}

function TrackingSection() {
  return (
    <>
      <div className="rounded-3xl border p-5" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
        <h4 className="text-xl font-medium">What gets tracked</h4>
        <div className="mt-4 grid gap-3 text-sm leading-6">
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)" }}>
            <div className="font-medium">Page activity</div>
            <p className="mt-1 opacity-70">Every loaded page can send a page view, time spent, scroll depth, visitor id, session id, and referrer.</p>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)" }}>
            <div className="font-medium">Individual content</div>
            <p className="mt-1 opacity-70">Music, video, article, and image resources can be tracked when the package registers content or your markup includes a data marker.</p>
          </div>
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--nib-border-soft)" }}>
            <div className="font-medium">Unlocks and revenue</div>
            <p className="mt-1 opacity-70">The package can call the widget bridge after successful unlocks so analytics and earnings stay tied to the right resource.</p>
          </div>
        </div>
      </div>
      <div className="rounded-3xl border p-5" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
        <h4 className="text-xl font-medium">Resource marker</h4>
        <pre className="mt-4 overflow-auto rounded-2xl bg-black p-4 text-xs leading-5 text-white"><code>{contentMetaSnippet()}</code></pre>
      </div>
      <div className="rounded-3xl border p-5" style={{ borderColor: "var(--nib-border-soft)", background: "var(--nib-page-bg)" }}>
        <h4 className="text-xl font-medium">Package event</h4>
        <pre className="mt-4 overflow-auto rounded-2xl bg-black p-4 text-xs leading-5 text-white"><code>{packageTrackSnippet()}</code></pre>
      </div>
    </>
  );
}
