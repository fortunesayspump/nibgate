import ExploreCollectionPage from "../_components/ExploreCollectionPage";

export const revalidate = 300;

export default function AgentRoutesExplorePage() {
  return <ExploreCollectionPage q="agent" />;
}
