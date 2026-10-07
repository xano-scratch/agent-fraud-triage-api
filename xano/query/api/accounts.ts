import { auth, c, cmp, col, expr, fl, guard, inp, input, obj, query, ref, s, withFilters } from "@xano/sdk";
import type { InferRow } from "@xano/sdk";
import { user } from "../../table/user.js";
import { monitored_account } from "../../table/monitored_account.js";
import { alert } from "../../table/alert.js";
import { api } from "../api.js";
import { rbac } from "../../rbac.js";
import { applyAction } from "../../function/actor.js";
import { changed } from "../../base/index.js";

type AccountRow = InferRow<typeof monitored_account>;
type AccountPage = { items: AccountRow[]; curPage: number; nextPage: number | null; prevPage: number | null; itemsTotal: number; pageTotal: number };

/** GET api:accounts — the monitored accounts. Filters status and q (holder name); paged. Open-alert counts are
 *  computed on the client from the open-alerts list, so the endpoint stays a plain, robust query. */
export const listAccounts = query({
  name: "accounts", verb: "GET", apiGroup: api, auth: user,
  input: { status: input.text(), q: input.text(), page: input.int(), per_page: input.int() },
  stack: [
    ...rbac.require("alerts.triage"),
    s.set_var("size", c.int(20)),
    s.conditional({ when: expr(inp("per_page"), ">", c.int(0)), then: [s.update_var("size", inp("per_page"))] }),
    s.conditional({ when: expr(ref("size"), ">", c.int(200)), then: [s.update_var("size", c.int(200))] }),
    s.db.query({
      table: monitored_account,
      where: [
        cmp(col("status"), "=", inp("status"), { ignoreEmpty: true }),
        cmp(col("holder_name"), "includes", inp("q"), { ignoreEmpty: true }),
      ],
      sort: [{ sortBy: "holder_name", dir: "asc" }],
      paging: { page: inp("page"), per_page: ref("size"), metadata: true, totals: true }, as: "rows",
    }),
  ],
  response: ref("rows"),
  responseShape: {} as AccountPage,
});

/** GET api:accounts/{id} — one account with its alerts (severity first) and its freeze state. */
export const getAccount = query({
  name: "accounts/{id}", verb: "GET", apiGroup: api, auth: user,
  input: { id: input.int({ required: true }) },
  stack: [
    ...rbac.require("alerts.triage"),
    s.db.get({ table: monitored_account, fieldValue: inp("id"), as: "acct" }),
    guard.found("acct", { message: "No such account." }),
    s.db.query({ table: alert, where: expr(col("account_id"), "=", inp("id")), sort: [{ sortBy: "severity", dir: "desc" }, { sortBy: "created_at", dir: "desc" }], paging: { per_page: 200, metadata: false }, as: "alerts" }),
  ],
  response: { account: ref("acct"), alerts: ref("alerts") },
  responseShape: {} as { account: AccountRow; alerts: InferRow<typeof alert>[] },
});

/** PATCH api:accounts/{id} — edit an account's risk note. Seniors only (accounts.freeze). */
export const updateAccountApi = query({
  name: "accounts/{id}", verb: "PATCH", apiGroup: api, auth: user,
  input: { id: input.int({ required: true }), risk_note: input.text({ methods: ["trim"] }) },
  stack: [
    ...rbac.require("accounts.freeze", "Only a senior can edit an account's risk note."),
    s.db.get({ table: monitored_account, fieldValue: inp("id"), as: "acct" }),
    guard.found("acct", { message: "No such account." }),
    s.db.patch({ table: monitored_account, fieldValue: inp("id"), data: obj({ risk_note: inp("risk_note") }), as: "updated" }),
    changed({ entity: "account", id: inp("id"), op: "updated", link: withFilters(c.text("/accounts/"), fl.concat(inp("id"))) }),
  ],
  response: ref("updated"),
  responseShape: {} as AccountRow,
});

/**
 * POST api:accounts/{id}/freeze — attempt a freeze. Guarded only by alerts.triage, so an ANALYST reaches the
 * shared rule path and gets an AUDITED refusal; the accounts.freeze authority check lives in apply_action. A
 * senior's attempt freezes the account and audits it allowed. This split is the Play-4 proof.
 */
export const freezeAccountApi = query({
  name: "accounts/{id}/freeze", verb: "POST", apiGroup: api, auth: user,
  input: { id: input.int({ required: true }), reason: input.text({ methods: ["trim"] }) },
  stack: [
    ...rbac.require("alerts.triage"),
    s.db.get({ table: monitored_account, fieldValue: inp("id"), as: "acct" }),
    guard.found("acct", { message: "No such account." }),
    guard.require(expr(ref("acct.status"), "=", c.text("active")), { errorType: "badrequest", message: "That account is already frozen." }),
    s.function.run({ fn: applyAction, input: {
      action: c.text("freeze"), account_id: inp("id"), alert_id: c.int(0), actor_id: auth("id"), actor_kind: c.text("human"), via: c.text(""), detail: inp("reason"),
    }, as: "r" }),
    s.db.get({ table: monitored_account, fieldValue: inp("id"), as: "updated" }),
    guard.found("updated", { message: "No such account." }),
  ],
  response: ref("updated"),
  responseShape: {} as AccountRow,
});

/** POST api:accounts/{id}/unfreeze — the senior-only reverse (same rule path; an analyst is audited-refused). */
export const unfreezeAccountApi = query({
  name: "accounts/{id}/unfreeze", verb: "POST", apiGroup: api, auth: user,
  input: { id: input.int({ required: true }) },
  stack: [
    ...rbac.require("alerts.triage"),
    s.db.get({ table: monitored_account, fieldValue: inp("id"), as: "acct" }),
    guard.found("acct", { message: "No such account." }),
    guard.require(expr(ref("acct.status"), "=", c.text("frozen")), { errorType: "badrequest", message: "That account isn't frozen." }),
    s.function.run({ fn: applyAction, input: {
      action: c.text("unfreeze"), account_id: inp("id"), alert_id: c.int(0), actor_id: auth("id"), actor_kind: c.text("human"), via: c.text(""), detail: c.text(""),
    }, as: "r" }),
    s.db.get({ table: monitored_account, fieldValue: inp("id"), as: "updated" }),
    guard.found("updated", { message: "No such account." }),
  ],
  response: ref("updated"),
  responseShape: {} as AccountRow,
});
