import type { PrivateEnvelope } from "./dr-nib-private-crypto";
import type { GuestSession } from "./dr-nib-private-verifier";

// The same-origin broker must authenticate the Nibgate session and pass only
// empty run metadata, ciphertext and public attestation evidence. Never call
// the ordinary /v1/runs or /sources APIs for confidential work.
const BASE = "/drnib-private-api/v1/private";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type PrivateExecuteOutcome = { state: "complete"; reportId: string } |
  { state: "processing" | "uncertain"; runId: string };
export type PrivateJobStatus = { state: "not_started" | "processing" | "uncertain" } |
  { state: "complete"; reportId: string };

function exactKeys(value: unknown, keys: string): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === keys.split(",").sort().join(",");
}

async function readJsonLimited(response: Response, maxBytes: number): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > maxBytes) throw Error("Private worker response is too large.");
  if (!response.body) throw Error("Private worker returned an invalid response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) { await reader.cancel(); throw Error("Private worker response is too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)); }
  catch { throw Error("Private worker returned an invalid response."); }
}

async function requestWithStatus(path: string, options: RequestInit = {}): Promise<{ data: unknown; status: number }> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: "include", cache: "no-store", redirect: "error", ...options,
      signal: options.signal ?? AbortSignal.timeout(30_000),
      headers: { "content-type": "application/json", "accept": "application/json", ...options.headers },
    });
  } catch { throw Error("Private worker connection failed. Check private run status before retrying."); }
  if (response.status === 401) throw Error("Sign in to Nibgate before starting private research.");
  if (response.status === 503) throw Error("Private worker is unavailable. It may still be starting. Retry when it is ready.");
  if (response.status === 429) throw Error("Private worker is busy. Please wait before retrying.");
  if (!response.ok) throw Error(`Private research request failed (${response.status}). No ordinary processing was started.`);
  if (!(response.headers.get("content-type") || "").toLowerCase().startsWith("application/json"))
    throw Error("Private worker returned an invalid response.");
  return { data: await readJsonLimited(response, 6 * 1024 * 1024), status: response.status };
}

async function request(path: string, options: RequestInit = {}): Promise<unknown> {
  return (await requestWithStatus(path, options)).data;
}

export async function createPrivateRun(): Promise<{ id: string; tenantId: string }> {
  const data = await request("/runs", { method: "POST", body: "{}" });
  const run = data as { id?: unknown; tenantId?: unknown };
  if (!run || typeof run.id !== "string" || !UUID.test(run.id) ||
      typeof run.tenantId !== "string" || !/^[A-Za-z0-9:_-]{1,128}$/.test(run.tenantId))
    throw Error("Private run identity was not returned.");
  return { id: run.id, tenantId: run.tenantId };
}

export async function openGuestSession(runId: string, clientNonce: string): Promise<GuestSession> {
  const data = await request("/sessions", { method: "POST", body: JSON.stringify({ runId, clientNonce }) });
  const session = data as GuestSession;
  if (!session || typeof session.sessionId !== "string" || !UUID.test(session.sessionId) ||
      typeof session.clientNonce !== "string" || typeof session.recipientId !== "string" ||
      typeof session.recipientPublicKey !== "string" || !session.evidence) throw Error("Private guest session was invalid.");
  return session;
}

export async function proveGuestKey(runId: string, sessionId: string, challengeEnvelope: PrivateEnvelope): Promise<unknown> {
  if (!UUID.test(runId) || !UUID.test(sessionId)) throw Error("Invalid private session ID");
  return request(`/sessions/${sessionId}/prove`, { method: "POST", body: JSON.stringify({ runId, challengeEnvelope }) });
}

function parseExecuteOutcome(data: unknown, status: number, runId: string): PrivateExecuteOutcome {
  if (status === 200 && exactKeys(data, "encrypted,id,version") && typeof data.id === "string" && UUID.test(data.id) &&
      data.encrypted === true && data.version === 1) return { state: "complete", reportId: data.id };
  if (status === 202 && exactKeys(data, "runId,state") && data.runId === runId &&
      (data.state === "processing" || data.state === "uncertain"))
    return { state: data.state, runId };
  throw Error("Private worker did not return a valid encrypted job state.");
}

export async function executePrivateRun(runId: string, sessionId: string, sourceEnvelope: PrivateEnvelope): Promise<PrivateExecuteOutcome> {
  if (!UUID.test(runId) || !UUID.test(sessionId)) throw Error("Invalid private session ID");
  const { data, status } = await requestWithStatus(`/sessions/${sessionId}/execute`, { method: "POST", body: JSON.stringify({ runId, sourceEnvelope }), signal: AbortSignal.timeout(200_000) });
  return parseExecuteOutcome(data, status, runId);
}

