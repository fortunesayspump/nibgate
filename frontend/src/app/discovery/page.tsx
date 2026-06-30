import InfoPage from "@/components/InfoPage";

export default function DiscoveryPage() {
  return <InfoPage eyebrow="Discovery" title="Public discovery for creator-owned paid routes." copy="Explore is the public surface for verified sites, indexed content, creator profiles, and activity signals from the Nibgate widget and package." primaryCta={["Browse Explore", "/explore"]} secondaryCta={["Connect your site", "/get-started"]} cards={[["Verified sources", "Only connected domains should stream content into the hub."], ["Content cards", "Music, video, articles, and images can appear with prices, tags, creators, and unlock signals."], ["Agent-readable routes", "Public metadata can help humans and AI agents discover what can be unlocked."]]} />;
}
