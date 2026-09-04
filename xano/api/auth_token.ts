import { query, input, s, c, ref, inp, expr } from "@xanots/sdk";
import { authApi } from "./groups.js";
import { analysts } from "../tables/analysts.js";
import { loadActor } from "../functions/load_actor.js";

/**
 * POST api:auth/token — mint an auth token after a real password check. The
 * response also carries the classified actor (kind + can_freeze) so the client
 * can show the identity's authority without a second call.
 *
 * The password is taken as text (never input.password) so it is not hashed a
 * second time before check_password compares it against the stored hash.
 */
export const authToken = query({
  name: "token",
  verb: "POST",
  apiGroup: authApi,
  auth: false,
  input: {
    email: input.text({ required: true, methods: ["trim", "lower"] }),
    password: input.text({ required: true }),
  },
  stack: [
    s.db.get({
      table: analysts,
      fieldName: "email",
      fieldValue: inp("email"),
      output: ["id", "email", "name", "role", "password"],
      as: "u",
    }),
    s.precondition({
      expr: expr(ref("u", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("No analyst with that email."),
    }),
    s.security.check_password({ text_password: inp("password"), hash_password: ref("u.password"), as: "ok" }),
    s.precondition({
      expr: expr(ref("ok"), "=", c.bool(true)),
      error_type: "unauthorized",
      error: c.text("Wrong password."),
    }),
    s.security.create_auth_token({ table: analysts, id: ref("u.id"), as: "token" }),
    s.function.run({ fn: loadActor, input: { actor_id: ref("u.id") }, as: "actor" }),
  ],
  response: { token: ref("token"), actor: ref("actor") },
});
