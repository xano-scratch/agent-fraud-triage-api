import { apiGroup } from "@xano/sdk";

/** The domain's one API group: the alert queue, accounts, the audit trail and the urgent-severity setting. */
export const api = apiGroup({ name: "api", canonical: "api", description: "Fraud triage: alerts, accounts, the governed audit trail." });
