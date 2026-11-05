import InfoPage from "@/components/InfoPage";

export default function DiscoveryPage() {
  return <InfoPage eyebrow="Discovery" title="Verified content discovery for humans and agents." copy="Explore is temporarily unavailable while we restore discovery." secondaryCta={["Connect your site", "/get-started"]} cards={[["Verified sources", "Only connected domains can stream content into the hub, so discovery starts from source ownership."], ["Content cards", "Music, video, articles, images, and documents can appear with prices, tags, creators, routes, receipts, and unlock signals."], ["Reputation layer", "Accepted onchain content ratings power creator, site, and content leaderboards — verified activity people and AI agents can trust."]]} />;
}
