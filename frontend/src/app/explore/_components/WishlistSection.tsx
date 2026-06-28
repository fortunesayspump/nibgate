import Link from "next/link";
import { type Wishlist, wishlists } from "../_data/catalog";

const documentIcon = (
  <svg className="explore-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
    <path d="M14.71 2.29A1 1 0 0 0 14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-.27-.11-.52-.29-.71zM7 7h4v2H7zm10 10H7v-2h10zm0-4H7v-2h10zm-4-4V3.5L18.5 9z"/>
  </svg>
);

const bookmarkIcon = (
  <svg className="explore-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
    <path d="M18 2H6c-1.1 0-2 .9-2 2v17c0 .36.19.69.5.87s.69.18 1 0l6.5-3.72 6.5 3.72c.15.09.33.13.5.13s.35-.04.5-.13c.31-.18.5-.51.5-.87V4c0-1.1-.9-2-2-2"/>
  </svg>
);

const followIcon = (
  <svg className="explore-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
    <path d="M13 6 11 6 11 9 8 9 8 11 11 11 11 14 13 14 13 11 16 11 16 9 13 9 13 6z"/>
    <path d="m18,2H6c-1.1,0-2,.9-2,2v17c0,.36.19.69.5.86.31.18.69.18,1,0l6.5-3.72,6.5,3.72c.15.09.32.13.5.13s.35-.04.5-.14c.31-.18.5-.51.5-.86V4c0-1.1-.9-2-2-2Zm0,8v9.28l-5.5-3.15c-.31-.18-.68-.18-.99,0l-5.5,3.15V4h12v6Z"/>
  </svg>
);

function WishlistCard({ wishlist }: { wishlist: Wishlist }) {
  return (
    <article className="wishlist-card">
      <figure className="wishlist-mosaic" aria-hidden="true">
        {wishlist.images.map((image: string, index: number) => (
          <span key={image || index} data-tile={index + 1} />
        ))}
      </figure>
      <section className="wishlist-copy">
        <header>
          <Link href="/explore/wishlists"><h3>{wishlist.title}</h3></Link>
          {wishlist.copy && <p>{wishlist.copy}</p>}
          <Link className="wishlist-creator" href="/explore/creators">
            <span>{wishlist.creator}</span>
          </Link>
        </header>
        <footer>
          <div>
            <span className="wishlist-products">{documentIcon} {wishlist.products}</span>
            <span>{bookmarkIcon} {wishlist.followers}</span>
          </div>
          <button type="button" aria-label="Follow">{followIcon}</button>
        </footer>
      </section>
    </article>
  );
}

export default function WishlistSection() {
  if (wishlists.length === 0) {
    return null;
  }

  return (
    <section className="wishlist-section" aria-labelledby="wishlist-title">
      <h2 id="wishlist-title">Wishlists you might like</h2>
      <div className="wishlist-grid">
        {wishlists.map((wishlist, index) => (
          <WishlistCard key={index} wishlist={wishlist} />
        ))}
      </div>
    </section>
  );
}
