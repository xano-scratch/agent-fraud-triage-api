import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Landmark, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DataList, EmptyState, PageHeader, Pager, SearchInput, StatusBadge, StatusTabs, Toolbar, useLoad, useUrlState, type Column,
} from "@/components/kit";
import { api, type Account } from "@/lib/api";
import { useLive } from "@/base/live";

const PAGE = 20;
const STATUS_TABS = [{ value: "", label: "All" }, { value: "active", label: "Active" }, { value: "frozen", label: "Frozen" }];

export function AccountsPage() {
  const [q, setQ] = useUrlState({ status: "", q: "", page: "1" });
  const navigate = useNavigate();
  const list = useLoad(() => api.accounts({ status: q.status, q: q.q, page: q.page, per_page: String(PAGE) }), [q.status, q.q, q.page]);
  // Open-alert counts per account, computed on the client from the open queue (keeps the endpoint simple).
  const openAlerts = useLoad(() => api.alerts({ status: "open", per_page: "300" }), []);
  useLive("account", list.reload);
  useLive("alert", openAlerts.reload);

  const openByAccount = useMemo(() => {
    const m = new Map<number, number>();
    for (const a of openAlerts.data?.items ?? []) m.set(a.account_id, (m.get(a.account_id) ?? 0) + 1);
    return m;
  }, [openAlerts.data]);
  const rows = list.data?.items ?? null;
  const filtered = !!(q.q || q.status);

  const columns: Column<Account>[] = [
    { id: "account", header: "Account", cell: (a) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium" title={a.holder_name}>{a.holder_name}</span>
        <span className="font-mono text-xs text-muted-foreground">{a.account_number}</span>
      </div>
    ) },
    { id: "status", header: "Status", className: "w-28", cell: (a) => a.status === "frozen"
      ? <StatusBadge tone="info"><Snowflake className="size-3" />Frozen</StatusBadge>
      : <StatusBadge tone="neutral" dot>Active</StatusBadge> },
    { id: "open", header: "Open alerts", className: "w-24 tabular-nums", cell: (a) => {
      const n = openByAccount.get(a.id) ?? 0;
      return <span className={n ? "font-medium" : "text-muted-foreground"}>{n}</span>;
    } },
    { id: "risk", header: "Risk note", className: "w-64", hideBelow: "xl", cell: (a) => <span className="truncate text-muted-foreground" title={a.risk_note ?? ""}>{a.risk_note || "—"}</span> },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="accounts-page">
      <PageHeader title="Accounts" description="The customer accounts under watch. Open one to see its alerts and its freeze state.">
        <StatusTabs value={q.status} onChange={(v) => setQ({ status: v, page: "1" })} options={STATUS_TABS} label="Filter by status" />
        <Toolbar>
          <SearchInput value={q.q} onChange={(v) => setQ({ q: v, page: "1" })} placeholder="Search holders" />
        </Toolbar>
      </PageHeader>

      <DataList label="Accounts" rows={rows} error={list.error} onRetry={list.reload} columns={columns} rowKey={(a) => a.id}
        pageSize={PAGE} onOpen={(a) => navigate(`/accounts/${a.id}`)}
        mobileRow={(a) => (
          <>
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-medium" title={a.holder_name}>{a.holder_name}</span>
              {a.status === "frozen" ? <StatusBadge tone="info">Frozen</StatusBadge> : <StatusBadge tone="neutral" dot>Active</StatusBadge>}
            </span>
            <span className="truncate text-xs text-muted-foreground">{a.account_number} · {openByAccount.get(a.id) ?? 0} open</span>
          </>
        )}
        empty={filtered
          ? <EmptyState icon={Landmark} title="No accounts match" description="Nothing matches these filters."
              action={<Button variant="outline" size="sm" onClick={() => setQ({ q: "", status: "" })}>Clear filters</Button>} />
          : <EmptyState icon={Landmark} title="No accounts" description="Monitored accounts show up here." />} />
    </div>
  );
}
