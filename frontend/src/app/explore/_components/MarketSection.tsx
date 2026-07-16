"use client";

import { useEffect, useMemo, useState } from "react";
import { contentTypes, sortTabs, type ExploreProduct } from "../_data/catalog";
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
  if (clean === "media") return ["Music", "Image", "Video"].includes(product.type);
  if (clean === "images") return product.type === "Image";
  return haystack.includes(clean);
}

export default function MarketSection({ products }: { products: ExploreProduct[] }) {
  const [sort, setSort] = useState("trending");
  const [activeType, setActiveType] = useState("All");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    const onCategory = (event: Event) => {
      const category = (event as CustomEvent<{ category?: string }>).detail?.category || "All";
      setActiveCategory(category);
      setSearchQuery("");
      setVisibleCount(12);
    };
    const onSearch = (event: Event) => {
      const q = (event as CustomEvent<{ q?: string }>).detail?.q || "";
      setSearchQuery(q);
      setActiveCategory("All");
      setVisibleCount(12);
    };
    window.addEventListener("nibgate:explore-category", onCategory);
    window.addEventListener("nibgate:explore-search", onSearch);
    return () => {
      window.removeEventListener("nibgate:explore-category", onCategory);
      window.removeEventListener("nibgate:explore-search", onSearch);
    };
  }, []);

  const isActive = searchQuery || activeCategory !== "All" || activeType !== "All";

  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) =>
        [p.title, p.type, p.summary, p.creator, ...(p.tags || [])].join(" ").toLowerCase().includes(q)
      );
    }
    result = result.filter((p) => categoryMatches(p, activeCategory));
    if (activeType !== "All") result = result.filter((p) => p.type === activeType);
    return sortProducts(result, sort);
  }, [products, sort, searchQuery, activeType, activeCategory]);
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
          <div className="market-grid">
            {visibleProducts.length === 0 ? (
              <div className="explore-empty-state market-empty-state">
                <p>No tracked content is available yet.</p>
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
