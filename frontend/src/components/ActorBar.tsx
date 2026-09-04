import { Bot, RotateCcw, ShieldCheck, User, UserCog } from "lucide-react";

import type { Actor } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface Identity {
  key: string;
  label: string;
  sub: string;
  email: string;
}

const ICONS: Record<string, typeof User> = {
  analyst: User,
  senior: UserCog,
  agent: Bot,
};

export function ActorBar({
  actor,
  identities,
  activeKey,
  onSwitch,
  onReset,
  busy,
}: {
  actor: Actor | null;
  identities: Identity[];
  activeKey: string;
  onSwitch: (key: string) => void;
  onReset: () => void;
  busy: boolean;
}) {
  return (
    <div className="border-border/60 bg-card flex flex-wrap items-center gap-3 rounded-xl border p-3">
      <span className="text-muted-foreground pl-1 text-sm font-medium">Acting as</span>
      <div className="flex flex-wrap gap-2">
        {identities.map((id) => {
          const Icon = ICONS[id.key] ?? User;
          const active = id.key === activeKey;
          return (
            <Button
              key={id.key}
              size="sm"
              variant={active ? "default" : "outline"}
              disabled={busy}
              onClick={() => onSwitch(id.key)}
              className="h-auto flex-col items-start gap-0 py-1.5"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="size-3.5" />
                {id.label}
              </span>
              <span className="text-[11px] font-normal opacity-80">{id.sub}</span>
            </Button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-3">
        {actor && (
          <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <ShieldCheck className="size-3.5" />
            {actor.can_freeze ? (
              <Badge variant="default">Can freeze accounts</Badge>
            ) : (
              <Badge variant="secondary">No freeze authority</Badge>
            )}
          </span>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onReset} title="Reset the demo data">
          <RotateCcw className="size-3.5" /> Reset demo
        </Button>
      </div>
    </div>
  );
}
