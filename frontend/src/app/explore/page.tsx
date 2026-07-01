import ExploreIntro from "./_components/ExploreIntro";
import FeaturedSection from "./_components/FeaturedSection";
import MarketSection from "./_components/MarketSection";
import ExploreControls from "./_components/ExploreControls";
import WishlistSection from "./_components/WishlistSection";
import LeaderboardPreview from "./_components/LeaderboardPreview";
import { getExploreProducts } from "./_data/explore-content";

export default async function ExploreHome() {
  const products = await getExploreProducts({ limit: 60, sort: "trending" });

  return (
    <>
      <ExploreIntro />
      <FeaturedSection products={products} />
      <ExploreControls />
      <MarketSection products={products} />
      <LeaderboardPreview />
      <WishlistSection />
    </>
  );
}
