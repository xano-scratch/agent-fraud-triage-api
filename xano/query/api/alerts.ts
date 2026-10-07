import { auth, c, cmp, col, expr, fl, guard, inp, input, obj, query, ref, s, withFilters } from "@xano/sdk";
import type { InferRow } from "@xano/sdk";
import { user } from "../../table/user.js";
import { alert } from "../../table/alert.js";
import { monitored_account } from "../../table/monitored_account.js";
import { finding } from "../../table/finding.js";
import { audit_event } from "../../table/audit_event.js";
import { api } from "../api.js";
import { rbac } from "../../rbac.js";
import { applyAction } from "../../function/actor.js";
import { changed, notify } from "../../base/index.js";

type AlertRow = InferRow<typeof alert>;
type AlertPage = { items: AlertRow[]; curPage: number; nextPage: number | null; prevPage: number | null; itemsTotal: number; pageTotal: number };

/** GET api:alerts — the queue. Filters status, severity (minimum), kind, q (reason), and "assigned to me"; paged. */
export const listAlerts = query({
  name: "alerts", verb: "GET", apiGroup: api, auth: user,
  input: { status: input.text(), severity: input.int(), kind: input.text(), q: input.text(), mine: input.bool(), page: input.int(), per_page: input.int() },
  stack: [
    ...rbac.require("alerts.triage"),
    s.set_var("size", c.int(20)),
    s.conditional({ when: expr(inp("per_page"), ">", c.int(0)), then: [s.update_var("size", inp("per_page"))] }),
    s.conditional({ when: expr(ref("size"), ">", c.int(200)), then: [s.update_var("size", c.int(200))] }),
    s.conditional({
      when: expr(inp("mine"), "=", c.bool(true)),
      then: [s.db.query({
        table: alert,
        where: [
          expr(col("assignee_id"), "=", auth("id")),
          cmp(col("status"), "=", inp("status"), { ignoreEmpty: true }),
          cmp(col("severity"), ">=", inp("severity"), { ignoreEmpty: true }),
          cmp(col("kind"), "=", inp("kind"), { ignoreEmpty: true }),
          cmp(col("reason"), "includes", inp("q"), { ignoreEmpty: true }),
        ],
        sort: [{ sortBy: "severity", dir: "desc" }, { sortBy: "created_at", dir: "desc" }],
        paging: { page: inp("page"), per_page: ref("size"), metadata: true, totals: true }, as: "rows",
      })],
      else: [s.db.query({
        table: alert,
        where: [
          cmp(col("status"), "=", inp("status"), { ignoreEmpty: true }),
          cmp(col("severity"), ">=", inp("severity"), { ignoreEmpty: true }),
          cmp(col("kind"), "=", inp("kind"), { ignoreEmpty: true }),
          cmp(col("reason"), "includes", inp("q"), { ignoreEmpty: true }),
        ],
        sort: [{ sortBy: "severity", dir: "desc" }, { sortBy: "created_at", dir: "desc" }],
        paging: { page: inp("page"), per_page: ref("size"), metadata: true, totals: true }, as: "rows",
      })],
    }),
  ],
  response: ref("rows"),
  responseShape: {} as AlertPage,
});

/** GET api:alerts/{id} — one alert with its account, its findings, and its slice of the audit trail. */
export const getAlert = query({
  name: "alerts/{id}", verb: "GET", apiGroup: api, auth: user,
  input: { id: input.int({ required: true }) },
  stack: [
    ...rbac.require("alerts.triage"),
    s.db.get({ table: alert, fieldValue: inp("id"), as: "al" }),
    guard.found("al", { message: "No such alert." }),
    s.db.get({ table: monitored_account, fieldValue: ref("al.account_id"), as: "acct" }),
    guard.found("acct", { message: "The account for this alert is missing." }),
    s.db.query({ table: finding, where: expr(col("alert_id"), "=", inp("id")), sort: [{ sortBy: "created_at", dir: "desc" }], paging: { per_page: 100, metadata: false }, as: "findings" }),
    s.db.query({ table: audit_event, where: expr(col("alert_id"), "=", inp("id")), sort: [{ sortBy: "created_at", dir: "desc" }], paging: { per_page: 100, metadata: false }, as: "audit" }),
  ],
  response: { alert: ref("al"), account: ref("acct"), findings: ref("findings"), audit: ref("audit") },
  responseShape: {} as { alert: AlertRow; account: InferRow<typeof monitored_account>; findings: InferRow<typeof finding>[]; audit: InferRow<typeof audit_event>[] },
});

