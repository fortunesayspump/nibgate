import InfoPage from "@/components/InfoPage";

export default function RoadmapPage() {
  return <InfoPage eyebrow="Roadmap" title="What Nibgate is building next." copy="Live: Arc mainnet (5042, real USDC) + testnet mirror, Nib Tips, onchain reputation, Dr. Nib funded research on both networks, SDK 0.4.40 / wallet 0.4.31, and the browser extension v1.2.0 on the Chrome Web Store with right-click Tip this page." primaryCta={["Follow progress", "/blog"]} secondaryCta={["Contribute", "https://github.com/fortunesayspump/nibgate"]} cards={[["Now", "Live tip and paid-source flow verification, plus Dr. Nib app soak."], ["Next", "Richer receipts, better crawler checks, metered streaming/reading, agent quotas."], ["Later", "Stronger reputation proofs and deeper payment receipt integrations."]]} />;
}
