"use client";

import PrivateResearch from "@/components/dr-nib/PrivateResearch";

// The Dr. Nib research experience is private by default: every run is a
// confidential source-only research pass against the broker-only worker.
export default function ResearchPage() {
  return <PrivateResearch />;
}
