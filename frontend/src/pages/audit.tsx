import { useNavigate } from "react-router";
import { ScrollText } from "lucide-react";
import {
  Ago, DataList, EmptyState, FilterSelect, PageHeader, Pager, StatusBadge, Toolbar, useLoad, useUrlState, type Column,
} from "@/components/kit";
import { api, type AuditEvent } from "@/lib/api";
import { ACTOR_KINDS, AUDIT_ACTIONS, actorKindLabel, auditActionLabel, useAccountsMap } from "@/lib/triage";
import { useLive } from "@/base/live";
import { useWorkspace } from "@/base/workspace";

const PAGE = 25;
const ACTION_OPTIONS = Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label }));
const DECISION_OPTIONS = [{ value: "allowed", label: "Allowed" }, { value: "refused", label: "Refused" }];

/** The governed audit trail: every attempt at a guarded action, allowed or refused, with the deciding rule. */
export function AuditPage() {
  const [q, setQ] = useUrlState({ action: "", allowed: "", actor_kind: "", page: "1" });
  const navigate = useNavigate();
  const { nameOf } = useWorkspace();
  const accounts = useAccountsMap();
  const list = useLoad(() => api.audit({ action: q.action, allowed: q.allowed, actor_kind: q.actor_kind, page: q.page, per_page: String(PAGE) }), [q.action, q.allowed, q.actor_kind, q.page]);
  useLive("audit_event", list.reload);
  const rows = list.data?.items ?? null;
  const filtered = !!(q.action || q.allowed || q.actor_kind);

  const onFor = (e: AuditEvent) => (e.alert_id ? `/alerts?open=${e.alert_id}` : e.account_id ? `/accounts/${e.account_id}` : null);

  const columns: Column<AuditEvent>[] = [
    { id: "when", header: "When", className: "w-28 whitespace-nowrap text-muted-foreground", cell: (e) => <Ago value={e.created_at} /> },
    { id: "who", header: "Who", className: "w-44", cell: (e) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{nameOf(e.actor_id)}</span>
        <span className="truncate text-xs text-muted-foreground">{actorKindLabel(e.actor_kind)}{e.via ? ` · ${e.via}` : ""}</span>
      </div>
    ) },
    { id: "action", header: "Action", className: "w-28 whitespace-nowrap", cell: (e) => auditActionLabel(e.action) },
    { id: "decision", header: "Decision", className: "w-28", cell: (e) => <StatusBadge tone={e.allowed ? "success" : "danger"}>{e.allowed ? "Allowed" : "Refused"}</StatusBadge> },
    { id: "rule", header: "Deciding rule", cell: (e) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate" title={e.rule ?? ""}>{e.rule}</span>
        {e.detail && <span className="truncate text-xs text-muted-foreground" title={e.detail}>{e.detail}</span>}
      </div>
    ) },
    { id: "on", header: "On", className: "w-32 whitespace-nowrap text-muted-foreground", hideBelow: "xl", cell: (e) =>
      e.alert_id ? <span className="tabular-nums">Alert #{e.alert_id}</span>
      : e.account_id ? <span className="truncate">{accounts.byId.get(e.account_id)?.holder_name ?? `Account #${e.account_id}`}</span>
      : <span>—</span> },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="audit-page">
      <PageHeader title="Audit trail" description="Every attempt at a guarded action, allowed or refused, with the rule that decided it. Read-only.">
        <Toolbar>
          <FilterSelect value={q.allowed} onChange={(v) => setQ({ allowed: v, page: "1" })} allLabel="Any decision" label="Decision" options={DECISION_OPTIONS} />
          <FilterSelect value={q.action} onChange={(v) => setQ({ action: v, page: "1" })} allLabel="Any action" label="Action" options={ACTION_OPTIONS} />
          <FilterSelect value={q.actor_kind} onChange={(v) => setQ({ actor_kind: v, page: "1" })} allLabel="Anyone" label="Actor" options={ACTOR_KINDS} />
        </Toolbar>
      </PageHeader>

      <DataList label="Audit trail" rows={rows} error={list.error} onRetry={list.reload} columns={columns} rowKey={(e) => e.id}
        pageSize={PAGE} onOpen={(e) => { const href = onFor(e); if (href) navigate(href); }}
        mobileRow={(e) => (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{auditActionLabel(e.action)} · {nameOf(e.actor_id)}</span>
              <StatusBadge tone={e.allowed ? "success" : "danger"}>{e.allowed ? "Allowed" : "Refused"}</StatusBadge>
            </span>
            <span className="truncate text-xs text-muted-foreground" title={e.rule ?? ""}>{e.rule}</span>
          </>
        )}
        empty={filtered
          ? <EmptyState icon={ScrollText} title="No entries match" description="Nothing matches these filters."
              action={undefined} />
          : <EmptyState icon={ScrollText} title="Nothing audited yet" description="Every clear, escalate, freeze and refusal shows up here." />} />
      {list.data && <Pager page={list.data.curPage} pageTotal={list.data.pageTotal} itemsTotal={list.data.itemsTotal} noun="entries" onPage={(p) => setQ({ page: String(p) })} />}
    </div>
  );
}
