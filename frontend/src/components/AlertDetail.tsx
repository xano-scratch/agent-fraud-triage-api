import { useState } from "react";
import { ArrowUpCircle, Bot, Check, Lock, MessagesSquare, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";

import type { Actor, AlertDetail as AlertDetailData } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { N, S, relativeTime, severityVariant, statusVariant } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Banner {
  allowed: boolean;
  action: string;
  rule: string;
  decision?: string;
  source?: string;
  why?: string;
}

export function AlertDetail({
  detail,
  actor,
  banner,
  busy,
  onAct,
  onTriage,
  onAddFinding,
}: {
  detail: AlertDetailData | null;
  actor: Actor | null;
  banner: Banner | null;
  busy: boolean;
  onAct: (action: "clear" | "escalate" | "freeze") => void;
  onTriage: () => void;
  onAddFinding: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  if (!detail || !detail.alert) {
    return (
      <Card className="text-muted-foreground flex min-h-64 items-center justify-center text-sm">
        Select an alert from the queue to review it.
      </Card>
    );
  }

  const alert = detail.alert;
  const account = detail.account;
  const sev = N(alert.severity);
  const status = S(alert.status);
  const isAgent = actor?.kind === "agent";

  const submitNote = () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    onAddFinding(trimmed);
    setNote("");
  };

  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={severityVariant(sev)}>Severity {sev}</Badge>
          <Badge variant={statusVariant(status)}>alert: {status}</Badge>
          {account && <Badge variant={statusVariant(S(account.status))}>account: {S(account.status)}</Badge>}
        </div>
        <CardTitle className="mt-1 text-lg">{account ? S(account.holder_name) : `Alert #${N(alert.id)}`}</CardTitle>
        <p className="text-muted-foreground text-sm">{S(alert.reason)}</p>
        {account && S(account.risk_note) && (
          <p className="text-muted-foreground text-xs">
            <span className="font-medium">Account note:</span> {S(account.risk_note)}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Action controls — the same endpoints a human and the agent both call. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct("clear")}>
            <Check className="size-3.5" /> Clear
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAct("escalate")}>
            <ArrowUpCircle className="size-3.5" /> Escalate
          </Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => onAct("freeze")}>
            <Lock className="size-3.5" /> Freeze account
          </Button>
          {isAgent && (
            <Button size="sm" disabled={busy} onClick={onTriage} className="ml-auto">
              <Sparkles className="size-3.5" /> Run agent triage
            </Button>
          )}
        </div>
        {!actor?.can_freeze && (
          <p className="text-muted-foreground -mt-2 text-xs">
            Freeze requires senior authority. Try it as this identity to see the governed refusal.
          </p>
        )}

        {/* The deciding-rule banner — the governed outcome of the last action. */}
        {banner && (
          <div
            className={cn(
              "rounded-lg border p-3",
              banner.allowed ? "border-primary/50 bg-primary/10" : "border-destructive/60 bg-destructive/10",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              {banner.allowed ? (
                <ShieldCheck className="text-primary size-4" />
              ) : (
                <ShieldAlert className="text-destructive size-4" />
              )}
              {banner.action} {banner.allowed ? "allowed" : "refused"}
              {banner.source && (
                <Badge variant={banner.source === "agent" ? "default" : "secondary"} className="ml-1 gap-1">
                  <Bot className="size-3" /> {banner.source === "agent" ? "decided by agent" : "severity rule"}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">Deciding rule: </span>
              {banner.rule}
            </p>
            {banner.why && banner.source && (
              <p className="text-muted-foreground mt-1 text-xs">Reasoning: {banner.why}</p>
            )}
          </div>
        )}

        {/* Findings */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <MessagesSquare className="size-4" /> Findings
          </h3>
          <ul className="space-y-2">
            {detail.findings.map((finding) => (
              <li key={N(finding.id)} className="border-border/60 rounded-md border px-3 py-2 text-sm">
                <div className="text-muted-foreground mb-0.5 flex items-center gap-1.5 text-xs">
                  <Badge variant={S(finding.actor_kind) === "agent" ? "default" : "secondary"}>{S(finding.actor_kind)}</Badge>
                  {relativeTime(N(finding.created_at))}
                </div>
                {S(finding.note)}
              </li>
            ))}
            {detail.findings.length === 0 && <li className="text-muted-foreground text-xs">No findings yet.</li>}
          </ul>
          <div className="mt-2 flex gap-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add an investigation note…"
              className="min-h-9 resize-none"
              rows={1}
            />
            <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={submitNote}>
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
