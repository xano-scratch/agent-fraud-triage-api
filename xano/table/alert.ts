import { f, table } from "@xano/sdk";
import { user } from "./user.js";
import { monitored_account } from "./monitored_account.js";

// Seeds run on every build, so created_at is relative to the deploy: the board and "needs attention" always
// have this week's work, with a couple stale (CRAFT.md §2, §17).
const DAY = 86_400_000;
const ago = (days: number, hours = 5) => Date.now() - days * DAY - hours * 3_600_000;

type Kind = "login_anomaly" | "velocity" | "device_change" | "geo_mismatch" | "chargeback_pattern";
type Status = "open" | "escalated" | "cleared";
// assignee_id uses a 0 sentinel for "unassigned" (fields.md); "mine" is assignee_id == the caller.
const row = (account_id: number, severity: number, kind: Kind, reason: string, status: Status, assignee_id: number, days: number) =>
  ({ account_id, severity, kind, reason, status, assignee_id, created_at: ago(days) });

/**
 * A flagged event on a monitored account. Severity 1-5 (4-5 is Urgent by default; see settings). Status moves
 * open -> escalated / cleared through the Triage board (apply_action writes each move to the audit trail).
 * Indexed on the columns the queue filters and sorts by.
 */
export const alert = table({
  name: "alert",
  description: "A fraud alert on a monitored account. Analysts clear or escalate it; every move is audited.",
  schema: {
    account_id: f.tableRef(monitored_account, { required: true }),
    /** 1 (low) to 5 (critical). The board marks 4-5 as Urgent (settings.urgent_severity_threshold). */
    severity: f.int({ required: true }),
    kind: f.enum(["login_anomaly", "velocity", "device_change", "geo_mismatch", "chargeback_pattern"], { required: true }),
    reason: f.text(),
    status: f.enum(["open", "escalated", "cleared"], { required: true, default: "open" }),
    /** The analyst working it (0 = unassigned). Analysts may act on any alert within their role. */
    assignee_id: f.tableRef(user, { default: 0 }),
  },
  index: [
    { type: "btree", fields: [{ name: "status", op: "asc" }] },
    { type: "btree", fields: [{ name: "severity", op: "desc" }] },
    { type: "btree", fields: [{ name: "assignee_id", op: "asc" }] },
    { type: "btree", fields: [{ name: "account_id", op: "asc" }] },
  ],
  seed: [
    row(1, 4, "velocity", "Six transfers in ten minutes to new payees.", "open", 1, 0),                      // 1
    row(5, 2, "login_anomaly", "Sign-in from an unseen browser, right password.", "open", 1, 0),            // 2
    row(3, 5, "geo_mismatch", "Impossible travel: London then São Paulo in 20 minutes.", "open", 1, 1),     // 3
    row(11, 3, "device_change", "New device after a year dormant.", "open", 2, 1),                          // 4
    row(1, 5, "velocity", "Card tested with 40 small auths overnight.", "open", 1, 0),                      // 5
    row(17, 4, "login_anomaly", "Two failed MFA prompts, then success.", "open", 0, 2),                     // 6
    row(13, 2, "velocity", "Quarter-end spike, within the usual band.", "open", 1, 2),                      // 7
    row(6, 5, "chargeback_pattern", "Three disputes opened on one merchant today.", "escalated", 2, 1),     // 8
    row(19, 4, "geo_mismatch", "Payment country differs from the last ten.", "open", 1, 3),                 // 9
    row(8, 1, "login_anomaly", "New browser, same city and device.", "open", 0, 3),                         // 10
    row(21, 3, "velocity", "Volume climbing toward month-end limit.", "open", 2, 4),                        // 11
    row(14, 2, "device_change", "Phone upgrade, same SIM.", "cleared", 2, 4),                               // 12
    row(7, 5, "velocity", "Velocity spike from three new devices in an hour.", "open", 1, 0),               // 13
    row(10, 3, "geo_mismatch", "VPN exit node in a new region.", "open", 1, 5),                             // 14
    row(22, 4, "chargeback_pattern", "Pattern matches a known refund-abuse ring.", "escalated", 1, 5),      // 15
    row(2, 1, "login_anomaly", "Password manager autofill from a new IP.", "cleared", 1, 6),               // 16
    row(16, 3, "device_change", "Two devices active in different cities.", "open", 2, 6),                   // 17
    row(24, 4, "velocity", "First week of activity already at the ceiling.", "open", 0, 7),                 // 18
    row(5, 2, "geo_mismatch", "Travel flagged; itinerary on file.", "cleared", 1, 8),                      // 19
    row(18, 5, "chargeback_pattern", "Disputes across four merchants in a day.", "escalated", 2, 2),       // 20
    row(3, 3, "device_change", "Known traveller, new phone abroad.", "cleared", 1, 9),                     // 21
    row(12, 4, "velocity", "Dormant account, sudden high volume.", "open", 1, 1),                          // 22
    row(20, 2, "login_anomaly", "Right password, slightly odd hours.", "open", 0, 10),                     // 23
    row(9, 5, "velocity", "Credential stuffing across many accounts.", "escalated", 2, 2),                 // 24
    row(23, 3, "geo_mismatch", "Shipping and billing countries diverge.", "open", 1, 11),                  // 25
    row(15, 4, "device_change", "Device change then a large transfer.", "escalated", 2, 1),                // 26
    row(6, 1, "login_anomaly", "Expected sign-in, logged for the record.", "cleared", 2, 12),             // 27
    row(13, 5, "chargeback_pattern", "Refund requests spiking after delivery.", "open", 1, 3),            // 28
    row(4, 4, "velocity", "Burst of auths before the freeze.", "escalated", 2, 6),                        // 29
    row(11, 2, "login_anomaly", "Return from dormancy, verified by phone.", "cleared", 1, 14),            // 30
  ],
});
