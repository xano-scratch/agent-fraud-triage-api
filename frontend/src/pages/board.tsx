import { useNavigate } from "react-router";
import { Bot, Snowflake } from "lucide-react";
import { useCan } from "@xano-sdk/rbac/react";
import { KanbanBoard, PageHeader, useLoad } from "@/components/kit";
import { api, type Alert, type AlertStatus } from "@/lib/api";
import { KINDS, SeverityMark, initials, kindLabel, markStep, moveAlert, statusOf, useAccountsMap, usePendingDrafts, useUrgentThreshold } from "@/lib/triage";
import { useLive } from "@/base/live";
import { PresenceAvatars } from "@/base/presence";
import { useWorkspace } from "@/base/workspace";

const kindDot = (k: string) => ({ login_anomaly: "Login", velocity: "Velocity", device_change: "Device", geo_mismatch: "Geo", chargeback_pattern: "Chargeback" }[k] ?? kindLabel(k));

/** The Triage board: every alert by status. Drag an open card to clear or escalate it; every move is audited. */
export function BoardPage() {
  const alerts = useLoad(() => api.alerts({ per_page: "200" }), []);
  const accounts = useAccountsMap();
  const { threshold } = useUrgentThreshold();
  useLive("alert", alerts.reload);
  useLive("account", accounts.reload);
  const { people } = useWorkspace();
  const canTriage = useCan("alerts.triage");
  const drafts = usePendingDrafts();
  const navigate = useNavigate();
  const rows = alerts.data?.items ?? null;
  const setRows = (r: Alert[] | null) => alerts.setData((p) => (p && r ? { ...p, items: r } : p));

  return (
    <div className="flex flex-col gap-4" data-signature-view="board" data-testid="board-page">
      <PageHeader title="Triage board" description={canTriage ? "Every alert by status. Drag an open card to clear or escalate it; each move is written to the audit trail." : "Every alert by status."}
        actions={<PresenceAvatars room="board" />} />
      <KanbanBoard label="Alerts by status" items={rows} error={alerts.error} onRetry={alerts.reload}
        columns={STATUS_COLUMNS} columnOf={(a) => a.status ?? "open"} itemKey={(a) => a.id}
        canMove={(a) => canTriage && a.status === "open"}
        onOpen={(a) => navigate(`/alerts?open=${a.id}`)}
        onMove={(a, to) => {
          if (to === a.status || to === "open") return;
          markStep("board");
          void moveAlert(rows, setRows, a, to === "cleared" ? "clear" : "escalate", accounts.reload);
        }}
        renderCard={(a) => {
          const acct = accounts.byId.get(a.account_id);
          const who = people.find((p) => p.id === a.assignee_id);
          return (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium wrap-anywhere" title={acct?.holder_name}>{acct?.holder_name ?? "Account"}</span>
                {acct?.status === "frozen" && <span title="Account frozen" className="inline-flex items-center gap-0.5 text-xs text-info"><Snowflake className="size-3.5" />Frozen</span>}
              </span>
              <span className="flex min-w-0 items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
                <span className="tabular-nums">#{a.id}</span>
                <span>{kindDot(a.kind)}</span>
                <span className="tabular-nums">Sev {a.severity}</span>
                <SeverityMark severity={a.severity} threshold={threshold} />
                {drafts.alerts.has(a.id) && <span title="An agent draft is waiting for approval" className="inline-flex items-center gap-1 text-info"><Bot className="size-3.5" />Draft</span>}
                {who && <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[0.625rem] font-medium text-foreground" title={who.name}>{initials(who.name)}</span>}
              </span>
              <span className="truncate text-xs text-muted-foreground" title={a.reason ?? ""}>{a.reason}</span>
            </>
          );
        }} />
    </div>
  );
}

const STATUS_COLUMNS = ([ "open", "escalated", "cleared" ] as AlertStatus[]).map((s) => ({ id: s, title: statusOf(s).label, tone: statusOf(s).tone, hint: statusOf(s).hint }));
