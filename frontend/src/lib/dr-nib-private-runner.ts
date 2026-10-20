"use client";
import { privateConnectionProgress } from './dr-nib-private-connection';

// Confidential research runner for the normal Dr. Nib flow.
//
// Intake, planning and research content are sealed to the verified guest.
// Saved project objects remain encrypted in storage and decrypt in the browser.
// Only a new private operation opens a worker session; reading saved work does not.

import {
  createPrivateRun,
  executeFullPrivateRun,
  executePrivateRun,
  getEncryptedPrivateReport,
  openGuestSession,
  proveGuestKey,
  type PrivateExecuteOutcome,
} from "./dr-nib-private-api";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  equalHex,
  freshId,
  freshNonce,
  generateResultKey,
  openReport,
  proofDigest,
  recipientId,
  sealSource,
  type PrivateEnvelope,
} from "./dr-nib-private-crypto";
import { configuredPrivateVerification, verifyPrivateSession } from "./dr-nib-private-verification";
import { pollPrivateJob } from "./dr-nib-private-recovery";
import { PRIVATE_FILE_EXTENSIONS, PRIVATE_FILE_LIMIT } from "./dr-nib-private-interaction";
import { freshWorkerStateKey, sealWorkerStateKey } from "./dr-nib-private-worker-key";

export const MAX_PRIVATE_TEXT = 100_000;

export type PrivateResultKey = Awaited<ReturnType<typeof generateResultKey>>;

export type ConfidentialSource =
  | { kind: "text"; text: string }
  | { kind: "file"; file: File };

/** An existing confidential run reused for an explicit fresh attempt. */
export type ConfidentialRunIdentity = { id: string; tenantId: string };

export type RunConfidentialArgs = {
  question: string;
  title: string;
  source: ConfidentialSource;
  onStage?: (stage: string) => void;
  /** Reuse the tab-held key so a delayed result on the same run stays decryptable. */
  resultKey?: PrivateResultKey | null;
  /** Reuse the tab-held worker-state key for a fresh attempt on the same run. */
  workerStateKey?: Uint8Array | null;
  /** Reuse an existing run for an explicit fresh attempt after "not_started". */
  run?: ConfidentialRunIdentity;
};

export type ConfidentialRunState = "complete" | "processing" | "not_started" | "uncertain";

export type ConfidentialRunOutcome = {
  runId: string;
  tenantId: string;
  reportId: string | null;
  report: string | null;
  resultKey: PrivateResultKey;
  workerStateKey: Uint8Array | null;
  state: ConfidentialRunState;
};

/** True when this build has a complete, reviewed confidential path configured. */
export function confidentialResearchAvailable(): boolean {
  return configuredPrivateVerification() !== null;
}

/**
 * True when the normal Dr. Nib flow should route research through the
 * confidential worker instead of the ordinary server pipeline. Explicit
 * build-time opt-in, and fail-closed if the reviewed path is missing.
 */
export function confidentialFlowEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DRNIB_PRIVATE_CONFIDENTIAL === "true" && confidentialResearchAvailable();
}

/** Full-worker (source-only plan + write) mode is an explicit build-time opt-in. */
export function confidentialFullWorkerMode(): boolean {
  return process.env.NEXT_PUBLIC_DRNIB_PRIVATE_FULL_ENABLED === "true";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readSourceField(
  source: ConfidentialSource,
): Promise<Record<string, string>> {
  if (source.kind === "text") {
    const sourceText = source.text;
    if (sourceText.trim().length < 1 || sourceText.length > MAX_PRIVATE_TEXT)
      throw Error("Paste a source of up to 100,000 characters.");
    return { sourceText };
  }
  const file = source.file;
  if (!PRIVATE_FILE_EXTENSIONS.test(file.name) || file.name.length > 160 ||
      file.size < 1 || file.size > PRIVATE_FILE_LIMIT)
    throw Error("Choose a PDF, DOCX, XLSX, CSV, TXT, MD, PNG, JPEG, or WebP file no larger than 2 MB.");
  return { fileName: file.name, fileBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer())) };
}

/**
 * Run one confidential research pass for a user-supplied source. The source and
 * report never leave the browser in plaintext; the caller keeps the source and
 * keys in tab memory only.
 */
