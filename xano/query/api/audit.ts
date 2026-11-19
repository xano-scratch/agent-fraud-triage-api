import { c, cmp, col, expr, guard, inp, input, obj, query, ref, s } from "@xano/sdk";
import type { InferRow } from "@xano/sdk";
import { user } from "../../table/user.js";
import { audit_event } from "../../table/audit_event.js";
import { api } from "../api.js";
import { rbac } from "../../rbac.js";
import { changed, workspace_setting } from "../../base/index.js";

type AuditRow = InferRow<typeof audit_event>;
type AuditPage = { items: AuditRow[]; curPage: number; nextPage: number | null; prevPage: number | null; itemsTotal: number; pageTotal: number };

/**
 * GET api:audit — the governed trail, newest first. Filters action, allowed (allowed|refused), actor_kind, and
 * optionally one alert or account. The allowed filter is a three-way branch because an explicit `false` can't be
 * expressed with ignoreEmpty.
 */
export const listAudit = query({
  name: "audit", verb: "GET", apiGroup: api, auth: user,
  input: { action: input.text(), allowed: input.text(), actor_kind: input.text(), alert_id: input.int(), account_id: input.int(), page: input.int(), per_page: input.int() },
  stack: [
    ...rbac.require("audit.read"),
    s.set_var("size", c.int(25)),
    s.conditional({ when: expr(inp("per_page"), ">", c.int(0)), then: [s.update_var("size", inp("per_page"))] }),
    s.conditional({ when: expr(ref("size"), ">", c.int(200)), then: [s.update_var("size", c.int(200))] }),
    s.conditional({
      when: expr(inp("allowed"), "=", c.text("allowed")),
      then: [s.db.query({
        table: audit_event,
        where: [
          cmp(col("action"), "=", inp("action"), { ignoreEmpty: true }),
          cmp(col("actor_kind"), "=", inp("actor_kind"), { ignoreEmpty: true }),
          cmp(col("alert_id"), "=", inp("alert_id"), { ignoreEmpty: true }),
          cmp(col("account_id"), "=", inp("account_id"), { ignoreEmpty: true }),
          expr(col("allowed"), "=", c.bool(true)),
        ],
        sort: [{ sortBy: "created_at", dir: "desc" }], paging: { page: inp("page"), per_page: ref("size"), metadata: true, totals: true }, as: "rows",
      })],
      elif: [{
        when: expr(inp("allowed"), "=", c.text("refused")),
        then: [s.db.query({
          table: audit_event,
          where: [
            cmp(col("action"), "=", inp("action"), { ignoreEmpty: true }),
            cmp(col("actor_kind"), "=", inp("actor_kind"), { ignoreEmpty: true }),
            cmp(col("alert_id"), "=", inp("alert_id"), { ignoreEmpty: true }),
            cmp(col("account_id"), "=", inp("account_id"), { ignoreEmpty: true }),
            expr(col("allowed"), "=", c.bool(false)),
          ],
          sort: [{ sortBy: "created_at", dir: "desc" }], paging: { page: inp("page"), per_page: ref("size"), metadata: true, totals: true }, as: "rows",
        })],
      }],
      else: [s.db.query({
        table: audit_event,
        where: [
          cmp(col("action"), "=", inp("action"), { ignoreEmpty: true }),
          cmp(col("actor_kind"), "=", inp("actor_kind"), { ignoreEmpty: true }),
          cmp(col("alert_id"), "=", inp("alert_id"), { ignoreEmpty: true }),
          cmp(col("account_id"), "=", inp("account_id"), { ignoreEmpty: true }),
        ],
        sort: [{ sortBy: "created_at", dir: "desc" }], paging: { page: inp("page"), per_page: ref("size"), metadata: true, totals: true }, as: "rows",
      })],
    }),
  ],
  response: ref("rows"),
  responseShape: {} as AuditPage,
});

type Settings = { urgent_severity_threshold: number };

/** GET api:settings — the domain's one setting: the severity at and above which an alert is Urgent. Anyone signed in. */
export const getTriageSettings = query({
  name: "settings", verb: "GET", apiGroup: api, auth: user,
  stack: [
    ...rbac.signedIn(),
    s.db.get({ table: workspace_setting, fieldValue: c.int(1), output: ["id", "urgent_severity_threshold"], as: "row" }),
    guard.found("row", { message: "The workspace has no settings row." }),
  ],
  response: { urgent_severity_threshold: ref("row.urgent_severity_threshold") },
  responseShape: {} as Settings,
});

/** PATCH api:settings — set the urgent-severity threshold (1-5). Seniors only (team.manage). */
export const updateTriageSettings = query({
  name: "settings", verb: "PATCH", apiGroup: api, auth: user,
  input: { urgent_severity_threshold: input.int({ required: true }) },
  stack: [
    ...rbac.require("team.manage", "Only people who manage the team change the settings."),
    guard.require(expr(inp("urgent_severity_threshold"), ">=", c.int(1)), { errorType: "badrequest", message: "The threshold is 1 to 5." }),
    guard.require(expr(inp("urgent_severity_threshold"), "<=", c.int(5)), { errorType: "badrequest", message: "The threshold is 1 to 5." }),
    s.db.patch({ table: workspace_setting, fieldValue: c.int(1), data: obj({ urgent_severity_threshold: inp("urgent_severity_threshold") }) }),
    changed({ entity: "settings", id: c.int(1), verb: "updated", link: "/",
      title: "updated the urgent-severity threshold" }),
    s.db.get({ table: workspace_setting, fieldValue: c.int(1), output: ["id", "urgent_severity_threshold"], as: "row" }),
    guard.found("row", { message: "The workspace has no settings row." }),
  ],
  response: { urgent_severity_threshold: ref("row.urgent_severity_threshold") },
  responseShape: {} as Settings,
});
