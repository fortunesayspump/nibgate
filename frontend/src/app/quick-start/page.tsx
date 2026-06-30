import InfoPage from "@/components/InfoPage";

export default function QuickStartPage() {
  return <InfoPage eyebrow="Quick start" title="Four steps from site to public paid route." copy="Connect a wallet, register the domain, paste the widget, then let the package send content and unlock activity from your own application." primaryCta={["Open full quick start", "https://docs.nibgate.xyz/quick-start"]} secondaryCta={["Open setup", "/get-started"]} cards={[["1. Connect wallet", "Your wallet creates or resumes the creator profile."], ["2. Register domain", "The dashboard creates a site id and verification token."], ["3. Paste widget", "The script proves ownership and streams page/content activity."], ["4. Publish content", "The package gates routes and reports unlocks for analytics and earnings."]]} />;
}
