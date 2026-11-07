import ExploreUnavailable from "../_components/ExploreUnavailable";
import CreatorSection from "../_components/CreatorSection";
import { getExploreProducts } from "../_data/explore-content";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const products = await getExploreProducts({ limit: 100, sort: "trending" });
  if (products === null) return <ExploreUnavailable />;

  return <CreatorSection products={products} />;
}
