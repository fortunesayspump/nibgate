import { contentTypes, marketProducts, sortTabs } from "../../../../explore/data/catalog.js";
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
            {marketProducts.map((product: any, i: number) => (
              <ExploreCard key={i} product={product} />
            ))}
          </div>
          <div className="market-load-more">
            <button type="button">Load more</button>
          </div>
        </div>
      </div>
    </section>
  );
}
