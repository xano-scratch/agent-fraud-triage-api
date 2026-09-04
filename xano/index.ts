import { workspace } from "@xanots/sdk";

// Tables
import { analysts } from "./tables/analysts.js";
import { accounts } from "./tables/accounts.js";
import { alerts } from "./tables/alerts.js";
import { findings } from "./tables/findings.js";
import { agentActions } from "./tables/agent_actions.js";

// API groups
import { seedApi, authApi, alertsApi, triageApi, findingsApi, actionsApi } from "./api/groups.js";

// Shared rule path (functions) + the agent
import { loadActor } from "./functions/load_actor.js";
import { applyAction } from "./functions/apply_action.js";
import { fraudTriageAgent } from "./agents/fraud_triage_agent.js";

// Endpoints
import { seedReset } from "./api/seed_reset.js";
import { authToken } from "./api/auth_token.js";
import { alertsQueue } from "./api/alerts_queue.js";
import { alertsGet } from "./api/alerts_get.js";
import { alertsAct } from "./api/alerts_act.js";
import { triageRun } from "./api/triage_run.js";
import { findingsAdd } from "./api/findings_add.js";
import { actionsList } from "./api/actions_list.js";

/**
 * Agent Fraud-Triage API — one governed Xano API a fraud team's AI agent and
 * its human analysts both call. The same authority rules gate every action
 * (freeze requires senior authority; the agent is refused), and every attempt,
 * allowed or refused, lands in one audit trail.
 */
export default workspace("agent-fraud-triage-api")
  .registerTables([analysts, accounts, alerts, findings, agentActions])
  .registerApiGroups([seedApi, authApi, alertsApi, triageApi, findingsApi, actionsApi])
  .registerFunctions([loadActor, applyAction])
  .registerAgents([fraudTriageAgent])
  .registerQueries([seedReset, authToken, alertsQueue, alertsGet, alertsAct, triageRun, findingsAdd, actionsList]);
