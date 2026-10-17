import { getPrivateJobStatus, type PrivateJobStatus } from "./dr-nib-private-api";

export function canBeginFreshVerifiedAttempt(jobState: string, hasRun: boolean,
  hasResultKey: boolean, hasInput: boolean, acknowledged: boolean): boolean {
  return jobState === "not_started" && hasRun && hasResultKey && hasInput && !acknowledged;
}

/** Poll only journal metadata. Never resend a source or restart the model. */
export async function pollPrivateJob(runId: string, { allowNotStarted = false,
  lookup = getPrivateJobStatus, pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  now = Date.now, maxWaitMs = 120_000 }:
  { allowNotStarted?: boolean; lookup?: (id: string) => Promise<PrivateJobStatus>;
    pause?: (ms: number) => Promise<void>; now?: () => number; maxWaitMs?: number } = {}): Promise<PrivateJobStatus> {
  const deadline = now() + maxWaitMs;
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await lookup(runId);
    if (status.state === "not_started" && !allowNotStarted)
      throw Error("Private job disappeared after its execution was acknowledged.");
    if (status.state !== "processing" || now() >= deadline || attempt === 59) return status;
    await pause(Math.min(2000, Math.max(0, deadline - now())));
  }
  throw Error("Private job polling did not return a state.");
}
