import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";

// Event-time visibility is not proven. Do not render historical data, including
// cached responses from earlier API versions, based on current public status.
export default function LeaderboardsPage() {
  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 px-6 py-16 md:px-10 lg:px-[4vw]">
        <section className="mx-auto max-w-7xl">
          <p className="text-xl font-medium">Leaderboards</p>
          <h1 className="nibgate-display-title mt-4 max-w-4xl text-5xl font-medium md:text-7xl">Reputation rankings.</h1>
          <p role="status" className="mt-6 max-w-3xl text-xl leading-8 opacity-75">Historical rankings are unavailable because we cannot establish whether content was public when the activity and ratings occurred.</p>
          <p className="mt-4 max-w-3xl opacity-75">A public listing today does not establish that earlier activity was public. This does not mean there was no activity.</p>
          <Link href="/explore" className="mt-6 inline-block underline">Browse current public articles</Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
