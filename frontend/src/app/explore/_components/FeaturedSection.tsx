"use client";

import { useRef, useState } from "react";
import type { ExploreProduct } from "../_data/catalog";
import { FeaturedCard } from "./ProductCard";

export default function FeaturedSection({ products }: { products: ExploreProduct[] }) {
  const featuredProducts = products.slice(0, 4);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const total = featuredProducts.length;

  const updateActiveIndex = () => {
    const track = trackRef.current;
    if (!track || total === 0) return;

    const children = Array.from(track.children) as HTMLElement[];
    const nearest = children.reduce(
      (best, child, index) => {
        const distance = Math.abs(child.offsetLeft - track.scrollLeft);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: 0, distance: Number.POSITIVE_INFINITY }
    );

    setActiveIndex(nearest.index);
  };

  const scrollToIndex = (nextIndex: number) => {
    const track = trackRef.current;
    if (!track || total === 0) return;

    const normalizedIndex = (nextIndex + total) % total;
    const target = track.children.item(normalizedIndex) as HTMLElement | null;
    if (target) {
      track.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    }
    setActiveIndex(normalizedIndex);
  };

  if (featuredProducts.length === 0) {
    return (
      <section className="featured-section" aria-labelledby="featured-title">
        <header className="explore-section-heading">
          <h1 id="featured-title">Featured content</h1>
        </header>
        <div className="rounded-[8px] border border-black/10 p-8 text-center">
          <p>No featured content has been tracked yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="featured-section" aria-labelledby="featured-title">
      <header className="explore-section-heading">
        <h1 id="featured-title">Featured content</h1>
        <div className="explore-pager">
          <button type="button" aria-label="Previous featured product" onClick={() => scrollToIndex(activeIndex - 1)}>&lt;</button>
          <span aria-live="polite">{activeIndex + 1} / {total}</span>
          <button type="button" aria-label="Next featured product" onClick={() => scrollToIndex(activeIndex + 1)}>&gt;</button>
        </div>
      </header>
      <div
        ref={trackRef}
        className="featured-track"
        onScroll={updateActiveIndex}
      >
        {featuredProducts.map((product, i) => (
          <FeaturedCard key={i} product={product} priority={i === 0} />
        ))}
      </div>
    </section>
  );
}
