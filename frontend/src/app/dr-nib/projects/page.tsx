"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { drNibApi } from "@/lib/dr-nib-api";
import { PageHeader, ProjectCard } from "@/components/dr-nib/common";

const ACTIVE = ["draft", "intake", "intake-done", "planning", "planned", "running", "paused", "awaiting"];
const ENDED = ["complete", "failed", "ended"];
// Only settled projects (or ones that never held money) can be deleted. Paused
// still holds funds and a queue job, so it has to be ended first.
const DELETABLE = ["ended", "complete", "failed", "draft", "intake", "intake-done"];

const hrefFor = (r: any) =>
  ["draft", "intake", "intake-done"].includes(r.status) ? `/dr-nib/research?project=${r.id}` : `/dr-nib/research/${r.id}`;

const daysLeft = (deletedAt: string) =>
  Math.max(0, Math.ceil((new Date(deletedAt).getTime() + 7 * 864e5 - Date.now()) / 864e5));

export default function ProjectsPage() {
  const [runs, setRuns] = useState<any[] | null>(null);
  const [trash, setTrash] = useState<any[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [active, deleted] = await Promise.all([drNibApi.listRuns(false), drNibApi.listRuns(true)]);
      setRuns(active.runs || []);
      setTrash(deleted.runs || []);
    } catch {
      setRuns([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    setBusyId(id);
    try { await drNibApi.deleteRun(id); await load(); } catch { /* surfaced by reload */ }
    finally { setBusyId(null); }
  }

  async function restore(id: string) {
    setBusyId(id);
    try { await drNibApi.restoreRun(id); await load(); } catch { /* surfaced by reload */ }
    finally { setBusyId(null); }
  }

  const q = query.trim().toLowerCase();
  const matches = (r: any) => !q || String(r.brief?.topic || r.title || "").toLowerCase().includes(q);
  const active = (runs || []).filter((r) => ACTIVE.includes(r.status) && matches(r));
  const ended = (runs || []).filter((r) => ENDED.includes(r.status) && matches(r));

  return (
    <div>
      <PageHeader
        eyebrow="Dr. Nib"
        title="Projects"
        desc="Active runs you can open · ended runs stay as history."
        action={
          <div className="flex gap-3">
            <button onClick={() => setShowTrash((v) => !v)} className="rounded-full border border-dark-gray/50 px-5 py-3 font-medium transition hover:bg-black hover:text-white">
              {showTrash ? "Back to projects" : `Deleted (${trash.length})`}
            </button>
            <Link href="/dr-nib/research" className="rounded-full bg-black px-6 py-3 font-medium text-white transition hover:-translate-y-0.5 hover:bg-black/85">New project</Link>
          </div>
        }
      />

      {runs === null ? (
        <p className="text-sm opacity-60">Loading projects…</p>
      ) : showTrash ? (
        <>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider opacity-60">Deleted ({trash.length})</p>
          {trash.length === 0 ? (
            <p className="text-sm opacity-60">Trash is empty. Deleted projects are restored from here for 7 days, then cleared.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {trash.map((r) => (
                <div key={r.id}>
                  <div className="opacity-70"><ProjectCard r={r} /></div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs opacity-60">{r.deletedAt ? `Clears in ${daysLeft(r.deletedAt)} day(s)` : "Deleted"}</span>
                    <button onClick={() => restore(r.id)} disabled={busyId === r.id} className="border border-dark-gray/60 px-4 py-1.5 text-sm font-medium hover:bg-black hover:text-white disabled:opacity-50">
                      {busyId === r.id ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-5">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects…"
              className="w-full border border-dark-gray/50 bg-white rounded-xl px-3 py-2 text-sm outline-none" />
          </div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider opacity-60">Active ({active.length})</p>
          {active.length === 0 ? (
            <p className="mb-5 text-sm opacity-60">{q ? "No active matches." : "Nothing running. Start one from Research."}</p>
          ) : (
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              {active.map((r) => <ProjectRow key={r.id} r={r} busy={busyId === r.id} onDelete={remove} />)}
            </div>
          )}
          <p className="mb-2 text-xs font-medium uppercase tracking-wider opacity-60">Ended ({ended.length})</p>
          {ended.length === 0 ? (
            <p className="text-sm opacity-60">{q ? "No ended matches." : "No finished runs yet."}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {ended.map((r) => <ProjectRow key={r.id} r={r} busy={busyId === r.id} onDelete={remove} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProjectRow({ r, busy, onDelete }: { r: any; busy: boolean; onDelete: (id: string) => void }) {
  const deletable = DELETABLE.includes(r.status);
  return (
    <div>
      <Link href={hrefFor(r)} className="no-underline"><ProjectCard r={r} /></Link>
      <div className="mt-2 flex items-center justify-between">
        <Link href={hrefFor(r)} className="text-sm opacity-70 hover:opacity-100">
          {["intake", "intake-done", "draft"].includes(r.status) ? "Continue intake →" : "Open →"}
        </Link>
        {deletable ? (
          <button onClick={() => onDelete(r.id)} disabled={busy} className="border border-dark-gray/60 px-4 py-1.5 text-sm font-medium hover:bg-[#a33b2e] hover:text-white disabled:opacity-50">
            {busy ? "Deleting…" : "Delete"}
          </button>
        ) : (
          <span className="text-xs opacity-50">{r.status === "awaiting" ? "Answer or end it to delete" : "End it to delete"}</span>
        )}
      </div>
    </div>
  );
}
