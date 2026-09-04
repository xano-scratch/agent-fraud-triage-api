import { apiGroup } from "@xanots/sdk";

/**
 * One API group per capability. Each `canonical` is PINNED so the public path
 * is stable and `getPath()` resolves in the browser bundle without a lock.
 * The slugs are namespaced with `aftq-` (agent-fraud-triage) to stay unique on
 * the shared instance a canonical is unique across.
 */
export const seedApi = apiGroup({ name: "seed", canonical: "aftq-seed" });
export const authApi = apiGroup({ name: "auth", canonical: "aftq-auth" });
export const alertsApi = apiGroup({ name: "alerts", canonical: "aftq-alerts" });
export const triageApi = apiGroup({ name: "triage", canonical: "aftq-triage" });
export const findingsApi = apiGroup({ name: "findings", canonical: "aftq-findings" });
export const actionsApi = apiGroup({ name: "actions", canonical: "aftq-actions" });
