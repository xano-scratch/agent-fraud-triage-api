import { f, table } from "@xano/sdk";
import { user } from "./user.js";

// The fraud-monitored customer account (NOT the auth `account` table, which is the signed-in person's company).
// Seeds run on every build, so frozen_at is relative to the deploy and reads as "2 days ago" on a fresh env.
const DAY = 86_400_000;
const ago = (days: number, hours = 4) => Date.now() - days * DAY - hours * 3_600_000;

// frozen_by uses a 0 sentinel for "nobody" (an optional foreign key to an int-keyed table; fields.md).
const acct = (holder_name: string, n: number, status: "active" | "frozen", risk_note: string, frozen_by = 0, frozenDays = 0) =>
  ({ holder_name, account_number: `AC-${100000 + n}`, status, risk_note, frozen_by, frozen_at: status === "frozen" ? ago(frozenDays) : null });

/**
 * The customer accounts a fraud team watches. Freezing one is senior-only and audited (see apply_action). Status
 * is a small enum so a typo can't become a state no screen renders. Index status for the accounts filter.
 */
export const monitored_account = table({
  name: "monitored_account",
  description: "A fraud-monitored customer account. Freezing it is senior-only and written to the audit trail.",
  schema: {
    holder_name: f.text({ required: true }),
    account_number: f.text({ required: true }),
    status: f.enum(["active", "frozen"], { required: true, default: "active" }),
    risk_note: f.text(),
    /** The senior who froze it (0 = not frozen). */
    frozen_by: f.tableRef(user, { default: 0 }),
    frozen_at: f.timestamp({ nullable: true }),
  },
  index: [
    { type: "btree|unique", fields: [{ name: "account_number", op: "asc" }] },
    { type: "btree", fields: [{ name: "status", op: "asc" }] },
  ],
  seed: [
    acct("Rivera Holdings", 42, "active", "New payees added twice this month."),                 // 1
    acct("Lindqvist Trading", 51, "active", ""),                                                  // 2
    acct("Okonkwo Imports", 63, "active", "Travels often; expect geo spread."),                   // 3
    acct("Delacroix Capital", 70, "frozen", "Chargeback pattern across three merchants.", 2, 6),  // 4
    acct("Hamilton & Price", 88, "active", ""),                                                   // 5
    acct("Suzuki Logistics", 95, "active", "High volume, low risk historically."),               // 6
    acct("Rivera Holdings Intl", 104, "active", "Shares a director with AC-100042."),             // 7
    acct("Beaumont Estates", 112, "active", ""),                                                  // 8
    acct("Castellano Group", 120, "frozen", "Credential stuffing from one IP range.", 2, 2),      // 9
    acct("Ferreira Exports", 133, "active", ""),                                                  // 10
    acct("Nakamura Ventures", 141, "active", "Dormant for a year, then active."),                 // 11
    acct("O'Brien Freight", 150, "active", ""),                                                   // 12
    acct("Vasquez Retail", 162, "active", "Seasonal spikes every quarter."),                      // 13
    acct("Thornton Mills", 171, "active", ""),                                                    // 14
    acct("Petrov Systems", 180, "frozen", "Device change then a large transfer.", 2, 1),          // 15
    acct("Adeyemi Foods", 193, "active", ""),                                                     // 16
    acct("Khoury Textiles", 201, "active", "Two login anomalies last week."),                     // 17
    acct("Whitfield & Co", 210, "active", ""),                                                    // 18
    acct("Moreau Pharma", 222, "active", "Regulated; flag early."),                               // 19
    acct("Sato Holdings", 231, "active", ""),                                                     // 20
    acct("Greenwood Partners", 240, "active", "Watch for velocity at month end."),               // 21
    acct("Abara Metals", 252, "active", ""),                                                      // 22
    acct("Lindgren Shipping", 261, "active", ""),                                                 // 23
    acct("Costa Financial", 270, "active", "Newly onboarded; limited history."),                  // 24
  ],
});
