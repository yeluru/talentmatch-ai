import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Shield, RefreshCw, UserPlus, UserMinus, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { OrgAdminLayout } from '@/components/layouts/OrgAdminLayout';
import { cn } from '@/lib/utils';

type AppRole = 'candidate' | 'recruiter' | 'account_manager' | 'org_admin' | 'super_admin';

interface OrgUser {
  user_id: string;
  email: string;
  full_name: string;
  roles: Array<{
    role: AppRole;
    organization_id: string;
    created_at: string;
    is_primary: boolean;
  }>;
}

export default function RoleManagement() {
  const { organizationId, user, currentRole } = useAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const availableRoles: AppRole[] = ['recruiter', 'account_manager', 'org_admin'];

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
    if (organizationId) {
      fetchUsers();
    }
  }, [organizationId]);

  const fetchUsers = async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_org_users_with_roles', {
        org_id: organizationId
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
    if (!organizationId) return;

    setActionLoading(`${targetUserId}-grant`);
    try {
      const { data, error } = await supabase.rpc('grant_role_to_user', {
        target_user_id: targetUserId,
        new_role: newRole,
        target_org_id: organizationId,
        caller_acting_role: currentRole
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        toast.success(`✅ ${roleLabels[newRole]} role granted`);
        await fetchUsers();
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
    if (!organizationId) return;

    setActionLoading(`${targetUserId}-revoke-${roleToRevoke}`);
    try {
      const { data, error } = await supabase.rpc('revoke_role_from_user', {
        target_user_id: targetUserId,
        role_to_revoke: roleToRevoke,
        target_org_id: organizationId,
        caller_acting_role: currentRole
      });

      if (error) throw error;

      const result = data as { success: boolean; message: string };
      if (result.success) {
        toast.success(`🗑️ ${roleLabels[roleToRevoke]} role revoked`);
        await fetchUsers();
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

  const getUserRoles = (targetUser: OrgUser): AppRole[] => {
    return targetUser.roles.map(r => r.role);
  };

  const getAvailableRolesToGrant = (targetUser: OrgUser): AppRole[] => {
    const currentRoles = getUserRoles(targetUser);
    return availableRoles.filter(role => !currentRoles.includes(role));
  };

  return (
    <OrgAdminLayout>
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
                Manage user roles in your organization
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
            className="border-gray-300 dark:border-gray-600"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

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
                No users in your organization yet
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
                        Current Roles
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
    </OrgAdminLayout>
  );
}
