"use client";

import { useEffect, useState } from "react";

export default function SitesPage() {
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSites = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/hub/sites');
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Failed to load');
      setSites(data.websites || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSites();
  }, []);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Site registration mocked in this preview.");
  };

  const handleVerify = (id: string) => {
    alert("Verification ping mocked for site " + id);
  };

  return (
    <div className="p-4 md:p-8 space-y-12">
      <section className="space-y-6">
        <h2 className="text-3xl font-medium">Register a New Website</h2>
        <div className="border p-8 rounded-2xl shadow-1" style={{ background: 'var(--nib-surface)', borderColor: 'var(--nib-border-soft)' }}>
          <form onSubmit={handleRegister} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium mb-1">Domain Name</label>
              <input type="text" placeholder="e.g., photos.clinton.com" required className="w-full p-3 border rounded bg-transparent" style={{ borderColor: 'var(--nib-border-soft)', color: 'var(--nib-page-fg)' }} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Display Name</label>
              <input type="text" placeholder="e.g., Clinton's Portfolio" required className="w-full p-3 border rounded bg-transparent" style={{ borderColor: 'var(--nib-border-soft)', color: 'var(--nib-page-fg)' }} />
            </div>
            <button type="submit" className="bg-black text-white px-6 py-3 font-medium cursor-pointer rounded">Register Website</button>
          </form>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-medium">Your Registered Sites</h2>
          <button onClick={loadSites} className="font-medium hover:underline cursor-pointer border-none bg-transparent" style={{ color: 'var(--nib-page-fg)' }}>Refresh</button>
        </div>
        
        {loading ? (
          <p style={{ color: 'var(--nib-page-muted)' }}>Loading your sites...</p>
        ) : error ? (
          <p className="text-red-500">Error: {error}</p>
        ) : sites.length === 0 ? (
          <p>You have not registered any websites yet.</p>
        ) : (
          <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-2">
            {sites.map(site => (
              <div key={site.id} className="border rounded-2xl shadow-1 overflow-hidden space-y-0" style={{ background: 'var(--nib-surface)', borderColor: 'var(--nib-border-soft)' }}>
                <div className="h-16 w-full bg-gray-100 border-b"></div>
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-2xl font-medium">{site.name}</h3>
                      <a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{site.domain}</a>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${site.isVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {site.isVerified ? 'Verified' : 'Pending'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t" style={{ borderColor: 'var(--nib-border-soft)' }}>
                    <div>
                      <div className="text-sm font-medium opacity-70">Indexed Items</div>
                      <div className="text-xl font-medium">{site._count.content || 0}</div>
                    </div>
                  </div>

                  {!site.isVerified ? (
                    <div className="bg-gray-100 p-4 rounded mt-4 space-y-3 dark:bg-gray-800 text-black dark:text-white">
                      <p className="text-sm font-medium">Action Required: Verify Domain</p>
                      <p className="text-sm opacity-80">1. Place the following text in a file on your server.</p>
                      <div className="bg-white dark:bg-black p-2 border rounded font-mono text-xs break-all">{site.verifyToken}</div>
                      <p className="text-sm opacity-80">2. Ensure it is accessible at:<br/><code>https://{site.domain}/.well-known/nibgate-verify.txt</code></p>
                      <button onClick={() => handleVerify(site.id)} className="mt-2 bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-sm rounded w-full cursor-pointer">Verify Now</button>
                    </div>
                  ) : (
                    <div className="bg-gray-100 p-4 rounded mt-4 space-y-2 dark:bg-gray-800 text-black dark:text-white">
                      <p className="text-sm font-medium">API Site Token</p>
                      <p className="text-sm opacity-80">Use this Bearer token to authenticate sync requests.</p>
                      <input type="password" value={site.siteToken} readOnly className="w-full bg-white dark:bg-black p-2 border rounded font-mono text-xs text-black dark:text-white" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
