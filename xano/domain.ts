// The template's own backend: its tables, the shared rule path, its endpoints, agent tools and assistant tools
// (BASELINE.md). xano/index.ts registers everything listed here, beside the base app and the modules.
//
// Every endpoint or tool that writes one of these tables reaches `changed(...)` (through apply_action, which both
// the REST endpoints and the approval actions call), so open screens update live and the activity feed records it.
import { monitored_account } from "./table/monitored_account.js";
import { alert } from "./table/alert.js";
import { finding } from "./table/finding.js";
import { audit_event } from "./table/audit_event.js";
import { loadActor, applyAction } from "./function/actor.js";
import { applyTriage, freezeAccount } from "./function/approval_actions.js";
import { api } from "./query/api.js";
import { listAlerts, getAlert, actAlert, addFinding, createAlert, editAlert } from "./query/api/alerts.js";
import { listAccounts, getAccount, updateAccountApi, freezeAccountApi, unfreezeAccountApi } from "./query/api/accounts.js";
import { listAudit, getTriageSettings, updateTriageSettings } from "./query/api/audit.js";
import { triageAgentTools } from "./query/agent/mcp.js";
import { triageAssistantTools } from "./query/assistant-tools.js";

export const tables = [monitored_account, alert, finding, audit_event];
export const functions = [loadActor, applyAction, applyTriage, freezeAccount];
export const apiGroups = [api];
export const queries = [
  listAlerts, getAlert, actAlert, addFinding, createAlert, editAlert,
  listAccounts, getAccount, updateAccountApi, freezeAccountApi, unfreezeAccountApi,
  listAudit, getTriageSettings, updateTriageSettings,
];

export const agentTools = triageAgentTools;
export const agentPrompts = [];
export const agentResources = [];

export const assistantTools = triageAssistantTools;
export const assistantPrompt = [
  "You are the Fraud assistant, inside Agent Fraud-Triage API, where a fraud team triages alerts on monitored customer accounts.",
  "An alert has a severity (1 low to 5 critical), a kind (login_anomaly, velocity, device_change, geo_mismatch, chargeback_pattern) and a status (open, escalated, cleared). An account is active or frozen.",
  "Roles: analysts clear or escalate alerts, add findings, and can only recommend a freeze; seniors also freeze accounts and manage the team.",
  "Use queue_summary for counts; find_alerts to look up alerts by their reason (it returns in-app links); draft_triage to propose a clear or escalate.",
  "A triage or a freeze is NEVER done until a person approves it in the app: say it is ready to review and give the approval_id.",
  "Only state facts a tool returned; never invent an account, an alert or a number. Answer briefly with light Markdown; show no ids or raw timestamps you were not given.",
  "End with one next step as a link: [Open the board](/board), [Open the queue](/alerts) or [Open the audit trail](/audit).",
].join(" ");
