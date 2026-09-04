import { table, f } from "@xanots/sdk";
import { accounts } from "./accounts.js";

/**
 * A fraud alert on an account. `severity` is 1-5. `status` moves through the
 * shared rule path (apply_action):
 *   open -> cleared    (clear)
 *   open -> escalated  (escalate)
 *   open -> frozen     (freeze, senior only; also freezes the account)
 */
export const alerts = table({
  name: "alerts",
  schema: {
    account_id: f.tableRef(accounts, { required: true }),
    severity: f.int({ required: true }),
    reason: f.text({ required: true }),
    status: f.enum(["open", "cleared", "escalated", "frozen"], { required: true, default: "open" }),
  },
  index: [{ type: "btree", fields: [{ name: "status" }] }],
});
