import { useMemo, useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, Search, Filter, Clock, User, FileText, 
  Briefcase, Users, Settings, AlertTriangle, ChevronLeft, ChevronRight 
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
        <Card>
          <CardHeader>
            <CardTitle>Organization not assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Tenant audit logs are only available when your account manager role is linked to an organization.
              Ask a platform admin to re-invite you or reassign you to a tenant.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  if (isLoading && logs.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Audit Logs</h1>
          <p className="mt-1">Track all system activity and changes</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
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
            <SelectTrigger className="w-40">
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

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Activity Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 mx-automb-4" />
                <h3 className="text-lg font-semibold mb-2">No activity logs</h3>
                <p className="">System activity will appear here</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="Timestamp" sortKey="created_at" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="User" sortKey="user_name" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Action" sortKey="action" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Entity" sortKey="entity_type" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Details" sortKey="details" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="IP Address" sortKey="ip_address" sort={tableSort.sort} onToggle={tableSort.toggle} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLogs.map((log) => {
                      const EntityIcon = getEntityIcon(log.entity_type);
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              {log.user_name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getActionColor(log.action)}>
                              {formatAction(log.action)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <EntityIcon className="h-4 w-4" />
                              <span className="capitalize">{log.entity_type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            {log.details ? (
                              <code className="text-xs bg-muted px-2 py-1 rounded truncate block">
                                {JSON.stringify(log.details).slice(0, 50)}...
                              </code>
                            ) : (
                              <span className="">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.ip_address || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm">
                    Showing {page * pageSize + 1} - {page * pageSize + filteredLogs.length} entries
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={filteredLogs.length < pageSize}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
