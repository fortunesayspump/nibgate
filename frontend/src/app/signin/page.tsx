import Link from "next/link";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function SigninPage() {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <div className="flex-1">
        <section className="bg-gray px-8 py-20 md:py-28 lg:px-[4vw]">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-8">
          <div className="text-xl font-medium">Wallet identity</div>
          <h1 className="max-w-3xl text-6xl font-medium leading-none md:text-7xl lg:text-8xl">Connect a wallet to manage what people unlock.</h1>
          <p className="max-w-2xl text-xl leading-8 md:text-2xl md:leading-9">Nibgate will use your wallet as the creator identity for site manifests, Arc testnet payment setup, route analytics, and Explore presence.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/get-started" className="nibgate-soft-cta">Connect your site</Link>
            <Link href="/explore" className="nibgate-soft-cta nibgate-soft-cta-secondary">Browse Explore</Link>
          </div>
        </div>
        <div className="nibgate-signin-panel bg-black p-6 text-white md:p-8 rounded-2xl">
          <div className="nibgate-signin-panel-inner space-y-5 bg-white/10 p-6 rounded-xl">
            <div className="space-y-2">
              <p className="text-sm font-medium uppercase tracking-[0.08em] text-white/70">Creator wallet</p>
              <p className="text-xl leading-8 text-white">Connect the wallet that should own your Nibgate creator profile.</p>
            </div>
            <button className="w-full bg-white text-black px-5 py-4 text-lg font-medium rounded-lg cursor-pointer hover:bg-gray-200 transition-colors" type="button" data-wallet-connect>Connect wallet</button>
            <p className="text-sm leading-6 text-white/70" data-wallet-status>Use a wallet-enabled browser. Full creator dashboard actions will unlock after wallet identity is connected.</p>
          </div>
        </div>
      </div>
        </section>
      </div>
      <Footer showThemeToggle={true} />
    </div>
  );
}
