// Dr. Nib is a separate service, but the browser must reach it through the
// same-origin /drnib-api proxy (see next.config.ts rewrites). A direct
// absolute URL (localhost:3100, drnib.nibgate.xyz) is a different origin from
// the page: the hub SIWE session cookie either isn't sent at all
// (127.0.0.1 page vs localhost API) or needs CORS, so every call 401s even
// right after a successful sign-in — the sign-again loop.
const BASE = process.env.NEXT_PUBLIC_DRNIB_API_URL || "/drnib-api";

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    // The hub SIWE session cookie is the account. Cross-origin (the frontend on
    // :3001 talking to the service on :3100, or the deployed pair), the browser
    // only sends it when credentials are explicitly included — without this
    // every authenticated call comes back 401.
    credentials: "include",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    const err = new Error('Sign in to Nibgate to use Dr. Nib.');
    (err as any).code = 'unauthenticated';
    throw err;
  }
  if (res.status === 503) {
    // The session store is unreachable (outage), not a missing login.
    // Surfaced separately so the UI says "retry", never "sign in again".
    const err = new Error('Dr. Nib account lookup is temporarily unavailable. Retry in a moment.');
    (err as any).code = 'unavailable';
    throw err;
  }
  if (!res.ok) {
    // Surface the server's reason (cap-hit counts, validation detail) — a
    // bare status leaves users staring at a dead screen with no next step.
    let detail = "";
    try {
      const data = await res.clone().json();
      if (data && typeof data.error === "string" && data.error) detail = `: ${data.error}`;
    } catch {}
    const err = new Error(`dr-nib ${opts.method || "GET"} ${path}: ${res.status}${detail}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json();
}

export type IntakeOption = { id: string; label: string };
export type IntakeType = "pick_one" | "pick_any" | "free";
export type IntakeQuestion = {
  key: string;
  type: IntakeType;
  prompt: string;
  options: IntakeOption[];
  allowOther: boolean;
};
export type IntakeAnswer = { optionIds?: string[]; text?: string };

export const drNibApi = {
  listRuns: (deleted = false) => req(`/v1/runs${deleted ? "?deleted=1" : ""}`),
  getRun: (id: string) => req(`/v1/runs/${id}`),
  createProject: (topic: string) => req("/v1/runs", { method: "POST", body: JSON.stringify({ topic }) }),
  answerQuestion: (id: string, seq: number, answer: IntakeAnswer) =>
    req(`/v1/runs/${id}/answers`, { method: "POST", body: JSON.stringify({ seq, answer }) }),
  answerBatch: (id: string, answers: { seq: number; answer: IntakeAnswer }[]) =>
    req(`/v1/runs/${id}/answers/batch`, { method: "POST", body: JSON.stringify({ answers }) }),
  finishIntake: (id: string) =>
    req(`/v1/runs/${id}/intake/finish`, { method: "POST" }),
  configureRun: (
    id: string,
    body: { depth?: string; budgetCap: number; formats?: string[]; liveWeb?: boolean; length?: string; lengthWords?: number },
  ) => req(`/v1/runs/${id}/configure`, { method: "POST", body: JSON.stringify(body) }),
  approveRun: (id: string) => req(`/v1/runs/${id}/approve`, { method: "POST" }),
  pauseRun: (id: string) => req(`/v1/runs/${id}/pause`, { method: "POST" }),
  resumeRun: (id: string) => req(`/v1/runs/${id}/resume`, { method: "POST" }),
  endRun: (id: string) => req(`/v1/runs/${id}/end`, { method: "POST" }),
  deleteRun: (id: string) => req(`/v1/runs/${id}`, { method: "DELETE" }),
  restoreRun: (id: string) => req(`/v1/runs/${id}/restore`, { method: "POST" }),
  getReport: (id: string, version?: number) =>
    req(`/v1/runs/${id}/report${version ? `?version=${version}` : ""}`),
  answerAwaiting: (id: string, text: string) =>
    req(`/v1/runs/${id}/awaiting/answer`, { method: "POST", body: JSON.stringify({ text }) }),
  sendGuidance: (id: string, text: string) =>
    req(`/v1/runs/${id}/guidance`, { method: "POST", body: JSON.stringify({ text }) }),
  repromptRun: (id: string, prompt: string) =>
    req(`/v1/runs/${id}/revise`, { method: "POST", body: JSON.stringify({ prompt }) }),
  createEscrow: (id: string, body: { client?: string; expiryHours?: number }) =>
    req(`/v1/runs/${id}/escrow`, { method: "POST", body: JSON.stringify(body) }),
  getEscrow: (id: string) => req(`/v1/runs/${id}/escrow`),
  createExport: (id: string, format: string) =>
    req(`/v1/runs/${id}/exports`, { method: "POST", body: JSON.stringify({ format }) }),
  getBudget: (runId: string) => req(`/v1/budgets/${runId}`),
  topUp: (runId: string, amount: number) =>
    req(`/v1/budgets/${runId}/topup`, { method: "POST", body: JSON.stringify({ amount }) }),
};

export const DRNIB_API_BASE = BASE;
