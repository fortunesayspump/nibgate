"use client";

import Link from "next/link";
import Image from "next/image";
import type { KeyboardEvent, MouseEvent } from "react";
import type { ExploreProduct } from "../_data/catalog";

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

const docIcon = (
  <span className="market-center-icon doc-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="12" y2="9" />
    </svg>
  </span>
);

function typeClass(type: string) {
  return String(type || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function productHref(product: ExploreProduct) {
  return product.url || "/explore/products";
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

function openProduct(product: ExploreProduct) {
  const href = productHref(product);
  if (href) window.open(href, '_blank', 'noopener');
}

function onCardKeyDown(event: KeyboardEvent<HTMLElement>, product: ExploreProduct) {
  if (event.key !== "Enter" && event.key !== " ") return;
  if ((event.target as HTMLElement).closest("a, button")) return;
  event.preventDefault();
  openProduct(product);
}

function onCardClick(event: MouseEvent<HTMLElement>, product: ExploreProduct) {
  if ((event.target as HTMLElement).closest("a, button")) return;
  openProduct(product);
}

export function FeaturedCard({ product, priority }: { product: ExploreProduct; priority?: boolean }) {
  const contentType = typeClass(product.type);

  return (
    <article className={`explore-feature-card content-card-${contentType}`} role="link" tabIndex={0} onClick={(event) => onCardClick(event, product)} onKeyDown={(event) => onCardKeyDown(event, product)}>
      <figure className="explore-art">
        {product.image && <Image src={product.image} alt="" width={800} height={600} priority={priority} sizes="(max-width: 900px) 100vw, 560px" />}
        {product.type === 'Video' && playIcon}
        {product.type === 'Music' && waveform}
        {product.type === 'Document' && docIcon}
      </figure>
      <section className="explore-card-copy">
        <header>
          <div className="content-card-badges">
            <span className="content-type">{product.type}</span>
          </div>
          <Link href={productHref(product)} target="_blank" rel="noopener noreferrer"><h2>{product.title}</h2></Link>
          <small>{product.summary}</small>
          <TagPills tags={product.tags} />
          <Link className="explore-creator" href="/explore/creators">
            {product.avatar && <Image src={product.avatar} alt="" width={24} height={24} />}
            {product.creator}
          </Link>
        </header>
        <footer>
          <div className="content-meta">
          </div>
          <span className="unlock-price" aria-label={`Price ${product.price}`}>{product.price}</span>
        </footer>
      </section>
    </article>
  );
}

export function ArticleCard({ product }: { product: ExploreProduct }) {
  const avatar = product.avatar;
  
  return (
    <article className="article-card" role="link" tabIndex={0} onClick={(event) => onCardClick(event, product)} onKeyDown={(event) => onCardKeyDown(event, product)}>
      <div className="article-header">
        {avatar && <Image className="article-avatar" src={avatar} alt={product.creator || "Creator"} width={36} height={36} />}
        <div className="article-author-info">
          <span className="article-author-name">{product.creator || 'Creator'}</span>
        </div>
      </div>
      <div className="article-body">
        {product.image && <Image className="article-media" src={product.image} alt="Article cover" width={800} height={450} sizes="(max-width: 900px) 100vw, 720px" />}
        <div className="article-content">
          <h3 className="article-title">{product.title}</h3>
          <p className="article-summary">{product.summary || 'No description available for this content.'}</p>
          <TagPills tags={product.tags} />
        </div>
      </div>
      <div className="article-footer">
        <div className="article-socials">
        </div>
        <Link className="article-action" href={productHref(product)} target="_blank" rel="noopener noreferrer">Open</Link>
      </div>
    </article>
  );
}

export function MarketCard({ product }: { product: ExploreProduct }) {
  const contentType = typeClass(product.type);
  const avatar = product.avatar;

  // Just using a static aspect ratio instead of a dynamic one on the server to avoid hydration mismatch
  const randomRatio = "4/3"; 

  return (
    <article className={`market-card content-card-${contentType}`} role="link" tabIndex={0} onClick={(event) => onCardClick(event, product)} onKeyDown={(event) => onCardKeyDown(event, product)}>
      <div className="market-media" style={{ aspectRatio: randomRatio }}>
        {product.image && <Image className="market-thumbnail" src={product.image} alt={product.title} width={800} height={600} sizes="(max-width: 900px) 100vw, 400px" />}
        
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
        {product.type === 'Document' && docIcon}

        <div className="market-overlay">
          <div className="market-badges">
            <span className="market-badge">{product.type}</span>
          </div>
        </div>
      </div>
      
      <div className="market-info">
        <div className="market-info-header">
          <Link href={productHref(product)} target="_blank" rel="noopener noreferrer"><h3 className="market-title">{product.title}</h3></Link>
          <span className="market-price">{product.price}</span>
        </div>
        
        <p className="market-summary">{product.summary || 'No description available for this content.'}</p>
        <TagPills tags={product.tags} />
        
        <div className="market-info-footer">
          <Link className="market-creator" href="/explore/creators">
            {avatar && <Image className="market-avatar" src={avatar} alt="Creator" width={24} height={24} />}
            <span className="market-creator-name">{product.creator || 'Creator'}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ExploreCard({ product }: { product: ExploreProduct }) {
  return <MarketCard product={product} />;
}
