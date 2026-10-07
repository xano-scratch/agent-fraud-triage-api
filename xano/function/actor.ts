// The two shared functions a human and an agent both reach, so their authority can never drift apart (Play 4).
import { c, cmp, col, defineFunction, expr, fl, guard, inp, input, obj, or, ref, s, withFilters } from "@xano/sdk";
import { user } from "../table/user.js";
import { alert } from "../table/alert.js";
import { monitored_account } from "../table/monitored_account.js";
import { finding } from "../table/finding.js";
import { audit_event, RULE_FREEZE, RULE_TRIAGE } from "../table/audit_event.js";
import { rbac } from "../rbac.js";
import { changed, notify, notifyRoles } from "../base/index.js";

const acctLink = withFilters(c.text("/accounts/"), fl.concat(inp("account_id")));
const alertLink = withFilters(c.text("/alerts?open="), fl.concat(inp("alert_id")));

/** Resolve a caller id to the row every rule reads: id, name and role. 401 if the person is gone. */
export const loadActor = defineFunction({
  name: "triage/load_actor",
  description: "Resolve a user id to { id, name, role } for the shared rule path. 401 if the person no longer exists.",
  input: { actor_id: input.int({ required: true }) },
  stack: [
    s.db.get({ table: user, fieldValue: inp("actor_id"), output: ["id", "name", "role"], as: "u" }),
    guard.found("u", { errorType: "unauthorized", message: "Sign in again." }),
  ],
  response: { id: ref("u.id"), name: ref("u.name"), role: ref("u.role") },
});

/**
 * The single authority gate every write path runs through: a REST endpoint, an approval action, the same code.
 * It loads the actor, checks the ONE permission the action needs (accounts.freeze for freeze/unfreeze, else
 * alerts.triage), and:
 *  - allowed: applies the state change, writes audit_event(allowed=true, rule) and calls changed();
 *  - refused: writes audit_event(allowed=false, rule) FIRST (so the refusal is on the trail), then raises 403.
 * The audit row is written either way — that is what makes "every attempt is audited" true for people and agents.
 */
