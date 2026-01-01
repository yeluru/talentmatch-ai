import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Shield, 
  Users, 
  Building2, 
  Briefcase, 
  Search,
  MoreVertical,
  Ban,
  CheckCircle,
  LogOut,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';

interface UserWithRoles {
  user_id: string;
  email: string;
  full_name: string;
  created_at: string;
  roles: string[];
  is_suspended: boolean;
}

interface PlatformStats {
  totalUsers: number;
  totalOrganizations: number;
  totalJobs: number;
  totalApplications: number;
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
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithRoles | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

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
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Fetch suspensions
      const { data: suspensionsData } = await supabase
        .from('user_suspensions')
        .select('user_id')
        .is('lifted_at', null);

      const suspendedUserIds = new Set(suspensionsData?.map(s => s.user_id) || []);

      // Combine data
      const usersWithRoles: UserWithRoles[] = (profilesData || []).map(profile => ({
        user_id: profile.user_id,
        email: profile.email,
        full_name: profile.full_name,
        created_at: profile.created_at,
        roles: rolesData?.filter(r => r.user_id === profile.user_id).map(r => r.role) || [],
        is_suspended: suspendedUserIds.has(profile.user_id)
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuspendUser = async (userId: string) => {
    try {
      const { error } = await supabase.from('user_suspensions').insert({
        user_id: userId,
        reason: 'Suspended by super admin',
        suspended_by: profile?.user_id
      });

      if (error) throw error;
      toast.success('User suspended');
      fetchDashboardData();
    } catch (error) {
      console.error('Error suspending user:', error);
      toast.error('Failed to suspend user');
    }
  };

  const handleUnsuspendUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_suspensions')
        .update({ lifted_at: new Date().toISOString(), lifted_by: profile?.user_id })
        .eq('user_id', userId)
        .is('lifted_at', null);

      if (error) throw error;
      toast.success('User unsuspended');
      fetchDashboardData();
    } catch (error) {
      console.error('Error unsuspending user:', error);
      toast.error('Failed to unsuspend user');
    }
  };

  const openDeleteDialog = (user: UserWithRoles) => {
    // Prevent deleting super admins
    if (user.roles.includes('super_admin')) {
      toast.error('Cannot delete a super admin account');
      return;
    }
    setUserToDelete(user);
    setDeleteReason('');
    setDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.rpc('archive_and_delete_user', {
        _target_user_id: userToDelete.user_id,
        _reason: deleteReason || 'Deleted by super admin'
      });

      if (error) throw error;
      
      toast.success(`User ${userToDelete.email} has been deleted and archived`);
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchDashboardData();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(error.message || 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
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

          {/* User Management */}
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                View and manage all platform users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
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

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
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
                          <TableCell>
                            {user.is_suspended ? (
                              <Badge variant="destructive">Suspended</Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {user.is_suspended ? (
                                  <DropdownMenuItem onClick={() => handleUnsuspendUser(user.user_id)}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Unsuspend User
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem 
                                    onClick={() => handleSuspendUser(user.user_id)}
                                    className="text-destructive"
                                  >
                                    <Ban className="h-4 w-4 mr-2" />
                                    Suspend User
                                  </DropdownMenuItem>
                                )}
                                {!user.roles.includes('super_admin') && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      onClick={() => openDeleteDialog(user)}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete User
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </main>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Delete User Permanently
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  You are about to permanently delete <strong>{userToDelete?.full_name}</strong> ({userToDelete?.email}).
                </p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm">
                  <p className="font-medium text-destructive mb-1">⚠️ This action cannot be undone!</p>
                  <p className="text-muted-foreground">
                    All user data including profile, applications, resumes, and related records will be archived and then removed from the platform.
                  </p>
                </div>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="delete-reason">Reason for deletion (optional)</Label>
                  <Textarea
                    id="delete-reason"
                    placeholder="Enter reason for deleting this user..."
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="resize-none"
                    rows={2}
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteUser}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? 'Deleting...' : 'Delete User'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
