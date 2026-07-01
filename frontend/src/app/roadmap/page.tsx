import InfoPage from "@/components/InfoPage";

export default function RoadmapPage() {
  return <InfoPage eyebrow="Roadmap" title="What Nibgate is building next." copy="The near-term focus is a clean creator dashboard, real backend ingestion, stable package APIs, verified Explore listings, and practical analytics for paid routes." primaryCta={["Follow progress", "/blog"]} secondaryCta={["Contribute", "https://github.com/fortunesayspump/nibgate"]} cards={[["Now", "Profiles, verified sites, content discovery, analytics, earnings, and Explore indexing."], ["Next", "Stable package release, richer receipts, better crawler checks, and cleaner setup docs."], ["Later", "More agent-readable routes, stronger reputation proofs, and deeper payment receipt integrations."]]} />;
}
