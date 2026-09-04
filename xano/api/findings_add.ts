import { query, input, s, c, ref, inp, auth, expr } from "@xanots/sdk";
import { findingsApi } from "./groups.js";
import { analysts } from "../tables/analysts.js";
import { alerts } from "../tables/alerts.js";
import { findings } from "../tables/findings.js";
import { loadActor } from "../functions/load_actor.js";
import { applyAction } from "../functions/apply_action.js";

/**
 * POST api:findings/add — append an investigation note to an alert, tagged with
 * whether a human or the agent wrote it, and logged through the shared rule path
 * (add_finding carries no authority gate, but the attempt is still audited).
 */
export const findingsAdd = query({
  name: "add",
  verb: "POST",
  apiGroup: findingsApi,
  auth: analysts,
  input: {
    alert_id: input.int({ required: true }),
    note: input.text({ required: true }),
  },
  stack: [
    s.function.run({ fn: loadActor, input: { actor_id: auth("id") }, as: "actor" }),
    s.db.get_by_id({ table: alerts, id: inp("alert_id"), as: "alert" }),
    s.precondition({
      expr: expr(ref("alert", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Alert not found."),
    }),
    s.db.add({
      table: findings,
      row: { alert_id: inp("alert_id"), actor_kind: ref("actor.kind"), note: inp("note") },
      as: "finding",
    }),
    s.function.run({
      fn: applyAction,
      input: {
        alert_id: inp("alert_id"),
        action: c.text("add_finding"),
        actor_id: ref("actor.id"),
        actor_kind: ref("actor.kind"),
        can_freeze: ref("actor.can_freeze"),
        detail: inp("note"),
      },
      as: "audit",
    }),
  ],
  response: { finding: ref("finding"), audit: ref("audit") },
});
