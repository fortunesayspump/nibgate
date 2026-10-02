"use client";

// Live run feed over SSE.
//
// The backend persists every event before broadcasting it, so a dropped
// connection loses nothing: EventSource resends Last-Event-ID on reconnect and
// the server replays everything after that cursor. This hook is the only thing
// that should drive run updates — polling the run on an interval is the
// fallback, used only when the stream itself errors.

import { DRNIB_API_BASE } from "./dr-nib-api";

export type RunEvent = {
  type: string;
  seq?: number;
  at?: string;
  [key: string]: unknown;
};

/**
 * Subscribe to a run's event log. `onEvent` fires for the hello, every replayed
 * event, and every live event. Returns an unsubscribe function. When the
 * stream errors, `onError` fires once and the caller should fall back to
 * polling — a failed stream must degrade to slow updates, never to silence.
 */
export function subscribeRunEvents(
  runId: string,
  onEvent: (event: RunEvent) => void,
  onError?: () => void,
): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    onError?.();
    return () => {};
  }
  let failed = false;
  let source: EventSource | null = null;
  try {
    source = new EventSource(`${DRNIB_API_BASE}/v1/runs/${runId}/events`, { withCredentials: true });
  } catch {
    onError?.();
    return () => {};
  }
  source.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {
      // A malformed frame must not kill the stream.
    }
  };
  source.onerror = () => {
    if (!failed) {
      failed = true;
      onError?.();
    }
  };
  return () => {
    failed = true;
    source?.close();
  };
}
