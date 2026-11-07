"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { contentTypes, sortTabs, type ExploreProduct } from "../_data/catalog";
import { toExploreProduct } from "../_data/explore-content";
import { ExploreCard } from "./ProductCard";

function sortKey(label: string) {
  return label.toLowerCase().replaceAll(" ", "-").replace("&", "");
}

function sortProducts(products: ExploreProduct[], sort: string) {
  return [...products].sort((a, b) => {
    if (sort === "best-sellers") {
      const aUnlocks = Number.parseInt(a.unlocks || "0", 10) || 0;
      const bUnlocks = Number.parseInt(b.unlocks || "0", 10) || 0;
      return (bUnlocks - aUnlocks) || ((b.revenue || 0) - (a.revenue || 0));
    }
    if (sort === "hot-new") {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    }
    return ((b.views || 0) + (b.revenue || 0) * 20) - ((a.views || 0) + (a.revenue || 0) * 20);
  });
}

function categoryMatches(product: ExploreProduct, category: string) {
  if (category === "All") return true;
  const clean = category.toLowerCase();
  const haystack = [product.type, product.title, product.summary || "", ...(product.tags || [])].join(" ").toLowerCase();
  if (clean === "writing" || clean === "articles") return product.type === "Article";
  if (clean === "media") return ["Music", "Image", "Video", "Document"].includes(product.type);
  if (clean === "images") return product.type === "Image";
  if (clean === "documents" || clean === "docs") return product.type === "Document";
  return haystack.includes(clean);
}

export default function MarketSection({
  products,
  fixedType = "",
  initialSort = "trending",
}: {
  products: ExploreProduct[];
  fixedType?: string;
  initialSort?: string;
}) {
  const [sort, setSort] = useState(initialSort);
  const [activeType, setActiveType] = useState("All");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  // Server-side search results: the `products` prop only holds the top-200
  // trending cards, so a client-side filter can never find low-traction
  // content (e.g. a brand-new subblog). When a query is active we ask the
  // full discovery index instead. Bare `/hub/...` path uses the
  // next.config.ts rewrite to the backend.
  const [remoteResults, setRemoteResults] = useState<ExploreProduct[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchSeq = useRef(0);

  useEffect(() => {
    const onCategory = (event: Event) => {
      const category = (event as CustomEvent<{ category?: string }>).detail?.category || "All";
      setActiveCategory(category);
      setSearchQuery("");
      setRemoteResults(null);
      setSearching(false);
      setSearchError("");
      setVisibleCount(12);
    };
    const onSearch = (event: Event) => {
      const q = (event as CustomEvent<{ q?: string }>).detail?.q || "";
      setSearchQuery(q);
      setActiveCategory("All");
      if (!q.trim()) {
        searchSeq.current += 1;
        setRemoteResults(null);
        setSearching(false);
        setSearchError("");
      } else {
        setSearching(true);
        setSearchError("");
      }
      setVisibleCount(12);
    };
    window.addEventListener("nibgate:explore-category", onCategory);
    window.addEventListener("nibgate:explore-search", onSearch);
    return () => {
      window.removeEventListener("nibgate:explore-category", onCategory);
      window.removeEventListener("nibgate:explore-search", onSearch);
    };
  }, []);

  const trimmedQuery = searchQuery.trim();
  const effectiveType = fixedType || activeType;

  useEffect(() => {
    if (!trimmedQuery) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      if (searchSeq.current !== seq) return;
      try {
        const params = new URLSearchParams();
        params.set("q", trimmedQuery);
        params.set("sort", sort);
        params.set("limit", "100");
        if (effectiveType && effectiveType !== "All") params.set("type", effectiveType.toLowerCase());
        const res = await fetch(`/hub/explore/content?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const content = Array.isArray(data.content) ? data.content : [];
        if (searchSeq.current !== seq) return;
        setRemoteResults(content.map(toExploreProduct));
      } catch {
        if (searchSeq.current !== seq) return;
        setRemoteResults([]);
        setSearchError("Search is unavailable right now. Try again in a moment.");
      } finally {
        if (searchSeq.current === seq) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmedQuery, sort, effectiveType]);

  const filteredProducts = useMemo(() => {
    // Active query → server results arrive pre-sorted; keep backend order and
    // only apply the client-side category filter on top.
    if (trimmedQuery) {
      const base = remoteResults ?? [];
      return base.filter((p) => categoryMatches(p, activeCategory));
    }
    let result = products;
    result = result.filter((p) => categoryMatches(p, activeCategory));
    if (!fixedType && activeType !== "All") result = result.filter((p) => p.type === activeType);
    return sortProducts(result, sort);
  }, [products, sort, trimmedQuery, remoteResults, activeType, activeCategory, fixedType]);
  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const title = activeCategory === "All" ? "Explore content" : activeCategory;

  return (
    <section className="market-section" aria-labelledby="market-title">
      <div className="market-heading">
        <h2 id="market-title">{title}</h2>
        <div className="market-controls" aria-label="Explore content controls">
          <div className="sort-tabs" role="radiogroup" aria-label="Sort content">
            {sortTabs.map((tab: string) => {
              const key = sortKey(tab);
              const normalizedKey = key === "hot--new" ? "hot-new" : key;
              return (
                <button key={tab} onClick={() => setSort(normalizedKey)} className={sort === normalizedKey ? "active" : ""} type="button" aria-pressed={sort === normalizedKey ? "true" : "false"}>
                  {tab}
                </button>
              );
            })}
          </div>
          <div className="type-tabs" aria-label="Filter by content type">
            {contentTypes.map((type: string) => (
              <button key={type} onClick={() => { setActiveType(type); setVisibleCount(12); }} className={activeType === type ? "active" : ""} type="button" aria-pressed={activeType === type ? "true" : "false"}>
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="market-layout">
        <div className="market-products">
          {trimmedQuery && (
            <p className="market-search-status" aria-live="polite">
              {searching
                ? `Searching discovery for "${trimmedQuery}"…`
                : searchError || `${filteredProducts.length} result${filteredProducts.length === 1 ? "" : "s"} for "${trimmedQuery}"`}
            </p>
          )}
          <div className="market-grid">
            {visibleProducts.length === 0 ? (
              <div className="explore-empty-state market-empty-state">
                <p>
                  {trimmedQuery && !searching
                    ? `No results for "${trimmedQuery}" in discovery.`
                    : "No tracked content is available yet."}
                </p>
              </div>
            ) : (
              visibleProducts.map((product, i) => (
                <ExploreCard key={product.id || i} product={product} />
              ))
            )}
          </div>
          {visibleCount < filteredProducts.length ? (
            <div className="market-load-more">
              <button type="button" onClick={() => setVisibleCount((count) => count + 12)}>Load more</button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
