import Link from "next/link";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

const steps = [
  ["1", "Connect wallet", "Your wallet becomes the creator identity for profiles, sites, contents, analytics, and earnings."],
  ["2", "Register the site", "Add the origin where your protected content lives. Nibgate creates a site id and verification token."],
  ["3", "Paste the widget", "One script proves ownership and streams page activity from the verified domain."],
  ["4", "Install the package", "Use npm install @nibgate/sdk to gate routes, define prices, and send content plus unlock events."],
];

const dashboardItems = [
  ["Profile", "Your public creator identity, socials, avatar, and connected wallet."],
  ["Sites", "Verified domains, widget health, setup instructions, and removal flow."],
  ["Contents", "Music, video, article, and image entries discovered from verified sites."],
  ["Analytics", "Views, unlocks, sources, timelines, and content-level performance."],
  ["Earnings", "Payment receipts, receiver addresses, revenue trends, and unlock history."],
  ["Explore", "The public discovery and reputation layer for verified paid content and agent-readable routes."],
];

export default function GetStartedPage() {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="relative flex flex-col items-center justify-center bg-gray px-8 pb-20 pt-16 text-center md:pb-24 md:pt-20 lg:px-[4vw] lg:pb-36 lg:pt-28">
          <div className="flex max-w-4xl flex-col items-center gap-8 lg:gap-10">
            <div className="text-xl md:text-2xl">Get started</div>
            <h1 className="nibgate-display-title text-5xl font-medium md:text-6xl lg:text-8xl">
              Connect your site. Gate your work. Show up in verified discovery.
            </h1>
            <p className="max-w-3xl text-xl leading-8 md:text-2xl md:leading-9">
              Nibgate starts on your own domain. Add the widget for verification, install the package for paid routes, and let your dashboard collect content, analytics, earnings, and reputation signals.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button type="button" data-wallet-connect className="nibgate-soft-cta border-none cursor-pointer">Connect wallet</button>
              <Link href="/dashboard/sites" className="nibgate-soft-cta nibgate-soft-cta-secondary">Connect a site</Link>
            </div>
          </div>
        </section>

        <section className="bg-gray px-8 pb-24 md:px-12 md:pb-32">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {steps.map(([number, title, copy]) => (
                <article key={number} className="border border-dark-gray/50 bg-white p-6 md:p-8">
                  <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-full bg-black text-lg font-medium text-white">{number}</div>
                  <h2 className="text-3xl font-medium leading-none md:text-4xl">{title}</h2>
                  <p className="mt-5 text-lg leading-8">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col overflow-hidden border-y lg:flex-row">
          <div className="flex items-center justify-center bg-gray p-8 py-16 sm:p-12 md:p-16 lg:w-1/2 xl:p-32">
            <div className="w-full max-w-2xl border border-dark-gray/50 bg-white p-6 md:p-8">
              <div className="mb-5 text-lg font-medium">Install and verify</div>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-none bg-black p-6 font-mono text-sm leading-7 text-white md:text-base">{`npm install @nibgate/sdk

<script async src="https://nibgate.xyz/widget.js"
  data-nibgate-site="site_..."
  data-nibgate-token="ngv_...">
</script>`}</pre>
              <p className="mt-6 text-lg leading-8">
                The widget verifies ownership. The package powers gating, pricing, unlock events, and content metadata from the app that owns the content.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center bg-black p-8 py-16 text-white sm:p-12 md:p-16 lg:w-1/2 xl:p-32">
            <div className="max-w-2xl space-y-12 md:space-y-16">
              <div className="space-y-4">
                <h2 className="text-3xl font-medium lg:text-4xl xl:text-5xl">Keep ownership on your domain</h2>
                <p className="text-lg lg:text-xl xl:text-2xl">Nibgate does not move your work into a marketplace. Your site stays the source of truth.</p>
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl font-medium lg:text-4xl xl:text-5xl">Send public signals to the hub</h2>
                <p className="text-lg lg:text-xl xl:text-2xl">Verified content, page activity, unlocks, and receipts become readable in your dashboard and Explore.</p>
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl font-medium lg:text-4xl xl:text-5xl">Let humans and agents discover it</h2>
                <p className="text-lg lg:text-xl xl:text-2xl">Music, video, article, image, and agent-readable paid routes can become searchable once verified.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gray px-8 py-20 md:px-12 md:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
              <div>
                <div className="text-xl md:text-2xl">Dashboard flow</div>
                <h2 className="mt-5 max-w-4xl text-5xl font-medium leading-none md:text-6xl lg:text-7xl">What fills in after setup</h2>
              </div>
              <Link href="https://docs.nibgate.xyz" className="nibgate-soft-cta nibgate-soft-cta-secondary">Read docs</Link>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {dashboardItems.map(([title, copy]) => (
                <article key={title} className="border border-dark-gray/50 bg-white p-6 md:p-8">
                  <h3 className="text-3xl font-medium">{title}</h3>
                  <p className="mt-4 text-lg leading-8">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col items-center justify-center gap-8 bg-gray px-8 py-16 text-center lg:gap-16 lg:px-[4vw] lg:py-24">
          <h2 className="text-4xl font-medium sm:text-5xl lg:text-7xl">
            Start with one verified site. <br /> Grow into a full creator hub.
          </h2>
          <Link className="nibgate-soft-cta" href="/dashboard/sites">Open site setup</Link>
        </section>
      </main>
      <Footer showThemeToggle={true} />
    </div>
  );
}
