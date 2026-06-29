import MarketSection from "../_components/MarketSection";
import { getExploreProducts } from "../_data/explore-content";

export default async function ProductsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q : "";
  const type = typeof params?.type === "string" ? params.type : "";
  const sort = typeof params?.sort === "string" ? params.sort : "trending";
  const products = await getExploreProducts({ q, type, sort, limit: 100 });
  return <MarketSection products={products} />;
}
