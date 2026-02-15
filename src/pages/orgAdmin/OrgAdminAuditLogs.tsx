import { useMemo, useState, useEffect } from 'react';
import { OrgAdminLayout } from '@/components/layouts/OrgAdminLayout';
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
import { AuditLogDetailViewer, getAuditLogDescription } from '@/components/audit/AuditLogDetailViewer';

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

export default function OrgAdminAuditLogs() {
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
    if (lowerAction.includes('create') || lowerAction.includes('add') || lowerAction.includes('insert')) return 'default';
    if (lowerAction.includes('update') || lowerAction.includes('edit')) return 'secondary';
    return 'outline';
  };

  if (!authLoading && !organizationId) {
    return (
      <OrgAdminLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          <div className="shrink-0 flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-org/10 text-org border border-org/20">
                <ScrollText className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Audit <span className="text-gradient-premium">Logs</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">Tenant audit logs are only available when your org admin role is linked to an organization.</p>
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
      </OrgAdminLayout>
    );
  }

  if (isLoading && logs.length === 0) {
    return (
      <OrgAdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-org" strokeWidth={1.5} />
        </div>
      </OrgAdminLayout>
    );
  }

  return (
    <OrgAdminLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="shrink-0 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-org/10 text-org border border-org/20">
                <ScrollText className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Audit <span className="text-gradient-premium">Logs</span>
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
              className="pl-10 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-org/20 font-sans"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-40 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-org/20 font-sans">
              <Filter className="h-4 w-4 mr-2" strokeWidth={1.5} />
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="insert">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="grant">Grant Role</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-40 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-org/20 font-sans">
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="candidate_profiles">Candidates</SelectItem>
              <SelectItem value="jobs">Jobs</SelectItem>
              <SelectItem value="clients">Clients</SelectItem>
              <SelectItem value="applications">Applications</SelectItem>
              <SelectItem value="user_roles">User Roles</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Time" sortKey="created_at" sort={tableSort.sort} onToggle={tableSort.toggle} />
                  <SortableTableHead label="User" sortKey="user_name" sort={tableSort.sort} onToggle={tableSort.toggle} />
                  <SortableTableHead label="Action" sortKey="action" sort={tableSort.sort} onToggle={tableSort.toggle} />
                  <SortableTableHead label="Entity" sortKey="entity_type" sort={tableSort.sort} onToggle={tableSort.toggle} />
                  <TableHead>Details</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center py-8">
                        <Clock className="h-12 w-12 text-muted-foreground/30 mb-4" strokeWidth={1.5} />
                        <p className="text-muted-foreground font-sans">No audit logs found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedLogs.map((log) => {
                    const EntityIcon = getEntityIcon(log.entity_type);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-org/10 flex items-center justify-center shrink-0">
                              <User className="h-3 w-3 text-org" strokeWidth={1.5} />
                            </div>
                            <span className="truncate text-sm font-medium">{log.user_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionColor(log.action)} className="text-[10px] px-2 py-0.5 min-w-[60px] justify-center">
                            {formatAction(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <EntityIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                            <span className="text-sm text-muted-foreground">
                              {log.entity_type}{log.entity_id ? `:${String(log.entity_id).slice(0, 8)}…` : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <span className="text-sm text-muted-foreground flex-1 whitespace-normal break-words">
                              {getAuditLogDescription(log)}
                            </span>
                            {log.details && <AuditLogDetailViewer log={log} />}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono font-sans">
                          {log.ip_address || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground font-sans">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, page * pageSize + sortedLogs.length)} of {page * pageSize + sortedLogs.length}+ logs
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0 || isLoading}
              className="h-9"
            >
              <ChevronLeft className="h-4 w-4 mr-1" strokeWidth={1.5} />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={sortedLogs.length < pageSize || isLoading}
              className="h-9"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
          </div>
        </div>
      </div>
    </OrgAdminLayout>
  );
}
