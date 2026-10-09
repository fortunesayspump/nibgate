import InfoPage from "@/components/InfoPage";

export default function RoadmapPage() {
  return <InfoPage eyebrow="Roadmap" title="What Nibgate is building next." copy="Live: Arc mainnet (5042, real USDC) + testnet mirror, Nib Tips, onchain reputation, Dr. Nib research agent, SDK 0.4.34 / wallet 0.4.19, and the browser extension v1.0.1 in Chrome Web Store review." primaryCta={["Follow progress", "/blog"]} secondaryCta={["Contribute", "https://github.com/fortunesayspump/nibgate"]} cards={[["Now", "Store approval + staged rollout for the extension, mainnet-default flip, Dr. Nib app soak."], ["Next", "Richer receipts, better crawler checks, metered streaming/reading, agent quotas."], ["Later", "Stronger reputation proofs and deeper payment receipt integrations."]]} />;
}
