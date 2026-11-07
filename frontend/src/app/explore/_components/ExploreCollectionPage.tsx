import ExploreUnavailable from "./ExploreUnavailable";
import MarketSection from "./MarketSection";
import { getExploreProducts } from "../_data/explore-content";

type ExploreCollectionPageProps = {
  q?: string;
  type?: string;
  sort?: string;
};

export default async function ExploreCollectionPage({ q = "", type = "", sort = "trending" }: ExploreCollectionPageProps) {
  const products = await getExploreProducts({ q, type, sort, limit: 200 });
  if (products === null) return <ExploreUnavailable />;

  return <MarketSection products={products} fixedType={type} initialSort={sort} />;
}
