import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRight, Bot, Plus, Siren } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@xano-sdk/rbac/react";
import { RecordApprovals } from "@xano-sdk/agents/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Ago, DataList, EmptyState, Field, Fields, FilterSelect, InlineSelect, InlineText, PageHeader, Pager, RecordSheet,
  SearchInput, StatusBadge, StatusTabs, Toolbar, optimistic, useHotkey, useLoad, useOpenParam, useUrlState, type Column,
} from "@/components/kit";
import { api, type Alert, type AlertDetail, type AlertKind } from "@/lib/api";
import { KINDS, SeverityMark, actorKindLabel, auditActionLabel, kindLabel, statusOf, useAccountsMap, usePendingDrafts, useUrgentThreshold } from "@/lib/triage";
import { useLive } from "@/base/live";
import { useWorkspace } from "@/base/workspace";
import { RecordTimeline } from "@/base/activity";

const PAGE = 20;
const SEVERITIES = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `Sev ${n}` }));
const NOBODY = "0";

export function AlertsPage() {
  const [q, setQ] = useUrlState({ status: "", severity: "", kind: "", q: "", mine: "", page: "1" });
  const [openId, open, close] = useOpenParam();
  const { threshold } = useUrgentThreshold();
  const accounts = useAccountsMap();
  const { people, nameOf } = useWorkspace();
  const canTriage = useCan("alerts.triage");
  const drafts = usePendingDrafts();
  const [creating, setCreating] = useState(false);
  useHotkey("n", () => canTriage && setCreating(true));
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("new") !== "1") return;
    if (canTriage) setCreating(true);
    setParams((p) => { const n = new URLSearchParams(p); n.delete("new"); return n; }, { replace: true });
  }, [params, setParams, canTriage]);

  const mine = q.mine === "me" ? "true" : "";
  const list = useLoad(() => api.alerts({ status: q.status, severity: q.severity, kind: q.kind, q: q.q, mine, page: q.page, per_page: String(PAGE) }), [q.status, q.severity, q.kind, q.q, q.mine, q.page]);
  const counts = useLoad(() => api.alerts({ severity: q.severity, kind: q.kind, q: q.q, mine, per_page: "300" }), [q.severity, q.kind, q.q, q.mine]);
  const detail = useLoad<AlertDetail | null>(() => (openId ? api.alert(openId) : Promise.resolve(null)), [openId]);
  useLive("alert", () => { list.reload(); counts.reload(); if (openId) detail.reload(); });
  useLive("audit_event", () => { if (openId) detail.reload(); });

  const rows = list.data?.items ?? null;
  const tabs = useMemo(() => {
    const all = counts.data?.items ?? [];
    return [{ value: "", label: "All", count: counts.data ? all.length : undefined },
      ...statusTabs(all, counts.data)];
  }, [counts.data]);
  const filtered = !!(q.q || q.status || q.severity || q.kind || q.mine);

  const columns: Column<Alert>[] = [
    { id: "alert", header: "Alert", cell: (a) => (
      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium" title={a.reason ?? ""}><span className="text-muted-foreground tabular-nums">#{a.id}</span> {a.reason}</span>
          {drafts.alerts.has(a.id) && <StatusBadge tone="info"><Bot className="size-3" />Draft waiting</StatusBadge>}
        </span>
        <span className="truncate text-xs text-muted-foreground">{accounts.byId.get(a.account_id)?.holder_name ?? "Account"}</span>
      </div>
    ) },
    { id: "severity", header: "Severity", className: "w-28 whitespace-nowrap", cell: (a) => (
      <span className="flex items-center gap-2"><span className="tabular-nums text-muted-foreground">Sev {a.severity}</span><SeverityMark severity={a.severity} threshold={threshold} /></span>
    ) },
    { id: "kind", header: "Kind", className: "w-32", hideBelow: "xl", cell: (a) => <span className="text-muted-foreground">{kindLabel(a.kind)}</span> },
    { id: "status", header: "Status", className: "w-28", cell: (a) => <StatusBadge tone={statusOf(a.status).tone} dot>{statusOf(a.status).label}</StatusBadge> },
    { id: "assignee", header: "Assignee", className: "w-32 whitespace-nowrap", hideBelow: "xl", cell: (a) => <span className={a.assignee_id ? "" : "text-muted-foreground"}>{a.assignee_id ? nameOf(a.assignee_id) : "Unassigned"}</span> },
    { id: "created", header: "Opened", className: "w-28 whitespace-nowrap text-muted-foreground", hideBelow: "xl", cell: (a) => <Ago value={a.created_at} /> },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="alerts-page">
      <PageHeader title="Alerts" description="The fraud queue, most severe first. Open one to triage it in place."
        actions={canTriage && <Button size="sm" onClick={() => setCreating(true)}><Plus />New alert<kbd className="ml-1 hidden rounded border border-primary-foreground/30 px-1 font-mono text-[0.625rem] sm:inline">N</kbd></Button>}>
        <StatusTabs value={q.status} onChange={(v) => setQ({ status: v, page: "1" })} options={tabs} label="Filter by status" />
        <Toolbar>
          <SearchInput value={q.q} onChange={(v) => setQ({ q: v, page: "1" })} placeholder="Search reasons" />
          <FilterSelect value={q.severity} onChange={(v) => setQ({ severity: v, page: "1" })} allLabel="Any severity" label="Severity" options={SEVERITIES} />
          <FilterSelect value={q.kind} onChange={(v) => setQ({ kind: v, page: "1" })} allLabel="Any kind" label="Kind" options={KINDS} />
          <FilterSelect value={q.mine} onChange={(v) => setQ({ mine: v, page: "1" })} allLabel="Anyone" label="Assigned" options={[{ value: "me", label: "Me" }]} />
        </Toolbar>
      </PageHeader>

      <DataList label="Alerts" rows={rows} error={list.error} onRetry={list.reload} columns={columns} rowKey={(a) => a.id}
        pageSize={PAGE} activeKey={openId} onOpen={(a) => open(a.id)}
        mobileRow={(a) => (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-medium" title={a.reason ?? ""}>{a.reason}</span>
              <StatusBadge tone={statusOf(a.status).tone} dot>{statusOf(a.status).label}</StatusBadge>
            </span>
            <span className="truncate text-xs text-muted-foreground">#{a.id} · Sev {a.severity} · {accounts.byId.get(a.account_id)?.holder_name ?? "Account"}</span>
          </>
        )}
        empty={filtered
          ? <EmptyState icon={Siren} title="No alerts match" description="Nothing matches these filters. Clear them to see the whole queue."
              action={<Button variant="outline" size="sm" onClick={() => setQ({ q: "", status: "", severity: "", kind: "", mine: "" })}>Clear filters</Button>} />
          : <EmptyState icon={Siren} title="The queue is clear" description="New fraud alerts, and the ones your agents open, show up here." />}
        footer={list.data && <Pager page={list.data.curPage} pageTotal={list.data.pageTotal} itemsTotal={list.data.itemsTotal} noun="alerts" onPage={(p) => setQ({ page: String(p) })} />} />

      <RecordSheet open={!!openId} onClose={close}
        title={detail.data ? `Alert #${detail.data.alert.id}` : "Loading…"}
        description={detail.data ? kindLabel(detail.data.alert.kind) : undefined}>
        {detail.data
          ? <AlertDetailPanel detail={detail.data} setDetail={detail.setData} reload={() => { detail.reload(); list.reload(); counts.reload(); }} canTriage={canTriage} threshold={threshold} people={people} />
          : detail.error ? <p className="text-muted-foreground">That alert isn't there any more.</p> : null}
      </RecordSheet>

      <NewAlert open={creating} onClose={() => setCreating(false)} accounts={accounts.list} people={people}
        onCreated={(a) => { list.reload(); counts.reload(); open(a.id); }} />
    </div>
  );
}

