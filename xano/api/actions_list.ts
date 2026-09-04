import { query, input, s, col, cmp, expr, ref, inp } from "@xanots/sdk";
import { actionsApi } from "./groups.js";
import { analysts } from "../tables/analysts.js";
import { agentActions } from "../tables/agent_actions.js";

/**
 * GET api:actions/list — the audit trail, newest first, with the acting
 * analyst's name joined in. An optional `alert_id` narrows it to one alert;
 * ignoreEmpty drops the predicate when no id is given, so the bare call returns
 * every attempt (allowed and refused).
 */
export const actionsList = query({
  name: "list",
  verb: "GET",
  apiGroup: actionsApi,
  auth: analysts,
  input: { alert_id: input.int({ required: false }) },
  stack: [
    s.db.query({
      table: agentActions,
      where: cmp(col("alert_id"), "=", inp("alert_id"), { ignoreEmpty: true }),
      bind: [{ table: analysts, as: "actor", join: "left", where: expr(col("actor_id"), "=", col("actor.id")) }],
      eval: [{ name: "actor.name", as: "actor_name" }],
      sort: [{ sortBy: "created_at", dir: "desc" }],
      as: "rows",
    }),
  ],
  response: ref("rows"),
});
