import Link from "next/link";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

const SECTIONS: Array<[string, string]> = [
  [
    "What the extension accesses",
    "Active tab and page content: title, author, canonical URL, and on-page wallet signals, used only to identify the content and resolve the creator. Site access is optional and granted at runtime when you tap 'Enable on all sites' — you can revoke it any time from chrome://extensions. Storage: tip history, network preference (testnet/mainnet), and theme. API host access is limited to Nibgate hosts (testnet-api.nibgate.xyz, api.nibgate.xyz).",
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
];

export default function ExtensionPrivacyPage() {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 px-6 py-14 md:py-20">
        <article className="mx-auto max-w-2xl">
          <p className="text-sm font-medium tracking-wide opacity-70">Nibgate extension · Privacy</p>
          <h1 className="mt-3 text-4xl font-medium leading-tight md:text-5xl">
            Your keys stay on your device.
          </h1>
          <p className="mt-5 text-lg leading-8 opacity-80">
            The Nibgate browser extension is a self-custodial tipping wallet. It
            reads the page you are on to find tippable content, and it never
            sells data, runs remote code, or tracks you across the web.
          </p>
          <hr className="my-10 border-dark-gray/30" />
          {SECTIONS.map(([title, copy]) => (
            <section key={title} className="mb-10">
              <h2 className="text-2xl font-medium">{title}</h2>
              <p className="mt-3 text-lg leading-8 opacity-80">{copy}</p>
            </section>
          ))}
          <hr className="my-10 border-dark-gray/30" />
          <div className="flex flex-wrap gap-4 text-lg">
            <a href="mailto:hello@nibgate.xyz" className="underline underline-offset-4">
              Contact us
            </a>
            <Link href="/privacy" className="underline underline-offset-4">
              Read site privacy
            </Link>
          </div>
        </article>
      </main>
      <Footer showThemeToggle={true} />
    </div>
  );
}
