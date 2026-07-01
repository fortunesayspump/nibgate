"use client";

import Link from "next/link";
import type { ExploreProduct } from "../_data/catalog";

const topCreatorBadge = (
  <span className="top-creator-badge" aria-label="Top creator">
    <svg width="16" height="16" viewBox="3.5 5 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12.6895 14.4967C12.2571 14.7205 11.7429 14.7205 11.3105 14.4967L5.31055 11.3903C4.81285 11.1326 4.50011 10.6187 4.5 10.0582L4.5 7.41662C4.5 6.5882 5.17157 5.91662 6 5.91662L18 5.91663C18.8284 5.91663 19.5 6.5882 19.5 7.41663L19.5 10.0582C19.4999 10.6187 19.1872 11.1326 18.6895 11.3903L12.6895 14.4967Z" fill="#7C9A6D" stroke="black"/>
      <circle cx="12" cy="18.8333" r="2.45" fill="#E7EFE4" stroke="#242423" strokeWidth="1.1"/>
      <path d="M9 5.41663H10V13.4166L9 12.8974V5.41663Z" fill="black"/>
      <path d="M14 5.41663H15V13.0166L14 13.4166V5.4166Z" fill="black"/>
    </svg>
  </span>
);

const playIcon = (
  <span className="content-play" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M8 5.4v13.2L18.6 12 8 5.4Z"/>
    </svg>
  </span>
);

const waveform = (
  <span className="content-wave" aria-hidden="true">
    <i/><i/><i/><i/><i/><i/>
  </span>
);

const articleLinkIcon = (
  <span className="market-center-icon article-link-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.9 5.03" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07l1.22-1.22" />
    </svg>
  </span>
);

const imageDownloadIcon = (
  <span className="market-center-icon image-download-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  </span>
);

function typeClass(type: string) {
  return String(type || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function productHref(product: ExploreProduct) {
  return product.url || "/explore/products";
}

function productImage(product: ExploreProduct) {
  return product.image || `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(product.title || "nibgate")}`;
}

function TagPills({ tags = [] }: { tags?: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.slice(0, 3).map((tag) => (
        <Link key={tag} href={`/explore/products?q=${encodeURIComponent(tag)}`} className="rounded-full border border-black/10 bg-white/55 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] opacity-75 transition hover:opacity-100">
          {tag}
        </Link>
      ))}
    </div>
  );
}

function ReputationStars({ score, stars }: { score?: number; stars?: number }) {
  const rating = typeof stars === "number" ? stars : (typeof score === "number" ? Math.max(0, Math.min(5, Math.round((score / 20) * 10) / 10)) : null);
  if (rating === null) return null;
  const percent = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span className="content-rating" title={`Content reputation: ${rating.toFixed(1)} out of 5 stars`}>
      <span className="content-rating-stars" aria-hidden="true">
        <span className="content-rating-empty">☆☆☆☆☆</span>
        <span className="content-rating-fill" style={{ width: `${percent}%` }}>★★★★★</span>
      </span>
      <span className="content-rating-value">{rating.toFixed(1)}</span>
      <span className="sr-only">{rating.toFixed(1)} out of 5 stars</span>
    </span>
  );
}

export function FeaturedCard({ product }: { product: ExploreProduct }) {
  const contentType = typeClass(product.type);

  return (
    <article className={`explore-feature-card content-card-${contentType}`}>
      <figure className="explore-art">
        <img src={productImage(product)} alt="" loading="lazy" />
        {product.type === 'Video' && playIcon}
        {product.type === 'Music' && waveform}
      </figure>
      <section className="explore-card-copy">
        <header>
          <div className="content-card-badges">
            <span className="content-type">{product.type}</span>
            <ReputationStars score={product.reputationScore} stars={product.reputationStars} />
          </div>
          <Link href={productHref(product)}><h2>{product.title}</h2></Link>
          <small>{product.summary}</small>
          <TagPills tags={product.tags} />
          <Link className="explore-creator" href="/explore/creators">
            {product.avatar && <img src={product.avatar} alt="" loading="lazy" />}
            {product.creator}
          </Link>
        </header>
        <footer>
          <div className="content-meta">
            {product.unlocks && <span>{product.unlocks}</span>}
            <ReputationStars score={product.reputationScore} stars={product.reputationStars} />
          </div>
          <span className="unlock-price" aria-label={`Price ${product.price}`}>{product.price}</span>
        </footer>
      </section>
    </article>
  );
}

export function ArticleCard({ product }: { product: ExploreProduct }) {
  const avatar = product.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(product.title)}`;
  
  return (
    <article className="article-card">
      <div className="article-header">
        <img className="article-avatar" src={avatar} alt={product.creator} loading="lazy" />
        <div className="article-author-info">
          <span className="article-author-name">{product.creator || 'Creator'}</span>
          <span className="article-meta-time">Content reputation {product.reputationScore || 0}</span>
        </div>
      </div>
      <div className="article-body">
        <img className="article-media" src={productImage(product)} alt="Article cover" loading="lazy" />
        <div className="article-content">
          <h3 className="article-title">{product.title}</h3>
          <p className="article-summary">{product.summary || 'No description available for this content.'}</p>
          <TagPills tags={product.tags} />
        </div>
      </div>
      <div className="article-footer">
        <div className="article-socials">
          <span className="article-action">{product.unlocks || "0 unlocks"}</span>
        </div>
        <Link className="article-action" href={productHref(product)}>Open</Link>
      </div>
    </article>
  );
}

export function MarketCard({ product }: { product: ExploreProduct }) {
  const contentType = typeClass(product.type);
  const avatar = product.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(product.title)}`;

  // Just using a static aspect ratio instead of a dynamic one on the server to avoid hydration mismatch
  const randomRatio = "4/3"; 

  return (
    <article className={`market-card content-card-${contentType}`}>
      <div className="market-media" style={{ aspectRatio: randomRatio }}>
        <img className="market-thumbnail" src={productImage(product)} alt={product.title} loading="lazy" />
        
        {product.type === 'Video' && (
          <div className="market-play-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}

        {product.type === 'Music' && (
          <div className="market-music-player">
            <button className="music-play-btn" aria-label="Play">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            <div className="music-waveform">
              {Array.from({ length: 40 }).map((_, i) => <i key={i} />)}
            </div>
          </div>
        )}

        {product.type === 'Article' && articleLinkIcon}
        {product.type === 'Image' && imageDownloadIcon}

        <div className="market-overlay">
          <div className="market-badges">
            <span className="market-badge">{product.type}</span>
          </div>
        </div>
      </div>
      
      <div className="market-info">
        <div className="market-info-header">
          <Link href={productHref(product)}><h3 className="market-title">{product.title}</h3></Link>
          <span className="market-price">{product.price}</span>
        </div>
        
        <p className="market-summary">{product.summary || 'No description available for this content.'}</p>
        <TagPills tags={product.tags} />
        
        <div className="market-info-footer">
          <Link className="market-creator" href="/explore/creators">
            <img className="market-avatar" src={avatar} alt="Creator" />
            <span className="market-creator-name">{product.creator || 'Creator'}</span>
          </Link>
          <ReputationStars score={product.reputationScore} stars={product.reputationStars} />
        </div>
      </div>
    </article>
  );
}

export function ExploreCard({ product }: { product: ExploreProduct }) {
  return <MarketCard product={product} />;
}
