import Link from "next/link";

export default function Features() {
  return (
    <section className="bg-gray">
      <div className="px-8 pb-24 pt-20 md:px-12 md:pb-32 md:pt-24">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-start gap-7 text-left md:items-center md:text-center">
            <div className="text-lg font-medium lg:text-xl">Creator-owned payments</div>
            <h2 className="text-4xl font-medium md:text-5xl lg:text-6xl">
              Sell protected work from the site you already own
            </h2>
            <div className="max-w-3xl text-lg md:text-2xl lg:leading-10 xl:text-3xl">
              Nibgate gives paid writing, media, files, and agent routes a clean unlock flow without
              turning your website into someone else&apos;s marketplace.
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden lg:flex-row">
        <div className="flex items-center justify-center bg-gray p-8 py-16 sm:p-12 md:p-16 lg:w-1/2 lg:order-2 xl:p-32">
          <div className="relative max-w-xl">
            <img className="h-auto w-full" alt="Paid content illustration" src="/illustrations/undraw/posts.svg" />
          </div>
        </div>
        <div className="flex items-center justify-center bg-black p-8 py-16 text-white sm:p-12 md:p-16 lg:w-1/2 xl:p-32">
          <div className="max-w-2xl space-y-12 md:space-y-16">
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Protect the route</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Pick the article, download, video, song, image, or API route that should unlock after payment.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Keep the source of truth</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Your content stays on your domain. Nibgate handles the gateway around it.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Let the page stay yours</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Use your existing layout, brand, analytics, and publishing workflow.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden bg-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-8 py-16 md:px-12 lg:grid-cols-2 lg:items-center lg:py-24">
          <div className="flex items-center justify-center">
            <img className="h-auto w-full max-w-md" alt="Widget tracking illustration" src="/illustrations/undraw/user-flow.svg" />
          </div>
          <div className="max-w-xl space-y-8">
            <h2 className="text-4xl font-medium sm:text-5xl lg:text-7xl">Publish once. Show up in discovery.</h2>
            <p className="text-xl md:text-2xl">
              A small widget lets Nibgate verify your domain and receive page, content, unlock, and revenue events while the paid payload stays private.
            </p>
            <Link className="nibgate-soft-cta" href="/explore">
              Open explore
            </Link>
          </div>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden lg:flex-row">
        <div className="flex items-center justify-center bg-gray p-8 py-16 sm:p-12 md:p-16 lg:w-1/2 xl:p-32">
          <div className="relative max-w-xl">
            <img className="h-auto w-full" alt="Payments illustration" src="/illustrations/undraw/payments.svg" />
          </div>
        </div>
        <div className="flex items-center justify-center bg-black p-8 py-16 text-white sm:p-12 md:p-16 lg:w-1/2 xl:p-32">
          <div className="max-w-2xl space-y-12 md:space-y-16">
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Take Arc payments</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Use x402-friendly payment gates on Arc testnet for people, agents, and paid routes.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Ship with the package</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Install the library, map your protected paths, and test the Arc unlock flow locally.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Grow into the app</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Creators can later view routes, performance, and discovery signals in the Nibgate app.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-8 bg-white px-8 py-16 text-center lg:px-[4vw] lg:py-24 lg:gap-16">
        <h2 className="text-4xl font-medium sm:text-5xl lg:text-6xl">
          Start with one paid route.<br />Grow from there.
        </h2>
        <p className="max-w-2xl text-xl md:text-2xl">
          Run the first demo on Arc testnet, then stream the same protected content activity into discovery.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link className="nibgate-soft-cta" href="/get-started">
            Get started
          </Link>
          <Link className="nibgate-soft-cta" href="/features">
            See features
          </Link>
        </div>
      </div>
    </section>
  );
}
