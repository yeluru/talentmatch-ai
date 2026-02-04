import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/ui/stat-card';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';
import { Toolbar } from '@/components/ui/toolbar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
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
  Loader2,
  Mail,
  Plus,
  UserCheck,
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { SuperAdminLayout } from '@/components/layouts/SuperAdminLayout';
import { sortBy } from '@/lib/sort';
import { useTableSort } from '@/hooks/useTableSort';

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

  const usersTableSort = useTableSort<'full_name' | 'tenant_label' | 'roles' | 'created_at'>({
    key: 'full_name',
    dir: 'asc',
  });

  // Global audit logs (read-only)
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditSearchDebounced, setAuditSearchDebounced] = useState('');

  const auditTableSort = useTableSort<'created_at' | 'org_name' | 'user_name' | 'action' | 'entity_type' | 'ip_address'>({
    key: 'created_at',
    dir: 'desc',
  });

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);

  const tenantsTableSort = useTableSort<'organization_name' | 'org_admin' | 'status'>({
    key: 'organization_name',
    dir: 'asc',
  });

  // Invite / Re-invite Org Admin for existing tenant
  const [tenantInviteDialogOpen, setTenantInviteDialogOpen] = useState(false);
  const [tenantInviteTarget, setTenantInviteTarget] = useState<TenantRow | null>(null);
  const [tenantInviteEmail, setTenantInviteEmail] = useState('');
  const [tenantInviteFullName, setTenantInviteFullName] = useState('');
  const [tenantInviteSubmitting, setTenantInviteSubmitting] = useState(false);

  // Tenant creation (Org + Org Admin invite) — in dialog like Invite Recruiter
  const [createTenantDialogOpen, setCreateTenantDialogOpen] = useState(false);
  const [tenantOrgName, setTenantOrgName] = useState('');
  const [tenantAdminName, setTenantAdminName] = useState('');
  const [tenantAdminEmail, setTenantAdminEmail] = useState('');
  const [tenantCreateLoading, setTenantCreateLoading] = useState(false);
  const [tenantInviteUrl, setTenantInviteUrl] = useState<string | null>(null);

  // Revoke org admin dialog state
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [userToRevoke, setUserToRevoke] = useState<UserWithRoles | null>(null);

  // Candidate support tools (link/unlink/suspend/marketplace opt-in)
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidateLookupLoading, setCandidateLookupLoading] = useState(false);
  const [candidateSupport, setCandidateSupport] = useState<{
    user_id: string;
    email: string;
    full_name: string | null;
    is_suspended: boolean;
    candidate_profile_id: string | null;
    marketplace_opt_in: boolean | null;
    org_links: Array<{ organization_id: string; organization_name: string | null; status: string; link_type: string | null }>;
  } | null>(null);
  const [candidateOrgId, setCandidateOrgId] = useState('');
  const [candidateReason, setCandidateReason] = useState('');
  const [candidateActionLoading, setCandidateActionLoading] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get('tab') || 'overview') as 'overview' | 'tenants' | 'users' | 'candidates' | 'audit';
  const [activeTab, setActiveTab] = useState<'overview' | 'tenants' | 'users' | 'candidates' | 'audit'>(tabFromUrl);
  const [isRevoking, setIsRevoking] = useState(false);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

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
        ? await (supabase as any)
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
      // Refresh session so we send a valid user JWT (gateway returns 401 if missing or expired)
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !session?.access_token) {
        toast.error('Your session expired. Please sign in again.');
        return;
      }
      const { data, error } = await supabase.functions.invoke('send-org-admin-invite', {
        body: { organizationName, email, fullName },
      });
      if (error) {
        let message = (data as { error?: string })?.error ?? error.message ?? 'Failed to create tenant';
        try {
          const ctx = (error as { context?: { body?: string } })?.context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) message = parsed.error;
          }
        } catch {
          // ignore
        }
        console.error('Create tenant error:', error, data);
        toast.error(message);
        return;
      }

      const inviteUrl = data?.inviteUrl as string | undefined;
      if (!inviteUrl) throw new Error('Invite created, but invite URL was not returned.');

      setTenantInviteUrl(inviteUrl);
      toast.success('Tenant created and org admin invite generated');
      setTenantOrgName('');
      setTenantAdminName('');
      setTenantAdminEmail('');
      fetchTenants();
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
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !session?.access_token) {
        toast.error('Your session expired. Please sign in again.');
        return;
      }
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

  const sortedUsers = useMemo(() => {
    return sortBy(filteredUsers, usersTableSort.sort, (u, key) => {
      switch (key) {
        case 'full_name':
          return u.full_name;
        case 'tenant_label':
          return u.tenant_label || '';
        case 'roles':
          return (u.roles || []).join(', ');
        case 'created_at':
          return u.created_at;
        default:
          return u.full_name;
      }
    });
  }, [filteredUsers, usersTableSort.sort]);

  const sortedTenants = useMemo(() => {
    return sortBy(tenants, tenantsTableSort.sort, (t, key) => {
      const pending = t.pending_org_admin_invites[0];
      const hasAdmin = t.org_admin_users.length > 0;
      const status = hasAdmin ? 'Active' : pending ? 'Invited' : 'No org admin';
      const orgAdmin = hasAdmin
        ? `${t.org_admin_users[0]?.full_name || ''} ${t.org_admin_users[0]?.email || ''}`.trim()
        : pending
          ? `${pending.full_name || ''} ${pending.email || ''}`.trim()
          : '';

      switch (key) {
        case 'organization_name':
          return t.organization_name;
        case 'org_admin':
          return orgAdmin;
        case 'status':
          return status;
        default:
          return t.organization_name;
      }
    });
  }, [tenants, tenantsTableSort.sort]);

  const sortedAuditLogs = useMemo(() => {
    return sortBy(auditLogs, auditTableSort.sort, (r, key) => {
      switch (key) {
        case 'created_at':
          return r.created_at;
        case 'org_name':
          return r.org_name || '';
        case 'user_name':
          return r.user_name || '';
        case 'action':
          return r.action;
        case 'entity_type':
          return r.entity_type;
        case 'ip_address':
          return r.ip_address || '';
        default:
          return r.created_at;
      }
    });
  }, [auditLogs, auditTableSort.sort]);

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'destructive';
      case 'account_manager': return 'default';
      case 'recruiter': return 'secondary';
      case 'candidate': return 'outline';
      default: return 'outline';
    }
  };

  const lookupCandidateByEmail = async () => {
    const email = candidateEmail.trim().toLowerCase();
    if (!email) return;
    setCandidateLookupLoading(true);
    try {
      const { data: prof, error: profErr } = await (supabase as any)
        .from('profiles')
        .select('user_id, email, full_name, is_suspended')
        .eq('email', email)
        .maybeSingle();
      if (profErr) throw profErr;
      if (!prof?.user_id) {
        setCandidateSupport(null);
        toast.error('No user found for that email');
        return;
      }

      const { data: cp } = await (supabase as any)
        .from('candidate_profiles')
        .select('id, marketplace_opt_in')
        .eq('user_id', prof.user_id)
        .maybeSingle();

      const cpId = cp?.id || null;

      const { data: links } = cpId
        ? await (supabase as any)
          .from('candidate_org_links')
          .select('organization_id, status, link_type, organizations(name)')
          .eq('candidate_id', cpId)
          .order('created_at', { ascending: false })
        : { data: [] as any[] };

      setCandidateSupport({
        user_id: prof.user_id,
        email: prof.email,
        full_name: prof.full_name || null,
        is_suspended: !!prof.is_suspended,
        candidate_profile_id: cpId,
        marketplace_opt_in: typeof cp?.marketplace_opt_in === 'boolean' ? cp.marketplace_opt_in : null,
        org_links: (links || []).map((l: any) => ({
          organization_id: l.organization_id,
          organization_name: l.organizations?.name || null,
          status: l.status,
          link_type: l.link_type || null,
        })),
      });

      // UX: if the lookup started from the Overview tab, jump to the full Candidate support tools.
      // (Keeps the overview card lightweight but still “one-click” to action.)
      setTab('candidates');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to lookup candidate');
    } finally {
      setCandidateLookupLoading(false);
    }
  };

  const runCandidateAction = async (fn: () => Promise<void>) => {
    setCandidateActionLoading(true);
    try {
      await fn();
      await lookupCandidateByEmail();
    } finally {
      setCandidateActionLoading(false);
    }
  };

  const tabTitles: Record<typeof activeTab, string> = {
    overview: 'Overview',
    tenants: 'Tenants',
    users: 'Users',
    candidates: 'Candidates',
    audit: 'Audit logs',
  };

  const setTab = (v: typeof activeTab) => {
    setActiveTab(v);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (v === 'overview') p.delete('tab');
      else p.set('tab', v);
      return p;
    });
  };

  return (
    <>
      <SEOHead
        title="Super Admin Dashboard"
        description="Platform administration and user management"
      />
      <SuperAdminLayout title={tabTitles[activeTab]} subtitle={profile?.email}>
        <PageShell>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {tabTitles[activeTab]}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeTab === 'overview' && 'Create tenants, manage Org Admin lifecycle, and audit activity.'}
                {activeTab === 'tenants' && 'Each tenant is an organization. Invite Org Admins and manage pending invites.'}
                {activeTab === 'users' && 'Platform-wide user directory.'}
                {activeTab === 'candidates' && 'Link/unlink candidates to tenants and manage discoverability.'}
                {activeTab === 'audit' && 'Platform audit activity.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => {
                fetchDashboardData();
                fetchTenants();
                fetchAuditLogs(true);
              }}
              disabled={isLoading || tenantsLoading || auditLoading}
            >
              {isLoading || tenantsLoading || auditLoading ? 'Refreshing…' : 'Refresh all'}
            </Button>
          </div>

            <div className="mt-6 space-y-6">
              {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div
                    onClick={() => setTab('users')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setTab('users')}
                    className="focus:outline-none focus:ring-2 focus:ring-primary rounded-xl"
                  >
                    <StatCard title="Total users" value={stats.totalUsers} icon={Users} className="cursor-pointer" />
                  </div>
                  <div
                    onClick={() => setTab('tenants')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setTab('tenants')}
                    className="focus:outline-none focus:ring-2 focus:ring-primary rounded-xl"
                  >
                    <StatCard title="Organizations" value={stats.totalOrganizations} icon={Building2} className="cursor-pointer" />
                  </div>
                  <StatCard title="Jobs posted" value={stats.totalJobs} icon={Briefcase} />
                  <StatCard title="Applications" value={stats.totalApplications} icon={CheckCircle} />
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="glass-panel p-6 rounded-xl hover-card-premium">
                    <div className="mb-6 flex flex-row items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold flex items-center gap-2">
                          <Building2 className="h-5 w-5 text-primary" />
                          Tenants
                        </h3>
                        <p className="text-sm text-muted-foreground">Create an organization and generate an Org Admin invite link.</p>
                      </div>
                      <Button
                        className="glass-panel text-primary-foreground hover:bg-primary/90"
                        onClick={() => setCreateTenantDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create tenant
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">Go to the <button type="button" className="text-primary underline underline-offset-2" onClick={() => setTab('tenants')}>Tenants</button> tab to manage organizations and invite Org Admins.</p>
                  </div>

                  <div className="glass-panel p-6 rounded-xl hover-card-premium">
                    <div className="mb-6">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        Candidate support
                      </h3>
                      <p className="text-sm text-muted-foreground">Lookup by email; link/unlink org; toggle discoverable; suspend.</p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="flex-1 space-y-2">
                          <Label>Candidate email</Label>
                          <Input
                            value={candidateEmail}
                            onChange={(e) => setCandidateEmail(e.target.value)}
                            placeholder="candidate@example.com"
                            className="bg-transparent border-white/10"
                          />
                        </div>
                        <Button
                          variant="outline"
                          onClick={lookupCandidateByEmail}
                          disabled={candidateLookupLoading || !candidateEmail.trim()}
                        >
                          {candidateLookupLoading ? 'Searching…' : 'Find candidate'}
                        </Button>
                      </div>
                      {candidateSupport ? (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{candidateSupport.full_name || '—'}</span>
                            <Badge variant="outline" className="text-xs border-white/10 bg-white/5">{candidateSupport.email}</Badge>
                            {candidateSupport.is_suspended ? (
                              <Badge variant="destructive" className="text-xs">Suspended</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">Active</Badge>
                            )}
                            {candidateSupport.marketplace_opt_in ? (
                              <Badge variant="outline" className="text-xs border-white/10 text-blue-400 bg-blue-400/10">Discoverable</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs border-white/10 text-muted-foreground">Not discoverable</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Tip: use the “Candidate support” tab for full actions (link/unlink/suspend).
                          </p>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Search for a candidate to see status and open full tools.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )}

              {activeTab === 'tenants' && (
              <div className="space-y-4">
                <div className="glass-panel rounded-xl overflow-hidden hover-card-premium">
                  <div className="p-4 sm:p-6 border-b border-white/5 bg-white/5 flex flex-wrap gap-2 justify-end">
                    <Button className="glass-panel text-primary-foreground hover:bg-primary/90" onClick={() => setCreateTenantDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create tenant
                    </Button>
                  </div>

                  <div className="p-0 overflow-x-auto">
                    <Table className="min-w-[640px]">
                      <TableHeader className="bg-white/5">
                        <TableRow className="hover:bg-white/5 border-white/5">
                          <SortableTableHead
                            label="Organization"
                            sortKey="organization_name"
                            sort={tenantsTableSort.sort}
                            onToggle={tenantsTableSort.toggle}
                          />
                          <SortableTableHead label="Org Admin" sortKey="org_admin" sort={tenantsTableSort.sort} onToggle={tenantsTableSort.toggle} />
                          <SortableTableHead label="Status" sortKey="status" sort={tenantsTableSort.sort} onToggle={tenantsTableSort.toggle} />
                          <TableHead className="w-[340px]">Invite / Reactivate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tenantsLoading ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
                              Loading tenants...
                            </TableCell>
                          </TableRow>
                        ) : tenants.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                              No tenants found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedTenants.map((t) => {
                            const pending = t.pending_org_admin_invites[0];
                            const inviteUrl = pending ? `${window.location.origin}/auth?invite=${pending.invite_token}` : null;
                            const hasAdmin = t.org_admin_users.length > 0;
                            const status = hasAdmin ? 'Active' : pending ? 'Invited' : 'No org admin';

                            return (
                              <TableRow key={t.organization_id} className="hover:bg-white/5 border-white/5 transition-colors">
                                <TableCell>
                                  <div className="space-y-0.5">
                                    <p className="font-medium text-foreground">{t.organization_name}</p>
                                    <p className="text-xs text-muted-foreground font-mono opacity-70">{t.organization_id}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {hasAdmin ? (
                                    <div className="space-y-1">
                                      {t.org_admin_users.map((u) => (
                                        <div key={u.user_id}>
                                          <p className="font-medium text-sm">{u.full_name}</p>
                                          <p className="text-xs text-muted-foreground">{u.email}</p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : pending ? (
                                    <div>
                                      <p className="font-medium text-sm">{pending.full_name || pending.email}</p>
                                      <p className="text-xs text-muted-foreground">{pending.email}</p>
                                    </div>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cn(
                                    "text-xs border-white/10",
                                    status === 'Active' && "bg-emerald-500/10 text-emerald-400",
                                    status === 'Invited' && "bg-blue-500/10 text-blue-400",
                                    status === 'No org admin' && "bg-amber-500/10 text-amber-400"
                                  )}>
                                    {status}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-2">
                                    {inviteUrl ? (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={async () => {
                                            await navigator.clipboard.writeText(inviteUrl);
                                            toast.success('Copied invite link');
                                          }}
                                        >
                                          Copy
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => window.open(inviteUrl, '_blank')}>
                                          Open
                                        </Button>
                                        <Button
                                          variant="ghost"
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
                                      <Button variant="outline" size="sm" onClick={() => openTenantInviteDialog(t)} className="bg-transparent border-white/10 hover:bg-white/10">
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
                </div>
              </div>
              )}

              {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="glass-panel rounded-xl overflow-hidden hover-card-premium">
                  <div className="p-4 sm:p-6 border-b border-white/5 bg-white/5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
                    <div className="relative w-full sm:max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-black/20 border-white/10"
                      />
                    </div>
                  </div>
                  <div className="p-0 overflow-x-auto">
                    <Table className="min-w-[640px]">
                      <TableHeader className="bg-white/5">
                        <TableRow className="hover:bg-white/5 border-white/5">
                          <SortableTableHead label="User" sortKey="full_name" sort={usersTableSort.sort} onToggle={usersTableSort.toggle} />
                          <SortableTableHead label="Tenant" sortKey="tenant_label" sort={usersTableSort.sort} onToggle={usersTableSort.toggle} />
                          <SortableTableHead label="Roles" sortKey="roles" sort={usersTableSort.sort} onToggle={usersTableSort.toggle} />
                          <SortableTableHead label="Joined" sortKey="created_at" sort={usersTableSort.sort} onToggle={usersTableSort.toggle} />
                          <TableHead className="w-[160px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isLoading ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
                              Loading users...
                            </TableCell>
                          </TableRow>
                        ) : filteredUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                              No users found
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedUsers.map((user) => (
                            <TableRow key={user.user_id} className="hover:bg-white/5 border-white/5 transition-colors">
                              <TableCell>
                                <div>
                                  <p className="font-medium text-foreground">{user.full_name}</p>
                                  <p className="text-sm text-muted-foreground">{user.email}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs border-white/10 bg-white/5">
                                  {user.tenant_label || '—'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {user.roles.map((role) => (
                                    <Badge key={role} variant={getRoleBadgeVariant(role) as any} className="text-xs border-white/10">
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
                                  <span className="text-sm text-muted-foreground italic">Read-only</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
              )}

              {activeTab === 'candidates' && (
              <div className="space-y-4">
                <div className="glass-panel rounded-xl overflow-hidden hover-card-premium">
                  <div className="p-4 sm:p-6">
                    {/* reuse existing candidate support block (moved here visually) */}
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="flex-1 space-y-2">
                          <Label>Candidate email</Label>
                          <Input
                            value={candidateEmail}
                            onChange={(e) => setCandidateEmail(e.target.value)}
                            placeholder="candidate@example.com"
                          />
                        </div>
                        <Button
                          variant="outline"
                          onClick={lookupCandidateByEmail}
                          disabled={candidateLookupLoading || !candidateEmail.trim()}
                        >
                          {candidateLookupLoading ? 'Searching…' : 'Find candidate'}
                        </Button>
                      </div>

                      {candidateSupport && (
                        <div className="mt-4 rounded-md border bg-card p-4 space-y-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{candidateSupport.full_name || '—'}</span>
                              <Badge variant="outline" className="text-xs">{candidateSupport.email}</Badge>
                              {candidateSupport.is_suspended ? (
                                <Badge variant="destructive" className="text-xs">Suspended</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Active</Badge>
                              )}
                              {candidateSupport.marketplace_opt_in ? (
                                <Badge variant="outline" className="text-xs">Discoverable</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">Not discoverable</Badge>
                              )}
                            </div>
                            <p className="text-xs">
                              user_id: <span className="font-mono">{candidateSupport.user_id}</span>
                              {candidateSupport.candidate_profile_id ? (
                                <> · candidate_id: <span className="font-mono">{candidateSupport.candidate_profile_id}</span></>
                              ) : (
                                <> · candidate profile: not created yet</>
                              )}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label>Organization ID</Label>
                              <Input value={candidateOrgId} onChange={(e) => setCandidateOrgId(e.target.value)} placeholder="org uuid" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <Label>Reason (audit)</Label>
                              <Input value={candidateReason} onChange={(e) => setCandidateReason(e.target.value)} placeholder="Why are we making this change?" />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              disabled={candidateActionLoading || !candidateOrgId.trim()}
                              onClick={() =>
                                runCandidateAction(async () => {
                                  const { error } = await (supabase as any).rpc('super_admin_link_candidate_to_org', {
                                    _candidate_user_id: candidateSupport.user_id,
                                    _organization_id: candidateOrgId.trim(),
                                    _reason: candidateReason || null,
                                  });
                                  if (error) throw error;
                                  toast.success('Candidate linked to org');
                                })
                              }
                            >
                              Link to org
                            </Button>
                            <Button
                              variant="outline"
                              disabled={candidateActionLoading || !candidateOrgId.trim()}
                              onClick={() =>
                                runCandidateAction(async () => {
                                  const { error } = await (supabase as any).rpc('super_admin_unlink_candidate_from_org', {
                                    _candidate_user_id: candidateSupport.user_id,
                                    _organization_id: candidateOrgId.trim(),
                                    _reason: candidateReason || null,
                                  });
                                  if (error) throw error;
                                  toast.success('Candidate unlinked from org');
                                })
                              }
                            >
                              Unlink from org
                            </Button>
                            <Button
                              variant={candidateSupport.is_suspended ? 'outline' : 'destructive'}
                              disabled={candidateActionLoading}
                              onClick={() =>
                                runCandidateAction(async () => {
                                  const { error } = await (supabase as any).rpc('super_admin_set_user_suspended', {
                                    _user_id: candidateSupport.user_id,
                                    _is_suspended: !candidateSupport.is_suspended,
                                    _reason: candidateReason || null,
                                  });
                                  if (error) throw error;
                                  toast.success(candidateSupport.is_suspended ? 'User unsuspended' : 'User suspended');
                                })
                              }
                            >
                              {candidateSupport.is_suspended ? 'Unsuspend' : 'Suspend'}
                            </Button>
                            <Button
                              variant="outline"
                              disabled={candidateActionLoading}
                              onClick={() =>
                                runCandidateAction(async () => {
                                  const next = !(candidateSupport.marketplace_opt_in === true);
                                  const { error } = await (supabase as any).rpc('super_admin_set_candidate_marketplace_opt_in', {
                                    _candidate_user_id: candidateSupport.user_id,
                                    _opt_in: next,
                                    _reason: candidateReason || null,
                                  });
                                  if (error) throw error;
                                  toast.success(next ? 'Candidate set discoverable' : 'Candidate set not discoverable');
                                })
                              }
                            >
                              {candidateSupport.marketplace_opt_in ? 'Disable discoverable' : 'Enable discoverable'}
                            </Button>
                          </div>

                          <div className="text-xs">
                            Current org links:
                            <ul className="mt-1 list-disc pl-5 space-y-1">
                              {candidateSupport.org_links.length === 0 ? (
                                <li>None</li>
                              ) : (
                                candidateSupport.org_links.slice(0, 8).map((l) => (
                                  <li key={`${l.organization_id}:${l.status}`}>
                                    {l.organization_name || 'Org'} ({l.organization_id}) — {l.status}
                                    {l.link_type ? ` · ${l.link_type}` : ''}
                                  </li>
                                ))
                              )}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )}

              {activeTab === 'audit' && (
              <div className="space-y-4">
                <div className="glass-panel rounded-xl overflow-hidden hover-card-premium">
                  <div className="p-4 sm:p-6 border-b border-white/5 bg-white/5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2">
                    <Input
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      placeholder="Search audit logs…"
                      className="w-full min-w-0 sm:w-[200px] bg-black/20 border-white/10"
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
                  <div className="p-0 overflow-x-auto">
                    <Table className="min-w-[720px]">
                      <TableHeader className="bg-white/5">
                        <TableRow className="hover:bg-white/5 border-white/5">
                          <SortableTableHead label="Time" sortKey="created_at" sort={auditTableSort.sort} onToggle={auditTableSort.toggle} />
                          <SortableTableHead label="Org" sortKey="org_name" sort={auditTableSort.sort} onToggle={auditTableSort.toggle} />
                          <SortableTableHead label="User" sortKey="user_name" sort={auditTableSort.sort} onToggle={auditTableSort.toggle} />
                          <SortableTableHead label="Action" sortKey="action" sort={auditTableSort.sort} onToggle={auditTableSort.toggle} />
                          <SortableTableHead label="Entity" sortKey="entity_type" sort={auditTableSort.sort} onToggle={auditTableSort.toggle} />
                          <SortableTableHead label="IP" sortKey="ip_address" sort={auditTableSort.sort} onToggle={auditTableSort.toggle} />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLoading ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
                              Loading audit logs...
                            </TableCell>
                          </TableRow>
                        ) : auditLogs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                              No audit logs found (or access not granted yet).
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedAuditLogs.map((log) => (
                            <TableRow key={log.id} className="hover:bg-white/5 border-white/5 transition-colors">
                              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                                {new Date(log.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <div className="space-y-0.5">
                                  <p className="font-medium text-sm">{log.org_name || 'Unknown org'}</p>
                                  <p className="text-xs text-muted-foreground font-mono opacity-70">{String(log.organization_id).slice(0, 8)}...</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-0.5">
                                  <p className="font-medium text-sm">{log.user_name || 'Unknown user'}</p>
                                  <p className="text-xs text-muted-foreground font-mono opacity-70">{String(log.user_id).slice(0, 8)}...</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs border-white/10 bg-white/5">
                                  {log.action}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {log.entity_type}{log.entity_id ? `:${String(log.entity_id).slice(0, 8)}…` : ''}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {log.ip_address || '-'}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="p-4 border-t border-white/5 flex items-center justify-between">
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
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAuditExpanded(true);
                            fetchAuditLogs(false);
                          }}
                          disabled={auditLoading || !auditHasMore}
                        >
                          Load older logs (100)
                        </Button>
                      )}
                      {(auditSearchDebounced || auditExpanded) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchAuditLogs(false)}
                          disabled={auditLoading || !auditHasMore}
                        >
                          Load more (100)
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )}
            </div>

            {/* Invite Org Admin for existing tenant (same pattern as Invite Recruiter) */}
            <Dialog open={tenantInviteDialogOpen} onOpenChange={setTenantInviteDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Org Admin</DialogTitle>
                  <DialogDescription>
                    Send an invite link to create an Org Admin account for this organization. Any previous pending invite for this tenant will be expired.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <Input value={tenantInviteTarget?.organization_name || ''} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Full name</Label>
                    <Input value={tenantInviteFullName} onChange={(e) => setTenantInviteFullName(e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
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
                    {tenantInviteSubmitting ? 'Generating…' : 'Create invite'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Create tenant (org + Org Admin invite) — same popup pattern as Invite Recruiter */}
            <Dialog open={createTenantDialogOpen} onOpenChange={(open) => { setCreateTenantDialogOpen(open); if (!open) setTenantInviteUrl(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create tenant</DialogTitle>
                  <DialogDescription>
                    Create an organization and generate an Org Admin invite link.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
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
                  {tenantInviteUrl && (
                    <div className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Invite link (local email may be skipped)</p>
                      <p className="mt-1 break-all text-sm font-medium">{tenantInviteUrl}</p>
                      <div className="mt-2 flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(tenantInviteUrl); toast.success('Copied invite link'); }}>
                          Copy
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => window.open(tenantInviteUrl, '_blank')}>
                          Open
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateTenantDialogOpen(false)} disabled={tenantCreateLoading}>
                    {tenantInviteUrl ? 'Done' : 'Cancel'}
                  </Button>
                  {!tenantInviteUrl ? (
                    <Button
                      onClick={handleCreateTenantAndInviteOrgAdmin}
                      disabled={tenantCreateLoading || !tenantOrgName.trim() || !tenantAdminName.trim() || !tenantAdminEmail.trim()}
                    >
                      {tenantCreateLoading ? 'Creating…' : 'Create invite'}
                    </Button>
                  ) : null}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Audit logs moved into the Audit logs tab */}
          </PageShell>

        {/* Remove Org Admin — same pattern as Remove recruiter in Org Admin */}
        <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Org Admin</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove Org Admin privileges for <strong>{userToRevoke?.email}</strong>. They will lose access to the org admin console.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevokeOrgAdmin}
                disabled={isRevoking}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isRevoking ? 'Removing…' : 'Remove'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SuperAdminLayout>
    </>
  );
}
