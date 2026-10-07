import { defineRbac } from "@xano-sdk/rbac";
import { user } from "./table/user.js";

/**
 * Who may do what (RBAC.md). Roles are user.role's values (xano/app.ts ROLES). One map, read by the endpoint
 * guards, the shared apply_action rule path, the agent and assistant tools, the approvers and the UI.
 * - alerts.triage: clear/escalate alerts, add findings, create/edit alerts (both roles).
 * - accounts.freeze: freeze/unfreeze an account (seniors only) — the privilege the app is built to govern.
 * - audit.read: read the governed audit trail (both roles).
 * - team.manage: change roles and the settings (seniors; required by the module).
 */
export const rbac = defineRbac({
  user,
  canonical: "rbac",
  permissions: {
    "alerts.triage": ["analyst", "senior"],
    "accounts.freeze": ["senior"],
    "audit.read": ["analyst", "senior"],
    "team.manage": ["senior"],
  },
});
