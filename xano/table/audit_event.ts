import { f, table } from "@xano/sdk";
import { user } from "./user.js";
import { alert } from "./alert.js";
import { monitored_account } from "./monitored_account.js";

// Seeds run on every build, so the trail (and the "refused attempts, 7 days" stat) is relative to the deploy.
const DAY = 86_400_000;
const ago = (days: number, hours = 3) => Date.now() - days * DAY - hours * 3_600_000;

/** The two deciding rules, written verbatim onto each row so the trail reads in plain words. */
export const RULE_FREEZE = "Freezing an account requires senior authority.";
export const RULE_TRIAGE = "Triage is open to analysts and seniors.";

type Kind = "human" | "agent" | "assistant";
type Action = "clear" | "escalate" | "freeze" | "unfreeze" | "add_finding";
const ev = (account_id: number, alert_id: number, actor_kind: Kind, actor_id: number, via: string, action: Action, allowed: boolean, rule: string, detail: string, days: number) =>
  ({ account_id, alert_id, actor_kind, actor_id, via, action, allowed, rule, detail, created_at: ago(days) });

/**
 * The governed audit trail: every ATTEMPT at a guarded action, allowed or REFUSED, with the deciding rule.
 * This is what the base activity feed cannot do, and the Play-4 showpiece: an analyst's refused freeze is
 * recorded here just like a senior's allowed one. Written only by apply_action. Index the columns the trail
 * filters on.
 */
export const audit_event = table({
  name: "audit_event",
  description: "Every attempt at a guarded action, allowed or refused, with the deciding rule. The governed trail.",
  schema: {
    /** The account acted on (0 when the action is only about an alert). */
    account_id: f.tableRef(monitored_account, { default: 0 }),
    /** The alert acted on (0 when the action is only about an account). */
    alert_id: f.tableRef(alert, { default: 0 }),
    actor_kind: f.enum(["human", "agent", "assistant"], { required: true, default: "human" }),
    actor_id: f.tableRef(user, { required: true }),
    /** The agent that acted for the person ("Claude Code"), or empty when the person did it themselves. */
    via: f.text(),
    action: f.enum(["clear", "escalate", "freeze", "unfreeze", "add_finding"], { required: true }),
    allowed: f.bool({ required: true }),
    /** The deciding rule, in plain words. */
    rule: f.text(),
    detail: f.text(),
  },
  index: [
    { type: "btree", fields: [{ name: "created_at", op: "desc" }] },
    { type: "btree", fields: [{ name: "action", op: "asc" }] },
    { type: "btree", fields: [{ name: "allowed", op: "asc" }] },
    { type: "btree", fields: [{ name: "actor_kind", op: "asc" }] },
    { type: "btree", fields: [{ name: "alert_id", op: "asc" }] },
    { type: "btree", fields: [{ name: "account_id", op: "asc" }] },
  ],
  seed: [
    // Refused: an analyst (and an analyst's agent) tried to freeze; the rule refused and the attempt is on record.
    ev(7, 13, "agent", 1, "Claude Code", "freeze", false, RULE_FREEZE, "Agent recommended a freeze; routed to a senior instead.", 0),
    ev(1, 5, "human", 1, "", "freeze", false, RULE_FREEZE, "Tried to freeze from the account page.", 0),
    ev(17, 6, "human", 1, "", "freeze", false, RULE_FREEZE, "Tried to freeze after two failed MFA prompts.", 1),
    ev(13, 28, "assistant", 1, "Fraud assistant", "freeze", false, RULE_FREEZE, "Assistant was asked to freeze; it can only recommend.", 2),
    // Allowed freezes, by a senior.
    ev(4, 29, "human", 2, "", "freeze", true, RULE_FREEZE, "Chargeback pattern confirmed with the merchant.", 6),
    ev(9, 24, "human", 2, "", "freeze", true, RULE_FREEZE, "Credential stuffing across many accounts.", 2),
    ev(15, 26, "human", 2, "", "freeze", true, RULE_FREEZE, "Device change then a large transfer.", 1),
    // Allowed triage, by analysts and their agents.
    ev(0, 8, "human", 1, "", "escalate", true, RULE_TRIAGE, "Disputes look coordinated; sent to a senior.", 0),
    ev(0, 3, "human", 1, "", "escalate", true, RULE_TRIAGE, "Impossible travel; likely takeover.", 1),
    ev(0, 12, "human", 2, "", "clear", true, RULE_TRIAGE, "Known device after a phone upgrade.", 4),
    ev(0, 16, "human", 1, "", "clear", true, RULE_TRIAGE, "Autofill from a known password manager.", 6),
    ev(0, 20, "human", 2, "", "escalate", true, RULE_TRIAGE, "Refund-abuse signature matched.", 2),
    ev(0, 24, "agent", 2, "Claude Code", "escalate", true, RULE_TRIAGE, "Agent escalated after matching a known pattern.", 2),
    ev(0, 3, "human", 1, "", "add_finding", true, RULE_TRIAGE, "Called the customer; not travelling.", 0),
    ev(0, 8, "human", 2, "", "add_finding", true, RULE_TRIAGE, "Merchant confirmed coordination.", 1),
    ev(0, 13, "agent", 1, "Claude Code", "add_finding", true, RULE_TRIAGE, "Three unverified devices within the hour.", 0),
    ev(0, 21, "human", 1, "", "clear", true, RULE_TRIAGE, "Known traveller, new phone abroad.", 9),
    ev(0, 19, "human", 1, "", "clear", true, RULE_TRIAGE, "Itinerary on file.", 8),
    // An unfreeze, after review (account is active again now).
    ev(11, 0, "human", 2, "", "unfreeze", true, RULE_FREEZE, "Reviewed and restored; monitoring continues.", 0),
    ev(0, 27, "human", 2, "", "clear", true, RULE_TRIAGE, "Expected sign-in, logged for the record.", 12),
  ],
});
