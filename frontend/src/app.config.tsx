// The app's frontend config (BASELINE.md): its screens, nav, ⌘K actions and record search, its permissions in
// plain words, and its assistant. The base app (src/base) builds the shell, sign-in, notifications, activity,
// settings, profile, team + invites, agents, approvals and live updates from it.
import { KanbanSquare, Landmark, LayoutDashboard, Plus, ScrollText, ShieldAlert, Siren } from "lucide-react";
import { useNavigate } from "react-router";
import { useCan } from "@xano-sdk/rbac/react";
import type { ChatTurn } from "@xano-sdk/chatbot/react";
import { page, type AppConfig } from "@/base/app";
import { api } from "@/lib/api";
import { markStep } from "@/lib/triage";

export const config: AppConfig = {
  name: "Agent Fraud-Triage API",
  icon: ShieldAlert,
  tagline: "One governed API a fraud team and their agents both call. Pick a person to sign in as.",

  routes: [
    { path: "/", lazy: page(() => import("./pages/overview"), "OverviewPage") },
    { path: "/board", lazy: page(() => import("./pages/board"), "BoardPage"), handle: { wide: true } },
    { path: "/alerts", lazy: page(() => import("./pages/alerts"), "AlertsPage") },
    { path: "/accounts", lazy: page(() => import("./pages/accounts"), "AccountsPage") },
    { path: "/accounts/:id", lazy: page(() => import("./pages/account-detail"), "AccountPage") },
    { path: "/audit", lazy: page(() => import("./pages/audit"), "AuditPage") },
  ],

  useNav: () => [
    { items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, primary: true, exact: true },
      { href: "/board", label: "Triage board", icon: KanbanSquare, primary: true },
      { href: "/alerts", label: "Alerts", icon: Siren, primary: true },
      { href: "/accounts", label: "Accounts", icon: Landmark, primary: true },
      { href: "/audit", label: "Audit trail", icon: ScrollText },
    ] },
  ],

  usePaletteActions: () => {
    const navigate = useNavigate();
    const canTriage = useCan("alerts.triage");
    return canTriage ? [{ id: "new-alert", label: "New alert", group: "Actions", icon: Plus, shortcut: "N", run: () => navigate("/alerts?new=1") }] : [];
  },
  search: (q, go) => {
    markStep("palette");
    return Promise.all([api.alerts({ q, per_page: "6" }), api.accounts({ q, per_page: "4" })]).then(([alerts, accounts]) => [
      ...alerts.items.map((a) => ({ id: `alert-${a.id}`, label: a.reason || `Alert #${a.id}`, hint: `#${a.id}`, group: "Alerts", icon: Siren, run: () => go(`/alerts?open=${a.id}`) })),
      ...accounts.items.map((a) => ({ id: `acct-${a.id}`, label: a.holder_name, hint: a.account_number, group: "Accounts", icon: Landmark, run: () => go(`/accounts/${a.id}`) })),
    ]);
  },
  shortcuts: [["N", "New alert (on Alerts)"]],

  permissionLabels: {
    "alerts.triage": "triage alerts: clear, escalate, add findings",
    "accounts.freeze": "freeze and unfreeze accounts",
    "audit.read": "read the audit trail",
    "team.manage": "manage the team and settings",
  },

  assistant: {
    name: "Fraud assistant",
    welcome: "Ask about the queue, find an alert, or draft a triage for a person to approve.",
    suggestions: ["Summarise the open queue", "Which high-severity alerts are still open?", "Draft a triage for alert #3"],
    followUps: (reply: ChatTurn) => {
      const used = reply.tools ?? [];
      if (used.includes("queue_summary")) return ["Which high-severity alerts are still open?", "Find velocity alerts"];
      if (used.includes("find_alerts")) return ["Summarise the open queue", "Draft a triage for the most severe one"];
      return ["Summarise the open queue", "Which high-severity alerts are still open?", "Find chargeback alerts"];
    },
  },
};
