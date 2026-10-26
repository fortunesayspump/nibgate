"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { drNibApi } from "@/lib/dr-nib-api";
import { PageHeader, ProjectCard } from "@/components/dr-nib/common";
import {privateBuildEnabled, listPrivateVaults, privateRecoveryAvailability, createNewPrivateVault,
  switchPrivateVault, unlockPrivateVault, privateTenantId, type PrivateVaultFolder} from '@/lib/dr-nib-private-records';

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
  const router = useRouter();
  const [runs, setRuns] = useState<any[] | null>(null);
  const [trash, setTrash] = useState<any[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError,setActionError]=useState("");
  const [loadError,setLoadError]=useState(false);
  const [vaults,setVaults]=useState<PrivateVaultFolder[]>([]);
  const [vaultReadiness,setVaultReadiness]=useState<'available'|'available-legacy'|'needs-code'|'no-vault'|null>(null);
  const [vaultBusy,setVaultBusy]=useState(false);
  const [freshStartAcknowledged,setFreshStartAcknowledged]=useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      if(privateBuildEnabled()){
        const folders=await listPrivateVaults();
        setVaults(folders);
        const readiness=await privateRecoveryAvailability();
        setVaultReadiness(readiness);
        if(readiness==='needs-code'||readiness==='no-vault'){
          setRuns([]);setTrash([]);return;
        }
      }
      const [active, deleted] = await Promise.all([drNibApi.listRuns(false), drNibApi.listRuns(true)]);
      setRuns(active.runs || []);
      setTrash(deleted.runs || []);
    } catch {
      if(privateBuildEnabled())setLoadError(true);
      else setRuns([]);
    }
  }, []);

  async function selectVault(vaultId:string){
    if(vaultBusy)return;
    setVaultBusy(true);setActionError('');
    try{await switchPrivateVault(vaultId);setShowTrash(false);await load();}
    catch{setActionError('Could not switch vaults. Your projects and keys are unchanged; refresh before retrying.');}
    finally{setVaultBusy(false);}
  }
  async function unlockVault(){
    if(vaultBusy)return;
    setVaultBusy(true);setActionError('');
    try{await unlockPrivateVault(await privateTenantId());await load();}
    catch{setActionError('This vault is still locked. Use its password, backup code, or enrolled passkey in Help.');}
    finally{setVaultBusy(false);}
  }
  async function addVault(){
    if(vaultBusy||!freshStartAcknowledged)return;
    setVaultBusy(true);setActionError('');
    try{await createNewPrivateVault();setFreshStartAcknowledged(false);setShowTrash(false);await load();}
    catch(error){setActionError(error instanceof Error?error.message:'Could not confirm the new vault. Check the vault list before retrying.');}
    finally{setVaultBusy(false);}
  }

  useEffect(() => { load(); }, [load]);

  // Runs move in other tabs (and on this one's timers): refresh when the tab
  // regains focus so a completed run doesn't sit stale as "running".
  useEffect(() => {
    const onFocus = () => { load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  async function remove(id: string) {
    setActionError("");
    setBusyId(id);
    try { await drNibApi.deleteRun(id); await load(); } catch { setActionError("Could not confirm the project update. Refresh the list before retrying."); }
    finally { setBusyId(null); }
  }

  async function restore(id: string) {
    setActionError("");
    setBusyId(id);
    try { await drNibApi.restoreRun(id); await load(); } catch { setActionError("Could not confirm the project update. Refresh the list before retrying."); }
    finally { setBusyId(null); }
  }

  // Duplicate: a fresh run on the same topic, straight into intake. One
  // click, no confirm — the new run is cheap until approved, and this is
  // the only path to a bigger budget once an escrow is exhausted.
  async function duplicate(r: any) {
    const topic = String(r.brief?.topic || r.title || "").trim();
    if (!topic) return;
    setActionError("");
    setBusyId(r.id + ":dup");
    try {
      const created: any = await drNibApi.createProject(topic);
      router.push(`/dr-nib/research?project=${created.id}`);
    } catch {
      setActionError("Could not confirm duplication. Check the project list before retrying.");
      setBusyId(null);
    }
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
            {privateBuildEnabled()&&(process.env.NEXT_PUBLIC_NIBGATE_NETWORK||'testnet').toLowerCase()!=='mainnet'?<Link href="/dr-nib/legacy" className="rounded-full border border-dark-gray/50 px-5 py-3 font-medium">Legacy history</Link>:null}
          </div>
        }
      />

      {privateBuildEnabled() ? <section className="mb-6 rounded-2xl border-2 border-dark-gray bg-white p-5" aria-labelledby="vault-folders-heading">
        <h2 id="vault-folders-heading" className="text-lg font-medium">Your vaults</h2>
        <p className="mt-2 text-sm leading-6 opacity-75">Your sign-in owns these folders. Each vault has its own password, backup code and optional passkey. Projects stay in the vault where you created them. Switching folders does not move or decrypt a project. Your selection follows your account across devices; refresh other open tabs after switching.</p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Choose a private vault">
          {vaults.map((vault,index)=><button key={vault.vaultId} type="button" onClick={()=>void selectVault(vault.vaultId)} disabled={vaultBusy||vault.active}
            aria-current={vault.active?'true':undefined} className={`private-vault-folder rounded-xl px-4 py-3 text-left text-sm ${vault.active?'private-vault-folder--active':''}`}>
            <span className="block font-medium">Vault {index+1}{vault.active?' · selected':''}</span>
            <span className="block text-xs opacity-70">Created {new Date(vault.createdAt).toLocaleDateString()} · {vault.vaultId.slice(0,8)}</span>
          </button>)}
        </div>
        {vaultReadiness==='needs-code'?<div className="mt-4 rounded-xl border border-dark-gray/40 bg-gray p-4 text-sm">
          <p>This vault is locked on this browser. Its projects are still saved. Unlock it to read them, or select another vault.</p>
          <button type="button" onClick={()=>void unlockVault()} disabled={vaultBusy} className="mt-3 rounded-full border border-current px-4 py-2 disabled:opacity-50">Unlock selected vault</button>
          <Link href="/dr-nib/settings#private-recovery" className="ml-4 underline">Recovery help</Link>
        </div>:null}
        {vaults.length>0?<div className="mt-5 rounded-xl border border-dark-gray/40 p-4">
          <h3 className="font-medium">Start a fresh vault</h3>
          <p className="mt-2 text-sm leading-6">If every unlock method for an older vault is lost, you can make a new one under this same account. The older vault and its encrypted projects remain in their folder. The new password or backup code will <strong>not</strong> open those older projects. No onchain transaction or research charge is needed.</p>
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={freshStartAcknowledged} onChange={event=>setFreshStartAcknowledged(event.target.checked)} className="mt-1" />I understand this creates a separate vault and does not recover or erase my old projects.</label>
          <button type="button" onClick={()=>void addVault()} disabled={vaultBusy||!freshStartAcknowledged||vaults.length>=10} className="mt-3 rounded-full border border-current px-5 py-2 font-medium disabled:opacity-50">{vaultBusy?'Working…':'Create new vault'}</button>
        </div>:<p className="mt-4 text-sm opacity-70">Your first vault is created when you start a private project.</p>}
      </section>:null}

      {actionError?<p role="alert" className="mb-4 text-sm text-red-700">{actionError}</p>:null}
      {loadError ? (
        <div role="alert"><p className="text-sm opacity-70">Could not load private projects. Your saved projects are unchanged.</p><button onClick={()=>void load()} className="mt-3 rounded-full border px-5 py-2">Try again</button></div>
      ) : runs === null ? (
        <p className="text-sm opacity-60">Loading projects…</p>
      ) : privateBuildEnabled() && vaultReadiness === 'needs-code' ? (
        <p className="rounded-xl border border-dark-gray/40 p-5 text-sm">Unlock the selected vault to see its projects. You can switch to another vault above.</p>
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
          {privateBuildEnabled() && vaults.length > 0 ? <h2 className="mb-4 text-xl font-medium">Projects in Vault {vaults.findIndex(vault => vault.active) + 1}</h2> : null}
          <div className="mb-5">
            <input type="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects…"
              className="w-full border border-dark-gray/50 bg-white rounded-xl px-3 py-2 text-sm outline-none" />
          </div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider opacity-60">Active ({active.length})</p>
          {active.length === 0 ? (
            <p className="mb-5 text-sm opacity-60">{q ? "No active matches." : "Nothing running. Start one from Research."}</p>
          ) : (
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            {active.map((r) => <ProjectRow key={r.id} r={r} busy={busyId === r.id} dupBusy={busyId === r.id + ":dup"} onDelete={remove} onDuplicate={duplicate} />)}
          </div>
        )}
        <p className="mb-2 text-xs font-medium uppercase tracking-wider opacity-60">Ended ({ended.length})</p>
        {ended.length === 0 ? (
          <p className="text-sm opacity-60">{q ? "No ended matches." : "No finished runs yet."}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {ended.map((r) => <ProjectRow key={r.id} r={r} busy={busyId === r.id} dupBusy={busyId === r.id + ":dup"} onDelete={remove} onDuplicate={duplicate} />)}
          </div>
        )}
        </>
      )}
    </div>
  );
}

function ProjectRow({ r, busy, dupBusy, onDelete, onDuplicate }: { r: any; busy: boolean; dupBusy: boolean; onDelete: (id: string) => void; onDuplicate: (r: any) => void }) {
  const deletable = DELETABLE.includes(r.status);
  // Duplicate only where there is no live work or money to confuse: finished
  // history and untouched drafts. Live runs duplicate from their own page.
  const duplicable = ["ended", "complete", "failed", "draft", "intake", "intake-done"].includes(r.status);
  return (
    <div>
      <Link href={hrefFor(r)} className="no-underline"><ProjectCard r={r} /></Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Link href={hrefFor(r)} className="text-sm opacity-70 hover:opacity-100">
          {["intake", "intake-done", "draft"].includes(r.status) ? "Continue intake →" : "Open →"}
        </Link>
        <span className="flex items-center gap-2">
          {duplicable && (
            <button onClick={() => onDuplicate(r)} disabled={busy || dupBusy} className="border border-dark-gray/60 px-4 py-1.5 text-sm font-medium hover:bg-black hover:text-white disabled:opacity-50">
              {dupBusy ? "Duplicating…" : "Duplicate"}
            </button>
          )}
          {deletable ? (
            <button onClick={() => onDelete(r.id)} disabled={busy} className="border border-dark-gray/60 px-4 py-1.5 text-sm font-medium hover:bg-[#a33b2e] hover:text-white disabled:opacity-50">
              {busy ? "Deleting…" : "Delete"}
            </button>
          ) : (
            <span className="text-xs opacity-50">{r.status === "awaiting" ? "Answer or end it to delete" : "End it to delete"}</span>
          )}
        </span>
      </div>
    </div>
  );
}
