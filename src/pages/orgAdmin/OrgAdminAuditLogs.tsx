import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Clock, User, Shield, Briefcase, FileText, Settings, Users, AlertTriangle } from "lucide-react";
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

const entityIcons: Record<string, React.ElementType> = {
  candidate: Users,
  job: Briefcase,
  application: FileText,
  user: User,
  organization: Settings,
  default: AlertTriangle
};

const actionColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  create: 'default',
  update: 'secondary',
  delete: 'destructive',
  view: 'outline',
  login: 'default',
  logout: 'outline'
};


export default function OrgAdminAuditLogs({ embedded = false }: { embedded?: boolean }) {
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
      // Keep UI responsive
    } finally {
      setLoading(false);
    }
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getActionColor = (action: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    const lowerAction = action.toLowerCase();
    if (lowerAction.includes('delete') || lowerAction.includes('remove')) return 'destructive';
    if (lowerAction.includes('create') || lowerAction.includes('add')) return 'default';
    if (lowerAction.includes('update') || lowerAction.includes('edit')) return 'secondary';
    return 'outline';
  };

  const getEntityIcon = (entityType: string) => {
    return entityIcons[entityType] || entityIcons.default;
  };

  if (loading && logs.length === 0) {
    const loader = (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
    if (embedded) return loader;
    return <DashboardLayout>{loader}</DashboardLayout>;
  }

  if (!organizationId) {
    const msg = (
      <div className="glass-panel p-6 rounded-xl">
        <h2 className="text-lg font-semibold mb-2">Organization not assigned</h2>
        <p className="text-sm text-muted-foreground">
          Tenant audit logs are only available when your account manager role is linked to an organization.
        </p>
      </div>
    );
    if (embedded) return msg;
    return <DashboardLayout>{msg}</DashboardLayout>;
  }

  const content = (
    <div className="space-y-6 animate-fade-in">
      {!embedded && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-gradient-premium">Audit Logs</h1>
            <p className="mt-1 text-muted-foreground">
              Default view shows the last 4 hours. Search queries the full tenant history.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 glass-panel p-3 rounded-xl">
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground ml-2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search audit logs..."
            className="bg-transparent border-0 focus-visible:ring-0 placeholder:text-muted-foreground/50 w-full"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setExpanded(false);
            setCursor(null);
            fetchLogs(true);
          }}
          disabled={loading}
          className="hover:bg-white/10"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Refresh
        </Button>
      </div>

      <div className="space-y-4">
        {/* Header Info */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Tenant Activity</h3>
          </div>
          <Badge variant="outline" className="glass-panel text-xs font-normal">
            {qDebounced ? "Search Mode" : expanded ? "Paged History" : "Last 4 hours"}
          </Badge>
        </div>

        {sortedLogs.length === 0 ? (
          <div className="text-center py-12 glass-panel rounded-xl border-dashed border-2 border-white/10">
            <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No activity logs</h3>
            <p className="text-muted-foreground">Logs matching your criteria will appear here.</p>
          </div>
        ) : (
          <div className="glass-panel p-0 rounded-xl overflow-hidden border border-white/10 shadow-sm relative z-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-primary/5">
                  <TableRow className="hover:bg-transparent border-b border-white/10">
                    <SortableTableHead label="Time" sortKey="created_at" sort={tableSort.sort} onToggle={tableSort.toggle} className="pl-6" />
                    <SortableTableHead label="User" sortKey="user_name" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    <SortableTableHead label="Action" sortKey="action" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    <SortableTableHead label="Entity" sortKey="entity_type" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    <SortableTableHead label="Details" sortKey="ip_address" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    {/* Reusing existing column headers or similar */}
                    <SortableTableHead label="IP" sortKey="ip_address" sort={tableSort.sort} onToggle={tableSort.toggle} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLogs.map((log) => {
                    const EntityIcon = getEntityIcon(log.entity_type);
                    return (
                      <TableRow key={log.id} className="hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors group">
                        <TableCell className="pl-6 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="h-3 w-3 text-primary" />
                            </div>
                            <span className="truncate text-sm font-medium">{log.user_name || "Unknown"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionColor(log.action)} className="text-[10px] px-2 py-0.5 min-w-[60px] justify-center">
                            {formatAction(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-foreground/80">
                            <EntityIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="capitalize">{log.entity_type}
                              {log.entity_id ? <span className="text-muted-foreground/50 text-xs ml-1">({String(log.entity_id).slice(0, 4)}...)</span> : ""}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {log.details ? (
                            <code className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded inline-block max-w-full truncate font-mono text-muted-foreground" title={JSON.stringify(log.details)}>
                              {JSON.stringify(log.details)}
                            </code>
                          ) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {log.ip_address || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-center gap-2">
          {!qDebounced && !expanded && (
            <Button
              variant="outline"
              size="sm"
              className="glass-panel hover:bg-white/10"
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
            <Button variant="outline" size="sm" className="glass-panel hover:bg-white/10" onClick={() => fetchLogs(false)} disabled={loading || !hasMore}>
              <Loader2 className={`mr-2 h-3 w-3 ${loading ? 'animate-spin' : 'hidden'}`} />
              Load more (100)
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
