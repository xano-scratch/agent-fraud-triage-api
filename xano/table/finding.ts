import { f, table } from "@xano/sdk";
import { user } from "./user.js";
import { alert } from "./alert.js";

const DAY = 86_400_000;
const ago = (days: number, hours = 6) => Date.now() - days * DAY - hours * 3_600_000;

const row = (alert_id: number, author_id: number, actor_kind: "human" | "agent" | "assistant", note: string, days: number) =>
  ({ alert_id, author_id, actor_kind, note, created_at: ago(days) });

/**
 * An analyst's (or their agent's) note on an alert: what they checked and concluded. Shown on the alert detail.
 * actor_kind records whether a person, their MCP agent, or the assistant wrote it.
 */
export const finding = table({
  name: "finding",
  description: "A note on an alert, by a person or their agent. Shown on the alert's detail.",
  schema: {
    alert_id: f.tableRef(alert, { required: true }),
    author_id: f.tableRef(user, { required: true }),
    actor_kind: f.enum(["human", "agent", "assistant"], { required: true, default: "human" }),
    note: f.text({ required: true }),
  },
  index: [{ type: "btree", fields: [{ name: "alert_id", op: "asc" }] }],
  seed: [
    row(3, 1, "human", "Called the customer; they are not travelling. Treating as account takeover.", 0),
    row(3, 1, "agent", "Last three logins came from one residential IP; this one is a datacentre range.", 0),
    row(8, 2, "human", "Merchant confirms the disputes are coordinated. Escalating for a freeze review.", 1),
    row(1, 1, "human", "Payees are all new and share a bank. Watching for the next transfer.", 0),
    row(13, 1, "agent", "Three devices registered within the hour, all unverified.", 0),
    row(20, 2, "human", "Refund-abuse signature matches a prior case. Looping in the merchant.", 2),
    row(24, 2, "human", "Same password tried across 40 accounts in our set. Credential stuffing.", 2),
    row(9, 1, "assistant", "Payment country has not appeared in the last ten; flagged for a second look.", 3),
  ],
});
