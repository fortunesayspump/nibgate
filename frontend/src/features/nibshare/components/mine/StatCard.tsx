"use client";

export function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border p-4 bg-white/40 flex flex-col gap-1 min-w-[140px]">
      <span className="text-[10px] uppercase tracking-wide text-[#6b6b6b]">{label}</span>
      <span className="text-2xl font-bold" style={{ color: accent || "#222" }}>{value}</span>
    </div>
  );
}
