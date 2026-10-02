// In production the hub frontend reaches Dr. Nib through its own /drnib-api
// proxy (see next.config.ts) so the .nibgate.xyz session cookie is sent.
// Locally it talks to the service directly.
const BASE = process.env.NEXT_PUBLIC_DRNIB_API_URL || (process.env.NODE_ENV === "production" ? "/drnib-api" : "http://localhost:3100");

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
  if (!res.ok) throw new Error(`dr-nib ${opts.method || "GET"} ${path}: ${res.status}`);
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
  configureRun: (
    id: string,
    body: { depth?: string; budgetCap: number; formats?: string[]; liveWeb?: boolean; length?: string; lengthWords?: number },
  ) => req(`/v1/runs/${id}/configure`, { method: "POST", body: JSON.stringify(body) }),
  approveRun: (id: string) => req(`/v1/runs/${id}/approve`, { method: "POST" }),
  pauseRun: (id: string) => req(`/v1/runs/${id}/pause`, { method: "POST" }),
  resumeRun: (id: string) => req(`/v1/runs/${id}/resume`, { method: "POST" }),
  deleteRun: (id: string) => req(`/v1/runs/${id}`, { method: "DELETE" }),
  restoreRun: (id: string) => req(`/v1/runs/${id}/restore`, { method: "POST" }),
  getReport: (id: string) => req(`/v1/runs/${id}/report`),
  createExport: (id: string, format: string) =>
    req(`/v1/runs/${id}/exports`, { method: "POST", body: JSON.stringify({ format }) }),
  getBudget: (runId: string) => req(`/v1/budgets/${runId}`),
  topUp: (runId: string, amount: number) =>
    req(`/v1/budgets/${runId}/topup`, { method: "POST", body: JSON.stringify({ amount }) }),
};

export const DRNIB_API_BASE = BASE;
