import MarketSection from "../_components/MarketSection";
import { getExploreProducts } from "../_data/explore-content";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q : "";
  const type = typeof params?.type === "string" ? params.type : "";
  const sort = typeof params?.sort === "string" ? params.sort : "site-order";
  const products = await getExploreProducts({ q, type, sort, limit: 100 });
  if (!products) return <p className="explore-empty-state" role="status">Explore is temporarily unavailable.</p>;
  return <MarketSection products={products} initialLimit={100} initialQuery={q} fixedType={type} />;
}
