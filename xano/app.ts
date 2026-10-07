// The app's name, roles and demo people: the first backend file a template edits (BASELINE.md).
// `xano/table/user.ts` reads ROLES and DEMO_PEOPLE from here (modules/base/install.mjs wired it), so the role
// enum, the seeded people, the demo sign-in and the invite form all follow this one file.

export const APP = {
  /** Shown in the sidebar, the sign-in screen and the MCP sign-in page. Seniors can rename it in Settings. */
  name: "Agent Fraud-Triage API",
  /** The repo slug. It names the workspace and the ChatGPT/Claude sign-in page's API group. */
  slug: "agent-fraud-triage-api",
} as const;

/**
 * user.role's values, most trusted first. A senior does everything an analyst does, plus freeze accounts and
 * manage the team. Every permission in xano/rbac.ts names some of these.
 */
export const ROLES = ["senior", "analyst"] as const;
export type Role = (typeof ROLES)[number];

/** What a sign-up gets, and the invite form's default: the least-privileged role. */
export const SIGNUP_ROLE: Role = "analyst";

/**
 * One demo person per role a visitor should try, in seed order: rows in other tables refer to them by
 * position (`user_id: 1` is the first). They sign in with one click through auth/demo, never a password.
 * Avery is first so a visitor lands as an analyst and sees the freeze refusal the app is built to prove.
 */
export const DEMO_PEOPLE: readonly { key: string; name: string; email: string; role: Role; description: string }[] = [
  { key: "analyst", name: "Avery Nash", email: "avery@demo.example", role: "analyst", description: "Triages the alert queue; can recommend a freeze, not do it" },
  { key: "senior", name: "Sloan Reyes", email: "sloan@demo.example", role: "senior", description: "Approves freezes, freezes accounts, manages the team" },
];

/**
 * What the activity feed shows on a fresh deploy: believable lines by the demo people and their agents, so the
 * overview isn't empty (BASELINE.md). `actor` is a DEMO_PEOPLE position (1 = the first); `via` names the agent
 * that did it for them; `title` is the rest of a sentence after their name. The two "asked" lines match the
 * two seeded approval requests (xano/approvals.ts).
 */
export type SeedActivity = { actor: number; via?: string; verb: string; entity: string; entity_id: number; title: string; link?: string; minutesAgo: number };
export const SEED_ACTIVITY: SeedActivity[] = [
  { actor: 1, via: "Claude Code", verb: "asked", entity: "account", entity_id: 7, title: "asked to freeze Rivera Holdings after a velocity spike", link: "/accounts/7", minutesAgo: 18 },
  { actor: 1, via: "Fraud assistant", verb: "asked", entity: "alert", entity_id: 3, title: "asked to escalate alert #3 (impossible travel)", link: "/alerts?open=3", minutesAgo: 52 },
  { actor: 2, verb: "froze", entity: "account", entity_id: 4, title: "froze Delacroix Capital after a chargeback pattern", link: "/accounts/4", minutesAgo: 140 },
  { actor: 1, verb: "escalated", entity: "alert", entity_id: 8, title: "escalated alert #8 to a senior", link: "/alerts?open=8", minutesAgo: 300 },
  { actor: 2, verb: "cleared", entity: "alert", entity_id: 12, title: "cleared alert #12 as a known device", link: "/alerts?open=12", minutesAgo: 520 },
];

/** The seeded people's shared, deliberately public password (AUTH.md §4). Never used to sign in. */
export const DEMO_PASSWORD = "DemoPass123";
