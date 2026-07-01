import Link from "next/link";
import { Suspense } from "react";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SigninFlow from "@/components/SigninFlow";

export default function SigninPage() {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <div className="flex-1">
        <section className="bg-gray px-8 py-20 md:py-28 lg:px-[4vw]">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-8">
          <div className="text-xl font-medium">Wallet identity</div>
          <h1 className="nibgate-display-title max-w-3xl text-6xl font-medium md:text-7xl lg:text-8xl">Connect a wallet to manage what people unlock.</h1>
          <p className="max-w-2xl text-xl leading-8 md:text-2xl md:leading-9">Nibgate will use your wallet as the creator identity for connected sites, Arc testnet payment setup, route analytics, and Explore presence.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/get-started" className="nibgate-soft-cta">Connect your site</Link>
            <Link href="/explore" className="nibgate-soft-cta nibgate-soft-cta-secondary">Browse Explore</Link>
          </div>
        </div>
        <div className="nibgate-signin-panel bg-black p-6 text-white md:p-8 rounded-2xl">
          <Suspense fallback={<div className="bg-white/10 p-6 rounded-xl text-white/70">Loading wallet sign-in...</div>}>
            <SigninFlow />
          </Suspense>
        </div>
      </div>
        </section>
      </div>
      <Footer showThemeToggle={true} />
    </div>
  );
}
