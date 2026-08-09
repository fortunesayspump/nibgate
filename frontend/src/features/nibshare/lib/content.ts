export type MediaItem = {
  url?: string;
  previewUrl?: string;
  storageRef?: string | null;
  encryptedKey?: string | null;
  contentType?: string;
  caption?: string;
};

export type ContentFile = {
  url?: string;
  storageRef?: string | null;
  encryptedKey?: string | null;
  contentType?: string;
  name?: string | null;
  size?: number | null;
};

export type ContentView =
  | { kind: "markdown"; markdown: string; media: MediaItem[] }
  | { kind: "photo"; coverUrl: string | null; media: MediaItem[]; caption: string | null }
  | { kind: "music"; coverUrl: string | null; audio: ContentFile | null; caption: string | null }
  | { kind: "video"; videoUrl: string | null; file: ContentFile | null; caption: string | null }
  | { kind: "document"; coverUrl: string | null; doc: ContentFile | null; caption: string | null };

export function detectEmbed(url: string): { type: "youtube" | "unknown"; embedUrl: string | null } {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (yt) return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${yt[1]}` };
  return { type: "unknown", embedUrl: null };
}

function fileFrom(raw: unknown): ContentFile | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, any>;
  return {
    url: f.url || null,
    storageRef: f.storageRef || null,
    encryptedKey: f.encryptedKey || null,
    contentType: f.contentType || null,
    name: f.name || null,
    size: f.size ?? null,
  };
}

function mediaListFrom(raw: unknown): MediaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m: any) => m && (m.url || m.storageRef))
    .map((m: any) => ({
      url: m.url || undefined,
      previewUrl: m.previewUrl || undefined,
      storageRef: m.storageRef || null,
      encryptedKey: m.encryptedKey || null,
      contentType: m.contentType || null,
      caption: m.caption || "",
    }));
}

export function parseContent(body: unknown): ContentView | null {
  if (body === null || body === undefined) return null;
  if (typeof body === "string") return { kind: "markdown", markdown: body, media: [] };
  if (typeof body !== "object") return { kind: "markdown", markdown: String(body), media: [] };

  const raw = body as Record<string, any>;
  const type = raw.type || "";

  if (type === "photo") {
    return { kind: "photo", coverUrl: raw.coverUrl || null, media: mediaListFrom(raw.media), caption: raw.caption || null };
  }
  if (type === "article" || type === "text") {
    const markdown = typeof raw.markdown === "string" ? raw.markdown : JSON.stringify(raw);
    return { kind: "markdown", markdown, media: mediaListFrom(raw.media) };
  }
  if (type === "music") {
    return { kind: "music", coverUrl: raw.coverUrl || null, audio: fileFrom(raw.audio), caption: raw.caption || null };
  }
  if (type === "video") {
    return { kind: "video", videoUrl: raw.url || null, file: fileFrom(raw.file), caption: raw.caption || null };
  }
  if (type === "document") {
    return { kind: "document", coverUrl: raw.coverUrl || null, doc: fileFrom(raw.document), caption: raw.caption || null };
  }
  return { kind: "markdown", markdown: JSON.stringify(body), media: [] };
}
