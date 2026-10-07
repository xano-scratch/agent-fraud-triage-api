import { auth, c, cmp, col, expr, fl, guard, inp, input, obj, ref, s, tool, withFilters } from "@xano/sdk";
import { alert } from "../table/alert.js";
import { monitored_account } from "../table/monitored_account.js";
import { approvals } from "../approvals.js";
import { rbac } from "../rbac.js";

// The in-app assistant's tools (CHATBOT.md). auth("id") here is the person chatting; each tool starts with the
// same guard as the REST endpoint it mirrors. Reads stay small; the one write drafts an approval, never acts.

export const queueSummary = tool({
  name: "queue_summary", title: "Summarise the queue",
  description: "Counts for the fraud queue: open alerts, escalated alerts, open alerts at or above the urgent severity, and frozen accounts. Any analyst or senior.",
  annotations: { readOnlyHint: true },
  stack: [
    ...rbac.require("alerts.triage"),
    s.db.query({ table: alert, where: expr(col("status"), "=", c.text("open")), returnType: "count", as: "open_count" }),
    s.db.query({ table: alert, where: expr(col("status"), "=", c.text("escalated")), returnType: "count", as: "escalated_count" }),
    s.db.query({ table: alert, where: [expr(col("status"), "=", c.text("open")), expr(col("severity"), ">=", c.int(4))], returnType: "count", as: "urgent_count" }),
    s.db.query({ table: monitored_account, where: expr(col("status"), "=", c.text("frozen")), returnType: "count", as: "frozen_count" }),
  ],
  response: { open: ref("open_count"), escalated: ref("escalated_count"), urgent_open: ref("urgent_count"), frozen_accounts: ref("frozen_count") },
});

export const findAlerts = tool({
  name: "find_alerts", title: "Find alerts",
  description: "Search open-or-any fraud alerts by their reason text, most severe first. Returns id, severity (1-5), kind, status and an in-app link. Any analyst or senior.",
  annotations: { readOnlyHint: true },
  input: {
    q: input.text({ description: "Match this text in the alert's reason. Leave out to list by severity." }),
    status: input.enum(["open", "escalated", "cleared"], { description: "Only alerts at this status." }),
  },
  stack: [
    ...rbac.require("alerts.triage"),
    s.db.query({
      table: alert,
      where: [cmp(col("reason"), "includes", inp("q"), { ignoreEmpty: true }), cmp(col("status"), "=", inp("status"), { ignoreEmpty: true })],
      sort: [{ sortBy: "severity", dir: "desc" }, { sortBy: "created_at", dir: "desc" }],
      paging: { per_page: 15, metadata: false }, output: ["id", "severity", "kind", "reason", "status"], as: "rows",
    }),
    s.array.map({ source: ref("rows"), as: "out", transform: {
      id: ref("$this.id"), severity: ref("$this.severity"), kind: ref("$this.kind"), reason: ref("$this.reason"), status: ref("$this.status"),
      link: withFilters(c.text("/alerts?open="), fl.concat(ref("$this.id"))),
    } }),
  ],
  response: ref("out"),
});

export const draftTriage = tool({
  name: "draft_triage", title: "Draft a triage",
  description: "Draft a clear or escalate on an OPEN alert for the person to approve. It is NOT applied: a person approves it in the app. Tell them it is ready to review, and give the approval_id. Any analyst or senior.",
  input: { id: input.int({ required: true }), action: input.enum(["clear", "escalate"], { required: true }), note: input.text({ required: true }) },
  stack: [
    ...rbac.require("alerts.triage"),
    s.db.get({ table: alert, fieldValue: inp("id"), as: "al" }),
    guard.found("al", { errorType: "notfound", message: "No such alert." }),
    guard.require(expr(ref("al.status"), "=", c.text("open")), { errorType: "badrequest", message: "That alert isn't open any more." }),
    approvals.request({
      user_id: auth("id"), source: "assistant", agent_label: c.text("Fraud assistant"), action: "apply_triage",
      title: withFilters(c.text("Triage ("), fl.concat(inp("action")), fl.concat(c.text(") alert #")), fl.concat(inp("id"))),
      preview: inp("note"),
      link: withFilters(c.text("/alerts?open="), fl.concat(inp("id"))),
      payload: obj({ alert_id: inp("id"), action: inp("action"), note: inp("note"), via: c.text("Fraud assistant"), actor_kind: c.text("assistant") }),
    }),
  ],
  response: ref("approval"),
});

export const triageAssistantTools = [queueSummary, findAlerts, draftTriage];
