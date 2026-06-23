import Link from "next/link";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function GetStartedPage() {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <div className="flex-1">
        <section className="bg-gray px-8 py-20 md:py-28 lg:px-[4vw]">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div className="space-y-8">
          <div className="text-xl font-medium">Connect your site</div>
          <h1 className="max-w-3xl text-6xl font-medium leading-none md:text-7xl lg:text-8xl">Install the package, protect a route, and publish to Explore.</h1>
          <p className="max-w-2xl text-xl leading-8 md:text-2xl md:leading-9">Nibgate starts on your own domain. Connect a wallet, expose a route manifest, and let people unlock paid content without moving your work into a marketplace.</p>
          <div className="flex flex-wrap gap-4">
            <button type="button" data-wallet-connect className="nibgate-soft-cta border-none cursor-pointer">Connect wallet</button>
            <Link href="/features" className="nibgate-soft-cta nibgate-soft-cta-secondary">View features</Link>
          </div>
        </div>
        <div className="grid gap-4">
          {[
            ['1', 'Install Nibgate', 'Run npm install nibgate in the project that owns your content.'],
            ['2', 'Define paid routes', 'Choose writing, media, downloads, or agent-readable endpoints and set the price.'],
            ['3', 'Verify ownership', 'Publish the manifest and verification file from your own domain.'],
            ['4', 'Appear in Explore', 'Send signed popularity and unlock events so the public hub can reflect what is live.']
          ].map(([step, title, copy], index) => (
            <article key={index} className="bg-white p-6 md:p-8">
              <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black text-white text-lg font-medium">{step}</div>
              <h2 className="mb-3 text-3xl font-medium md:text-4xl">{title}</h2>
              <p className="text-lg leading-8">{copy}</p>
            </article>
          ))}
        </div>
      </div>
        </section>
      </div>
      <Footer showThemeToggle={true} />
    </div>
  );
}
