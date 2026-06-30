import InfoPage from "@/components/InfoPage";

export default function CookiesPage() {
  return <InfoPage eyebrow="Cookie policy" title="Small bits of browser state for a smoother hub." copy="Nibgate may use cookies or local storage for wallet connection state, preferences, theme, and basic product analytics." primaryCta={["Privacy policy", "/privacy"]} secondaryCta={["Contact", "mailto:hello@nibgate.xyz"]} cards={[["Preferences", "Theme and UI state can be saved locally."], ["Wallet sessions", "Wallet tooling may store connection state so creators do not reconnect every page load."], ["Product analytics", "Operational metrics help us understand whether setup, Explore, and dashboard flows are working."]]} />;
}
