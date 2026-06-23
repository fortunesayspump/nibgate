import Link from "next/link";

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

function typeClass(type: string) {
  return String(type || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function FeaturedCard({ product }: { product: any }) {
  const contentType = typeClass(product.type);

  return (
    <article className={`explore-feature-card content-card-${contentType}`}>
      <figure className="explore-art">
        <img src={product.image} alt="" loading="lazy" />
        {product.type === 'Video' && playIcon}
        {product.type === 'Music' && waveform}
      </figure>
      <section className="explore-card-copy">
        <header>
          <span className="content-type">{product.type}</span>
          <Link href="/explore/products"><h2>{product.title}</h2></Link>
          <small>{product.summary}</small>
          <Link className="explore-creator" href="/explore/creators">
            {product.avatar && <img src={product.avatar} alt="" loading="lazy" />}
            {product.creator}
            {product.topCreator && topCreatorBadge}
          </Link>
        </header>
        <footer>
          <div className="content-meta">
            <span>{product.type}</span>
            {product.meta && <span>{product.meta}</span>}
            {product.unlocks && <span>{product.unlocks}</span>}
          </div>
          <span className="unlock-price" aria-label={`Price ${product.price}`}>{product.price}</span>
        </footer>
      </section>
    </article>
  );
}

export function ArticleCard({ product }: { product: any }) {
  const avatar = product.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(product.title)}`;
  
  return (
    <article className="article-card">
      <div className="article-header">
        <img className="article-avatar" src={avatar} alt={product.creator} loading="lazy" />
        <div className="article-author-info">
          <span className="article-author-name">{product.creator || 'Creator'}</span>
          <span className="article-meta-time">4 hours ago</span>
        </div>
      </div>
      <div className="article-body">
        <img className="article-media" src={product.image} alt="Article cover" loading="lazy" />
        <div className="article-content">
          <h3 className="article-title">{product.title}</h3>
          <p className="article-summary">{product.summary || 'No description available for this content.'}</p>
        </div>
      </div>
      <div className="article-footer">
        <div className="article-socials">
          <button className="article-action" aria-label="Like">♡ 52</button>
          <button className="article-action" aria-label="Comment">🗨 16</button>
        </div>
        <button className="article-action" aria-label="Share">➦</button>
      </div>
    </article>
  );
}

export function MarketCard({ product }: { product: any }) {
  const contentType = typeClass(product.type);
  const avatar = product.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(product.title)}`;

  // Just using a static aspect ratio instead of a dynamic one on the server to avoid hydration mismatch
  const randomRatio = "4/3"; 

  return (
    <article className={`market-card content-card-${contentType}`}>
      <div className="market-media" style={{ aspectRatio: randomRatio }}>
        <img className="market-thumbnail" src={product.image} alt={product.title} loading="lazy" />
        
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

        <div className="market-overlay">
          <div className="market-badges">
            <span className="market-badge">{product.type}</span>
            <div className="market-actions">
              <button className="market-action-btn" aria-label="Like" onClick={(e) => e.preventDefault()}>♡</button>
              <button className="market-action-btn" aria-label="Bookmark" onClick={(e) => e.preventDefault()}>⚑</button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="market-info">
        <div className="market-info-header">
          <h3 className="market-title">{product.title}</h3>
          <span className="market-price">{product.price}</span>
        </div>
        
        <p className="market-summary">{product.summary || 'No description available for this content.'}</p>
        
        <div className="market-info-footer">
          <Link className="market-creator" href="/explore/creators">
            <img className="market-avatar" src={avatar} alt="Creator" />
            <span className="market-creator-name">{product.creator || 'Creator'}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ExploreCard({ product }: { product: any }) {
  if (product.type === 'Article' || product.type === 'Writing') {
    return <ArticleCard product={product} />;
  }
  return <MarketCard product={product} />;
}
