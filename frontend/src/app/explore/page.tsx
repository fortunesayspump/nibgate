import FeaturedSection from "./_components/FeaturedSection";
import MarketSection from "./_components/MarketSection";
import ExploreControls from "./_components/ExploreControls";
import WishlistSection from "./_components/WishlistSection";
import { getExploreProducts } from "./_data/explore-content";

export default async function ExploreHome() {
  const products = await getExploreProducts({ limit: 60, sort: "trending" });

  return (
    <>
      <FeaturedSection products={products} />
      <ExploreControls />
      <MarketSection products={products} />
      <WishlistSection />
    </>
  );
}
