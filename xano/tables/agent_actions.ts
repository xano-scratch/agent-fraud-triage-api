import { table, f } from "@xanots/sdk";
import { alerts } from "./alerts.js";

/**
 * The audit table. apply_action writes ONE row for every attempt, allowed or
 * refused, so the trail is complete: who acted (actor_kind + actor_id), what
 * they tried (action), whether it was allowed, and the deciding rule text.
 *
 * `actor_id` is a plain int (the analysts row id) rather than a tableRef, so a
 * truncate-and-reseed of analysts never orphans the historical trail.
 */
export const agentActions = table({
  name: "agent_actions",
  schema: {
    alert_id: f.tableRef(alerts, { required: true }),
    actor_kind: f.enum(["human", "agent"], { required: true }),
    actor_id: f.int({ required: true }),
    action: f.enum(["clear", "escalate", "freeze", "triage", "add_finding"], { required: true }),
    allowed: f.bool({ required: true }),
    rule: f.text({ required: true }),
    detail: f.text(),
  },
  index: [{ type: "btree", fields: [{ name: "alert_id" }] }],
});
