import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Shield, 
  Users, 
  Building2, 
  Briefcase, 
  Search,
  CheckCircle,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';

interface UserWithRoles {
  user_id: string;
  email: string;
  full_name: string;
  created_at: string;
  roles: string[];
  tenant_label?: string;
}

interface PlatformStats {
  totalUsers: number;
  totalOrganizations: number;
  totalJobs: number;
  totalApplications: number;
}

interface AuditLogRow {
  id: string;
  created_at: string;
  organization_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip_address: string | null;
  details: unknown;
  user_name?: string;
  org_name?: string;
}

interface OrgAdminInviteRow {
  id: string;
  created_at: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  status: string;
  expires_at: string;
  invite_token: string;
  org_name?: string;
}

interface TenantRow {
  organization_id: string;
  organization_name: string;
  created_at?: string;
  org_admin_users: Array<{ user_id: string; email: string; full_name: string }>;
  pending_org_admin_invites: Array<OrgAdminInviteRow>;
}

export default function SuperAdminDashboard() {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [stats, setStats] = useState<PlatformStats>({
    totalUsers: 0,
    totalOrganizations: 0,
    totalJobs: 0,
    totalApplications: 0
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Global audit logs (read-only)
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditSearchDebounced, setAuditSearchDebounced] = useState('');

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);

  // Invite / Re-invite Org Admin for existing tenant
  const [tenantInviteDialogOpen, setTenantInviteDialogOpen] = useState(false);
  const [tenantInviteTarget, setTenantInviteTarget] = useState<TenantRow | null>(null);
  const [tenantInviteEmail, setTenantInviteEmail] = useState('');
  const [tenantInviteFullName, setTenantInviteFullName] = useState('');
  const [tenantInviteSubmitting, setTenantInviteSubmitting] = useState(false);

  // Tenant creation (Org + Org Admin invite)
  const [tenantOrgName, setTenantOrgName] = useState('');
  const [tenantAdminName, setTenantAdminName] = useState('');
  const [tenantAdminEmail, setTenantAdminEmail] = useState('');
  const [tenantCreateLoading, setTenantCreateLoading] = useState(false);
  const [tenantInviteUrl, setTenantInviteUrl] = useState<string | null>(null);

  // Revoke org admin dialog state
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [userToRevoke, setUserToRevoke] = useState<UserWithRoles | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchAuditLogs();
    fetchTenants();
  }, []);

  // Debounce audit search to avoid hammering PostgREST
  useEffect(() => {
    const t = setTimeout(() => setAuditSearchDebounced(auditSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [auditSearch]);

  // When search changes, reset pagination + reload
  useEffect(() => {
    // Reset to default behavior when clearing search
    setAuditExpanded(false);
    setAuditCursor(null);
    fetchAuditLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditSearchDebounced]);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      // Fetch platform stats
      const [profilesRes, orgsRes, jobsRes, appsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
        supabase.from('jobs').select('id', { count: 'exact', head: true }),
        supabase.from('applications').select('id', { count: 'exact', head: true })
      ]);

      setStats({
        totalUsers: profilesRes.count || 0,
        totalOrganizations: orgsRes.count || 0,
        totalJobs: jobsRes.count || 0,
        totalApplications: appsRes.count || 0
      });

      // Fetch users with their roles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, email, full_name, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (profilesError) throw profilesError;

      // Fetch roles for all users
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role, organization_id');

      if (rolesError) throw rolesError;

      const roleRows = (rolesData ?? []) as Array<{ user_id: string; role: string; organization_id: string | null }>;
      const orgIdsFromRoles = [
        ...new Set(roleRows.map((r) => r.organization_id).filter(Boolean) as string[]),
      ];

      const { data: orgsByRoleOrg } = orgIdsFromRoles.length
        ? await supabase.from('organizations').select('id, name').in('id', orgIdsFromRoles)
        : { data: [] as Array<{ id: string; name: string }> };

      const orgNameById: Record<string, string> = {};
      (orgsByRoleOrg ?? []).forEach((o: any) => {
        orgNameById[o.id] = o.name;
      });

      // For candidates, org membership may be tracked via candidate_profiles.organization_id (not user_roles)
      const userIds = (profilesData || []).map((p) => p.user_id);
      const { data: candidateOrgLinks } = userIds.length
        ? await supabase
            .from('candidate_profiles')
            .select('user_id, organization_id')
            .in('user_id', userIds)
        : { data: [] as Array<{ user_id: string; organization_id: string | null }> };

      const candidateOrgByUserId: Record<string, string> = {};
      const orgIdsFromCandidates = [
        ...new Set((candidateOrgLinks ?? []).map((c: any) => c.organization_id).filter(Boolean) as string[]),
      ].filter((id) => !orgNameById[id]);

      if (orgIdsFromCandidates.length) {
        const { data: orgsByCandidateOrg } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', orgIdsFromCandidates);
        (orgsByCandidateOrg ?? []).forEach((o: any) => {
          orgNameById[o.id] = o.name;
        });
      }

      (candidateOrgLinks ?? []).forEach((c: any) => {
        if (c.user_id && c.organization_id) candidateOrgByUserId[c.user_id] = c.organization_id;
      });

      // Combine data
      const usersWithRoles: UserWithRoles[] = (profilesData || []).map(profile => {
        const userRoleRows = roleRows.filter((r) => r.user_id === profile.user_id);
        const roles = userRoleRows.map((r) => r.role);

        const isPlatform = roles.includes('super_admin');

        // Prefer org from user_roles (staff accounts), else candidate_profiles org link, else Public
        const roleOrgId =
          userRoleRows.find((r) => !!r.organization_id)?.organization_id ||
          candidateOrgByUserId[profile.user_id] ||
          null;

        const tenant_label = isPlatform
          ? 'Platform'
          : roleOrgId
            ? (orgNameById[roleOrgId] || roleOrgId)
            : 'Public';

        return ({
          user_id: profile.user_id,
          email: profile.email,
          full_name: profile.full_name,
          created_at: profile.created_at,
          roles,
          tenant_label,
        });
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const auditCutoffIso = useMemo(
    () => new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    [],
  );

  const buildAuditSearchOr = (q: string) => {
    const pattern = `%${q}%`;
    // Note: this queries the *entire* audit log history when search is non-empty.
    return [
      `action.ilike.${pattern}`,
      `entity_type.ilike.${pattern}`,
      `org_name.ilike.${pattern}`,
      `user_full_name.ilike.${pattern}`,
      `user_email.ilike.${pattern}`,
      `ip_address.ilike.${pattern}`,
      `details_text.ilike.${pattern}`,
    ].join(',');
  };

  const fetchAuditLogs = async (reset: boolean = false) => {
    const PAGE_SIZE = 100;
    setAuditLoading(true);
    try {
      const q = auditSearchDebounced;

      // Use enriched view so we can search across org/user fields.
      const sb: any = supabase as any;
      let query = sb
        .from('audit_logs_enriched')
        .select('id, created_at, organization_id, user_id, action, entity_type, entity_id, ip_address, details, org_name, user_full_name, user_email')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (!q) {
        // Default mode: show only last 4 hours unless the user has clicked "Load more".
        if (!auditExpanded) {
          query = query.gte('created_at', auditCutoffIso);
        }
      } else {
        query = query.or(buildAuditSearchOr(q));
      }

      const cursor = reset ? null : auditCursor;
      if (cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as any[];
      const normalized: AuditLogRow[] = rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        organization_id: r.organization_id,
        user_id: r.user_id,
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        ip_address: r.ip_address,
        details: r.details,
        org_name: r.org_name || undefined,
        user_name: r.user_full_name || r.user_email || undefined,
      }));

      const nextLogs = reset ? normalized : [...auditLogs, ...normalized];
      setAuditLogs(nextLogs);

      const last = normalized[normalized.length - 1];
      setAuditCursor(last?.created_at || null);
      setAuditHasMore(normalized.length === PAGE_SIZE);
    } catch (err: any) {
      console.error('Audit log fetch error:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const fetchTenants = async () => {
    setTenantsLoading(true);
    try {
      const { data: orgs, error: orgErr } = await supabase
        .from('organizations')
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (orgErr) throw orgErr;

      const orgIds = (orgs ?? []).map((o: any) => o.id) as string[];

      // Pending org admin invites per org (show invite link until accepted)
      const { data: invites, error: invitesErr } = orgIds.length
        ? await supabase
            .from('org_admin_invites')
            .select('id, created_at, organization_id, email, full_name, status, expires_at, invite_token')
            .in('organization_id', orgIds)
            .order('created_at', { ascending: false })
        : { data: [] as any[], error: null };

      if (invitesErr) throw invitesErr;

      const pendingInvites = (invites ?? []).filter((i: any) => i.status === 'pending') as any[];

      // Org admin users (actual accepted accounts)
      const { data: orgAdminRoles, error: rolesErr } = orgIds.length
        ? await supabase
            .from('user_roles')
            .select('user_id, organization_id, role')
            .in('organization_id', orgIds)
            .eq('role', 'org_admin')
        : { data: [] as any[], error: null };

      if (rolesErr) throw rolesErr;

      const adminUserIds = [...new Set((orgAdminRoles ?? []).map((r: any) => r.user_id).filter(Boolean))] as string[];
      const { data: adminProfiles, error: profilesErr } = adminUserIds.length
        ? await supabase
            .from('profiles')
            .select('user_id, email, full_name')
            .in('user_id', adminUserIds)
        : { data: [] as any[], error: null };

      if (profilesErr) throw profilesErr;

      const profileMap: Record<string, { email: string; full_name: string }> = {};
      (adminProfiles ?? []).forEach((p: any) => {
        profileMap[p.user_id] = { email: p.email, full_name: p.full_name };
      });

      const tenantsRows: TenantRow[] = (orgs ?? []).map((o: any) => {
        const org_admin_users = (orgAdminRoles ?? [])
          .filter((r: any) => r.organization_id === o.id)
          .map((r: any) => ({
            user_id: r.user_id,
            email: profileMap[r.user_id]?.email || '',
            full_name: profileMap[r.user_id]?.full_name || 'Org Admin',
          }))
          .filter((u: any) => u.user_id);

        const pending_org_admin_invites = pendingInvites
          .filter((i: any) => i.organization_id === o.id)
          .map((i: any) => ({
            ...i,
            org_name: o.name,
          })) as OrgAdminInviteRow[];

        return {
          organization_id: o.id,
          organization_name: o.name,
          created_at: o.created_at,
          org_admin_users,
          pending_org_admin_invites,
        };
      });

      setTenants(tenantsRows);
    } catch (e: any) {
      console.error('Tenant fetch error:', e);
    } finally {
      setTenantsLoading(false);
    }
  };

  const openRevokeDialog = (user: UserWithRoles) => {
    if (!user.roles.includes('org_admin')) return;
    setUserToRevoke(user);
    setRevokeDialogOpen(true);
  };

  const handleRevokeOrgAdmin = async () => {
    if (!userToRevoke) return;
    setIsRevoking(true);
    try {
      const { error } = await supabase.rpc('revoke_org_admin' as any, { _user_id: userToRevoke.user_id } as any);
      if (error) throw error;
      toast.success(`Revoked Org Admin access for ${userToRevoke.email}`);
      setRevokeDialogOpen(false);
      setUserToRevoke(null);
      fetchDashboardData();
    } catch (err: any) {
      console.error('Revoke org admin error:', err);
      toast.error(err?.message || 'Failed to revoke org admin');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleCreateTenantAndInviteOrgAdmin = async () => {
    const organizationName = tenantOrgName.trim();
    const email = tenantAdminEmail.trim();
    const fullName = tenantAdminName.trim();
    if (!organizationName || !email || !fullName) return;

    setTenantCreateLoading(true);
    setTenantInviteUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-org-admin-invite', {
        body: { organizationName, email, fullName },
      });
      if (error) throw error;

      const inviteUrl = data?.inviteUrl as string | undefined;
      if (!inviteUrl) throw new Error('Invite created, but invite URL was not returned.');

      setTenantInviteUrl(inviteUrl);
      toast.success('Tenant created and org admin invite generated');
      setTenantOrgName('');
      setTenantAdminName('');
      setTenantAdminEmail('');

      // Refresh counts
      fetchDashboardData();
    } catch (err: any) {
      console.error('Create tenant error:', err);
      toast.error(err?.message || 'Failed to create tenant');
    } finally {
      setTenantCreateLoading(false);
    }
  };

  const openTenantInviteDialog = (tenant: TenantRow, defaults?: { email?: string; fullName?: string }) => {
    setTenantInviteTarget(tenant);
    setTenantInviteEmail(defaults?.email || '');
    setTenantInviteFullName(defaults?.fullName || '');
    setTenantInviteDialogOpen(true);
  };

  const handleInviteOrgAdminForExistingTenant = async () => {
    if (!tenantInviteTarget) return;
    const email = tenantInviteEmail.trim();
    const fullName = tenantInviteFullName.trim();
    if (!email || !fullName) return;

    setTenantInviteSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-org-admin-invite-existing', {
        body: {
          organizationId: tenantInviteTarget.organization_id,
          email,
          fullName,
        },
      });
      if (error) throw error;

      const inviteUrl = (data as any)?.inviteUrl as string | undefined;
      toast.success('Org Admin invite generated');
      if (inviteUrl) {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          toast.message('Invite link copied to clipboard');
        } catch {
          // ignore
        }
      }

      setTenantInviteDialogOpen(false);
      setTenantInviteTarget(null);
      setTenantInviteEmail('');
      setTenantInviteFullName('');

      // Refresh tenant state + audit logs
      fetchTenants();
      fetchAuditLogs();
      fetchDashboardData();
    } catch (e: any) {
      console.error('Invite existing org admin error:', e);
      toast.error(e?.message || 'Failed to invite org admin');
    } finally {
      setTenantInviteSubmitting(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'destructive';
      case 'account_manager': return 'default';
      case 'recruiter': return 'secondary';
      case 'candidate': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <>
      <SEOHead 
        title="Super Admin Dashboard" 
        description="Platform administration and user management"
      />
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10">
                <Shield className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Super Admin</h1>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalUsers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Organizations</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalOrganizations}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Jobs Posted</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalJobs}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Applications</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalApplications}</div>
              </CardContent>
            </Card>
          </div>

          {/* Tenant provisioning + Read-only User Management */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  View all platform users (read-only). You can manage Org Admins only.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 mb-6">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-sm font-medium text-foreground">Create tenant + invite Org Admin</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This creates an organization and generates an invite link for the customer Org Super Admin (org_admin).
                    In local dev, email sending may be skipped; you can copy the invite link below.
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Organization name</Label>
                      <Input value={tenantOrgName} onChange={(e) => setTenantOrgName(e.target.value)} placeholder="Acme Inc" />
                    </div>
                    <div className="space-y-2">
                      <Label>Org admin full name</Label>
                      <Input value={tenantAdminName} onChange={(e) => setTenantAdminName(e.target.value)} placeholder="Jane Doe" />
                    </div>
                    <div className="space-y-2">
                      <Label>Org admin email</Label>
                      <Input value={tenantAdminEmail} onChange={(e) => setTenantAdminEmail(e.target.value)} placeholder="admin@acme.com" />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      variant="default"
                      onClick={handleCreateTenantAndInviteOrgAdmin}
                      disabled={tenantCreateLoading || !tenantOrgName.trim() || !tenantAdminName.trim() || !tenantAdminEmail.trim()}
                    >
                      {tenantCreateLoading ? 'Creating…' : 'Create tenant + generate invite'}
                    </Button>

                    {tenantInviteUrl && (
                      <div className="flex-1 rounded-md border bg-card p-3">
                        <p className="text-xs text-muted-foreground">Invite link</p>
                        <p className="mt-1 break-all text-sm font-medium">{tenantInviteUrl}</p>
                        <div className="mt-2 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              await navigator.clipboard.writeText(tenantInviteUrl);
                              toast.success('Copied invite link');
                            }}
                          >
                            Copy
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => window.open(tenantInviteUrl, '_blank')}>
                            Open
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[160px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          Loading users...
                        </TableCell>
                      </TableRow>
                    ) : filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.user_id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{user.full_name}</p>
                              <p className="text-sm text-muted-foreground">{user.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {user.tenant_label || '—'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {user.roles.map((role) => (
                                <Badge 
                                  key={role} 
                                  variant={getRoleBadgeVariant(role)}
                                  className="text-xs"
                                >
                                  {role.replace('_', ' ')}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {user.roles.includes('org_admin') ? (
                              <Button variant="destructive" size="sm" onClick={() => openRevokeDialog(user)}>
                                Revoke Org Admin
                              </Button>
                            ) : (
                              <span className="text-sm text-muted-foreground">Read-only</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Tenants (orgs) + Org Admin status */}
          <Card className="mt-8">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tenants</CardTitle>
                <CardDescription>
                  Each tenant is an organization. Pending Org Admin invites show here until accepted.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchTenants} disabled={tenantsLoading}>
                {tenantsLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Org Admin</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[340px]">Invite / Reactivate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantsLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          Loading tenants...
                        </TableCell>
                      </TableRow>
                    ) : tenants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No tenants found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      tenants.map((t) => {
                        const pending = t.pending_org_admin_invites[0]; // show newest pending invite
                        const inviteUrl = pending ? `${window.location.origin}/auth?invite=${pending.invite_token}` : null;
                        const hasAdmin = t.org_admin_users.length > 0;
                        const status = hasAdmin ? 'Active' : pending ? 'Invited' : 'No org admin';

                        return (
                          <TableRow key={t.organization_id}>
                            <TableCell>
                              <div className="space-y-0.5">
                                <p className="font-medium">{t.organization_name}</p>
                                <p className="text-xs text-muted-foreground">{t.organization_id}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {hasAdmin ? (
                                <div className="space-y-1">
                                  {t.org_admin_users.map((u) => (
                                    <div key={u.user_id}>
                                      <p className="font-medium">{u.full_name}</p>
                                      <p className="text-sm text-muted-foreground">{u.email}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : pending ? (
                                <div>
                                  <p className="font-medium">{pending.full_name || pending.email}</p>
                                  <p className="text-sm text-muted-foreground">{pending.email}</p>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {inviteUrl ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={async () => {
                                        await navigator.clipboard.writeText(inviteUrl);
                                        toast.success('Copied invite link');
                                      }}
                                    >
                                      Copy
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => window.open(inviteUrl, '_blank')}>
                                      Open
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        openTenantInviteDialog(t, {
                                          email: pending?.email,
                                          fullName: pending?.full_name || '',
                                        })
                                      }
                                    >
                                      Re-invite
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openTenantInviteDialog(t)}
                                  >
                                    {hasAdmin ? 'Invite another org admin' : 'Invite org admin'}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Invite / Re-invite Org Admin dialog */}
          <Dialog open={tenantInviteDialogOpen} onOpenChange={setTenantInviteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Org Admin</DialogTitle>
                <DialogDescription>
                  Generate an invite link for an existing tenant. Any previous pending invites for this tenant will be expired.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Organization</Label>
                  <Input value={tenantInviteTarget?.organization_name || ''} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Org admin full name</Label>
                  <Input value={tenantInviteFullName} onChange={(e) => setTenantInviteFullName(e.target.value)} placeholder="Uma Mokkarala" />
                </div>
                <div className="space-y-2">
                  <Label>Org admin email</Label>
                  <Input value={tenantInviteEmail} onChange={(e) => setTenantInviteEmail(e.target.value)} placeholder="admin@acme.com" />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setTenantInviteDialogOpen(false)} disabled={tenantInviteSubmitting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInviteOrgAdminForExistingTenant}
                  disabled={tenantInviteSubmitting || !tenantInviteEmail.trim() || !tenantInviteFullName.trim() || !tenantInviteTarget}
                >
                  {tenantInviteSubmitting ? 'Generating…' : 'Generate invite'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Global Audit Logs (read-only) */}
          <Card className="mt-8">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Audit Logs (platform-wide)</CardTitle>
                <CardDescription>
                  Default view shows the last 4 hours. Use search to query the full history, or load older logs in pages of 100.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Search audit logs…"
                  className="w-[260px]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAuditCursor(null);
                    setAuditExpanded(false);
                    fetchAuditLogs(true);
                  }}
                  disabled={auditLoading}
                >
                  {auditLoading ? 'Refreshing…' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Org</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          Loading audit logs...
                        </TableCell>
                      </TableRow>
                    ) : auditLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No audit logs found (or access not granted yet).
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-medium">{log.org_name || 'Unknown org'}</p>
                              <p className="text-xs text-muted-foreground">{log.organization_id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-medium">{log.user_name || 'Unknown user'}</p>
                              <p className="text-xs text-muted-foreground">{log.user_id}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {log.entity_type}{log.entity_id ? `:${String(log.entity_id).slice(0, 8)}…` : ''}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {log.ip_address || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {!auditSearchDebounced && !auditExpanded ? (
                    <span>Showing last 4 hours</span>
                  ) : auditSearchDebounced ? (
                    <span>Search mode (full history)</span>
                  ) : (
                    <span>Showing full history (paged)</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!auditSearchDebounced && !auditExpanded && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAuditExpanded(true);
                        // load older than current cursor (older than the last row we have)
                        fetchAuditLogs(false);
                      }}
                      disabled={auditLoading || !auditHasMore}
                    >
                      Load older logs (100)
                    </Button>
                  )}
                  {(auditSearchDebounced || auditExpanded) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchAuditLogs(false)}
                      disabled={auditLoading || !auditHasMore}
                    >
                      Load more (100)
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </main>

        {/* Revoke Org Admin Confirmation Dialog */}
        <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke Org Admin Access</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove Org Admin privileges for <strong>{userToRevoke?.email}</strong>.
                They will lose access to the org admin console.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevokeOrgAdmin}
                disabled={isRevoking}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isRevoking ? 'Revoking…' : 'Revoke'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
