import Header from "@/components/Header";
import DrNibShell from "@/components/dr-nib/DrNibShell";
import { activeNetworkName } from "@/lib/api";

// Dr. Nib is mainnet-only on purpose. Every run spends real money — model
// calls, JEV decisions, and source retrieval, all paid by Nibgate's own keys —
// and the payer funds it in USDC. On testnet that USDC is free, so exposing
// Dr. Nib there would be an open faucet for real compute. Testnet builds show
// a clear notice instead of the app, never a broken page.
export default function DrNibLayout({ children }: { children: React.ReactNode }) {
  if (activeNetworkName() !== "mainnet") {
    return (
      <>
        <Header />
        <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-20 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] opacity-60">Dr. Nib</p>
          <h1 className="mt-3 text-3xl font-medium md:text-4xl">Dr. Nib runs on mainnet</h1>
          <p className="mt-4 text-sm leading-7 opacity-70">
            Every research run spends real money — model calls, decisions, and source retrieval — and
            the payer funds it in USDC. Because testnet USDC is free, offering Dr. Nib here would be an
            open faucet for real compute, so it lives on the mainnet hub only.
          </p>
          <a
            href="https://nibgate.xyz/dr-nib"
            className="mx-auto mt-8 inline-block bg-black px-6 py-3 text-sm font-medium text-white"
          >
            Open Dr. Nib on mainnet
          </a>
        </main>
      </>
    );
  }
  return (
    <>
      <Header />
      <DrNibShell>{children}</DrNibShell>
    </>
  );
}
