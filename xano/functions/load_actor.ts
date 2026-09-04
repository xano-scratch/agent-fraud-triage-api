import { defineFunction, input, s, ref, inp, expr, c } from "@xanots/sdk";
import { analysts } from "../tables/analysts.js";

/**
 * Resolve the caller from their auth-token identity and classify them. This is
 * the ONE place identity is read, so every endpoint sees the same actor shape:
 *   - kind       : "agent" when role is agent, else "human"
 *   - can_freeze : true only for a senior human
 * Both are DERIVED from role here, never stored, so authority can never drift
 * from the role that governs it.
 *
 * Endpoints pass `auth("id")` as `actor_id` so this function has an explicit
 * identity to resolve rather than relying on auth context crossing the call.
 */
export const loadActor = defineFunction({
  name: "load_actor",
  description: "Resolve + classify the caller (human analyst vs agent, freeze authority) from their analysts row.",
  input: { actor_id: input.int({ required: true }) },
  stack: [
    s.db.get_by_id({ table: analysts, id: inp("actor_id"), output: ["id", "name", "role"], as: "a" }),
    s.precondition({
      expr: expr(ref("a", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("No such analyst."),
    }),
    s.conditional({
      when: expr(ref("a.role"), "=", c.text("agent")),
      then: [s.set_var("kind", c.text("agent"))],
      else: [s.set_var("kind", c.text("human"))],
    }),
    s.conditional({
      when: expr(ref("a.role"), "=", c.text("senior")),
      then: [s.set_var("can_freeze", c.bool(true))],
      else: [s.set_var("can_freeze", c.bool(false))],
    }),
  ],
  response: {
    id: ref("a.id"),
    name: ref("a.name"),
    role: ref("a.role"),
    kind: ref("kind"),
    can_freeze: ref("can_freeze"),
  },
});