/** POST api:alerts/{id}/act — clear or escalate an OPEN alert, through the shared rule path (audited). */
export const actAlert = query({
  name: "alerts/{id}/act", verb: "POST", apiGroup: api, auth: user,
  input: { id: input.int({ required: true }), action: input.enum(["clear", "escalate"], { required: true }), note: input.text() },
  stack: [
    ...rbac.require("alerts.triage"),
    s.db.get({ table: alert, fieldValue: inp("id"), as: "al" }),
    guard.found("al", { message: "No such alert." }),
    guard.require(expr(ref("al.status"), "=", c.text("open")), { errorType: "badrequest", message: "Only an open alert can be cleared or escalated." }),
    s.function.run({ fn: applyAction, input: {
      action: inp("action"), alert_id: inp("id"), account_id: c.int(0), actor_id: auth("id"), actor_kind: c.text("human"), via: c.text(""), detail: inp("note"),
    }, as: "r" }),
    s.db.get({ table: alert, fieldValue: inp("id"), as: "updated" }),
    guard.found("updated", { message: "No such alert." }),
  ],
  response: ref("updated"),
  responseShape: {} as AlertRow,
});

/** POST api:alerts/{id}/findings — add a finding (audited as add_finding). Returns the alert's findings, newest first. */
export const addFinding = query({
  name: "alerts/{id}/findings", verb: "POST", apiGroup: api, auth: user,
  input: { id: input.int({ required: true }), note: input.text({ required: true, methods: ["trim"] }) },
  stack: [
    ...rbac.require("alerts.triage"),
    guard.require(expr(withFilters(inp("note"), fl.strlen()), ">=", c.int(1)), { errorType: "badrequest", message: "Write a finding first." }),
    guard.require(expr(withFilters(inp("note"), fl.strlen()), "<=", c.int(500)), { errorType: "badrequest", message: "Keep a finding under 500 characters." }),
    s.db.get({ table: alert, fieldValue: inp("id"), as: "al" }),
    guard.found("al", { message: "No such alert." }),
    s.function.run({ fn: applyAction, input: {
      action: c.text("add_finding"), alert_id: inp("id"), account_id: c.int(0), actor_id: auth("id"), actor_kind: c.text("human"), via: c.text(""), detail: inp("note"),
    }, as: "r" }),
    s.db.query({ table: finding, where: expr(col("alert_id"), "=", inp("id")), sort: [{ sortBy: "created_at", dir: "desc" }], paging: { per_page: 100, metadata: false }, as: "findings" }),
  ],
  response: ref("findings"),
  responseShape: [] as InferRow<typeof finding>[],
});

