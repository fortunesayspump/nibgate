import HistoricalSortUnavailable from "../_components/HistoricalSortUnavailable";
import ExploreUnavailable from "../_components/ExploreUnavailable";
import MarketSection from "../_components/MarketSection";
import { getExploreProducts } from "../_data/explore-content";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q : "";
  const type = typeof params?.type === "string" ? params.type : "";
  const sort = typeof params?.sort === "string" ? params.sort : "newest-publication";
  if (!["newest-publication", "hot-new"].includes(sort)) return <HistoricalSortUnavailable />;
  const products = await getExploreProducts({ q, type, sort, limit: 100 });
  if (products === null) return <ExploreUnavailable />;

  return <MarketSection products={products} fixedType={type} initialSort="newest-publication" />;
}
