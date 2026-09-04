// The one contract: paths, request bodies, and response shapes are all DERIVED
// from the xanots query defs. Change a def and this file follows — no hand-typed
// URL, no hand-mirrored response interface.
//
// Bundle discipline (the split-route-metadata rule): triage/run's def imports
// the agent graph (s.ai.agent.run), so we import its TYPE only (types erase to
// nothing) and read its runtime path/verb from ROUTES below — verified against
// `npx xanots routes xano/index.ts`. Every other def is lean enough to import.
//
// Note on `unknown`: the SDK types values produced by `s.set_var` and by
// `s.function.run` as `unknown` (a called function's response shape does not
// propagate). Those land on a few fields (an actor's derived kind/can_freeze,
// the rule path's outcome). We DERIVE the raw shapes from the defs' InferResponse
// and normalize them to view models at this one seam, so a backend change still
// surfaces here as a type error rather than drifting silently.

import type { InferInput, InferResponse } from "@xanots/sdk";

// Lean query defs — imported for getPath()/verb.
import { seedReset } from "../../../xano/api/seed_reset.js";
import { authToken } from "../../../xano/api/auth_token.js";
import { alertsQueue } from "../../../xano/api/alerts_queue.js";
import { alertsGet } from "../../../xano/api/alerts_get.js";
import { alertsAct } from "../../../xano/api/alerts_act.js";
import { findingsAdd } from "../../../xano/api/findings_add.js";
import { actionsList } from "../../../xano/api/actions_list.js";

// Type-only imports (free — never enter the bundle).
import type { triageRun } from "../../../xano/api/triage_run.js";
import type { loadActor } from "../../../xano/functions/load_actor.js";
import type { applyAction } from "../../../xano/functions/apply_action.js";

/** The deployed backend URL (injected by `xanots deploy --static`, or dev env). */
export const XANO_HOST: string =
  (typeof window !== "undefined" && (window as { XANO_HOST?: string }).XANO_HOST) ||
  import.meta.env.VITE_XANO_HOST ||
  "";

// Stack-heavy endpoint (imports the agent graph): metadata only.
export const ROUTES = {
  triageRun: { path: "/api:aftq-triage/run", verb: "POST" },
} as const;

// ── Types derived from the defs ─────────────────────────────────────────────
export type LoginBody = InferInput<typeof authToken>;
export type QueueRow = InferResponse<typeof alertsQueue>[number];
export type AlertDetail = InferResponse<typeof alertsGet>;
export type ActBody = InferInput<typeof alertsAct>;
export type FindingBody = InferInput<typeof findingsAdd>;
export type AuditRow = InferResponse<typeof actionsList>[number];

// Raw (pre-normalization) shapes, still derived from the defs.
type RawActor = InferResponse<typeof loadActor>;
type RawOutcome = InferResponse<typeof applyAction>;

// ── View models (normalized from the derived raw shapes) ────────────────────
export interface Actor {
  id: number;
  name: string;
  role: string;
  kind: string; // "human" | "agent"
  can_freeze: boolean;
}
export interface ActionOutcome {
  allowed: boolean;
  rule: string;
  action: string;
  alert_id: number;
}
export interface LoginResult {
  token: string;
  actor: Actor;
}
export interface TriageOutcome {
  decision: string;
  source: string;
  why: string;
  outcome: ActionOutcome;
}
export interface ActResult {
  outcome: ActionOutcome;
  alertStatus: string;
  accountStatus: string;
}

function toActor(raw: RawActor): Actor {
  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? ""),
    role: String(raw.role ?? ""),
    kind: String(raw.kind ?? ""),
    can_freeze: raw.can_freeze === true,
  };
}
function toOutcome(raw: RawOutcome): ActionOutcome {
  return {
    allowed: raw.allowed === true,
    rule: String(raw.rule ?? ""),
    action: String(raw.action ?? ""),
    alert_id: Number(raw.alert_id ?? 0),
  };
}

// ── Token-aware fetch ───────────────────────────────────────────────────────
let token: string | null = null;
export function setToken(t: string | null) {
  token = t;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, verb: string, body?: unknown): Promise<T> {
  const res = await fetch(XANO_HOST + path, {
    method: verb,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "message" in data && (data as { message?: string }).message) ||
      res.statusText ||
      "Request failed";
    throw new ApiError(String(message), res.status);
  }
  return data as T;
}

// ── The endpoints ───────────────────────────────────────────────────────────
export const resetDemo = () =>
  call<{ ok: boolean; analysts: number; accounts: number; alerts: number }>(seedReset.getPath(), seedReset.verb);

export async function login(body: LoginBody): Promise<LoginResult> {
  const raw = await call<{ token: unknown; actor: RawActor }>(authToken.getPath(), authToken.verb, body);
  return { token: String(raw.token ?? ""), actor: toActor(raw.actor) };
}

export const getQueue = () => call<QueueRow[]>(alertsQueue.getPath(), alertsQueue.verb);

export const getAlert = (id: number) =>
  call<AlertDetail>(alertsGet.getPath({ params: { alert_id: id } }), alertsGet.verb);

export async function act(body: ActBody): Promise<ActResult> {
  const raw = await call<{ outcome: RawOutcome; alert: { status?: unknown } | null; account: { status?: unknown } | null }>(
    alertsAct.getPath(),
    alertsAct.verb,
    body,
  );
  return {
    outcome: toOutcome(raw.outcome),
    alertStatus: String(raw.alert?.status ?? ""),
    accountStatus: String(raw.account?.status ?? ""),
  };
}

export const addFinding = (body: FindingBody) =>
  call<unknown>(findingsAdd.getPath(), findingsAdd.verb, body);

export const getAudit = (alertId?: number) =>
  call<AuditRow[]>(actionsList.getPath() + (alertId ? `?alert_id=${alertId}` : ""), actionsList.verb);

export async function runTriage(alert_id: number): Promise<TriageOutcome> {
  const raw = await call<{ decision: unknown; source: unknown; why: unknown; outcome: RawOutcome }>(
    ROUTES.triageRun.path,
    ROUTES.triageRun.verb,
    { alert_id },
  );
  return { decision: String(raw.decision ?? ""), source: String(raw.source ?? ""), why: String(raw.why ?? ""), outcome: toOutcome(raw.outcome) };
}
