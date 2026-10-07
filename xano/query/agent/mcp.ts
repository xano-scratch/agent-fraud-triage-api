import { c, cmp, col, expr, fl, guard, inp, input, obj, or, ref, s, withFilters } from "@xano/sdk";
import { alert } from "../../table/alert.js";
import { monitored_account } from "../../table/monitored_account.js";
import { finding } from "../../table/finding.js";
import { agent } from "../../agent.js";
import { approvals } from "../../approvals.js";
import { rbac } from "../../rbac.js";
import { applyAction } from "../../function/actor.js";
import { notifyRoles } from "../../base/index.js";

// Every tool runs agent.tool's key check first, acts on ref("conn.user_id"), and holds no more than its person
// (rbac.allows(ref("person.role"), …)). Write tools need a read-and-write key. Nothing freezes directly: the
// agent can only recommend a freeze, which a senior approves.

export const listOpenAlerts = agent.tool({
  name: "list_open_alerts", access: "read", title: "List open alerts",
  description: "The open fraud-alert queue, most severe first. Each row has id, severity (1-5), kind, reason, the account id and the assignee. Works on a read-only key.",
  stack: [
    rbac.allows(ref("person.role"), "alerts.triage"),
    s.db.query({ table: alert, where: expr(col("status"), "=", c.text("open")), sort: [{ sortBy: "severity", dir: "desc" }, { sortBy: "created_at", dir: "desc" }], paging: { per_page: 50, metadata: false }, as: "rows" }),
  ],
  response: ref("rows"),
});

export const getAlertTool = agent.tool({
  name: "get_alert", access: "read", title: "Get one alert",
  description: "One alert with its monitored account and its findings, for grounding before a triage. Works on a read-only key.",
  input: { id: input.int({ required: true }) },
  stack: [
    rbac.allows(ref("person.role"), "alerts.triage"),
    s.db.get({ table: alert, fieldValue: inp("id"), as: "al" }),
    guard.found("al", { errorType: "notfound", message: "No such alert." }),
    s.db.get({ table: monitored_account, fieldValue: ref("al.account_id"), as: "acct" }),
    s.db.query({ table: finding, where: expr(col("alert_id"), "=", inp("id")), sort: [{ sortBy: "created_at", dir: "desc" }], paging: { per_page: 50, metadata: false }, as: "findings" }),
  ],
  response: { alert: ref("al"), account: ref("acct"), findings: ref("findings") },
});

export const searchAccounts = agent.tool({
  name: "search_accounts", access: "read", title: "Search accounts",
  description: "Find a monitored account by holder name or account number. Works on a read-only key.",
  input: { q: input.text({ required: true }) },
  stack: [
    rbac.allows(ref("person.role"), "alerts.triage"),
    s.db.query({ table: monitored_account, where: or(cmp(col("holder_name"), "includes", inp("q")), cmp(col("account_number"), "includes", inp("q"))), sort: [{ sortBy: "holder_name", dir: "asc" }], paging: { per_page: 20, metadata: false }, as: "rows" }),
  ],
  response: ref("rows"),
});

export const triageAlert = agent.tool({
  name: "triage_alert", access: "write", asksApproval: true,
  title: "Draft a triage for an alert",
  description: "Draft a clear or escalate on an OPEN alert for the person to approve. It is NOT applied: the person approves it in the app and you get an approval_id. Needs a read-and-write key.",
  logDetail: withFilters(c.text("asked to triage alert #"), fl.concat(inp("id"))),
  input: { id: input.int({ required: true }), action: input.enum(["clear", "escalate"], { required: true }), note: input.text({ required: true }) },
  stack: [
    rbac.allows(ref("person.role"), "alerts.triage"),
    s.db.get({ table: alert, fieldValue: inp("id"), as: "al" }),
    guard.found("al", { errorType: "notfound", message: "No such alert." }),
    guard.require(expr(ref("al.status"), "=", c.text("open")), { errorType: "badrequest", message: "That alert isn't open any more." }),
    approvals.request({
      ...agent.asker, action: "apply_triage",
      title: withFilters(c.text("Triage ("), fl.concat(inp("action")), fl.concat(c.text(") alert #")), fl.concat(inp("id"))),
      preview: inp("note"),
      link: withFilters(c.text("/alerts?open="), fl.concat(inp("id"))),
      payload: obj({ alert_id: inp("id"), action: inp("action"), note: inp("note"), via: ref("conn.name"), actor_kind: c.text("agent") }),
    }),
  ],
  response: ref("approval"),
});

export const addFindingTool = agent.tool({
  name: "add_finding", access: "write", title: "Add a finding to an alert",
  description: "Append a finding (a short note of what you checked) to an alert. Logged as an agent action and applied directly. Needs a read-and-write key.",
  logDetail: withFilters(c.text("added a finding to alert #"), fl.concat(inp("id"))),
  input: { id: input.int({ required: true }), note: input.text({ required: true }) },
  stack: [
    rbac.allows(ref("person.role"), "alerts.triage"),
    s.db.get({ table: alert, fieldValue: inp("id"), as: "al" }),
    guard.found("al", { errorType: "notfound", message: "No such alert." }),
    guard.require(expr(withFilters(inp("note"), fl.strlen()), ">=", c.int(1)), { errorType: "badrequest", message: "Write a finding first." }),
    s.function.run({ fn: applyAction, input: {
      action: c.text("add_finding"), alert_id: inp("id"), account_id: c.int(0), actor_id: ref("conn.user_id"), actor_kind: c.text("agent"), via: ref("conn.name"), detail: inp("note"),
    }, as: "r" }),
  ],
  response: { ok: c.bool(true), alert_id: inp("id") },
});

export const recommendFreeze = agent.tool({
  name: "recommend_freeze", access: "write", asksApproval: true,
  title: "Recommend freezing an account",
  description: "Draft a freeze recommendation on a monitored account. You cannot freeze directly: a senior approves it in the app and you get an approval_id. Needs a read-and-write key.",
  logDetail: withFilters(c.text("recommended freezing account #"), fl.concat(inp("account_id"))),
  input: { account_id: input.int({ required: true }), reason: input.text({ required: true }) },
  stack: [
    rbac.allows(ref("person.role"), "alerts.triage"),
    s.db.get({ table: monitored_account, fieldValue: inp("account_id"), as: "acct" }),
    guard.found("acct", { errorType: "notfound", message: "No such account." }),
    guard.require(expr(ref("acct.status"), "=", c.text("active")), { errorType: "badrequest", message: "That account is already frozen." }),
    approvals.request({
      ...agent.asker, action: "freeze_account",
      title: withFilters(c.text("Freeze "), fl.concat(ref("acct.holder_name")), fl.concat(c.text("'s account"))),
      preview: inp("reason"),
      link: withFilters(c.text("/accounts/"), fl.concat(inp("account_id"))),
      payload: obj({ account_id: inp("account_id"), reason: inp("reason") }),
    }),
    notifyRoles({ roles: rbac.rolesWith("accounts.freeze"), kind: "approval", link: "/approvals", actor: ref("conn.user_id"),
      title: withFilters(ref("conn.name"), fl.concat(c.text(" recommends freezing ")), fl.concat(ref("acct.holder_name"))) }),
  ],
  response: ref("approval"),
});

export const triageAgentTools = [listOpenAlerts, getAlertTool, searchAccounts, triageAlert, addFindingTool, recommendFreeze];
