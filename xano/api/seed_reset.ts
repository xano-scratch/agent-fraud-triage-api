import { query, s, c } from "@xanots/sdk";
import { seedApi } from "./groups.js";
import { analysts } from "../tables/analysts.js";
import { accounts } from "../tables/accounts.js";
import { alerts } from "../tables/alerts.js";
import { findings } from "../tables/findings.js";
import { agentActions } from "../tables/agent_actions.js";
import { DEMO_PASSWORD, ANALYST_SEED, ACCOUNT_SEED, ALERT_SEED } from "../seed/fixtures.js";

/**
 * POST api:seed/reset — reset the demo to a known state. Public (no auth) so the
 * frontend can seed a fresh ephemeral before anyone logs in. Truncates every
 * table (children first) and re-inserts analysts, accounts, and open alerts.
 * Idempotent: call it any time to wipe the audit trail and re-open the queue.
 */
export const seedReset = query({
  name: "reset",
  verb: "POST",
  apiGroup: seedApi,
  auth: false,
  input: {},
  stack: [
    // Wipe child tables first, then parents; reset restarts the id sequences.
    s.db.truncate({ table: agentActions, reset: true }),
    s.db.truncate({ table: findings, reset: true }),
    s.db.truncate({ table: alerts, reset: true }),
    s.db.truncate({ table: accounts, reset: true }),
    s.db.truncate({ table: analysts, reset: true }),

    // Analysts (the password column hashes the plaintext on write).
    ...ANALYST_SEED.map((a) =>
      s.db.add({ table: analysts, row: { email: a.email, password: DEMO_PASSWORD, name: a.name, role: a.role } }),
    ),
    // Accounts (auto-number 1..N to match ALERT_SEED.account_id).
    ...ACCOUNT_SEED.map((acc) =>
      s.db.add({ table: accounts, row: { holder_name: acc.holder_name, status: acc.status, risk_note: acc.risk_note } }),
    ),
    // Open alerts against those accounts.
    ...ALERT_SEED.map((al) =>
      s.db.add({ table: alerts, row: { account_id: c.int(al.account_id), severity: c.int(al.severity), reason: al.reason, status: "open" } }),
    ),
  ],
  response: {
    ok: c.bool(true),
    analysts: c.int(ANALYST_SEED.length),
    accounts: c.int(ACCOUNT_SEED.length),
    alerts: c.int(ALERT_SEED.length),
  },
});
