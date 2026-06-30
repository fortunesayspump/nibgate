import InfoPage from "@/components/InfoPage";

export default function SecurityPage() {
  return <InfoPage eyebrow="Security" title="Verification before discovery, signed events after." copy="Nibgate only trusts content and activity from domains that prove ownership with the widget and continue reporting healthy verification checks." primaryCta={["Connect a site", "/dashboard/sites"]} secondaryCta={["Read quick start", "/quick-start"]} cards={[["Domain proof", "A site starts pending, receives a unique token, and becomes verified once the widget is visible on the origin."], ["Ongoing checks", "Verification health can be rechecked so stale or removed widgets do not stay trusted forever."], ["Event boundaries", "The widget and package send analytics signals. Private protected content stays on the creator's domain."]]} />;
}
