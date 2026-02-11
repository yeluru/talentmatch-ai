import { useMemo, useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2, Search, Filter, Clock, User, FileText,
  Briefcase, Users, Settings, AlertTriangle, ChevronLeft, ChevronRight,
  ScrollText
} from 'lucide-react';
import { format } from 'date-fns';
import { sortBy } from '@/lib/sort';
import { useTableSort } from '@/hooks/useTableSort';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: unknown;
  ip_address: string | null;
  created_at: string;
  user_name?: string;
}

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

export default function AuditLogs() {
  const { organizationId, isLoading: authLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const tableSort = useTableSort<'created_at' | 'user_name' | 'action' | 'entity_type' | 'details' | 'ip_address'>({
    key: 'created_at',
    dir: 'desc',
  });

  useEffect(() => {
    if (authLoading) return;
    if (organizationId) fetchLogs();
    else setIsLoading(false);
  }, [organizationId, authLoading, page, actionFilter, entityFilter]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (actionFilter !== 'all') {
        query = query.ilike('action', `%${actionFilter}%`);
      }
      if (entityFilter !== 'all') {
        query = query.eq('entity_type', entityFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch user names for the logs
      const userIds = [...new Set(data?.map(log => log.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const userMap: Record<string, string> = {};
      profiles?.forEach(p => { userMap[p.user_id] = p.full_name; });

      setLogs((data || []).map(log => ({
        ...log,
        user_name: userMap[log.user_id] || 'Unknown User'
      })));
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast.error('Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLogs = logs.filter(log =>
    log.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.entity_type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedLogs = useMemo(() => {
    return sortBy(filteredLogs, tableSort.sort, (r, key) => {
      switch (key) {
        case 'created_at':
          return r.created_at;
        case 'user_name':
          return r.user_name || '';
        case 'action':
          return r.action;
        case 'entity_type':
          return r.entity_type;
        case 'details':
          return r.details ? JSON.stringify(r.details).slice(0, 200) : '';
        case 'ip_address':
          return r.ip_address || '';
        default:
          return r.created_at;
      }
    });
  }, [filteredLogs, tableSort.sort]);

  const getEntityIcon = (entityType: string) => {
    return entityIcons[entityType] || entityIcons.default;
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

  if (!authLoading && !organizationId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          <div className="shrink-0 flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                <ScrollText className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Audit <span className="text-gradient-manager">Logs</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">Tenant audit logs are only available when your account manager role is linked to an organization.</p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="pt-6 pb-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm font-sans text-muted-foreground">
                  Ask a platform admin to re-invite you or reassign you to a tenant.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading && logs.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-manager" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="shrink-0 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                <ScrollText className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Audit <span className="text-gradient-manager">Logs</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">
              Track all system activity and changes
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 rounded-xl border border-border bg-card p-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-manager/20 font-sans"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-40 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-manager/20 font-sans">
              <Filter className="h-4 w-4 mr-2" strokeWidth={1.5} />
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="view">View</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-40 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-manager/20 font-sans">
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="candidate">Candidate</SelectItem>
              <SelectItem value="job">Job</SelectItem>
              <SelectItem value="application">Application</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Logs List - Premium Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-manager" strokeWidth={1.5} />
              <h2 className="text-lg font-display font-semibold text-foreground">Activity Log</h2>
            </div>
            <div className="text-sm text-muted-foreground font-sans">
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, page * pageSize + filteredLogs.length)} of recent
            </div>
          </div>

          {!filteredLogs.length ? (
            <div className="text-center py-12 rounded-xl border border-border border-dashed bg-card">
              <div className="h-12 w-12 rounded-full bg-manager/10 border border-manager/20 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-6 w-6 text-manager opacity-60" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-display font-semibold mb-2 text-foreground">No activity logs</h3>
              <p className="text-muted-foreground font-sans">System activity will appear here.</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden border border-border bg-card shadow-sm relative z-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-manager/5">
                    <TableRow className="hover:bg-transparent border-b border-manager/10">
                      <SortableTableHead label="Timestamp" sortKey="created_at" sort={tableSort.sort} onToggle={tableSort.toggle} className="pl-6" />
                      <SortableTableHead label="User" sortKey="user_name" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Action" sortKey="action" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Entity" sortKey="entity_type" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Details" sortKey="details" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="IP" sortKey="ip_address" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLogs.map((log) => {
                      const EntityIcon = getEntityIcon(log.entity_type);
                      return (
                        <TableRow key={log.id} className="hover:bg-manager/5 border-b border-border last:border-0 transition-colors group">
                          <TableCell className="pl-6 font-mono text-xs text-muted-foreground whitespace-nowrap font-sans">
                            {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-manager/10 flex items-center justify-center">
                                <User className="h-3 w-3 text-manager" strokeWidth={1.5} />
                              </div>
                              <span className="font-sans font-medium text-sm">{log.user_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getActionColor(log.action)} className="text-[10px] px-2 py-0.5 min-w-[60px] justify-center">
                              {formatAction(log.action)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-foreground/80 font-sans">
                              <EntityIcon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                              <span className="capitalize">{log.entity_type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {log.details ? (
                              <code className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded inline-block max-w-full truncate font-mono text-muted-foreground font-sans" title={JSON.stringify(log.details)}>
                                {JSON.stringify(log.details)}
                              </code>
                            ) : <span className="text-muted-foreground font-sans">-</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono font-sans">
                            {log.ip_address || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground font-sans">
              {/* Pagination info above */}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg border border-manager/20 bg-manager/5 hover:bg-manager/10 text-manager font-sans font-medium"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" strokeWidth={1.5} />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg border border-manager/20 bg-manager/5 hover:bg-manager/10 text-manager font-sans font-medium"
                onClick={() => setPage(p => p + 1)}
                disabled={filteredLogs.length < pageSize}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>
      </div>
    </DashboardLayout>
  );
}
