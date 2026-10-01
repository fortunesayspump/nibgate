"use client";

import { PageHeader } from "@/components/dr-nib/common";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Dr. Nib"
        title="Settings"
        desc="Spending and run defaults."
      />

      <section className="rounded-2xl border border-dark-gray/50 bg-white p-5">
        <p className="font-medium">How budgets work</p>
        <p className="mt-2 text-sm leading-7 opacity-70">
          Every research prepays its own budget — you set the cap while
          configuring the run, and it is held for the run. Searches, fetches,
          scoring, and writing draw that balance down stage by stage, and a
          1% platform fee is taken as it goes.
        </p>
        <p className="mt-2 text-sm leading-7 opacity-70">
          When the run ends, whatever is left returns immediately. The run
          pauses instead of overspending; raise the cap to let it continue.
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
        <p className="font-medium">Models and tools</p>
        <p className="mt-2 text-sm leading-7 opacity-70">
          The model and every research tool — search, scraping, document
          parsing, code execution — are provided by Nibgate and covered by the
          run budget. There are no keys to add, here or anywhere.
        </p>
      </section>
    </div>
  );
}
