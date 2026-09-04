import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import {
  ApiError,
  act,
  addFinding,
  getAlert,
  getAudit,
  getQueue,
  login,
  resetDemo,
  setToken,
  type Actor,
  type AlertDetail as AlertDetailData,
  type AuditRow,
  type QueueRow,
} from "@/lib/api";
import { ActorBar, type Identity } from "@/components/ActorBar";
import { AlertQueue } from "@/components/AlertQueue";
import { AlertDetail, type Banner } from "@/components/AlertDetail";
import { AuditTrail } from "@/components/AuditTrail";
import { N } from "@/lib/format";
import { runTriage } from "@/lib/api";

const IDENTITIES: Identity[] = [
  { key: "analyst", label: "Dana Cole", sub: "Analyst", email: "dana@fraudops.example" },
  { key: "senior", label: "Sam Ortiz", sub: "Senior analyst", email: "sam@fraudops.example" },
  { key: "agent", label: "Triage Agent", sub: "AI agent", email: "triage-agent@fraudops.example" },
];
const DEMO_PASSWORD = "fraudops-demo";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function App() {
  const [actor, setActor] = useState<Actor | null>(null);
  const [activeKey, setActiveKey] = useState<string>("analyst");
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AlertDetailData | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Log in as an identity; if the ephemeral has no data yet, seed then retry. */
  async function ensureLogin(key: string): Promise<Actor> {
    const id = IDENTITIES.find((i) => i.key === key)!;
    try {
      const res = await login({ email: id.email, password: DEMO_PASSWORD });
      setToken(res.token);
      return res.actor;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        await resetDemo();
        const res = await login({ email: id.email, password: DEMO_PASSWORD });
        setToken(res.token);
        return res.actor;
      }
      throw e;
    }
  }

  async function refreshAll(keepId: number | null) {
    const [q, a] = await Promise.all([getQueue(), getAudit()]);
    setQueue(q);
    setAudit(a);
    if (keepId != null) {
      try {
        setDetail(await getAlert(keepId));
      } catch {
        /* alert may have gone; leave detail as-is */
      }
    }
  }

  // Boot: log in (seeding if needed), then load the queue. Supports optional
  // deep-link params (?as=agent&alert=1&act=freeze) so a governed result can be
  // shared as a link — the same mechanism used to frame the docs screenshot.
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const asParam = params.get("as");
        const bootKey = IDENTITIES.some((i) => i.key === asParam) ? (asParam as string) : "analyst";
        const alertParam = params.get("alert");
        const actParam = params.get("act");

        const a = await ensureLogin(bootKey);
        setActor(a);
        setActiveKey(bootKey);

        const q = await getQueue();
        setQueue(q);
        const targetId =
          alertParam && q.some((r) => N(r.id) === Number(alertParam))
            ? Number(alertParam)
            : q.length
              ? N(q[0].id)
              : null;
        if (targetId != null) setSelectedId(targetId);

        // Optional deep-link action.
        if (targetId != null && actParam) {
          try {
            if (actParam === "triage" && a.kind === "agent") {
              const res = await runTriage(targetId);
              setBanner({
                allowed: res.outcome.allowed,
                action: res.outcome.action || res.decision,
                rule: res.outcome.rule,
                decision: res.decision,
                source: res.source,
                why: res.why,
              });
            } else if (actParam === "clear" || actParam === "escalate" || actParam === "freeze") {
              const res = await act({ alert_id: targetId, action: actParam });
              setBanner({ allowed: res.outcome.allowed, action: actParam, rule: res.outcome.rule });
            }
          } catch (e) {
            setError(errMsg(e));
          }
        }

        // Load detail + audit AFTER any deep-link action so they reflect it.
        if (targetId != null) setDetail(await getAlert(targetId));
        setAudit(await getAudit());
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBooting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchActor(key: string) {
    setBusy(true);
    setError(null);
    setBanner(null);
    try {
      const a = await ensureLogin(key);
      setActor(a);
      setActiveKey(key);
      await refreshAll(selectedId);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function selectAlert(id: number) {
    setSelectedId(id);
    setBanner(null);
    setBusy(true);
    try {
      setDetail(await getAlert(id));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function doAct(action: "clear" | "escalate" | "freeze") {
    if (selectedId == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await act({ alert_id: selectedId, action });
      setBanner({ allowed: res.outcome.allowed, action, rule: res.outcome.rule });
      await refreshAll(selectedId);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function doTriage() {
    if (selectedId == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runTriage(selectedId);
      setBanner({
        allowed: res.outcome.allowed,
        action: res.outcome.action || res.decision,
        rule: res.outcome.rule,
        decision: res.decision,
        source: res.source,
        why: res.why,
      });
      await refreshAll(selectedId);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function doAddFinding(note: string) {
    if (selectedId == null) return;
    setBusy(true);
    setError(null);
    try {
      await addFinding({ alert_id: selectedId, note });
      await refreshAll(selectedId);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    setBusy(true);
    setError(null);
    setBanner(null);
    try {
      await resetDemo();
      const a = await ensureLogin(activeKey);
      setActor(a);
      const [q, trail] = await Promise.all([getQueue(), getAudit()]);
      setQueue(q);
      setAudit(trail);
      if (q.length) {
        const id = N(q[0].id);
        setSelectedId(id);
        setDetail(await getAlert(id));
      } else {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (booting) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Connecting to the governed API…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="text-primary size-6" /> Agent Fraud-Triage API
        </h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          One governed API a fraud team's AI agent and its human analysts both call. The same authority rules gate every
          action, and every attempt (allowed or refused) lands in one audit trail. Switch identity below, then act on an
          alert: only a senior can freeze, and the agent is refused just like a junior analyst.
        </p>
      </header>

      <ActorBar
        actor={actor}
        identities={IDENTITIES}
        activeKey={activeKey}
        onSwitch={switchActor}
        onReset={doReset}
        busy={busy}
      />

      {error && (
        <div className="border-destructive/60 bg-destructive/10 text-destructive-foreground rounded-lg border px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <AlertQueue rows={queue} selectedId={selectedId} onSelect={selectAlert} />
        <AlertDetail
          detail={detail}
          actor={actor}
          banner={banner}
          busy={busy}
          onAct={doAct}
          onTriage={doTriage}
          onAddFinding={doAddFinding}
        />
      </div>

      <AuditTrail rows={audit} />

      <footer className="text-muted-foreground pt-2 text-center text-xs">
        Backend authored in TypeScript with @xanots/sdk. The rule path (apply_action) and audit trail are one governed
        layer, called the same way by humans and the agent.
      </footer>
    </main>
  );
}
