import { agent, input } from "@xanots/sdk";

/**
 * The fraud-triage agent. It reads one alert and proposes an in-scope decision.
 *
 * Its structured OUTPUT is constrained to `clear` or `escalate`, so the model
 * literally cannot propose freezing an account. The privileged action (freeze)
 * is not just refused at the rule path, it is off the agent's menu entirely.
 *
 * Provider is `xano-free`, so the demo needs no external model key. triage/run
 * treats the agent's decision as best-effort enrichment over a deterministic
 * severity rule, so the endpoint is well-behaved even if the free model is busy.
 */
export const fraudTriageAgent = agent({
  name: "fraud_triage_agent",
  description: "Reads a fraud alert and proposes an in-scope triage decision (clear or escalate). It can never propose a freeze.",
  llm: {
    type: "xano-free",
    systemPrompt:
      "You are a fraud-triage assistant for a bank's fraud-operations team. You review one alert and choose exactly one action: CLEAR it (low risk, no action needed) or ESCALATE it (a human analyst should review). You cannot freeze accounts and must never suggest it. Escalate anything with severity 3 or higher, or a reason that suggests account takeover, a new-device large transfer, or impossible-travel sign-ins.",
    prompt:
      "Alert severity: {{ $args.severity }} out of 5.\nReason: {{ $args.reason }}\n\nDecide clear or escalate, and give one short sentence of reasoning.",
    maxSteps: 1,
  },
  output: {
    schema: {
      decision: input.enum(["clear", "escalate"], { required: true }),
      reason: input.text({ required: true }),
    },
  },
});
