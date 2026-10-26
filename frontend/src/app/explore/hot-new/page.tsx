import ExploreCollectionPage from "../_components/ExploreCollectionPage";

export const revalidate = 300;

export default function HotNewExplorePage() {
  return <ExploreCollectionPage sort="hot-new" />;
}
