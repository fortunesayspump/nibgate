import ExploreCollectionPage from "../_components/ExploreCollectionPage";

export const revalidate = 300;

export default function BestSellersExplorePage() {
  return <ExploreCollectionPage sort="best-sellers" />;
}
