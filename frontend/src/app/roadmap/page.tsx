import InfoPage from "@/components/InfoPage";

export default function RoadmapPage() {
  return <InfoPage eyebrow="Roadmap" title="What Nibgate is building next." copy="Live: Arc mainnet (5042, real USDC) + testnet mirror, Nib Tips, onchain reputation, Dr. Nib research agent, SDK 0.4.37 / wallet 0.4.27, and the browser extension v1.1.0 on the Chrome Web Store; v1.2.0 adds right-click Tip this page and is prepared for submission." primaryCta={["Follow progress", "/blog"]} secondaryCta={["Contribute", "https://github.com/fortunesayspump/nibgate"]} cards={[["Now", "Extension 1.2.0 submission + staged rollout, mainnet-default flip, Dr. Nib app soak."], ["Next", "Richer receipts, better crawler checks, metered streaming/reading, agent quotas."], ["Later", "Stronger reputation proofs and deeper payment receipt integrations."]]} />;
}