export async function runConfidentialResearch(args: RunConfidentialArgs): Promise<ConfidentialRunOutcome> {
  let runId: string | undefined;
  try { return await performConfidentialResearch(args, id => { runId = id; }); }
  finally { if (runId) privateConnectionProgress(runId, null); }
}
async function performConfidentialResearch(args: RunConfidentialArgs, onRun: (id: string) => void): Promise<ConfidentialRunOutcome> {
  const verification = configuredPrivateVerification();
  if (!verification) throw Error("Confidential research is not configured for this build.");

  const question = args.question.trim();
  const title = args.title.trim();
  if (question.length < 3 || question.length > 1000)
    throw Error("Add a research question of 3–1,000 characters.");
  if (title.length < 1 || title.length > 160) throw Error("Add a source title of 1–160 characters.");
  const sourceField = await readSourceField(args.source);
  const stage = (text: string) => args.onStage?.(text);

  stage("Creating confidential run");
  const run = args.run ?? (await createPrivateRun());
  onRun(run.id);

  stage("Requesting fresh guest evidence");
  const nonce = freshNonce();
  const session = await openGuestSession(run.id, bytesToHex(nonce));
  if (!equalHex(session.clientNonce, bytesToHex(nonce)))
    throw Error("Guest nonce did not match this browser session.");
  const guestKey = base64ToBytes(session.recipientPublicKey, 65, 65);
  if (!equalHex(session.recipientId, await recipientId(guestKey)))
    throw Error("Guest encryption key identity did not match.");

  stage("Checking independent attestation");
  await verifyPrivateSession({ mode: verification, session, nonce, publicKey: guestKey });

  stage("Checking live key possession");
  const challenge = freshNonce();
  const challengeEnvelope = await sealSource(guestKey, {
    tenantId: run.tenantId, runId: run.id, objectId: freshId(), revision: 1,
    purpose: "source", recipientId: session.recipientId,
  }, challenge);
  const proof = await proveGuestKey(run.id, session.sessionId, challengeEnvelope) as {
    verified?: unknown; recipientId?: unknown; clientNonce?: unknown; sessionId?: unknown; challengeDigest?: unknown;
  };
  if (!proof || proof.verified !== true || proof.sessionId !== session.sessionId ||
      !equalHex(proof.recipientId as string, session.recipientId) ||
      !equalHex(proof.clientNonce as string, bytesToHex(nonce)) ||
      !equalHex(proof.challengeDigest as string, await proofDigest(session.sessionId, challenge)))
    throw Error("Guest could not prove possession of its attested key.");

  privateConnectionProgress(run.id, null);
  stage("Encrypting source in this browser");
  const resultKey = args.resultKey ?? (await generateResultKey());
  const input = { question, title, ...sourceField, browserPublicKey: bytesToBase64(resultKey.publicKey) };
  const plain = new TextEncoder().encode(JSON.stringify(input));
  const sourceEnvelope = await sealSource(guestKey, {
    tenantId: run.tenantId, runId: run.id, objectId: freshId(), revision: 1,
    purpose: "source", recipientId: session.recipientId,
  }, plain);

  const fullWorkerMode = confidentialFullWorkerMode();
  let workerStateKey: Uint8Array | null = null;
  let keyEnvelope: PrivateEnvelope | undefined;
  if (fullWorkerMode) {
    workerStateKey = args.workerStateKey ?? freshWorkerStateKey();
    let keyObjectId = freshId();
    while (keyObjectId === sourceEnvelope.context.objectId) keyObjectId = freshId();
    keyEnvelope = await sealWorkerStateKey(guestKey, {
      tenantId: run.tenantId, runId: run.id, objectId: keyObjectId,
      revision: 1, purpose: "source", recipientId: session.recipientId,
    }, session.sessionId, workerStateKey);
  }

  stage("Processing inside private worker");
  let acknowledged = false;
  let outcome: PrivateExecuteOutcome | null = null;
  try {
    outcome = fullWorkerMode && keyEnvelope
      ? await executeFullPrivateRun(run.id, session.sessionId, sourceEnvelope, keyEnvelope)
      : await executePrivateRun(run.id, session.sessionId, sourceEnvelope);
    acknowledged = true;
  } catch {
    // A lost execute response may still have run on the guest; fall through to
    // journal polling rather than reporting a clean failure.
  }

  let reportId: string | null = outcome?.state === "complete" ? outcome.reportId : null;
  let state: ConfidentialRunState = outcome?.state === "complete" ? "complete"
    : outcome?.state === "processing" ? "processing" : "uncertain";
  if (!reportId && outcome?.state !== "uncertain") {
    const status = await pollPrivateJob(run.id, { allowNotStarted: !acknowledged });
    state = status.state;
    if (status.state === "complete") reportId = status.reportId;
  }

  if (!reportId) return { runId: run.id, tenantId: run.tenantId, reportId: null, report: null, resultKey, workerStateKey, state };

  stage("Waiting for encrypted report");
  const deadline = Date.now() + 120_000;
  let report: string | null = null;
  for (let attempt = 0; attempt < 60 && Date.now() < deadline; attempt++) {
    const envelope = await getEncryptedPrivateReport(run.id, reportId);
    if (envelope) {
      report = await openReport(resultKey.privateKey, envelope, {
        tenantId: run.tenantId, runId: run.id, objectId: reportId, recipientId: resultKey.recipientId,
      });
      stage("Decrypted in this tab");
      break;
    }
    await sleep(2000);
  }
  if (report === null) throw Error("The encrypted report is still pending. Keep this tab open and try again.");

  return { runId: run.id, tenantId: run.tenantId, reportId, report, resultKey, workerStateKey, state: "complete" };
}
