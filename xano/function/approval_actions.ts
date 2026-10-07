// The two approval actions (AGENT-APPROVALS.md): what runs after a person approves an agent's or the assistant's
// draft. Both go through the same apply_action rule path a human endpoint uses, so an approved action is governed
// and audited exactly like a direct one. Each re-checks authority INSIDE apply_action (loads the approver, checks
// their permission), so a person demoted after the request was made can no longer run it.
import { c, defineFunction, inp, input, ref, s } from "@xano/sdk";
import { applyAction } from "./actor.js";

/**
 * Apply an agent's or the assistant's drafted clear/escalate, as the person who approved it (the analyst the
 * agent works for). actor_kind/via carry through so the audit reads "Avery via Claude Code".
 */
export const applyTriage = defineFunction({
  name: "triage/apply_triage",
  description: "Approval action: apply a drafted clear/escalate through the shared rule path, as the approving person.",
  input: {
    alert_id: input.int({ required: true }),
    action: input.text({ required: true }),
    note: input.text(),
    via: input.text(),
    actor_kind: input.text(),
    actor_id: input.int({ required: true }),
  },
  stack: [
    s.function.run({ fn: applyAction, input: {
      action: inp("action"), alert_id: inp("alert_id"), account_id: c.int(0),
      actor_id: inp("actor_id"), actor_kind: inp("actor_kind"), via: inp("via"), detail: inp("note"),
    }, as: "r" }),
  ],
  response: { ok: ref("r.ok") },
});

/**
 * Freeze an account as the SENIOR who approved it. apply_action re-checks accounts.freeze on the approver, so
 * only a senior's approval actually freezes; the audit records the senior as the human who exercised the authority.
 */
export const freezeAccount = defineFunction({
  name: "triage/freeze_account",
  description: "Approval action: freeze an account through the shared rule path, as the senior who approved it.",
  input: {
    account_id: input.int({ required: true }),
    reason: input.text(),
    actor_id: input.int({ required: true }),
  },
  stack: [
    s.function.run({ fn: applyAction, input: {
      action: c.text("freeze"), account_id: inp("account_id"), alert_id: c.int(0),
      actor_id: inp("actor_id"), actor_kind: c.text("human"), via: c.text(""), detail: inp("reason"),
    }, as: "r" }),
  ],
  response: { ok: ref("r.ok") },
});
