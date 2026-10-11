import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function ClaimPendingTipsGuidePage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray">
      <Header />
      <main className="flex-1 px-6 py-16 md:px-10 lg:px-[4vw]">
        <section className="mx-auto max-w-3xl">
          <p className="text-xl font-medium">Nib Tips</p>
          <h1 className="nibgate-display-title mt-4 text-5xl font-medium md:text-7xl">Claim tips for your site.</h1>
          <p className="mt-6 text-lg leading-8 opacity-75">
            Tips stay in the site&apos;s holding box until its owner claims them. Checking is public; releasing funds requires verified site ownership.
          </p>

          <ol className="mt-8 space-y-4">
            {[
              ["Connect your site", "Open the creator dashboard and add the exact domain that received the tips."],
              ["Verify ownership", "Follow the setup instructions to add the Nibgate widget to your site, deploy it, and verify the domain."],
              ["Claim the pending tips", "On the verified site card, choose Claim tips. The claim releases the held balance to the wallet linked to your creator account, after the protocol fee."],
            ].map(([title, description], index) => (
              <li key={title} className="flex gap-4 rounded-2xl border p-5" style={{ borderColor: "var(--nib-border-soft)", backgroundColor: "var(--nib-surface)" }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-sm font-medium text-white">{index + 1}</span>
                <div>
                  <h2 className="font-medium">{title}</h2>
                  <p className="mt-1 text-sm leading-6 opacity-70">{description}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard/sites" className="inline-flex rounded-full bg-black px-6 py-3 text-sm font-medium text-white no-underline hover:bg-black/80">
              Open creator dashboard
            </Link>
            <Link href="/pending-tips" className="inline-flex rounded-full border px-6 py-3 text-sm font-medium no-underline" style={{ borderColor: "var(--nib-border-soft)" }}>
              Back to pending tip checker
            </Link>
          </div>

          <p className="mt-6 text-sm leading-6 opacity-60">
            Mainnet and testnet tips are separate. Claim each balance from the matching network&apos;s dashboard; testnet tips use test USDC.
          </p>
        </section>
      </main>
      <Footer showThemeToggle />
    </div>
  );
}
