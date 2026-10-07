// What every fraud-triage screen shares: the statuses and kinds in words, the severity mark, the accounts map,
// the agent-draft markers, and the one optimistic triage write.
import { useEffect, useState } from "react";
import { useAgents } from "@xano-sdk/agents/react";
import { optimistic, StatusBadge, useLoad, type Tone } from "@/components/kit";
import { api, type Account, type Alert, type AlertKind, type AlertStatus, type TriageAction } from "@/lib/api";

/** The board's columns, and the status in words everywhere. */
export const STATUSES: { value: AlertStatus; label: string; tone: Tone; hint: string }[] = [
  { value: "open", label: "Open", tone: "neutral", hint: "Needs a decision" },
  { value: "escalated", label: "Escalated", tone: "warning", hint: "Sent to a senior" },
  { value: "cleared", label: "Cleared", tone: "success", hint: "Resolved" },
];
export const statusOf = (s: string | null | undefined) => STATUSES.find((x) => x.value === s) ?? STATUSES[0];

const KIND_LABELS: Record<AlertKind, string> = {
  login_anomaly: "Login anomaly",
  velocity: "Velocity",
  device_change: "Device change",
  geo_mismatch: "Geo mismatch",
  chargeback_pattern: "Chargeback",
};
export const KINDS = (Object.keys(KIND_LABELS) as AlertKind[]).map((value) => ({ value, label: KIND_LABELS[value] }));
export const kindLabel = (k: string | null | undefined) => KIND_LABELS[k as AlertKind] ?? (k ?? "");

/**
 * Severity, one way everywhere: a mark only at or above the urgent threshold (Urgent, danger) or just below it
 * (High, neutral); nothing lower, so a mark always means "look at this". The threshold is a workspace setting.
 */
export function SeverityMark({ severity, threshold }: { severity: number | null | undefined; threshold: number }) {
  const s = severity ?? 0;
  if (s >= threshold) return <StatusBadge tone="danger">Urgent</StatusBadge>;
  if (s === threshold - 1) return <StatusBadge tone="neutral">High</StatusBadge>;
  return null;
}

/** The urgent-severity threshold (settings), 4 until it loads. */
export function useUrgentThreshold() {
  const s = useLoad(() => api.settings(), []);
  return { threshold: s.data?.urgent_severity_threshold ?? 4, reload: s.reload };
}

/** Every monitored account, by id, loaded once per screen (for holder names and freeze state on alert rows). */
export function useAccountsMap() {
  const accounts = useLoad(() => api.accounts({ per_page: "200" }), []);
  const list = accounts.data?.items ?? [];
  const byId = new Map<number, Account>(list.map((a) => [a.id, a]));
  return { byId, list, reload: accounts.reload, loading: !accounts.data };
}

/** The alerts and accounts an agent draft is waiting on (each pending approval's link names its record). */
export function usePendingDrafts() {
  const { client } = useAgents();
  const [drafts, setDrafts] = useState<{ alerts: Set<number>; accounts: Set<number> }>({ alerts: new Set(), accounts: new Set() });
  useEffect(() => {
    client.approvals("pending").then((p) => {
      const live = p.items.filter((a) => !a.expires_at || a.expires_at > Date.now());
      const alerts = new Set<number>(), accounts = new Set<number>();
      for (const a of live) {
        const al = /\/alerts\?open=(\d+)/.exec(a.link ?? "");
        if (al) alerts.add(Number(al[1]));
        const ac = /\/accounts\/(\d+)/.exec(a.link ?? "");
        if (ac) accounts.add(Number(ac[1]));
      }
      setDrafts({ alerts, accounts });
    }, () => {});
  }, [client]);
  return drafts;
}

/** Move an alert on the board (clear or escalate), optimistically; roll back and say why if the server refuses. */
export function moveAlert(rows: Alert[] | null, setRows: (r: Alert[] | null) => void, alert: Alert, action: TriageAction, onSettled?: () => void) {
  const newStatus: AlertStatus = action === "clear" ? "cleared" : "escalated";
  return optimistic({
    apply: () => {
      const before = rows;
      setRows(rows ? rows.map((r) => (r.id === alert.id ? { ...r, status: newStatus } : r)) : rows);
      return () => setRows(before);
    },
    run: () => api.act(alert.id, action),
    success: `${action === "clear" ? "Cleared" : "Escalated"} alert #${alert.id}`,
    onSettled,
  });
}

/** UI-only first-run steps (moving a card, pressing ⌘K) remember they happened, per browser. */
export const markStep = (id: string) => { try { localStorage.setItem(`triage.step.${id}`, "1"); } catch { /* storage off */ } };
export const stepDone = (id: string) => { try { return localStorage.getItem(`triage.step.${id}`) === "1"; } catch { return false; } };

/** Initials for an avatar: "Avery Nash" -> "AN". */
export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** Audit actions and actor kinds, in words (shared by the alert sheet and the audit trail). */
export const AUDIT_ACTIONS: Record<string, string> = { clear: "Cleared", escalate: "Escalated", freeze: "Froze", unfreeze: "Unfroze", add_finding: "Added finding" };
export const auditActionLabel = (a: string | null | undefined) => AUDIT_ACTIONS[a ?? ""] ?? (a ?? "");
export const ACTOR_KINDS = [
  { value: "human", label: "Person" },
  { value: "agent", label: "Agent" },
  { value: "assistant", label: "Assistant" },
];
export const actorKindLabel = (k: string | null | undefined) => ACTOR_KINDS.find((x) => x.value === k)?.label ?? (k ?? "");
