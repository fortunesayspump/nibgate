import type { ExploreProduct } from "./catalog";

type ExploreContent = {
  id: string;
  identityScope: "creator-publication";
  title: string;
  description: string;
  imageUrl: string;
  contentType: string;
  tags: string;
  tagList?: string[];
  url: string;
  currency?: string;
  price: number;
  views: number | null;
  unlocks: number | null;
  revenue: number | null;
  reputationScore?: number | null;
  reputationStars?: number | null;
  ratings?: number | null;
  websiteName: string;
  websiteDomain: string;
  websiteFaviconUrl?: string;
  websiteOgImageUrl?: string;
  createdAt: string | null;
};

function apiOrigin() {
  const raw = process.env.NEXT_PUBLIC_API_URL
    || (process.env.NODE_ENV === "production"
      ? ((process.env.NEXT_PUBLIC_NIBGATE_NETWORK || "testnet").toLowerCase() === "mainnet"
        ? "https://api.nibgate.xyz"
        : "https://testnet-api.nibgate.xyz")
      : "http://localhost:3000");
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
  return "";
}

function parseTags(content: ExploreContent) {
  const source = Array.isArray(content.tagList) ? content.tagList : String(content.tags || "").split(",");
  return source.map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 4);
}

export async function getExploreProducts(params: { q?: string; type?: string; sort?: string; limit?: number } = {}) {
  if (params.sort && params.sort !== "site-order") return null;
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.type && params.type !== "all") search.set("type", params.type);
  search.set("sort", "site-order");
  if (params.limit) search.set("limit", String(params.limit));

  try {
    const res = await fetch(`${apiOrigin()}/hub/explore/content?${search.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!isCurrentPublicResponse(data)) return null;
    const content = data.content as ExploreContent[];
    return content.map(toExploreProduct);
  } catch {
    return null;
  }
}

export function toExploreProduct(content: ExploreContent): ExploreProduct {
  const type = displayType(content.contentType);
  return {
    id: `${content.websiteDomain}:${content.id}`,
    type,
    title: content.title,
    summary: content.description || `${type} from ${content.websiteName || content.websiteDomain}`,
    creator: content.websiteName || content.websiteDomain || "Creator",
    price: typeof content.price === "number" && Number.isFinite(content.price) && content.price >= 0
      ? (content.price === 0 ? "Free" : `${content.price.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${content.currency || "USDC"}`)
      : "Price unavailable",
    meta: content.websiteDomain,
    unlocks: null,
    unlockCount: null,
    tags: parseTags(content),
    image: fallbackImage(content),
    avatar: content.websiteFaviconUrl || "",
    topCreator: false,
    url: content.url,
    views: null,
    revenue: null,
    reputationScore: null,
    reputationStars: null,
    ratings: null,
    createdAt: content.createdAt,
  };
}

// Reject older discovery contracts instead of accidentally exposing cached
// listings or historical metrics whose event-time visibility is unproven.
export function isCurrentPublicResponse(data: unknown): data is { content: ExploreContent[] } {
  if (!data || typeof data !== "object") return false;
  const response = data as Record<string, unknown>;
  return response.success === true
    && response.scope === "current-public-creator-articles"
    && response.sort === "site-order"
    && response.historyStatus === "unavailable-no-event-visibility-proof"
    && Array.isArray(response.content)
    && response.content.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const article = item as Record<string, unknown>;
      if (article.identityScope !== "creator-publication" || article.contentType !== "article"
        || typeof article.id !== "string" || typeof article.title !== "string" || typeof article.url !== "string"
        || typeof article.websiteDomain !== "string" || typeof article.price !== "number" || !Number.isFinite(article.price) || article.price < 0
        || article.views !== null || article.unlocks !== null || article.revenue !== null) return false;
      try { const u=new URL(article.url); return u.protocol === "https:" && u.hostname === article.websiteDomain && !u.port && !u.username && !u.password && !u.search && !u.hash && /^\/writing\/[A-Za-z0-9_-]{1,200}$/.test(u.pathname); } catch { return false; }
    });
}
