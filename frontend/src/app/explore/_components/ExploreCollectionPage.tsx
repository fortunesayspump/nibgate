import MarketSection from "./MarketSection";
import { getExploreProducts } from "../_data/explore-content";

type ExploreCollectionPageProps = {
  q?: string;
  type?: string;
  sort?: string;
};

export default async function ExploreCollectionPage({ q = "", type = "", sort = "site-order" }: ExploreCollectionPageProps) {
  const products = await getExploreProducts({ q, type, sort, limit: 200 });
  if (!products) return <p className="explore-empty-state" role="status">Explore is temporarily unavailable.</p>;
  return <MarketSection products={products} fixedType={type} initialSort={sort} initialQuery={q} />;
}
