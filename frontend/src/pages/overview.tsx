import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AgentActivityFeed, ApprovalsWaiting, useAgents } from "@xano-sdk/agents/react";
import { useCan } from "@xano-sdk/rbac/react";
import { Skeleton } from "@/components/ui/skeleton";
import { FirstRun, LoadError, PageHeader, StatCard, openCommandPalette, perDay, useLoad } from "@/components/kit";
import { api } from "@/lib/api";
import { SeverityMark, markStep, stepDone, useAccountsMap, useUrgentThreshold } from "@/lib/triage";
import { useMe } from "@/base/session";
import { useLive } from "@/base/live";
import { ActivityFeed } from "@/base/activity";

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const seen = (k: string) => { try { return localStorage.getItem(`seen:${k}`) === "1"; } catch { return false; } };
const mark = (k: string) => { try { localStorage.setItem(`seen:${k}`, "1"); } catch { /* storage off */ } };
const DAY = 86_400_000;

export function OverviewPage() {
  const me = useMe();
  const { client } = useAgents();
  const canManage = useCan("team.manage");
  const { threshold } = useUrgentThreshold();
  const alerts = useLoad(() => api.alerts({ per_page: "300" }), []);
  const frozen = useLoad(() => api.accounts({ status: "frozen", per_page: "1" }), []);
  const refused = useLoad(() => api.audit({ allowed: "refused", per_page: "100" }), []);
  const accounts = useAccountsMap();
  const agentsUsed = useLoad(() => client.connections().then((c) => c.some((x) => !!x.last_used_at)), [client]);
  useLive("alert", () => { alerts.reload(); });
  useLive("account", () => { frozen.reload(); accounts.reload(); });
  useLive("audit_event", () => refused.reload());

  const all = alerts.data?.items ?? [];
  const open = all.filter((a) => a.status === "open");
  const escalated = all.filter((a) => a.status === "escalated").length;
  const highOpen = open.filter((a) => a.severity >= threshold).sort((a, b) => b.severity - a.severity);
  const frozenCount = frozen.data?.itemsTotal ?? 0;
  const refused7d = (refused.data?.items ?? []).filter((e) => e.created_at >= Date.now() - 7 * DAY).length;
  const opened = perDay(all, (a) => a.created_at, 14);
  const last7 = opened.slice(7).reduce((a, b) => a + b, 0), prev7 = opened.slice(0, 7).reduce((a, b) => a + b, 0);
  const loading = !alerts.data;

  return (
    <div className="flex flex-col gap-6" data-testid="overview">
      <PageHeader title={`${greeting()}, ${me.name.split(" ")[0]}`} description="What needs a decision now, and what people and their agents have been doing." />
      <FirstRun storageKey={`first-run:${me.id}`} title="Get to know the fraud desk" steps={[
        { id: "board", title: "Triage on the board", description: "Drag an open alert to Escalated or Cleared. It saves at once and lands in the audit trail.", href: "/board", done: stepDone("board") },
        { id: "freeze", title: "See a refusal", description: "Open an account and try Freeze. An analyst is refused, and the refusal is recorded.", href: "/accounts", done: stepDone("freeze") },
        { id: "live", title: "Watch it update live", description: "Open this app in a second window as the other person, change something there, and see it here.", onClick: () => { mark("live"); window.open(location.origin, "_blank", "noopener"); }, done: seen("live") },
        { id: "agent", title: "Connect an agent", description: "Give Claude Code a read-and-write key, then ask it to triage the open queue.", href: "/agents", done: agentsUsed.data === true },
        { id: "palette", title: "Find anything with ⌘K", description: "Jump to an alert or an account from the keyboard.", onClick: () => { markStep("palette"); openCommandPalette(); }, done: stepDone("palette") },
      ]} />
      <ApprovalsWaiting />

      {alerts.error ? <LoadError error={alerts.error} onRetry={alerts.reload} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Open alerts" value={open.length} hint="Awaiting a decision" href="/alerts?status=open" loading={loading}
            trend={opened} delta={{ value: last7 - prev7, label: "Opened, vs the 7 days before" }} />
          <StatCard label="Escalated" value={escalated} hint="Waiting on a senior" href="/alerts?status=escalated" loading={loading} />
          <StatCard label="Frozen accounts" value={frozenCount} hint="Currently stopped" href="/accounts?status=frozen" loading={!frozen.data} />
          <StatCard label="Refused attempts" value={refused7d} href="/audit?allowed=refused" loading={!refused.data}
            hint={refused7d ? <span className="font-medium text-warning">Last 7 days</span> : "Last 7 days"} />
        </div>
      )}

      {canManage && <TriageSettingsCard />}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="High severity, still open" className="rounded-lg border bg-card">
          <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-sm font-medium">High severity, still open</h2>
            <Link to="/alerts?status=open" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Queue<ArrowRight className="size-3.5" /></Link>
          </header>
          {loading ? <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Skeleton key={`skeleton-${i}`} className="h-4 w-full" />)}</div>
            : highOpen.length === 0 ? <p className="p-4 text-[0.8125rem] text-muted-foreground">Nothing high-severity is open. Good.</p> : (
              <ul className="divide-y">
                {highOpen.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link to={`/alerts?open=${a.id}`} className="flex min-w-0 items-center gap-3 px-4 py-2 text-[0.8125rem] hover:bg-muted/50">
                      <span className="tabular-nums text-muted-foreground">#{a.id}</span>
                      <span className="min-w-0 flex-1 truncate" title={a.reason ?? ""}>{accounts.byId.get(a.account_id)?.holder_name ?? a.reason}</span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">Sev {a.severity}</span>
                      <SeverityMark severity={a.severity} threshold={threshold} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </section>
        <AgentActivityFeed limit={6} />
      </div>

      <ActivityFeed entities={["alert", "account", "finding"]} />
    </div>
  );
}

function TriageSettingsCard() {
  const { threshold, reload } = useUrgentThreshold();
  const [busy, setBusy] = useState(false);
  async function set(n: number) {
    setBusy(true);
    try { await api.updateSettings(n); toast.success(`Urgent at severity ${n} and above`); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "That didn't save."); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-col">
        <h2 className="text-sm font-medium">Urgent severity threshold</h2>
        <p className="text-xs text-muted-foreground">Alerts at this severity and above are marked Urgent across the app.</p>
      </div>
      <label className="flex items-center gap-2 text-[0.8125rem]">
        <span className="text-muted-foreground">Urgent at</span>
        <select value={String(threshold)} disabled={busy} onChange={(e) => void set(Number(e.target.value))}
          className="h-8 rounded-md border bg-background px-2">
          {[2, 3, 4, 5].map((n) => <option key={n} value={n}>Sev {n}+</option>)}
        </select>
      </label>
    </div>
  );
}
