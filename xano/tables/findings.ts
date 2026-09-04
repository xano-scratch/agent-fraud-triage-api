import { table, f } from "@xanots/sdk";
import { alerts } from "./alerts.js";

/**
 * A note attached to an alert by whoever investigated it. `actor_kind` records
 * whether a human or the agent wrote it, so the trail shows who said what.
 */
export const findings = table({
  name: "findings",
  schema: {
    alert_id: f.tableRef(alerts, { required: true }),
    actor_kind: f.enum(["human", "agent"], { required: true }),
    note: f.text({ required: true }),
  },
  index: [{ type: "btree", fields: [{ name: "alert_id" }] }],
});
