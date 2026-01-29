import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { sortBy } from "@/lib/sort";
import { useTableSort } from "@/hooks/useTableSort";

type Row = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip_address: string | null;
  user_name?: string;
  details: unknown;
};

export default function OrgAdminAuditLogs() {
  const { organizationId, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const tableSort = useTableSort<"created_at" | "user_name" | "action" | "entity_type" | "ip_address">({
    key: "created_at",
    dir: "desc",
  });

  const cutoffIso = useMemo(() => new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), []);

  const sortedLogs = useMemo(() => {
    return sortBy(logs, tableSort.sort, (r, key) => {
      switch (key) {
        case "created_at":
          return r.created_at;
        case "user_name":
          return r.user_name || "";
        case "action":
          return r.action;
        case "entity_type":
          return r.entity_type;
        case "ip_address":
          return r.ip_address || "";
        default:
          return r.created_at;
      }
    });
  }, [logs, tableSort.sort]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (authLoading) return;
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setExpanded(false);
    setCursor(null);
    fetchLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, authLoading, qDebounced]);

  const buildOr = (qq: string) => {
    const pattern = `%${qq}%`;
    return [
      `action.ilike.${pattern}`,
      `entity_type.ilike.${pattern}`,
      `user_full_name.ilike.${pattern}`,
      `user_email.ilike.${pattern}`,
      `ip_address.ilike.${pattern}`,
      `details_text.ilike.${pattern}`,
    ].join(",");
  };

  const fetchLogs = async (reset: boolean) => {
    if (!organizationId) return;
    const PAGE = 100;
    setLoading(true);
    try {
      const sb: any = supabase as any;
      let query = sb
        .from("audit_logs_enriched")
        .select("id, created_at, action, entity_type, entity_id, ip_address, details, user_full_name, user_email, details_text, actor_is_super_admin")
        .eq("organization_id", organizationId)
        .eq("actor_is_super_admin", false)
        .order("created_at", { ascending: false })
        .limit(PAGE);

      if (!qDebounced) {
        if (!expanded) query = query.gte("created_at", cutoffIso);
      } else {
        query = query.or(buildOr(qDebounced));
      }

      const c = reset ? null : cursor;
      if (c) query = query.lt("created_at", c);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as any[];
      const normalized: Row[] = rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        ip_address: r.ip_address,
        details: r.details,
        user_name: r.user_full_name || r.user_email || undefined,
      }));

      const next = reset ? normalized : [...logs, ...normalized];
      setLogs(next);
      setHasMore(normalized.length === PAGE);
      setCursor(normalized[normalized.length - 1]?.created_at || null);
    } catch (e) {
      console.error(e);
      // Keep UI responsive instead of silently showing empty.
      // (We intentionally avoid toast spam here; org admins will use Refresh if needed.)
    } finally {
      setLoading(false);
    }
  };

  if (loading && logs.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Organization not assigned</CardTitle>
          </CardHeader>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Audit Logs</h1>
            <p className="mt-1">
              Default view shows the last 4 hours. Search queries the full tenant history.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search audit logs…" className="w-[260px]" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExpanded(false);
                setCursor(null);
                fetchLogs(true);
              }}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tenant activity</CardTitle>
            <CardDescription>
              {qDebounced ? "Search mode" : expanded ? "Paged history" : "Last 4 hours"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead label="Time" sortKey="created_at" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    <SortableTableHead label="User" sortKey="user_name" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    <SortableTableHead label="Action" sortKey="action" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    <SortableTableHead label="Entity" sortKey="entity_type" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    <SortableTableHead label="IP" sortKey="ip_address" sort={tableSort.sort} onToggle={tableSort.toggle} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        No audit logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(log.created_at), "MMM d, yyyy HH:mm:ss")}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <span className="truncate block">{log.user_name || "Unknown"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="">
                          {log.entity_type}
                          {log.entity_id ? ` (${String(log.entity_id).slice(0, 8)}…)` : ""}
                        </TableCell>
                        <TableCell className="">{log.ip_address || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              {!qDebounced && !expanded && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setExpanded(true);
                    fetchLogs(false);
                  }}
                  disabled={loading || !hasMore}
                >
                  Load older logs (100)
                </Button>
              )}
              {(qDebounced || expanded) && (
                <Button variant="outline" size="sm" onClick={() => fetchLogs(false)} disabled={loading || !hasMore}>
                  Load more (100)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}


