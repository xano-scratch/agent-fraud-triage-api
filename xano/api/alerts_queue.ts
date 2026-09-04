import { query, s, col, expr, ref } from "@xanots/sdk";
import { alertsApi } from "./groups.js";
import { analysts } from "../tables/analysts.js";
import { alerts } from "../tables/alerts.js";
import { accounts } from "../tables/accounts.js";

/**
 * GET api:alerts/queue — the alert queue joined with its account. Any
 * authenticated actor (human or agent) may read it. Sorted by severity so the
 * riskiest alerts sit on top; the account holder + account status are projected
 * from the joined accounts row.
 */
export const alertsQueue = query({
  name: "queue",
  verb: "GET",
  apiGroup: alertsApi,
  auth: analysts,
  stack: [
    s.db.query({
      table: alerts,
      bind: [{ table: accounts, as: "acct", join: "left", where: expr(col("account_id"), "=", col("acct.id")) }],
      eval: [
        { name: "acct.holder_name", as: "account_holder" },
        { name: "acct.status", as: "account_status" },
      ],
      sort: [
        { sortBy: "severity", dir: "desc" },
        { sortBy: "id", dir: "asc" },
      ],
      as: "rows",
    }),
  ],
  response: ref("rows"),
});