export const applyAction = defineFunction({
  name: "triage/apply_action",
  description: "The shared rule path: check the action's permission, apply it or refuse it, and audit the attempt either way.",
  input: {
    action: input.enum(["clear", "escalate", "freeze", "unfreeze", "add_finding"], { required: true }),
    alert_id: input.int({ default: 0 }),
    account_id: input.int({ default: 0 }),
    actor_id: input.int({ required: true }),
    actor_kind: input.enum(["human", "agent", "assistant"], { required: true }),
    via: input.text(),
    detail: input.text(),
  },
  stack: [
    s.function.run({ fn: loadActor, input: { actor_id: inp("actor_id") }, as: "actor" }),
    s.set_var("rule", c.text(RULE_TRIAGE)),
    s.conditional({
      when: or(expr(inp("action"), "=", c.text("freeze")), expr(inp("action"), "=", c.text("unfreeze"))),
      // ── Account actions: freeze / unfreeze — need accounts.freeze (seniors) ──────────────────────────
      then: [
        s.update_var("rule", c.text(RULE_FREEZE)),
        s.conditional({
          when: rbac.has(ref("actor.role"), "accounts.freeze"),
          then: [
            s.db.get({ table: monitored_account, fieldValue: inp("account_id"), as: "acct" }),
            guard.found("acct", { message: "No such account." }),
            s.conditional({
              when: expr(inp("action"), "=", c.text("freeze")),
              then: [
                s.db.patch({ table: monitored_account, fieldValue: inp("account_id"),
                  data: obj({ status: c.text("frozen"), frozen_by: inp("actor_id"), frozen_at: c.now() }) }),
                changed({ entity: "account", id: inp("account_id"), op: "updated", actor: inp("actor_id"), via: inp("via"), link: acctLink,
                  title: withFilters(c.text("froze "), fl.concat(ref("acct.holder_name")), fl.concat(c.text("'s account"))) }),
                notifyRoles({ roles: rbac.rolesWith("accounts.freeze"), kind: "freeze", actor: inp("actor_id"), link: acctLink,
                  title: withFilters(ref("acct.holder_name"), fl.concat(c.text("'s account was frozen"))) }),
                // Tell the analysts working this account's open alerts.
                s.db.query({ table: alert, where: [expr(col("account_id"), "=", inp("account_id")), cmp(col("status"), "in", c.array(["open", "escalated"]))],
                  output: ["assignee_id"], paging: { per_page: 100, metadata: false }, as: "openAlerts" }),
                s.foreach({ list: ref("openAlerts"), as: "oa", body: [
                  s.conditional({ when: expr(ref("oa.assignee_id"), ">", c.int(0)), then: [
                    notify({ to: ref("oa.assignee_id"), kind: "freeze", actor: inp("actor_id"), link: acctLink,
                      title: withFilters(ref("acct.holder_name"), fl.concat(c.text("'s account was frozen"))) }),
                  ] }),
                ] }),
              ],
              else: [ // unfreeze
                s.db.patch({ table: monitored_account, fieldValue: inp("account_id"),
                  data: obj({ status: c.text("active"), frozen_by: c.int(0), frozen_at: c.null() }) }),
                changed({ entity: "account", id: inp("account_id"), op: "updated", actor: inp("actor_id"), via: inp("via"), link: acctLink,
                  title: withFilters(c.text("unfroze "), fl.concat(ref("acct.holder_name")), fl.concat(c.text("'s account"))) }),
                notifyRoles({ roles: rbac.rolesWith("accounts.freeze"), kind: "unfreeze", actor: inp("actor_id"), link: acctLink,
                  title: withFilters(ref("acct.holder_name"), fl.concat(c.text("'s account was unfrozen"))) }),
              ],
            }),
            s.db.add({ table: audit_event, row: {
              account_id: inp("account_id"), alert_id: c.int(0), actor_kind: inp("actor_kind"), actor_id: inp("actor_id"),
              via: inp("via"), action: inp("action"), allowed: c.bool(true), rule: ref("rule"), detail: inp("detail"),
            }, as: "evt" }),
            changed({ entity: "audit_event", id: ref("evt.id"), op: "created", actor: inp("actor_id") }),
          ],
          else: [ // refused: audit the attempt, then 403
            s.db.add({ table: audit_event, row: {
              account_id: inp("account_id"), alert_id: c.int(0), actor_kind: inp("actor_kind"), actor_id: inp("actor_id"),
              via: inp("via"), action: inp("action"), allowed: c.bool(false), rule: ref("rule"), detail: inp("detail"),
            }, as: "evt" }),
            changed({ entity: "audit_event", id: ref("evt.id"), op: "created", actor: inp("actor_id") }),
            guard.require(expr(c.int(0), "=", c.int(1)), { errorType: "accessdenied", message: RULE_FREEZE }),
          ],
        }),
      ],
      // ── Alert actions: clear / escalate / add_finding — need alerts.triage (both roles) ──────────────
      else: [
        s.conditional({
          when: rbac.has(ref("actor.role"), "alerts.triage"),
          then: [
            s.db.get({ table: alert, fieldValue: inp("alert_id"), as: "al" }),
            guard.found("al", { message: "No such alert." }),
            s.conditional({
              when: expr(inp("action"), "=", c.text("add_finding")),
              then: [
                s.db.add({ table: finding, row: { alert_id: inp("alert_id"), author_id: inp("actor_id"), actor_kind: inp("actor_kind"), note: inp("detail") } }),
                changed({ entity: "alert", id: inp("alert_id"), op: "updated", actor: inp("actor_id"), via: inp("via"), link: alertLink,
                  title: withFilters(c.text("added a finding on alert #"), fl.concat(inp("alert_id"))) }),
              ],
              else: [
                s.conditional({
                  when: expr(inp("action"), "=", c.text("clear")),
                  then: [
                    s.db.patch({ table: alert, fieldValue: inp("alert_id"), data: obj({ status: c.text("cleared") }) }),
                    changed({ entity: "alert", id: inp("alert_id"), op: "moved", actor: inp("actor_id"), via: inp("via"), link: alertLink,
                      title: withFilters(c.text("cleared alert #"), fl.concat(inp("alert_id"))) }),
                  ],
                  else: [ // escalate
                    s.db.patch({ table: alert, fieldValue: inp("alert_id"), data: obj({ status: c.text("escalated") }) }),
                    changed({ entity: "alert", id: inp("alert_id"), op: "moved", actor: inp("actor_id"), via: inp("via"), link: alertLink,
                      title: withFilters(c.text("escalated alert #"), fl.concat(inp("alert_id"))) }),
                    notifyRoles({ roles: rbac.rolesWith("accounts.freeze"), kind: "escalation", actor: inp("actor_id"), link: alertLink,
                      title: withFilters(c.text("Alert #"), fl.concat(inp("alert_id")), fl.concat(c.text(" was escalated"))) }),
                  ],
                }),
              ],
            }),
            s.db.add({ table: audit_event, row: {
              account_id: c.int(0), alert_id: inp("alert_id"), actor_kind: inp("actor_kind"), actor_id: inp("actor_id"),
              via: inp("via"), action: inp("action"), allowed: c.bool(true), rule: ref("rule"), detail: inp("detail"),
            }, as: "evt" }),
            changed({ entity: "audit_event", id: ref("evt.id"), op: "created", actor: inp("actor_id") }),
          ],
          else: [ // refused (defensive: both roles hold alerts.triage)
            s.db.add({ table: audit_event, row: {
              account_id: c.int(0), alert_id: inp("alert_id"), actor_kind: inp("actor_kind"), actor_id: inp("actor_id"),
              via: inp("via"), action: inp("action"), allowed: c.bool(false), rule: ref("rule"), detail: inp("detail"),
            }, as: "evt" }),
            changed({ entity: "audit_event", id: ref("evt.id"), op: "created", actor: inp("actor_id") }),
            guard.require(expr(c.int(0), "=", c.int(1)), { errorType: "accessdenied", message: "You do not have permission to triage alerts." }),
          ],
        }),
      ],
    }),
  ],
  response: { ok: c.bool(true) },
});
