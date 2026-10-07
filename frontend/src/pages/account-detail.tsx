import { useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ArrowRight, Snowflake } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@xano-sdk/rbac/react";
import { RecordApprovals } from "@xano-sdk/agents/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Ago, Field, Fields, InlineText, LoadError, PageHeader, StatusBadge, useLoad } from "@/components/kit";
import { api } from "@/lib/api";
import { SeverityMark, kindLabel, markStep, statusOf, useUrgentThreshold } from "@/lib/triage";
import { useLive } from "@/base/live";
import { PresenceAvatars } from "@/base/presence";
import { useWorkspace } from "@/base/workspace";
import { RecordTimeline } from "@/base/activity";

/** /accounts/:id — one account, its alerts, and its freeze state. Freezing is where the governance shows: anyone
 *  may try it, but only a senior's attempt freezes; an analyst's is refused and written to the audit trail. */
export function AccountPage() {
  const { id } = useParams();
  const { threshold } = useUrgentThreshold();
  const { nameOf } = useWorkspace();
  const canTriage = useCan("alerts.triage");
  const canFreeze = useCan("accounts.freeze");
  const { data, error, reload } = useLoad(() => api.account(id!), [id]);
  useLive("account", reload);
  useLive("alert", reload);

  if (error) return <LoadError title="This account didn't load" error={error} onRetry={reload} />;
  if (!data) return <div className="flex flex-col gap-6"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-40 w-full" /></div>;
  const { account, alerts } = data;
  const openCount = alerts.filter((a) => a.status === "open").length;

  return (
    <div className="flex flex-col gap-6" data-testid="account-page">
      <Link to="/accounts" className="inline-flex w-fit items-center gap-1 text-[0.8125rem] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Accounts</Link>
      <PageHeader title={account.holder_name} description={account.account_number} actions={<PresenceAvatars room={`account-${account.id}`} />} />

      <RecordApprovals link={`/accounts/${account.id}`} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <div className="rounded-lg border bg-card p-4">
            <Fields>
              <Field label="Status">
                {account.status === "frozen"
                  ? <StatusBadge tone="info"><Snowflake className="size-3" />Frozen</StatusBadge>
                  : <StatusBadge tone="neutral" dot>Active</StatusBadge>}
              </Field>
              <Field label="Open alerts"><span className="tabular-nums">{openCount}</span></Field>
              {account.status === "frozen" && <Field label="Frozen by">{account.frozen_by ? nameOf(account.frozen_by) : "—"}</Field>}
              {account.status === "frozen" && account.frozen_at && <Field label="Frozen"><Ago value={account.frozen_at} /></Field>}
              <Field label="Risk note">
                {canFreeze
                  ? <InlineText label="Risk note" multiline value={account.risk_note ?? ""} placeholder="Add a risk note…"
                      onSave={async (v) => { await api.editAccount(account.id, v); toast.success("Risk note saved"); reload(); }} />
                  : <span className="text-[0.8125rem]">{account.risk_note || "No note."}</span>}
              </Field>
            </Fields>
          </div>

          <section aria-label="Alerts on this account" className="rounded-lg border bg-card">
            <header className="border-b px-4 py-3"><h2 className="text-sm font-medium">Alerts on this account</h2></header>
            {alerts.length === 0 ? <p className="p-4 text-[0.8125rem] text-muted-foreground">No alerts on this account.</p> : (
              <ul className="divide-y">
                {alerts.map((a) => (
                  <li key={a.id}>
                    <Link to={`/alerts?open=${a.id}`} className="flex min-w-0 items-center gap-3 px-4 py-2 text-[0.8125rem] hover:bg-muted/50">
                      <span className="tabular-nums text-muted-foreground">#{a.id}</span>
                      <span className="min-w-0 flex-1 truncate" title={a.reason ?? ""}>{a.reason}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{kindLabel(a.kind)}</span>
                      <SeverityMark severity={a.severity} threshold={threshold} />
                      <StatusBadge tone={statusOf(a.status).tone} dot>{statusOf(a.status).label}</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {canTriage && (
          <aside className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">Account control</h2>
            <p className="text-xs text-muted-foreground">Freezing an account is senior-only. Anyone may attempt it; an attempt without senior authority is refused and written to the audit trail.</p>
            {account.status === "active"
              ? <FreezeDialog accountId={account.id} holder={account.holder_name} onDone={reload} />
              : <UnfreezeDialog accountId={account.id} holder={account.holder_name} onDone={reload} />}
            <Link to="/audit" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">See the audit trail<ArrowRight className="size-3.5" /></Link>
          </aside>
        )}
      </div>

      <div className="max-w-3xl rounded-lg border bg-card p-4"><RecordTimeline entity="account" id={account.id} /></div>
    </div>
  );
}

function FreezeDialog({ accountId, holder, onDone }: { accountId: number; holder: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function freeze() {
    setBusy(true);
    markStep("freeze");
    try { await api.freeze(accountId, reason.trim()); toast.success(`Froze ${holder}'s account`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "The freeze was refused."); }
    finally { setBusy(false); setOpen(false); setReason(""); onDone(); }
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Snowflake />Freeze account</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Freeze {holder}'s account?</AlertDialogTitle>
            <AlertDialogDescription>This stops activity on the account. It is senior-only; if you aren't a senior the attempt is refused and recorded. Every attempt is audited.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="freeze-reason" className="text-xs font-medium text-muted-foreground">Reason</label>
            <Textarea id="freeze-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why is this account being frozen?" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={() => void freeze()} disabled={busy}>{busy ? "Freezing…" : "Freeze account"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function UnfreezeDialog({ accountId, holder, onDone }: { accountId: number; holder: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function unfreeze() {
    setBusy(true);
    try { await api.unfreeze(accountId); toast.success(`Unfroze ${holder}'s account`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "The unfreeze was refused."); }
    finally { setBusy(false); setOpen(false); onDone(); }
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Unfreeze account</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfreeze {holder}'s account?</AlertDialogTitle>
            <AlertDialogDescription>Activity resumes on the account. It is senior-only; an attempt without senior authority is refused and recorded.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={() => void unfreeze()} disabled={busy}>{busy ? "Unfreezing…" : "Unfreeze account"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
