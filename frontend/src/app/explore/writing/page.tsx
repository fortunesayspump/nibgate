import ExploreCollectionPage from "../_components/ExploreCollectionPage";

export const revalidate = 300;

export default function WritingExplorePage() {
  return <ExploreCollectionPage type="article" q="writing" />;
}
