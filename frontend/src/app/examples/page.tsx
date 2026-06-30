import InfoPage from "@/components/InfoPage";

export default function ExamplesPage() {
  return <InfoPage eyebrow="Examples" title="Patterns for creators, builders, and agents." copy="Use Nibgate for paid articles, private media, downloadable files, paid APIs, gated tools, and agent-readable unlock routes." primaryCta={["Explore examples", "/explore"]} secondaryCta={["Start building", "/get-started"]} cards={[["Paid writing", "Publish premium posts, essays, reports, and newsletters."], ["Media drops", "Sell image sets, music, videos, and behind-the-scenes files."], ["Agent routes", "Expose paid endpoints or resources that AI agents can discover and unlock."]]} />;
}
