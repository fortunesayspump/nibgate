"use client";

// Legacy prototype cache, retained for migration. Its pruning behavior is not
// suitable as the only durable key store; see dr-nib/privacy/PLAN.md.
// Browser-local persistence for confidential reports. The report key is a
// non-extractable HPKE CryptoKey pair; CryptoKey is structured-cloneable, so it
// is stored in IndexedDB as an object and never leaves this browser profile.
// This does not protect keys from malicious same-origin JavaScript or device access.

export type PrivateResultKey = {
  publicKey: Uint8Array;
  privateKey: { publicKey: CryptoKey; privateKey: CryptoKey };
  recipientId: string;
};

export type PrivateLocalRun = {
  runId: string;
  tenantId: string;
  question: string;
  title: string;
  reportId: string | null;
  createdAt: number;
  key: PrivateResultKey;
  stateKey?: Uint8Array;
  wallet?: string;
};

const DB_NAME = "drnib-private";
const STORE = "runs";
const DB_VERSION = 1;
const MAX_RUNS = 25;

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "runId" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Private key store unavailable."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Private key store request failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Private key store transaction aborted."));
    });
  } finally {
    db.close();
  }
}

export function privateKeyStoreAvailable(): boolean {
  return available();
}

export async function savePrivateRun(entry: PrivateLocalRun): Promise<void> {
  if (!available()) return;
  await withStore("readwrite", store => store.put(entry));
  await prune();
}

export async function updatePrivateRunReport(runId: string, reportId: string | null): Promise<void> {
  if (!available()) return;
  const existing = await getPrivateRun(runId);
  if (!existing) return;
  await withStore("readwrite", store => store.put({ ...existing, reportId }));
}

export async function getPrivateRun(runId: string): Promise<PrivateLocalRun | null> {
  if (!available()) return null;
  const row = await withStore<PrivateLocalRun | undefined>("readonly", store => store.get(runId));
  return row ?? null;
}

export async function listPrivateRuns(): Promise<PrivateLocalRun[]> {
  if (!available()) return [];
  const rows = await withStore<PrivateLocalRun[]>("readonly", store => store.getAll());
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deletePrivateRun(runId: string): Promise<void> {
  if (!available()) return;
  await withStore("readwrite", store => store.delete(runId));
}

async function prune(): Promise<void> {
  const rows = await listPrivateRuns();
  if (rows.length <= MAX_RUNS) return;
  for (const stale of rows.slice(MAX_RUNS)) await deletePrivateRun(stale.runId);
}
