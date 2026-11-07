"use client";

import { useEffect, useMemo, useState } from "react";
import { contentTypes, sortTabs, type ExploreProduct } from "../_data/catalog";
import { ExploreCard } from "./ProductCard";

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
  initialSort = "site-order",
}: {
  products: ExploreProduct[];
  fixedType?: string;
  initialSort?: string;
}) {
  const unsupportedSort = !["site-order"].includes(initialSort);
  const [activeType, setActiveType] = useState("All");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

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

  const trimmedQuery = searchQuery.trim();
  const filteredProducts = useMemo(() => {
    let result = products;
    result = result.filter((p) => categoryMatches(p, activeCategory));
    if (!fixedType && activeType !== "All") result = result.filter((p) => p.type === activeType);
    if (trimmedQuery) { const q=trimmedQuery.toLowerCase(); result=result.filter((p)=>[p.title,p.summary,p.creator,p.meta].some(value=>value?.toLowerCase().includes(q))); }
    return result;
  }, [products, trimmedQuery, activeType, activeCategory, fixedType]);
  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const title = activeCategory === "All" ? "Current public articles" : activeCategory;

  return (
    <section className="market-section" aria-labelledby="market-title">
      <div className="market-heading">
        <h2 id="market-title">{title}</h2>
        <div className="market-controls" aria-label="Explore content controls">
          <div className="sort-tabs" role="group" aria-label="Sort content">
            {sortTabs.map((tab: string) => {
              const available = tab === "Site order";
              return (
                <button key={tab} disabled={!available} className={available ? "active" : ""} type="button" aria-pressed={available ? "true" : "false"} title={available ? "Alphabetical site order in the current sample" : "Unavailable: historical public visibility cannot be established"}>
                  {tab}{!available && " (unavailable)"}
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
      <p className="market-search-status">Current mainnet public articles only, sampled from up to 20 listings per eligible hosted site among the first 20 verified hosted sites, in site order. Some sites may be temporarily unavailable and omitted. Search and filters cover this sample, not all network content. Historical views, unlocks, revenue, ratings and reputation are unavailable because public visibility when those events occurred cannot be established.</p>
      {unsupportedSort && <p role="status" className="explore-empty-state">The requested activity-based sort is unavailable. These articles are shown by site order instead.</p>}
      <div className="market-layout">
        <div className="market-products">
          {trimmedQuery && (
            <p className="market-search-status" aria-live="polite">
              {`${filteredProducts.length} result${filteredProducts.length === 1 ? "" : "s"} for "${trimmedQuery}"`}
            </p>
          )}
          <div className="market-grid">
            {visibleProducts.length === 0 ? (
              <div className="explore-empty-state market-empty-state">
                <p>
                  {trimmedQuery
                    ? `No results for "${trimmedQuery}" in the current public listing sample.`
                    : "No matching articles were found in the current public listing sample."}
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
