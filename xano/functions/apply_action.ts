import { defineFunction, input, s, ref, inp, expr, c } from "@xanots/sdk";
import { alerts } from "../tables/alerts.js";
import { accounts } from "../tables/accounts.js";
import { agentActions } from "../tables/agent_actions.js";

/**
 * The ONE shared rule path. Every action a human OR the agent takes on an alert
 * runs through here, so the two can never drift apart:
 *   1. decide whether the action is allowed and record the deciding RULE text
 *      (freeze requires senior authority; clear/escalate/add_finding are open),
 *   2. apply the state change only when allowed,
 *   3. write an audit row EVERY time, allowed or refused.
 *
 * Identity is passed in (actor_id/actor_kind/can_freeze) by the calling
 * endpoint, which resolved it once via load_actor.
 */
export const applyAction = defineFunction({
  name: "apply_action",
  description: "Shared authority + audit path: gate the action, apply the state change when allowed, always log the attempt.",
  input: {
    alert_id: input.int({ required: true }),
    action: input.enum(["clear", "escalate", "freeze", "add_finding"], { required: true }),
    actor_id: input.int({ required: true }),
    actor_kind: input.enum(["human", "agent"], { required: true }),
    can_freeze: input.bool({ required: true }),
    detail: input.text(),
  },
  stack: [
    s.db.get_by_id({ table: alerts, id: inp("alert_id"), as: "alert" }),
    s.precondition({
      expr: expr(ref("alert", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Alert not found."),
    }),

    // 1. Authority decision -> allowed + the deciding rule text.
    s.set_var("allowed", c.bool(true)),
    s.set_var("rule", c.text("")),
    s.switch({
      on: inp("action"),
      cases: [
        {
          when: c.text("freeze"),
          break: true,
          body: [
            s.conditional({
              when: expr(inp("can_freeze"), "=", c.bool(true)),
              then: [s.update_var("rule", c.text("Freeze allowed: caller holds senior authority."))],
              else: [
                s.update_var("allowed", c.bool(false)),
                s.update_var(
                  "rule",
                  c.text("Freeze refused: freezing an account requires senior authority. The agent and standard analysts cannot freeze."),
                ),
              ],
            }),
          ],
        },
        { when: c.text("clear"), break: true, body: [s.update_var("rule", c.text("Clear allowed for analysts and the agent."))] },
        { when: c.text("escalate"), break: true, body: [s.update_var("rule", c.text("Escalate allowed for analysts and the agent."))] },
        { when: c.text("add_finding"), break: true, body: [s.update_var("rule", c.text("Finding recorded. Notes carry no authority gate."))] },
      ],
    }),

    // 2. Apply the state change only when allowed.
    s.conditional({
      when: expr(ref("allowed"), "=", c.bool(true)),
      then: [
        s.switch({
          on: inp("action"),
          cases: [
            { when: c.text("clear"), break: true, body: [s.db.edit({ table: alerts, fieldValue: inp("alert_id"), row: { status: "cleared" } })] },
            { when: c.text("escalate"), break: true, body: [s.db.edit({ table: alerts, fieldValue: inp("alert_id"), row: { status: "escalated" } })] },
            {
              when: c.text("freeze"),
              break: true,
              body: [
                s.db.edit({ table: alerts, fieldValue: inp("alert_id"), row: { status: "frozen" } }),
                s.db.edit({ table: accounts, fieldValue: ref("alert.account_id"), row: { status: "frozen" } }),
              ],
            },
          ],
        }),
      ],
    }),

    // 3. Always audit.
    s.db.add({
      table: agentActions,
      row: {
        alert_id: inp("alert_id"),
        actor_kind: inp("actor_kind"),
        actor_id: inp("actor_id"),
        action: inp("action"),
        allowed: ref("allowed"),
        rule: ref("rule"),
        detail: inp("detail"),
      },
      as: "audit",
    }),
  ],
  response: {
    allowed: ref("allowed"),
    rule: ref("rule"),
    action: inp("action"),
    alert_id: inp("alert_id"),
    audit_id: ref("audit.id"),
  },
});
