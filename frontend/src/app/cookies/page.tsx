import InfoPage from "@/components/InfoPage";
import { CookieResetButton } from "@/components/CookieConsent";

export default function CookiesPage() {
  return (
    <>
      <InfoPage eyebrow="Cookie policy" title="Small bits of browser state for a smoother hub." copy="Nibgate may use cookies or local storage for wallet connection state, preferences, theme, and basic product analytics." primaryCta={["Privacy policy", "/privacy"]} secondaryCta={["Contact", "mailto:hello@nibgate.xyz"]} cards={[["Preferences", "Theme and UI state can be saved locally."], ["Wallet sessions", "Wallet tooling may store connection state so creators do not reconnect every page load."], ["Product analytics", "Operational metrics help us understand whether setup, Explore, and dashboard flows are working."]]} />
      <div className="mx-auto max-w-2xl px-4 pb-10">
        <p className="text-sm font-medium">Your choice</p>
        <p className="mt-1 text-sm opacity-70">Essential cookies (sign-in, theme, wallet) are always on. Analytics are optional and off unless you accepted them.</p>
        <CookieResetButton />
      </div>
    </>
  );
}
