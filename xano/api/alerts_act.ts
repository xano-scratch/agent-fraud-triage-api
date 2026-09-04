import { query, input, s, c, ref, inp, auth, expr, withFilters, fl } from "@xanots/sdk";
import { alertsApi } from "./groups.js";
import { analysts } from "../tables/analysts.js";
import { alerts } from "../tables/alerts.js";
import { accounts } from "../tables/accounts.js";
import { loadActor } from "../functions/load_actor.js";
import { applyAction } from "../functions/apply_action.js";

/**
 * POST api:alerts/act — a human or the agent acts on an alert (clear, escalate,
 * or freeze) through the SHARED rule path. Freeze is refused for anyone without
 * senior authority (the agent included), and the refusal is audited just like
 * an allowed action. Returns the outcome plus the refreshed alert + account so
 * the UI can show the deciding rule and the resulting state.
 */
export const alertsAct = query({
  name: "act",
  verb: "POST",
  apiGroup: alertsApi,
  auth: analysts,
  input: {
    alert_id: input.int({ required: true }),
    action: input.enum(["clear", "escalate", "freeze"], { required: true }),
  },
  stack: [
    s.function.run({ fn: loadActor, input: { actor_id: auth("id") }, as: "actor" }),
    s.db.get_by_id({ table: alerts, id: inp("alert_id"), as: "alert" }),
    s.precondition({
      expr: expr(ref("alert", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Alert not found."),
    }),
    s.function.run({
      fn: applyAction,
      input: {
        alert_id: inp("alert_id"),
        action: inp("action"),
        actor_id: ref("actor.id"),
        actor_kind: ref("actor.kind"),
        can_freeze: ref("actor.can_freeze"),
        detail: withFilters(c.text("Manual action by "), fl.concat(ref("actor.name"))),
      },
      as: "outcome",
    }),
    // Re-read so the client sees the resulting state after the rule path ran.
    s.db.get_by_id({ table: alerts, id: inp("alert_id"), as: "alert_after" }),
    s.db.get_by_id({ table: accounts, id: ref("alert.account_id"), as: "account_after" }),
  ],
  response: { outcome: ref("outcome"), alert: ref("alert_after"), account: ref("account_after") },
});
