import { query, input, s, c, col, expr, ref, inp } from "@xanots/sdk";
import { alertsApi } from "./groups.js";
import { analysts } from "../tables/analysts.js";
import { alerts } from "../tables/alerts.js";
import { accounts } from "../tables/accounts.js";
import { findings } from "../tables/findings.js";

/**
 * GET api:alerts/get/{alert_id} — one alert with its account and its findings.
 * The alert id rides the path (it names which resource is wanted), so the route
 * is addressable and getPath() types it.
 */
export const alertsGet = query({
  name: "get/{alert_id}",
  verb: "GET",
  apiGroup: alertsApi,
  auth: analysts,
  input: { alert_id: input.int({ required: true }) },
  stack: [
    s.db.get_by_id({ table: alerts, id: inp("alert_id"), as: "alert" }),
    s.precondition({
      expr: expr(ref("alert", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Alert not found."),
    }),
    s.db.get_by_id({ table: accounts, id: ref("alert.account_id"), as: "account" }),
    s.db.query({
      table: findings,
      where: expr(col("alert_id"), "=", inp("alert_id")),
      sort: [{ sortBy: "created_at", dir: "desc" }],
      as: "findings",
    }),
  ],
  response: { alert: ref("alert"), account: ref("account"), findings: ref("findings") },
});
