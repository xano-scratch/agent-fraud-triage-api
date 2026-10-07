// The one contract (CRAFT.md §4): paths from xano/routes.gen.ts, types from the defs with `import type`, every
// call through the base's request(). Never import a def, table or seed as a value here.
import type { InferResponse } from "@xano/sdk";
import type { listAlerts, getAlert, createAlert } from "../../../xano/query/api/alerts.js";
import type { listAccounts, getAccount } from "../../../xano/query/api/accounts.js";
import type { listAudit, getTriageSettings } from "../../../xano/query/api/audit.js";
import { routePath } from "../../../xano/routes.gen.js";
import { qs, request } from "@/base/request";

export { ApiError, XANO_HOST, qs, request, token } from "@/base/request";
export { baseApi } from "@/base/api";
export type { Me, Person } from "@/base/api";

export type AlertPage = InferResponse<typeof listAlerts>;
export type Alert = AlertPage["items"][number];
export type AlertDetail = InferResponse<typeof getAlert>;
export type Finding = AlertDetail["findings"][number];
export type AccountPage = InferResponse<typeof listAccounts>;
export type Account = AccountPage["items"][number];
export type AccountDetail = InferResponse<typeof getAccount>;
export type AuditPage = InferResponse<typeof listAudit>;
export type AuditEvent = AuditPage["items"][number];
export type Settings = InferResponse<typeof getTriageSettings>;
export type NewAlert = InferResponse<typeof createAlert>;

export type TriageAction = "clear" | "escalate";
export type AlertKind = "login_anomaly" | "velocity" | "device_change" | "geo_mismatch" | "chargeback_pattern";
export type AlertStatus = "open" | "escalated" | "cleared";
export type ActorKind = "human" | "agent" | "assistant";
export type AuditAction = "clear" | "escalate" | "freeze" | "unfreeze" | "add_finding";

export type AlertQuery = Partial<{ status: string; severity: string; kind: string; q: string; mine: string; page: string; per_page: string }>;
export type AccountQuery = Partial<{ status: string; q: string; page: string; per_page: string }>;
export type AuditQuery = Partial<{ action: string; allowed: string; actor_kind: string; alert_id: string; account_id: string; page: string; per_page: string }>;
export type AlertPatch = Partial<{ severity: number; reason: string; assignee_id: number; clear_assignee: boolean }>;

export const api = {
  alerts: (q: AlertQuery = {}) => request<AlertPage>("GET", routePath("GET alerts") + qs(q)),
  alert: (id: number | string) => request<AlertDetail>("GET", routePath("GET alerts/{id}", { id: Number(id) })),
  act: (id: number, action: TriageAction, note = "") => request<Alert>("POST", routePath("POST alerts/{id}/act", { id }), { action, note }),
  addFinding: (id: number, note: string) => request<Finding[]>("POST", routePath("POST alerts/{id}/findings", { id }), { note }),
  createAlert: (body: { account_id: number; severity: number; kind: AlertKind; reason?: string; assignee_id?: number }) =>
    request<NewAlert>("POST", routePath("POST alerts"), body),
  editAlert: (id: number, patch: AlertPatch) => request<Alert>("PATCH", routePath("PATCH alerts/{id}", { id }), patch),

  accounts: (q: AccountQuery = {}) => request<AccountPage>("GET", routePath("GET accounts") + qs(q)),
  account: (id: number | string) => request<AccountDetail>("GET", routePath("GET accounts/{id}", { id: Number(id) })),
  editAccount: (id: number, risk_note: string) => request<Account>("PATCH", routePath("PATCH accounts/{id}", { id }), { risk_note }),
  freeze: (id: number, reason: string) => request<Account>("POST", routePath("POST accounts/{id}/freeze", { id }), { reason }),
  unfreeze: (id: number) => request<Account>("POST", routePath("POST accounts/{id}/unfreeze", { id })),

  audit: (q: AuditQuery = {}) => request<AuditPage>("GET", routePath("GET audit") + qs(q)),
  settings: () => request<Settings>("GET", routePath("GET settings")),
  updateSettings: (urgent_severity_threshold: number) => request<Settings>("PATCH", routePath("PATCH settings"), { urgent_severity_threshold }),
};