function statusTabs(all: Alert[], loaded: unknown) {
  return statusList.map((s) => ({ value: s.value, label: s.label, count: loaded ? all.filter((a) => a.status === s.value).length : undefined }));
}
const statusList = [{ value: "open", label: "Open" }, { value: "escalated", label: "Escalated" }, { value: "cleared", label: "Cleared" }];

function AlertDetailPanel({ detail, setDetail, reload, canTriage, threshold, people }: {
  detail: AlertDetail; setDetail: (fn: (p: AlertDetail | null) => AlertDetail | null) => void; reload: () => void;
  canTriage: boolean; threshold: number; people: { id: number; name: string }[];
}) {
  const { alert, account, findings, audit } = detail;
  const open = alert.status === "open";
  const editable = canTriage && open;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const edit = (patch: Parameters<typeof api.editAlert>[1], success: string, local: Partial<Alert>) => optimistic({
    apply: () => { const before = detail; setDetail((p) => (p ? { ...p, alert: { ...p.alert, ...local } } : p)); return () => setDetail(() => before); },
    run: () => api.editAlert(alert.id, patch), success, onSettled: reload,
  });

  async function act(action: "clear" | "escalate") {
    setBusy(true);
    try { await api.act(alert.id, action); toast.success(`${action === "clear" ? "Cleared" : "Escalated"} alert #${alert.id}`); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "That didn't go through."); }
    finally { setBusy(false); }
  }
  async function addFinding() {
    if (!note.trim()) return;
    setBusy(true);
    try { await api.addFinding(alert.id, note.trim()); setNote(""); toast.success("Finding added"); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "That didn't save."); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-6">
      <RecordApprovals link={`/alerts?open=${alert.id}`} />
      <Link to={`/accounts/${account.id}`} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-muted/50">
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium" title={account.holder_name}>{account.holder_name}</span>
          <span className="font-mono text-xs text-muted-foreground">{account.account_number}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <StatusBadge tone={account.status === "frozen" ? "info" : "neutral"}>{account.status === "frozen" ? "Frozen" : "Active"}</StatusBadge>
          <ArrowRight className="size-4 text-muted-foreground" />
        </span>
      </Link>

      <Fields>
        <Field label="Severity">
          <span className="flex items-center gap-2">
            <InlineSelect label="Severity" value={String(alert.severity)} disabled={!editable} options={SEVERITIES}
              onSave={(v) => edit({ severity: Number(v) }, `Severity set to ${v}`, { severity: Number(v) })} />
            <SeverityMark severity={alert.severity} threshold={threshold} />
          </span>
        </Field>
        <Field label="Kind">{kindLabel(alert.kind)}</Field>
        <Field label="Status"><StatusBadge tone={statusOf(alert.status).tone} dot>{statusOf(alert.status).label}</StatusBadge></Field>
        <Field label="Assignee">
          <InlineSelect label="Assignee" value={String(alert.assignee_id ?? NOBODY)} disabled={!editable}
            options={[{ value: NOBODY, label: "Unassigned" }, ...people.map((p) => ({ value: String(p.id), label: p.name }))]}
            onSave={(v) => edit(v === NOBODY ? { clear_assignee: true } : { assignee_id: Number(v) }, v === NOBODY ? "Unassigned" : `Assigned to ${people.find((p) => String(p.id) === v)?.name}`, { assignee_id: v === NOBODY ? 0 : Number(v) })} />
        </Field>
        <Field label="Opened"><Ago value={alert.created_at} /></Field>
      </Fields>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Reason</h3>
        {editable
          ? <InlineText label="Reason" multiline value={alert.reason ?? ""} placeholder="Describe the alert…" onSave={(v) => edit({ reason: v }, "Saved", { reason: v })} />
          : <p className="whitespace-pre-wrap wrap-anywhere text-[0.8125rem]">{alert.reason || "No reason recorded."}</p>}
      </div>

      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void act("escalate")} disabled={busy}>Escalate</Button>
          <Button size="sm" variant="outline" onClick={() => void act("clear")} disabled={busy}>Clear</Button>
        </div>
      )}

      {canTriage && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Add a finding</h3>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What did you check?" maxLength={500} />
          <div><Button size="sm" variant="outline" onClick={() => void addFinding()} disabled={busy || !note.trim()}>Add finding</Button></div>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Findings</h3>
        {findings.length === 0 ? <p className="text-[0.8125rem] text-muted-foreground">No findings yet.</p> : (
          <ul className="flex flex-col gap-2">
            {findings.map((f) => (
              <li key={f.id} className="rounded-lg border bg-card p-3 text-[0.8125rem]">
                <p className="wrap-anywhere">{f.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">{actorKindLabel(f.actor_kind)} · <Ago value={f.created_at} /></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Decisions on this alert</h3>
        {audit.length === 0 ? <p className="text-[0.8125rem] text-muted-foreground">No decisions recorded yet.</p> : (
          <ul className="flex flex-col gap-2">
            {audit.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2 rounded-lg border bg-card p-3 text-[0.8125rem]">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{auditActionLabel(e.action)}{e.via ? ` · via ${e.via}` : ""}</span>
                  <span className="text-xs text-muted-foreground wrap-anywhere">{e.rule}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge tone={e.allowed ? "success" : "danger"}>{e.allowed ? "Allowed" : "Refused"}</StatusBadge>
                  <span className="text-xs text-muted-foreground"><Ago value={e.created_at} /></span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecordTimeline entity="alert" id={alert.id} />
    </div>
  );
}

function NewAlert({ open, onClose, onCreated, accounts, people }: {
  open: boolean; onClose: () => void; onCreated: (a: Alert) => void;
  accounts: { id: number; holder_name: string; account_number: string }[]; people: { id: number; name: string }[];
}) {
  const [accountId, setAccountId] = useState("");
  const [severity, setSeverity] = useState("3");
  const [kind, setKind] = useState<AlertKind>("velocity");
  const [reason, setReason] = useState("");
  const [assignee, setAssignee] = useState(NOBODY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) { setError("Pick an account."); return; }
    setBusy(true);
    try {
      const a = await api.createAlert({ account_id: Number(accountId), severity: Number(severity), kind, reason, assignee_id: assignee === NOBODY ? undefined : Number(assignee) });
      toast.success(`Opened alert #${a.id}`);
      setAccountId(""); setReason(""); setError(null);
      onClose(); onCreated(a);
    } catch (err) { setError(err instanceof Error ? err.message : "That didn't save."); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>New alert</DialogTitle>
            <DialogDescription>Open a fraud alert on a monitored account for the team to triage.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="na-account">Account</Label>
            <select id="na-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-[0.8125rem]">
              <option value="">Pick an account…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.holder_name} ({a.account_number})</option>)}
            </select>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="na-sev">Severity</Label>
              <select id="na-sev" value={severity} onChange={(e) => setSeverity(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-[0.8125rem]">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Sev {n}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="na-kind">Kind</Label>
              <select id="na-kind" value={kind} onChange={(e) => setKind(e.target.value as AlertKind)} className="h-8 rounded-md border bg-background px-2 text-[0.8125rem]">
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="na-assignee">Assignee <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <select id="na-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-[0.8125rem]">
              <option value={NOBODY}>Unassigned</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="na-reason">Reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="na-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Opening…" : "Open alert"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