/** Opt-in measured plan/write path. The second envelope contains a browser
 * state key only under HPKE; no plaintext key is an API argument or body field. */
export async function executeFullPrivateRun(runId: string, sessionId: string,
  sourceEnvelope: PrivateEnvelope, keyEnvelope: PrivateEnvelope): Promise<PrivateExecuteOutcome> {
  if (!UUID.test(runId) || !UUID.test(sessionId) ||
      !exactKeys(sourceEnvelope, "algorithm,ciphertext,context,encapsulatedSecret,version") ||
      !exactKeys(keyEnvelope, "algorithm,ciphertext,context,encapsulatedSecret,version") ||
      sourceEnvelope.version !== 2 || keyEnvelope.version !== 2 ||
      sourceEnvelope.algorithm !== "HPKE-P256-HKDF-SHA256-AES128GCM" ||
      keyEnvelope.algorithm !== "HPKE-P256-HKDF-SHA256-AES128GCM" ||
      sourceEnvelope.context?.purpose !== "source" || keyEnvelope.context?.purpose !== "source" ||
      sourceEnvelope.context.runId !== runId || keyEnvelope.context.runId !== runId ||
      sourceEnvelope.context.tenantId !== keyEnvelope.context.tenantId ||
      sourceEnvelope.context.recipientId !== keyEnvelope.context.recipientId ||
      sourceEnvelope.context.objectId === keyEnvelope.context.objectId)
    throw Error("Invalid private worker ciphertexts");
  const { data, status } = await requestWithStatus(`/sessions/${sessionId}/full-execute`, {
    method: "POST", body: JSON.stringify({ runId, sourceEnvelope, keyEnvelope }), signal: AbortSignal.timeout(200_000),
  });
  return parseExecuteOutcome(data, status, runId);
}

export async function getPrivateJobStatus(runId: string): Promise<PrivateJobStatus> {
  if (!UUID.test(runId)) throw Error("Invalid private run ID");
  const { data, status } = await requestWithStatus(`/runs/${runId}/job`, { method: "GET" });
  if (status !== 200) throw Error("Private worker returned an invalid job state.");
  if (exactKeys(data, "state") &&
      (data.state === "not_started" || data.state === "processing" || data.state === "uncertain"))
    return { state: data.state };
  if (exactKeys(data, "reportId,state") && data.state === "complete" &&
      typeof data.reportId === "string" && UUID.test(data.reportId))
    return { state: "complete", reportId: data.reportId };
  throw Error("Private worker returned an invalid job state.");
}

export type PrivateRunSummary = { id: string; createdAt: number | string; status: string; tenantId: string };

export async function listPrivateRunSummaries(): Promise<PrivateRunSummary[]> {
  const data = await request("/runs");
  const runs = (data as { runs?: unknown })?.runs;
  if (!Array.isArray(runs)) throw Error("Private run list was invalid.");
  return runs
    .filter((run): run is { id: string; createdAt?: number | string; status: string; tenantId: string } =>
      !!run && typeof run === "object" && typeof (run as { id?: unknown }).id === "string" &&
      UUID.test((run as { id: string }).id) && typeof (run as { status?: unknown }).status === "string" &&
      typeof (run as { tenantId?: unknown }).tenantId === "string")
    .map(run => ({ id: run.id, createdAt: run.createdAt ?? 0, status: run.status, tenantId: run.tenantId }));
}

export async function getEncryptedPrivateReport(runId: string, reportId: string): Promise<PrivateEnvelope | null> {
  if (!UUID.test(runId) || !UUID.test(reportId)) throw Error("Invalid private report ID");
  let response: Response;
  try {
    response = await fetch(`${BASE}/reports/${reportId}?runId=${encodeURIComponent(runId)}`, {
      method: "GET", credentials: "include", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { accept: "application/json" },
    });
  } catch { throw Error("Encrypted report connection failed. You can retry while this tab stays open."); }
  if (response.status === 202) return null;
  if (!response.ok || !(response.headers.get("content-type") || "").toLowerCase().startsWith("application/json"))
    throw Error(`Encrypted report is unavailable (${response.status}). You can retry while this tab stays open.`);
  const envelope = await readJsonLimited(response, 6 * 1024 * 1024) as PrivateEnvelope;
  if (!envelope || envelope.version !== 2 || envelope.algorithm !== "HPKE-P256-HKDF-SHA256-AES128GCM")
    throw Error("Private report was not encrypted as expected.");
  return envelope;
}
