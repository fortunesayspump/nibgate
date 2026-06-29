import { contentTypes, marketProducts, sortTabs } from "../_data/catalog";
import { ExploreCard } from "./ProductCard";

export default function MarketSection() {
  return (
    <section className="market-section" aria-labelledby="market-title">
      <div className="market-heading">
        <h2 id="market-title">Explore content</h2>
        <div className="market-controls" aria-label="Explore content controls">
          <div className="sort-tabs" role="radiogroup" aria-label="Sort content">
            {sortTabs.map((tab: string, index: number) => (
              <button key={tab} className={index === 0 ? "active" : ""} type="button" aria-pressed={index === 0 ? "true" : "false"}>
                {tab}
              </button>
            ))}
          </div>
          <div className="type-tabs" aria-label="Filter by content type">
            {contentTypes.map((type: string) => (
              <button key={type} className="active" type="button" aria-pressed="true">
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="market-layout">
        <div className="market-products">
          <div className="market-grid">
            {marketProducts.length === 0 ? (
              <div className="rounded-[8px] border border-black/10 p-8 text-center">
                <p>No tracked content is available yet.</p>
              </div>
            ) : (
              marketProducts.map((product, i) => (
                <ExploreCard key={i} product={product} />
              ))
            )}
          </div>
          {marketProducts.length > 0 && (
            <div className="market-load-more">
              <button type="button">Load more</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
