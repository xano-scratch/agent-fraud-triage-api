// Small coercion + presentation helpers. The SDK types set_var / function.run
// results as `unknown` and columns as `T | null`, so S()/N() coerce at the
// render boundary. Badge variants stay on the semantic tokens (no raw palette).

export const S = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
export const N = (v: unknown): number => Number(v ?? 0);

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "open":
      return "secondary";
    case "cleared":
      return "outline";
    case "escalated":
      return "default";
    case "frozen":
      return "destructive";
    default:
      return "outline";
  }
}

export function severityVariant(sev: number): BadgeVariant {
  if (sev >= 4) return "destructive";
  if (sev === 3) return "default";
  return "secondary";
}

export function actorKindLabel(kind: string): string {
  return kind === "agent" ? "AI agent" : "Human";
}

export function relativeTime(epochMs: number): string {
  if (!epochMs) return "";
  const diff = Date.now() - epochMs;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
