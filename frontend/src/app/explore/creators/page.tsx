import CreatorSection from "../_components/CreatorSection";
import { getExploreProducts } from "../_data/explore-content";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const products = await getExploreProducts({ limit: 100, sort: "trending" });
  return <CreatorSection products={products} />;
}
