"use client";

import { useEffect, useState } from "react";

type Profile = {
  id: string;
  walletAddress: string;
  username: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  websiteUrl: string;
  twitterUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  creatorReputation?: number;
  verifiedSites?: number;
  trackedContent?: number;
  archivedContent?: number;
  createdAt: string;
};

const MAX_IMAGE_BYTES = {
  avatar: 2 * 1024 * 1024,
  cover: 5 * 1024 * 1024,
};

function shortWallet(address = "") {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function imageFileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [draftUsername, setDraftUsername] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [draftAvatarUrl, setDraftAvatarUrl] = useState("");
  const [draftCoverUrl, setDraftCoverUrl] = useState("");
  const [draftWebsiteUrl, setDraftWebsiteUrl] = useState("");
  const [draftTwitterUrl, setDraftTwitterUrl] = useState("");
  const [draftInstagramUrl, setDraftInstagramUrl] = useState("");
  const [draftTiktokUrl, setDraftTiktokUrl] = useState("");
  const [draftYoutubeUrl, setDraftYoutubeUrl] = useState("");
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState("");
  const [pendingCoverPreview, setPendingCoverPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/hub/dashboard/profile");
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Failed to load profile");
        const u = data.user || data.profile || {};
        const s = data.stats || {};
        const rep = data.reputation || {};
        setProfile((current) => ({
          ...(current || u), ...u,
          creatorReputation: typeof rep.reputationScore === 'number' ? rep.reputationScore : u.creatorReputation,
          verifiedSites: typeof s.sites === 'number' ? s.sites : u.verifiedSites,
          trackedContent: typeof s.contentCount === 'number' ? s.contentCount : u.trackedContent,
          archivedContent: typeof s.archivedContent === 'number' ? s.archivedContent : u.archivedContent,
        }));
        setUsername(u.username || "");
        setBio(u.bio || "");
        setAvatarUrl(u.avatarUrl || "");
        setCoverUrl(u.coverUrl || "");
        setWebsiteUrl(u.websiteUrl || "");
        setTwitterUrl(u.twitterUrl || "");
        setInstagramUrl(u.instagramUrl || "");
        setTiktokUrl(u.tiktokUrl || "");
        setYoutubeUrl(u.youtubeUrl || "");
        setDraftUsername(u.username || "");
        setDraftBio(u.bio || "");
        setDraftAvatarUrl(u.avatarUrl || "");
        setDraftCoverUrl(u.coverUrl || "");
        setDraftWebsiteUrl(u.websiteUrl || "");
        setDraftTwitterUrl(u.twitterUrl || "");
        setDraftInstagramUrl(u.instagramUrl || "");
        setDraftTiktokUrl(u.tiktokUrl || "");
        setDraftYoutubeUrl(u.youtubeUrl || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (pendingAvatarPreview) URL.revokeObjectURL(pendingAvatarPreview);
    };
  }, [pendingAvatarPreview]);

  useEffect(() => {
    return () => {
      if (pendingCoverPreview) URL.revokeObjectURL(pendingCoverPreview);
    };
  }, [pendingCoverPreview]);

  async function uploadImage(file: File, target: "avatar" | "cover") {
    const dataUrl = await imageFileToDataUrl(file);
    const res = await fetch("/uploads/profile-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, image: dataUrl }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Upload failed");
    return data.url as string;
  }

  async function saveProfile() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const nextAvatarUrl = pendingAvatarFile ? await uploadImage(pendingAvatarFile, "avatar") : draftAvatarUrl;
      const nextCoverUrl = pendingCoverFile ? await uploadImage(pendingCoverFile, "cover") : draftCoverUrl;

      const res = await fetch("/hub/dashboard/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: draftUsername,
          bio: draftBio,
          avatarUrl: nextAvatarUrl,
          coverUrl: nextCoverUrl,
          websiteUrl: draftWebsiteUrl,
          twitterUrl: draftTwitterUrl,
          instagramUrl: draftInstagramUrl,
          tiktokUrl: draftTiktokUrl,
          youtubeUrl: draftYoutubeUrl,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to save profile");
      const u = data.user || data.profile || {};
      setProfile((current) => ({ ...(current || u), ...u }));
      setUsername(u.username || "");
      setBio(u.bio || "");
      setAvatarUrl(u.avatarUrl || "");
      setCoverUrl(u.coverUrl || "");
      setWebsiteUrl(u.websiteUrl || "");
      setTwitterUrl(u.twitterUrl || "");
      setInstagramUrl(u.instagramUrl || "");
      setTiktokUrl(u.tiktokUrl || "");
      setYoutubeUrl(u.youtubeUrl || "");
      setDraftUsername(u.username || "");
      setDraftBio(u.bio || "");
      setDraftAvatarUrl(u.avatarUrl || "");
      setDraftCoverUrl(u.coverUrl || "");
      setDraftWebsiteUrl(u.websiteUrl || "");
      setDraftTwitterUrl(u.twitterUrl || "");
      setDraftInstagramUrl(u.instagramUrl || "");
      setDraftTiktokUrl(u.tiktokUrl || "");
      setDraftYoutubeUrl(u.youtubeUrl || "");
      setPendingAvatarFile(null);
      setPendingCoverFile(null);
      setPendingAvatarPreview("");
      setPendingCoverPreview("");
      setMessage("Profile saved.");
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  function beginEditing() {
    setDraftUsername(username);
    setDraftBio(bio);
    setDraftAvatarUrl(avatarUrl);
    setDraftCoverUrl(coverUrl);
    setDraftWebsiteUrl(websiteUrl);
    setDraftTwitterUrl(twitterUrl);
    setDraftInstagramUrl(instagramUrl);
    setDraftTiktokUrl(tiktokUrl);
    setDraftYoutubeUrl(youtubeUrl);
    setPendingAvatarFile(null);
    setPendingCoverFile(null);
    setPendingAvatarPreview("");
    setPendingCoverPreview("");
    setMessage("");
    setError("");
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraftUsername(username);
    setDraftBio(bio);
    setDraftAvatarUrl(avatarUrl);
    setDraftCoverUrl(coverUrl);
    setDraftWebsiteUrl(websiteUrl);
    setDraftTwitterUrl(twitterUrl);
    setDraftInstagramUrl(instagramUrl);
    setDraftTiktokUrl(tiktokUrl);
    setDraftYoutubeUrl(youtubeUrl);
    setPendingAvatarFile(null);
    setPendingCoverFile(null);
    setPendingAvatarPreview("");
    setPendingCoverPreview("");
    setMessage("");
    setError("");
    setIsEditing(false);
  }

  function stageDraftImage(file: File | undefined, target: "avatar" | "cover") {
    if (!file) return;
    setError("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
      if (file.size > MAX_IMAGE_BYTES[target]) throw new Error(`${target === "avatar" ? "Profile" : "Cover"} image is too large.`);

      const preview = URL.createObjectURL(file);
      if (target === "avatar") {
        setPendingAvatarFile(file);
        setPendingAvatarPreview(preview);
      }
      if (target === "cover") {
        setPendingCoverFile(file);
        setPendingCoverPreview(preview);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare image.");
    }
  }

  const previewName = isEditing ? draftUsername : username;
  const previewBio = isEditing ? draftBio : bio;
  const previewAvatar = isEditing ? (pendingAvatarPreview || draftAvatarUrl) : avatarUrl;
  const previewCover = isEditing ? (pendingCoverPreview || draftCoverUrl) : coverUrl;
  const socials = [
    { label: "Website", value: isEditing ? draftWebsiteUrl : websiteUrl },
    { label: "X", value: isEditing ? draftTwitterUrl : twitterUrl },
    { label: "Instagram", value: isEditing ? draftInstagramUrl : instagramUrl },
    { label: "TikTok", value: isEditing ? draftTiktokUrl : tiktokUrl },
    { label: "YouTube", value: isEditing ? draftYoutubeUrl : youtubeUrl },
  ].filter((item) => item.value);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] opacity-60">Dashboard</p>
          <h2 className="mt-2 text-4xl font-medium tracking-tight md:text-5xl">Creator Profile</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 opacity-70">
            This is the identity your connected sites, content events, analytics, and earnings roll up under.
          </p>
        </div>
        <div className="flex gap-3">
          {isEditing ? (
            <>
              <button
                onClick={cancelEditing}
                className="rounded-full border px-6 py-3 font-medium transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
                style={{ borderColor: "var(--nib-border-soft)" }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={saveProfile}
                className="rounded-full bg-black px-6 py-3 font-medium text-white transition hover:-translate-y-0.5 hover:bg-black/85 disabled:pointer-events-none disabled:opacity-50"
                disabled={loading || saving}
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </>
          ) : (
            <button
              onClick={beginEditing}
              className="rounded-full bg-black px-6 py-3 font-medium text-white transition hover:-translate-y-0.5 hover:bg-black/85 disabled:pointer-events-none disabled:opacity-50"
              disabled={loading}
            >
              Edit Profile
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border p-5 shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
          <div className="text-sm font-medium opacity-65">Creator reputation</div>
          <div className="mt-2 text-4xl font-medium">{profile?.creatorReputation || 1}<span className="text-lg opacity-50">/100</span></div>
        </div>
        <div className="rounded-2xl border p-5 shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
          <div className="text-sm font-medium opacity-65">Verified sites</div>
          <div className="mt-2 text-4xl font-medium">{profile?.verifiedSites || 0}</div>
        </div>
        <div className="rounded-2xl border p-5 shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
          <div className="text-sm font-medium opacity-65">Tracked content</div>
          <div className="mt-2 text-4xl font-medium">{profile?.trackedContent || 0}</div>
          {Boolean(profile?.archivedContent) && <div className="mt-1 text-sm opacity-60">{profile?.archivedContent} archived</div>}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="overflow-hidden rounded-[24px] border shadow-1" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
          <label
            className={`relative block h-44 bg-[linear-gradient(135deg,#A3C293,#C2B067_52%,#D39EAD)] ${isEditing ? "cursor-pointer" : ""}`}
            onDragOver={(event) => {
              if (!isEditing) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!isEditing) return;
              event.preventDefault();
              stageDraftImage(event.dataTransfer.files?.[0], "cover");
            }}
          >
            {previewCover ? <img src={previewCover} alt="" className="h-full w-full object-cover" /> : null}
            {isEditing ? (
              <span className="absolute inset-0 flex items-start justify-between bg-black/20 p-4 text-sm font-medium text-white">
                <span className="rounded-full bg-black/55 px-4 py-2 backdrop-blur">Drag image here</span>
                <span className="rounded-full bg-black/75 px-4 py-2 backdrop-blur">Change cover</span>
              </span>
            ) : null}
            {isEditing ? <input className="sr-only" type="file" accept="image/*" onChange={(event) => stageDraftImage(event.target.files?.[0], "cover")} /> : null}
          </label>
          <div className="-mt-8 space-y-5 p-5 pt-0 md:p-6 md:pt-0">
            <div className="flex flex-col gap-4 pt-0 sm:flex-row sm:items-start">
              <label
                className={`relative flex h-30 w-30 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 text-sm font-medium shadow-1 ${isEditing ? "cursor-pointer" : ""}`}
                style={{ background: "var(--nib-page-bg)", borderColor: "var(--nib-surface)" }}
                onDragOver={(event) => {
                  if (!isEditing) return;
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!isEditing) return;
                  event.preventDefault();
                  stageDraftImage(event.dataTransfer.files?.[0], "avatar");
                }}
              >
                {previewAvatar ? (
                  <img src={previewAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl">{(previewName || "N").slice(0, 1).toUpperCase()}</span>
                )}
                {isEditing ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 px-3 text-center text-xs font-medium leading-4 text-white opacity-0 transition hover:opacity-100">
                    Change<br />profile image
                  </span>
                ) : null}
                {isEditing ? <input className="sr-only" type="file" accept="image/*" onChange={(event) => stageDraftImage(event.target.files?.[0], "avatar")} /> : null}
              </label>
              <div className="min-w-0 flex-1 pt-10 sm:pt-12">
                {isEditing ? (
                  <input
                    value={draftUsername}
                    onChange={(event) => setDraftUsername(event.target.value)}
                    type="text"
                    placeholder="Unnamed creator"
                    className="w-full rounded-2xl border bg-transparent px-3 py-2 text-2xl font-medium outline-none transition focus:ring-2 focus:ring-black/20 md:text-3xl"
                    style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }}
                  />
                ) : (
                  <h3 className="text-2xl font-medium md:text-3xl">{previewName || "Unnamed creator"}</h3>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] opacity-65">
                  <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--nib-border-soft)" }}>
                    {shortWallet(profile?.walletAddress)}
                  </span>
                  {profile?.createdAt ? (
                    <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--nib-border-soft)" }}>
                      Since {new Date(profile.createdAt).toLocaleDateString()}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border p-5 text-sm" style={{ borderColor: "var(--nib-border-soft)" }}>
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] opacity-50">Creator bio</div>
              {isEditing ? (
                <div className="space-y-3">
                  <textarea
                    value={draftBio}
                    onChange={(event) => setDraftBio(event.target.value)}
                    placeholder="Tell people what you create, sell, or unlock with Nibgate."
                    className="min-h-36 w-full resize-none rounded-2xl border bg-transparent p-4 text-base leading-7 outline-none transition focus:ring-2 focus:ring-black/20"
                    style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }}
                  />
                  <p className="text-xs leading-5 opacity-55">This is the short intro people see before they unlock or follow your work.</p>
                </div>
              ) : (
                <p className="text-base leading-7 opacity-80">
                  {previewBio || "Tell people what you create, sell, or unlock with Nibgate."}
                </p>
              )}
            </div>

            <div className="rounded-3xl bg-black/[0.03] p-4 text-xs leading-6 opacity-70">
              Primary wallet <span className="break-all font-mono">{profile?.walletAddress || "Connect a wallet to create your profile"}</span>
            </div>
            {socials.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {socials.map((social) => (
                  <span key={social.label} className="rounded-full border px-3 py-1 text-sm font-medium" style={{ borderColor: "var(--nib-border-soft)" }}>
                    {social.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border p-5 shadow-1 md:p-6" style={{ background: "var(--nib-surface)", borderColor: "var(--nib-border-soft)" }}>
          {loading ? (
            <div className="space-y-4">
              <div className="h-5 w-40 rounded-full bg-black/10" />
              <div className="h-12 rounded-2xl bg-black/10" />
              <div className="h-12 rounded-2xl bg-black/10" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] opacity-60">Socials</p>
                <h3 className="mt-2 text-2xl font-medium">Connected presence</h3>
                <p className="mt-3 leading-7 opacity-70">These links travel with your creator identity and can show up on Explore later.</p>
              </div>

              {isEditing ? (
                <div className="grid gap-3">
                  <input value={draftWebsiteUrl} onChange={(event) => setDraftWebsiteUrl(event.target.value)} type="url" placeholder="Website / personal link" className="w-full rounded-2xl border bg-transparent p-3.5 outline-none transition focus:ring-2 focus:ring-black/20" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
                  <input value={draftTwitterUrl} onChange={(event) => setDraftTwitterUrl(event.target.value)} type="url" placeholder="X / Twitter URL" className="w-full rounded-2xl border bg-transparent p-3.5 outline-none transition focus:ring-2 focus:ring-black/20" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
                  <input value={draftInstagramUrl} onChange={(event) => setDraftInstagramUrl(event.target.value)} type="url" placeholder="Instagram URL" className="w-full rounded-2xl border bg-transparent p-3.5 outline-none transition focus:ring-2 focus:ring-black/20" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
                  <input value={draftTiktokUrl} onChange={(event) => setDraftTiktokUrl(event.target.value)} type="url" placeholder="TikTok URL" className="w-full rounded-2xl border bg-transparent p-3.5 outline-none transition focus:ring-2 focus:ring-black/20" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
                  <input value={draftYoutubeUrl} onChange={(event) => setDraftYoutubeUrl(event.target.value)} type="url" placeholder="YouTube URL" className="w-full rounded-2xl border bg-transparent p-3.5 outline-none transition focus:ring-2 focus:ring-black/20" style={{ borderColor: "var(--nib-border-soft)", color: "var(--nib-page-fg)" }} />
                </div>
              ) : (
                <div className="grid gap-3">
                  {socials.length > 0 ? socials.map((social) => (
                    <div key={social.label} className="rounded-2xl border p-3.5" style={{ borderColor: "var(--nib-border-soft)" }}>
                      <div className="text-sm font-medium opacity-60">{social.label}</div>
                      <div className="mt-1 break-all font-mono text-sm">{social.value}</div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border p-3.5 opacity-70" style={{ borderColor: "var(--nib-border-soft)" }}>
                      No social links added yet.
                    </div>
                  )}
                </div>
              )}

              {message && <p className="rounded-2xl bg-green-50 p-4 text-sm font-medium text-green-700">{message}</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
