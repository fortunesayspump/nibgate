import InfoPage from "@/components/InfoPage";

export default function InstallPage() {
  return <InfoPage eyebrow="Install package" title="Install one package in the site that owns your content." copy="Use npm install @nibgate/sdk, wire protected resources in your app, and pair it with the widget so Nibgate can verify and index public metadata." primaryCta={["Open install docs", "https://docs.nibgate.xyz/install-package"]} secondaryCta={["GitHub", "https://github.com/fortunesayspump/nibgate"]} cards={[["Gating", "Define which resources require unlocks and what each route costs."], ["Payments", "Keep receiver configuration in the creator's own site package."], ["Metrics bridge", "Send content, view, unlock, and receipt events to the Nibgate backend."]]} />;
}
