import { table, f } from "@xanots/sdk";

/**
 * The auth table for every principal that acts on the system: human analysts
 * AND the fraud-triage agent. One table backs identity, so a human and the
 * agent authenticate the same way and read the same rules.
 *
 * `role` is the single source of truth for authority:
 *   - analyst : a standard human analyst (clear / escalate, add findings)
 *   - senior  : a human with freeze authority
 *   - agent   : the AI triage agent (in-scope actions only, never freeze)
 *
 * `can_freeze` and `actor_kind` are DERIVED from role in load_actor, never
 * stored, so they can never drift from the role that governs them.
 */
export const analysts = table({
  name: "analysts",
  auth: true,
  // `id` (int PK) + `created_at` (epochms) are auto-injected.
  schema: {
    email: f.email({ required: true }),
    password: f.password({ required: true }),
    name: f.text({ required: true }),
    role: f.enum(["analyst", "senior", "agent"], { required: true, default: "analyst" }),
  },
  index: [{ type: "unique", fields: [{ name: "email" }] }],
});
