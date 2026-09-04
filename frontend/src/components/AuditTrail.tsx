import { Ban, Bot, Check, ScrollText, User } from "lucide-react";

import type { AuditRow } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { N, S, relativeTime } from "@/lib/format";

export function AuditTrail({ rows }: { rows: AuditRow[] }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-border/60 border-b py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ScrollText className="size-4" /> Audit trail
          <span className="text-muted-foreground font-normal">every attempt, allowed or refused</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-border/60 border-b text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="px-4 py-2 font-medium">Deciding rule</th>
              </tr>
            </thead>
            <tbody className="divide-border/60 divide-y">
              {rows.map((row) => {
                const allowed = row.allowed === true;
                const kind = S(row.actor_kind);
                return (
                  <tr key={N(row.id)} className="align-top">
                    <td className="text-muted-foreground px-4 py-2 whitespace-nowrap">{relativeTime(N(row.created_at))}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {kind === "agent" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
                        {S(row.actor_name) || (kind === "agent" ? "Agent" : "Analyst")}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap font-medium">{S(row.action)}</td>
                    <td className="px-4 py-2">
                      {allowed ? (
                        <Badge variant="default" className="gap-1">
                          <Check className="size-3" /> allowed
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <Ban className="size-3" /> refused
                        </Badge>
                      )}
                    </td>
                    <td className="text-muted-foreground max-w-md px-4 py-2">{S(row.rule)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-4 py-8 text-center">
                    No actions yet. Act on an alert to write the first audit row.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
