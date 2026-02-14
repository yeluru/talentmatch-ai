import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Shield, RefreshCw, Building2, UserPlus, UserMinus, ChevronDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { SuperAdminLayout } from '@/components/layouts/SuperAdminLayout';
import { cn } from '@/lib/utils';

type AppRole = 'candidate' | 'recruiter' | 'account_manager' | 'org_admin' | 'super_admin';

interface Organization {
  id: string;
  name: string;
}

interface UserWithRoles {
  user_id: string;
  email: string;
  full_name: string;
  roles: Array<{
    role: AppRole;
    organization_id: string | null;
    created_at: string;
    is_primary: boolean;
  }>;
}

export default function SuperAdminRoleManagement() {
  const { user, currentRole } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const allRoles: AppRole[] = ['recruiter', 'account_manager', 'org_admin', 'super_admin'];

  const roleLabels: Record<AppRole, string> = {
    candidate: 'Candidate',
    recruiter: 'Recruiter',
    account_manager: 'Account Manager',
    org_admin: 'Org Admin',
    super_admin: 'Platform Admin'
  };

  const roleColors: Record<AppRole, string> = {
    candidate: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    recruiter: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    account_manager: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    org_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    super_admin: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  };

  const roleIcons: Record<AppRole, string> = {
    candidate: '👤',
    recruiter: '🔍',
    account_manager: '💼',
    org_admin: '👑',
    super_admin: '⚡'
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    if (selectedOrg) {
      fetchUsersInOrg(selectedOrg);
    }
  }, [selectedOrg]);

  const fetchOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setOrganizations(data || []);

      if (data && data.length > 0 && !selectedOrg) {
        setSelectedOrg(data[0].id);
      }
    } catch (error: any) {
      console.error('Error fetching organizations:', error);
      toast.error('Failed to load organizations');
    }
  };

  const fetchUsersInOrg = async (orgId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_org_users_with_roles', {
        org_id: orgId
      });

      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleGrantRole = async (targetUserId: string, newRole: AppRole) => {
    setActionLoading(`${targetUserId}-grant`);
    try {
      const targetOrgId = newRole === 'super_admin' ? null : selectedOrg;

      const { data, error } = await supabase.rpc('grant_role_to_user', {
        target_user_id: targetUserId,
        new_role: newRole,
        target_org_id: targetOrgId,
        caller_acting_role: currentRole
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        toast.success(`✅ ${roleLabels[newRole]} role granted`);
        await fetchUsersInOrg(selectedOrg);
      } else {
        toast.info(result.message);
      }
    } catch (error: any) {
      console.error('Error granting role:', error);
      toast.error('Failed to grant role');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeRole = async (targetUserId: string, roleToRevoke: AppRole) => {
    setActionLoading(`${targetUserId}-revoke-${roleToRevoke}`);
    try {
      const targetUser = users.find(u => u.user_id === targetUserId);
      const roleOrg = targetUser?.roles.find(r => r.role === roleToRevoke)?.organization_id;

      const { data, error } = await supabase.rpc('revoke_role_from_user', {
        target_user_id: targetUserId,
        role_to_revoke: roleToRevoke,
        target_org_id: roleOrg,
        caller_acting_role: currentRole
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        toast.success(`🗑️ ${roleLabels[roleToRevoke]} role revoked`);
        await fetchUsersInOrg(selectedOrg);
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      console.error('Error revoking role:', error);
      toast.error('Failed to revoke role');
    } finally {
      setActionLoading(null);
    }
  };

  const getUserRoles = (targetUser: UserWithRoles): AppRole[] => {
    return targetUser.roles.map(r => r.role);
  };

  const getAvailableRolesToGrant = (targetUser: UserWithRoles): AppRole[] => {
    const currentRoles = getUserRoles(targetUser);
    return allRoles.filter(role => !currentRoles.includes(role));
  };

  const selectedOrgName = organizations.find(o => o.id === selectedOrg)?.name || '';

  return (
    <SuperAdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Role Management
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Manage user roles across all organizations
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => selectedOrg && fetchUsersInOrg(selectedOrg)}
            disabled={loading}
            className="border-gray-300 dark:border-gray-600"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Organization Selector */}
        <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
          <div className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Organization
                </label>
                <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                  <SelectTrigger className="w-full border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                    <SelectValue placeholder="Choose an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Card>

        {/* Users List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <RefreshCw className="h-12 w-12 animate-spin text-purple-500 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div className="p-12 text-center">
              <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No users found
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                No users in {selectedOrgName || 'this organization'}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {users.map((targetUser) => {
              const userRoles = getUserRoles(targetUser);
              const availableToGrant = getAvailableRolesToGrant(targetUser);
              const isCurrentUser = targetUser.user_id === user?.id;

              return (
                <Card
                  key={targetUser.user_id}
                  className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:shadow-lg transition-all duration-200"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
                          {(targetUser.full_name || targetUser.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {targetUser.full_name || 'Unnamed User'}
                            </h3>
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-xs border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300">
                                You
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {targetUser.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {availableToGrant.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-sm"
                                disabled={actionLoading?.startsWith(targetUser.user_id)}
                              >
                                <UserPlus className="h-4 w-4 mr-2" />
                                Add Role
                                <ChevronDown className="h-4 w-4 ml-1" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Grant Role</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {availableToGrant.map((role) => (
                                <DropdownMenuItem
                                  key={role}
                                  onClick={() => handleGrantRole(targetUser.user_id, role)}
                                  className="cursor-pointer"
                                >
                                  <span className="mr-2">{roleIcons[role]}</span>
                                  {roleLabels[role]}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}

                        {userRoles.length > 1 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                                disabled={actionLoading?.startsWith(targetUser.user_id)}
                              >
                                <UserMinus className="h-4 w-4 mr-2" />
                                Revoke Role
                                <ChevronDown className="h-4 w-4 ml-1" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Remove Role</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {targetUser.roles.map((roleData) => {
                                const isPrimary = roleData.is_primary;
                                return (
                                  <DropdownMenuItem
                                    key={roleData.role}
                                    onClick={() => !isPrimary && handleRevokeRole(targetUser.user_id, roleData.role)}
                                    disabled={isPrimary}
                                    className={cn(
                                      isPrimary
                                        ? "cursor-not-allowed opacity-50"
                                        : "cursor-pointer text-red-600 dark:text-red-400"
                                    )}
                                  >
                                    <span className="mr-2">{roleIcons[roleData.role]}</span>
                                    <span className="flex-1">{roleLabels[roleData.role]}</span>
                                    {isPrimary && (
                                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">⭐ Primary</span>
                                    )}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                        Current Roles in {selectedOrgName}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {targetUser.roles.map((roleData) => (
                          <Badge
                            key={roleData.role}
                            className={`${roleColors[roleData.role]} px-3 py-1.5 text-sm font-medium shadow-sm flex items-center gap-1.5`}
                          >
                            <span>{roleIcons[roleData.role]}</span>
                            <span>{roleLabels[roleData.role]}</span>
                            {roleData.is_primary && (
                              <span className="text-amber-300">⭐</span>
                            )}
                          </Badge>
                        ))}
                      </div>

                      {availableToGrant.length > 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                          Available to add: {availableToGrant.map(r => roleLabels[r]).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}
