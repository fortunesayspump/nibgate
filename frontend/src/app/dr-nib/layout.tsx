import Header from "@/components/Header";
import DrNibShell from "@/components/dr-nib/DrNibShell";

// Availability is per-deployment, via env — no code change needed to pull the
// app off a stack:
//
//   NEXT_PUBLIC_DRNIB_ENABLED=false  renders the notice below instead of the app.
//   Unset (or any other value)      means on.
//
// Mainnet and testnet Vercel projects toggle independently: flip the value on
// that project and redeploy. Testnet runs are testnet-funded staging; the
// backend's own network is what moves money, and run budgets gate every run
// on either stack.
const enabled = (() => {
  const raw = String(process.env.NEXT_PUBLIC_DRNIB_ENABLED ?? "").trim().toLowerCase();
  return raw === "" || !["0", "false", "no", "off", "disabled"].includes(raw);
})();

export default function DrNibLayout({ children }: { children: React.ReactNode }) {
  if (!enabled) {
    return (
      <>
        <Header />
        <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-6 py-20 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] opacity-60">Dr. Nib</p>
          <h1 className="mt-3 text-3xl font-medium md:text-4xl">Dr. Nib is currently unavailable here</h1>
          <p className="mt-4 text-sm leading-7 opacity-70">
            The app has been switched off on this network by its operators. Nothing
            about your projects changed — they resume where they left off when it returns.
          </p>
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
