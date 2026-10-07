import { defineApprovals } from "@xano-sdk/agents";
import { user } from "./table/user.js";
import { rbac } from "./rbac.js";
import { applyTriage, freezeAccount } from "./function/approval_actions.js";

/**
 * What an agent or the assistant asks a person's OK for (AGENT-APPROVALS.md). Each entry is a function that runs
 * through the shared apply_action rule path and re-checks the approver's authority.
 * - apply_triage: a drafted clear/escalate; the analyst the agent works for decides (no approver roles).
 * - freeze_account: a drafted freeze; a SENIOR decides (freezing is senior-only) — never the requester.
 * - change_role: the base app's (a team manager approves a role change). Keep it.
 */
export const approvals = defineApprovals({
  user,
  canonical: "approvals",
  actions: {
    apply_triage: { fn: applyTriage, label: "Apply triage", editable: "note" },
    freeze_account: { fn: freezeAccount, label: "Freeze account", editable: "reason", approvers: rbac.rolesWith("accounts.freeze") },
    change_role: { fn: rbac.setRoleFn, label: "Change role", editable: "role", approvers: rbac.rolesWith("team.manage") },
  },
  // Two requests waiting on a fresh deploy, so Approvals and the records they touch open on real drafts. They
  // match the two "asked" lines in SEED_ACTIVITY (xano/app.ts). Avery (user 1) is the requester of both.
  seed: [
    {
      user_id: 1, source: "mcp", agent_label: "Claude Code", connection_id: 0, action: "freeze_account",
      title: "Freeze Rivera Holdings' account", preview: "Velocity spike from three new devices in an hour; recommend a freeze.",
      link: "/accounts/7", approve_label: "Freeze account", editable_field: "reason", requester_name: "Avery Nash", approver_roles: ",senior,",
      payload: { account_id: 7, reason: "Velocity spike from three new devices in an hour." }, status: "pending", expires_at: Date.now() + 7 * 86_400_000,
    },
    {
      user_id: 1, source: "assistant", agent_label: "Fraud assistant", connection_id: 0, action: "apply_triage",
      title: "Escalate alert #3", preview: "Impossible travel: London then São Paulo in 20 minutes. Recommend escalating.",
      link: "/alerts?open=3", approve_label: "Apply triage", editable_field: "note", requester_name: "Avery Nash", approver_roles: "",
      payload: { alert_id: 3, action: "escalate", note: "Impossible travel; likely account takeover.", via: "Fraud assistant", actor_kind: "assistant" },
      status: "pending", expires_at: Date.now() + 7 * 86_400_000,
    },
  ],
});
