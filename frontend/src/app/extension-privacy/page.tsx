import InfoPage from "@/components/InfoPage";

export default function ExtensionPrivacyPage() {
  return (
    <InfoPage
      eyebrow="Nibgate extension · Privacy"
      title="Your keys stay on your device."
      copy="The Nibgate browser extension is a self-custodial tipping wallet. It reads the page you are on to find tippable content, and it never sells data, runs remote code, or tracks you across the web."
      primaryCta={["Contact us", "mailto:hello@nibgate.xyz"]}
      secondaryCta={["Read site privacy", "/privacy"]}
      sections={[
        [
          "What the extension accesses",
          "Active tab and page content: title, author, canonical URL, and on-page wallet signals, used only to identify the content and resolve the creator. Storage: tip history, network preference (testnet/mainnet), and theme. Host access is limited to Nibgate API hosts (testnet-api.nibgate.xyz, api.nibgate.xyz) plus the page you are viewing.",
        ],
        [
          "What stays on your device",
          "Your recovery phrase and private keys are encrypted with your password and never leave the device. Page content is processed to resolve a tip and is not stored or sold. There is no advertising SDK, no cross-site tracker, and no remote code execution.",
        ],
        [
          "What leaves the device",
          "Tip requests (content URL, title, amount, recipient) go to the Nibgate hub to build challenges and verify on-chain payments. USDC transfers settle on Arc / Arc Testnet and are public on-chain like any crypto payment.",
        ],
        [
          "Networks",
          "Testnet is the default and uses play money (faucet USDC). Mainnet is an explicit confirm-gated toggle in Settings and spends real USDC. You can switch back at any time.",
        ],
        [
          "Questions or deletion",
          "Email hello@nibgate.xyz for privacy questions or support. Uninstalling the extension removes its local storage; on-chain tip records remain public by nature of the blockchain.",
        ],
      ]}
    />
  );
}
