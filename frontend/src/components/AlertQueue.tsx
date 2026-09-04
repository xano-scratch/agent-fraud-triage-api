import { ChevronRight } from "lucide-react";

import type { QueueRow } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { N, S, severityVariant, statusVariant } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AlertQueue({
  rows,
  selectedId,
  onSelect,
}: {
  rows: QueueRow[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-border/60 border-b py-3">
        <CardTitle className="text-sm font-medium">
          Alert queue <span className="text-muted-foreground">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-border/60 divide-y">
          {rows.map((row) => {
            const id = N(row.id);
            const sev = N(row.severity);
            const status = S(row.status);
            const active = id === selectedId;
            return (
              <li key={id}>
                <button
                  onClick={() => onSelect(id)}
                  className={cn(
                    "hover:bg-accent/50 flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                    active && "bg-accent",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant={severityVariant(sev)}>Sev {sev}</Badge>
                      <Badge variant={statusVariant(status)}>{status}</Badge>
                    </div>
                    <p className="truncate text-sm font-medium">{S(row.account_holder)}</p>
                    <p className="text-muted-foreground truncate text-xs">{S(row.reason)}</p>
                  </div>
                  <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" />
                </button>
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="text-muted-foreground px-4 py-8 text-center text-sm">No alerts. Reset the demo to seed some.</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
