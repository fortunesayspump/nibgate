"use client";

import { useState } from "react";
import { categories } from "../_data/catalog";

function CategoryNav() {
  const [activeCategory, setActiveCategory] = useState("All");

  const selectCategory = (category: string) => {
    setActiveCategory(category);
    window.dispatchEvent(new CustomEvent("nibgate:explore-category", { detail: { category } }));
  };

  return (
    <nav className="explore-categories" aria-label="Explore categories" role="menubar">
      {categories.map((category) => {
        const [label, ...items] = category;
        const isActive = activeCategory === label || items.includes(activeCategory);
        
        const isMore = label === "More";

        return (
          <div key={label} className="explore-category-wrap">
            <button
              type="button"
              onClick={() => selectCategory(label)}
              className={`explore-category ${isActive ? "active" : ""}`}
              role="menuitem"
              aria-haspopup={items.length > 0 ? "menu" : "false"}
              aria-expanded={items.length > 0 ? "false" : undefined}
            >
              {label}
              {isMore && (
                <svg className="explore-category-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="m12 15.41 5.71-5.7-1.42-1.42-4.29 4.3-4.29-4.3-1.42 1.42z"/></svg>
              )}
            </button>
            {items.length > 0 && (
              <div className="explore-category-menu" role="menu" aria-label={label}>
                {items.map((item, index) => (
                  <button key={item} type="button" onClick={() => selectCategory(item)} role="menuitem">
                    {item}
                    {index > 0 && index < items.length - 1 ? <span>›</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function ExploreControls() {
  return (
    <section className="explore-controls" aria-label="Explore filters">
      <div className="explore-controls-main">
        <form className="explore-search" action="/explore/products" method="get">
          <label htmlFor="explore-query">Search content</label>
          <svg className="explore-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="m18,10c0-4.41-3.59-8-8-8S2,5.59,2,10s3.59,8,8,8c1.85,0,3.54-.63,4.9-1.69l5.1,5.1,1.41-1.41-5.1-5.1c1.05-1.36,1.69-3.05,1.69-4.9Zm-14,0c0-3.31,2.69-6,6-6s6,2.69,6,6-2.69,6-6,6-6-2.69-6-6Z"/></svg>
          <input id="explore-query" name="q" placeholder="Search articles, images, music, video" autoComplete="off" />
        </form>
      </div>
      <CategoryNav />
    </section>
  );
}
