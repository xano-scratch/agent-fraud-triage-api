import { table, f } from "@xanots/sdk";

/**
 * A customer account that fraud alerts are raised against. A freeze (a senior
 * action) flips `status` to "frozen"; the agent can never reach this state.
 */
export const accounts = table({
  name: "accounts",
  schema: {
    holder_name: f.text({ required: true }),
    status: f.enum(["active", "frozen"], { required: true, default: "active" }),
    risk_note: f.text(),
  },
});
