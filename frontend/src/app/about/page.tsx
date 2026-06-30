import InfoPage from "@/components/InfoPage";

export default function About() {
  return (
    <InfoPage
      eyebrow="Why Nibgate?"
      title="A verified discovery layer for creator-owned content."
      copy="Nibgate lets creators keep content on their own domains while making it discoverable, unlockable, measurable, and reputation-aware for humans and AI agents."
      primaryCta={["Start publishing", "/get-started"]}
      secondaryCta={["Explore content", "/explore"]}
      cards={[
        ["Creator-owned source", "The original site stays the source of truth. Nibgate verifies the domain instead of pulling creators into a closed marketplace."],
        ["Agent-readable discovery", "Public content metadata, routes, prices, types, and unlock signals can be indexed for people and autonomous agents."],
        ["Reputation from activity", "Trust should come from verified views, unlocks, receipts, referrals, and future feedback tied to real content interactions."],
      ]}
    />
  );
}
