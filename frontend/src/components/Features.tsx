import Link from "next/link";

export default function Features() {
  return (
    <section className="bg-gray">
      <div className="px-8 pb-24 pt-20 md:px-12 md:pb-32 md:pt-24">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-start gap-7 text-left md:items-center md:text-center">
            <div className="text-lg font-medium lg:text-xl">Package-powered paid content</div>
            <h2 className="text-4xl font-medium md:text-5xl lg:text-6xl">
              Protect work from the site you already own
            </h2>
            <div className="max-w-3xl text-lg md:text-2xl lg:leading-10 xl:text-3xl">
              Nibgate gives creator-owned articles, media, files, and agent-readable routes a clean
              package layer for one-time unlocks now, receipts, analytics, and discovery.
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
                Pick the article, download, video, song, image, or API route that should unlock after verified payment.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Keep the source of truth</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Your content stays on your domain. The package enforces access and reports public metadata to the hub.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Let the page stay yours</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Use your existing layout, brand, payment receiver, analytics, and publishing workflow.
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
              One widget verifies your domain and receives page, content, unlock, and receipt events while the paid payload stays private.
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
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Verify real receipts</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Use x402-friendly payment challenges with Circle Gateway or Arc testnet receipt metadata for MVP one-time unlocks.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Ship with the package</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Install `nibgate`, map protected paths, and issue one-time unlock tokens only after your payment layer verifies access.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="text-3xl font-medium text-white lg:text-4xl xl:text-5xl">Grow into the app</h3>
              <p className="text-lg lg:text-xl xl:text-2xl">
                Creators can view verified sites, content performance, payment records, and reputation signals in the hub.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-8 bg-white px-8 py-16 text-center lg:px-[4vw] lg:py-24 lg:gap-16">
        <h2 className="text-4xl font-medium sm:text-5xl lg:text-6xl">
          Start with one protected route.<br />Grow into discovery.
        </h2>
        <p className="max-w-2xl text-xl md:text-2xl">
          Install the package, verify the site, then stream protected content activity into the hub.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link className="nibgate-soft-cta" href="/get-started">
            Get started
          </Link>
        </div>
      </div>
    </section>
  );
}
