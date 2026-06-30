import InfoPage from "@/components/InfoPage";

export default function DiscoveryPage() {
  return <InfoPage eyebrow="Discovery" title="Verified content discovery for humans and agents." copy="Explore is the public surface for connected sites, indexed content, creator profiles, activity signals, receipts, and reputation signals from the Nibgate widget and package." primaryCta={["Browse Explore", "/explore"]} secondaryCta={["Connect your site", "/get-started"]} cards={[["Verified sources", "Only connected domains can stream content into the hub, so discovery starts from source ownership."], ["Content cards", "Music, video, articles, and images can appear with prices, tags, creators, routes, receipts, and unlock signals."], ["Reputation layer", "Verified activity and future feedback can help people and AI agents understand which creators and resources are worth trusting."]]} />;
}