/** POST api:alerts — open a manual alert on an account. */
export const createAlert = query({
  name: "alerts", verb: "POST", apiGroup: api, auth: user,
  input: {
    account_id: input.int({ required: true }), severity: input.int({ required: true }),
    kind: input.enum(["login_anomaly", "velocity", "device_change", "geo_mismatch", "chargeback_pattern"], { required: true }),
    reason: input.text({ methods: ["trim"] }), assignee_id: input.int(),
  },
  stack: [
    ...rbac.require("alerts.triage"),
    guard.require(expr(inp("severity"), ">=", c.int(1)), { errorType: "badrequest", message: "Severity is 1 to 5." }),
    guard.require(expr(inp("severity"), "<=", c.int(5)), { errorType: "badrequest", message: "Severity is 1 to 5." }),
    s.db.get({ table: monitored_account, fieldValue: inp("account_id"), as: "acct" }),
    guard.found("acct", { errorType: "badrequest", message: "No such account." }),
    s.db.add({ table: alert, row: {
      account_id: inp("account_id"), severity: inp("severity"), kind: inp("kind"), reason: inp("reason"), status: c.text("open"), assignee_id: inp("assignee_id"),
    }, as: "created" }),
    changed({ entity: "alert", id: ref("created.id"), op: "created", link: withFilters(c.text("/alerts?open="), fl.concat(ref("created.id"))),
      title: withFilters(c.text("opened an alert on "), fl.concat(ref("acct.holder_name"))) }),
    s.conditional({ when: expr(inp("assignee_id"), ">", c.int(0)), then: [
      notify({ to: inp("assignee_id"), kind: "assigned", link: withFilters(c.text("/alerts?open="), fl.concat(ref("created.id"))),
        title: withFilters(c.text("You're on a new alert for "), fl.concat(ref("acct.holder_name"))) }),
    ] }),
  ],
  response: ref("created"),
  responseShape: {} as AlertRow,
});

/** PATCH api:alerts/{id} — edit severity, reason or assignee on an OPEN alert. */
export const editAlert = query({
  name: "alerts/{id}", verb: "PATCH", apiGroup: api, auth: user,
  input: { id: input.int({ required: true }), severity: input.int(), reason: input.text({ methods: ["trim"] }), assignee_id: input.int(), clear_assignee: input.bool() },
  stack: [
    ...rbac.require("alerts.triage"),
    s.db.get({ table: alert, fieldValue: inp("id"), as: "al" }),
    guard.found("al", { message: "No such alert." }),
    guard.require(expr(ref("al.status"), "=", c.text("open")), { errorType: "badrequest", message: "Only an open alert can be edited." }),
    s.conditional({ when: expr(inp("severity"), "!=", c.null()), then: [
      guard.require(expr(inp("severity"), ">=", c.int(1)), { errorType: "badrequest", message: "Severity is 1 to 5." }),
      guard.require(expr(inp("severity"), "<=", c.int(5)), { errorType: "badrequest", message: "Severity is 1 to 5." }),
    ] }),
    s.set_var("data", obj({})),
    s.conditional({ when: expr(inp("severity"), "!=", c.null()), then: [s.update_var("data", withFilters(ref("data"), fl.set(c.text("severity"), inp("severity"))))] }),
    s.conditional({ when: expr(inp("reason"), "!=", c.null()), then: [s.update_var("data", withFilters(ref("data"), fl.set(c.text("reason"), inp("reason"))))] }),
    s.conditional({ when: expr(inp("assignee_id"), "!=", c.null()), then: [s.update_var("data", withFilters(ref("data"), fl.set(c.text("assignee_id"), inp("assignee_id"))))] }),
    s.conditional({ when: expr(inp("clear_assignee"), "=", c.bool(true)), then: [s.update_var("data", withFilters(ref("data"), fl.set(c.text("assignee_id"), c.int(0))))] }),
    s.db.patch({ table: alert, fieldValue: inp("id"), data: ref("data"), as: "updated" }),
    changed({ entity: "alert", id: inp("id"), op: "updated", link: withFilters(c.text("/alerts?open="), fl.concat(inp("id"))) }),
    s.conditional({ when: expr(inp("assignee_id"), ">", c.int(0)), then: [
      notify({ to: inp("assignee_id"), kind: "assigned", link: withFilters(c.text("/alerts?open="), fl.concat(inp("id"))),
        title: withFilters(c.text("You're on alert #"), fl.concat(inp("id"))) }),
    ] }),
  ],
  response: ref("updated"),
  responseShape: {} as AlertRow,
});
