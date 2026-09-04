import { query, input, s, c, ref, inp, auth, expr, or, withFilters, fl } from "@xanots/sdk";
import { triageApi } from "./groups.js";
import { analysts } from "../tables/analysts.js";
import { alerts } from "../tables/alerts.js";
import { loadActor } from "../functions/load_actor.js";
import { applyAction } from "../functions/apply_action.js";
import { fraudTriageAgent } from "../agents/fraud_triage_agent.js";

/**
 * POST api:triage/run — the agent showcase. Agent-token guarded: only the
 * triage agent may call it. It runs fraud_triage_agent for a decision and then
 * applies that decision through the SAME apply_action rule path a human uses, so
 * the agent gets no privileged shortcut and every run is audited with the agent
 * as the actor.
 *
 * The agent decision is best-effort ENRICHMENT over a deterministic severity
 * rule (escalate when severity >= 3): the endpoint sets a sane default first,
 * then upgrades it to the model's choice only when the model returns a valid
 * decision. So triage/run always returns a governed, auditable result even if
 * the free model is unavailable.
 */
export const triageRun = query({
  name: "run",
  verb: "POST",
  apiGroup: triageApi,
  auth: analysts,
  input: { alert_id: input.int({ required: true }) },
  stack: [
    s.function.run({ fn: loadActor, input: { actor_id: auth("id") }, as: "actor" }),
    s.precondition({
      expr: expr(ref("actor.kind"), "=", c.text("agent")),
      error_type: "accessdenied",
      error: c.text("Only the fraud-triage agent may run this endpoint."),
    }),
    s.db.get_by_id({ table: alerts, id: inp("alert_id"), as: "alert" }),
    s.precondition({
      expr: expr(ref("alert", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Alert not found."),
    }),

    // Deterministic default decision (works with no model).
    s.conditional({
      when: expr(ref("alert.severity"), ">=", c.int(3)),
      then: [s.set_var("decision", c.text("escalate"))],
      else: [s.set_var("decision", c.text("clear"))],
    }),
    s.set_var("source", c.text("severity-rule")),
    s.set_var("why", c.text("Deterministic rule: escalate when severity is 3 or higher.")),

    // Best-effort agent enrichment: upgrade to the model's decision if valid.
    s.try_catch({
      try: [
        s.ai.agent.run({
          agent: fraudTriageAgent,
          args: { severity: ref("alert.severity"), reason: ref("alert.reason") },
          as: "run",
        }),
        s.conditional({
          when: or(
            expr(ref("run.result.decision"), "=", c.text("clear")),
            expr(ref("run.result.decision"), "=", c.text("escalate")),
          ),
          then: [
            s.update_var("decision", ref("run.result.decision")),
            s.update_var("source", c.text("agent")),
            s.update_var("why", ref("run.result.reason")),
          ],
        }),
      ],
      catch: [s.comment("Free model unavailable; keep the deterministic decision.")],
    }),

    // Apply through the shared rule path, audited as the agent.
    s.function.run({
      fn: applyAction,
      input: {
        alert_id: inp("alert_id"),
        action: ref("decision"),
        actor_id: ref("actor.id"),
        actor_kind: ref("actor.kind"),
        can_freeze: ref("actor.can_freeze"),
        detail: withFilters(c.text("Agent triage ("), fl.concat(ref("source")), fl.concat(c.text("): ")), fl.concat(ref("why"))),
      },
      as: "outcome",
    }),
  ],
  response: {
    decision: ref("decision"),
    source: ref("source"),
    why: ref("why"),
    outcome: ref("outcome"),
  },
});
