/**
 * Demo fixtures. These are DELIBERATELY PUBLIC demo credentials for a throwaway
 * ephemeral, not secrets. seed/reset writes them at runtime through each
 * column's own rules (the password column hashes on write), so the seeded
 * analysts log in exactly like real ones.
 */

// Shared demo password for every seeded analyst (public on purpose).
export const DEMO_PASSWORD = "fraudops-demo";

export const ANALYST_SEED: { email: string; name: string; role: "analyst" | "senior" | "agent" }[] = [
  { email: "dana@fraudops.example", name: "Dana Cole", role: "analyst" },
  { email: "sam@fraudops.example", name: "Sam Ortiz", role: "senior" },
  { email: "triage-agent@fraudops.example", name: "Triage Agent", role: "agent" },
];

export const ACCOUNT_SEED: { holder_name: string; status: "active" | "frozen"; risk_note: string }[] = [
  { holder_name: "Rivera Imports LLC", status: "active", risk_note: "New wire beneficiary added last week." },
  { holder_name: "Priya Nair", status: "active", risk_note: "Two sign-in devices in two countries." },
  { holder_name: "Delta Freight Co", status: "active", risk_note: "Dormant six months, then suddenly active." },
  { holder_name: "Marcus Webb", status: "active", risk_note: "Card used in person and online at once." },
];

// account_id maps to the seeded account order (accounts auto-number 1..N on insert).
export const ALERT_SEED: { account_id: number; severity: number; reason: string }[] = [
  { account_id: 1, severity: 5, reason: "Large transfer to a new beneficiary minutes after login from a new device." },
  { account_id: 2, severity: 4, reason: "Sign-in from two countries within ten minutes." },
  { account_id: 3, severity: 2, reason: "Small test charge after a long dormant period." },
  { account_id: 4, severity: 1, reason: "Card used in person and online in the same hour, same city." },
  { account_id: 1, severity: 3, reason: "Beneficiary transfer limit raised right before a large payment." },
];
