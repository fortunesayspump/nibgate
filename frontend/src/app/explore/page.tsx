import FeaturedSection from "./_components/FeaturedSection";
import MarketSection from "./_components/MarketSection";
import WishlistSection from "./_components/WishlistSection";
import { getExploreProducts } from "./_data/explore-content";

export default async function ExploreHome() {
  const products = await getExploreProducts({ limit: 60, sort: "trending" });

  return (
    <>
      <FeaturedSection products={products} />
      <MarketSection products={products} />
      <WishlistSection />
    </>
  );
}
