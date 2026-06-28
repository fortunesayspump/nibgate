"use client";

import { useEffect, useState } from "react";

type Profile = {
  id: string;
  walletAddress: string;
  username: string;
  avatarUrl: string;
  createdAt: string;
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/hub/dashboard/profile");
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Failed to load profile");
        setProfile(data.profile);
        setUsername(data.profile.username || "");
        setAvatarUrl(data.profile.avatarUrl || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveProfile() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/hub/dashboard/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, avatarUrl }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to save profile");
      setProfile(data.profile);
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-medium">Creator Profile</h2>
        <button onClick={saveProfile} className="rounded bg-black px-6 py-2 font-medium text-white disabled:opacity-50" disabled={loading || saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="space-y-8 rounded-2xl border p-8 shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
        {loading ? (
          <p className="opacity-70">Loading profile...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : (
          <>
            <div className="flex items-center gap-6">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 text-sm opacity-80" style={{ borderColor: "var(--nib-border-soft)" }}>
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : "Avatar"}
              </div>
              <div className="text-sm opacity-70">
                Wallet<br />
                <span className="font-mono">{profile?.walletAddress}</span>
              </div>
            </div>
            <div className="max-w-xl space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Display Name</label>
                <input value={username} onChange={(event) => setUsername(event.target.value)} type="text" className="w-full rounded border bg-transparent p-3" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Avatar URL</label>
                <input value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} type="url" className="w-full rounded border bg-transparent p-3" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
              </div>
              {message && <p className="text-sm font-medium text-green-600">{message}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
