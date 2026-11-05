import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function LedgerPage() {
  return <div className="bg-gray min-h-screen flex flex-col"><Header /><main className="flex-1 px-6 py-16 md:px-10 lg:px-[4vw]"><section className="mx-auto max-w-7xl"><p className="text-xl font-medium">Ledger</p><h1 className="nibgate-display-title mt-4 max-w-4xl text-5xl font-medium md:text-7xl">Network activity.</h1><p className="mt-6 max-w-3xl text-xl leading-8 opacity-75">The activity feed is temporarily unavailable while the migration is completed.</p></section></main><Footer /></div>;
}
