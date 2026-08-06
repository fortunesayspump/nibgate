import type { ExploreProduct } from "./catalog";

type ExploreContent = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  contentType: string;
  tags: string;
  tagList?: string[];
  url: string;
  currency?: string;
  price: number;
  views: number;
  unlocks: number;
  revenue: number;
  reputationScore?: number | null;
  reputationStars?: number | null;
  ratings?: number;
  websiteName: string;
  websiteDomain: string;
  websiteFaviconUrl?: string;
  websiteOgImageUrl?: string;
  createdAt: string;
};

function apiOrigin() {
  const raw = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? "https://api.nibgate.xyz" : "http://localhost:3000");
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

function displayType(type = "") {
  const clean = type.trim().toLowerCase();
  if (clean === "music") return "Music";
  if (clean === "video") return "Video";
  if (clean === "image") return "Image";
  if (clean === "document") return "Document";
  return "Article";
}

function fallbackImage(content: ExploreContent) {
  if (content.imageUrl) return content.imageUrl;
  if (content.websiteOgImageUrl) return content.websiteOgImageUrl;
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(content.title || content.websiteDomain || "nibgate")}`;
}

function parseTags(content: ExploreContent) {
  const source = Array.isArray(content.tagList) ? content.tagList : String(content.tags || "").split(",");
  return source.map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 4);
}

export async function getExploreProducts(params: { q?: string; type?: string; sort?: string; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.type && params.type !== "all") search.set("type", params.type);
  if (params.sort) search.set("sort", params.sort);
  if (params.limit) search.set("limit", String(params.limit));

  try {
    const res = await fetch(`${apiOrigin()}/api/hub/explore/content?${search.toString()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const content = Array.isArray(data.content) ? data.content as ExploreContent[] : [];
    return content.map(toExploreProduct);
  } catch {
    return [];
  }
}

export function toExploreProduct(content: ExploreContent): ExploreProduct {
  const type = displayType(content.contentType);
  return {
    id: content.id,
    type,
    title: content.title,
    summary: content.description || `${type} from ${content.websiteName || content.websiteDomain}`,
    creator: content.websiteName || content.websiteDomain || "Creator",
    price: Number(content.price || 0) > 0 ? `${Number(content.price).toFixed(3)} ${content.currency || "USDC"}` : "Free",
    meta: content.websiteDomain,
    unlocks: `${content.unlocks || 0} unlocks`,
    unlockCount: content.unlocks || 0,
    tags: parseTags(content),
    image: fallbackImage(content),
    avatar: content.websiteFaviconUrl || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(content.websiteName || content.websiteDomain || "N")}`,
    topCreator: (content.unlocks || 0) > 0,
    url: content.url,
    views: content.views || 0,
    revenue: content.revenue || 0,
    reputationScore: typeof content.reputationScore === "number" ? content.reputationScore : null,
    reputationStars: typeof content.reputationStars === "number" ? content.reputationStars : null,
    ratings: content.ratings || 0,
    createdAt: content.createdAt,
  };
}
