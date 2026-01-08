import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Loader2, Mail, Trash2, Clock, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url?: string;
}

interface PendingInvite {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  invite_token: string;
}

export default function ManagerTeam() {
  const { organizationId, user } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [organizationName, setOrganizationName] = useState('');
  
  // Dialog states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastRecruiterInviteUrl, setLastRecruiterInviteUrl] = useState<string | null>(null);
  
  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  const buildInviteUrl = (token: string) =>
    `${window.location.origin}/auth?invite=${token}`;

  useEffect(() => {
    // When auth is hydrated but the org isn't available, don't spin forever.
    if (user && !organizationId) {
      setIsLoading(false);
      return;
    }

    if (organizationId) {
      fetchTeamData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, user]);

  const fetchTeamData = async () => {
    if (!organizationId) return;
    
    try {
      // Fetch org name
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();
      
      if (org) setOrganizationName(org.name);

      // Fetch team members
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('organization_id', organizationId);

      if (rolesData && rolesData.length > 0) {
        const userIds = rolesData.map(r => r.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, user_id, avatar_url')
          .in('user_id', userIds);
        
        if (profiles) {
          const members = profiles.map(p => ({
            id: p.id,
            user_id: p.user_id,
            full_name: p.full_name,
            email: p.email,
            avatar_url: p.avatar_url || undefined,
            role: rolesData.find(r => r.user_id === p.user_id)?.role || 'unknown'
          }));
          setTeamMembers(members);
        }
      }

      // Fetch pending invites
      const { data: invites } = await supabase
        .from('recruiter_invites')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (invites) {
        setPendingInvites(invites as PendingInvite[]);
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail || !organizationId) return;
    
    setIsSubmitting(true);
    setLastRecruiterInviteUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-recruiter-invite', {
        body: {
          email: inviteEmail,
          fullName: inviteName || undefined,
          organizationId,
          organizationName,
        },
      });

      if (error) throw error;
      const inviteUrl = (data as any)?.inviteUrl as string | undefined;
      if (inviteUrl) {
        setLastRecruiterInviteUrl(inviteUrl);
        try {
          await navigator.clipboard.writeText(inviteUrl);
          toast.success('Recruiter invite created (link copied to clipboard)');
        } catch {
          toast.success('Recruiter invite created');
        }
      } else {
        toast.success(`Invitation created for ${inviteEmail}`);
      }
      setIsInviteOpen(false);
      setInviteEmail('');
      setInviteName('');
      fetchTeamData();
    } catch (error: any) {
      console.error('Error sending invite:', error);
      const msg = error?.message || 'Failed to send invitation';
      toast.error(msg.includes('Unauthorized')
        ? 'Unauthorized. Please refresh and try again. If it persists, ensure you are signed in as an Account Manager.'
        : msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveRecruiter = async (recruiterId: string, recruiterName: string) => {
    try {
      const { error } = await supabase.rpc('remove_recruiter_from_org', {
        _user_id: recruiterId
      });

      if (error) throw error;

      toast.success(`${recruiterName} has been removed from the organization`);
      fetchTeamData();
    } catch (error: any) {
      console.error('Error removing recruiter:', error);
      toast.error(error.message || 'Failed to remove recruiter');
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from('recruiter_invites')
        .delete()
        .eq('id', inviteId);

      if (error) throw error;

      toast.success('Invitation cancelled');
      fetchTeamData();
    } catch (error: any) {
      console.error('Error cancelling invite:', error);
      toast.error('Failed to cancel invitation');
    }
  };

  const handleReInvite = async (invite: PendingInvite) => {
    if (!organizationId) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-recruiter-invite', {
        body: {
          email: invite.email,
          fullName: invite.full_name || undefined,
          organizationId,
          organizationName,
        },
      });
      if (error) throw error;

      await supabase.from('recruiter_invites').delete().eq('id', invite.id);

      const inviteUrl = (data as any)?.inviteUrl as string | undefined;
      if (inviteUrl) {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          toast.success('Re-invited (new link copied)');
        } catch {
          toast.success('Re-invited');
        }
      } else {
        toast.success('Re-invited');
      }

      fetchTeamData();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to re-invite');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
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
        <main className="space-y-4">
          <header>
            <h1 className="font-display text-3xl font-bold">Team Management</h1>
            <p className="text-muted-foreground mt-1">We couldn’t find an organization for this manager account.</p>
          </header>

          <Card>
            <CardHeader>
              <CardTitle>Action needed</CardTitle>
              <CardDescription>
                This page requires an organization to be linked to your user role. If you were just invited/changed roles, try signing out and back in.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => supabase.auth.signOut()}>
                Sign out
              </Button>
              <Button onClick={() => (window.location.href = '/auth')}>Go to login</Button>
            </CardContent>
          </Card>
        </main>
      </DashboardLayout>
    );
  }

  const recruiters = teamMembers.filter(m => m.role === 'recruiter');
  const managers = teamMembers.filter(m => m.role === 'account_manager');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Team Management</h1>
            <p className="text-muted-foreground mt-1">Manage recruiters in your organization</p>
          </div>
          
          <Dialog open={isInviteOpen} onOpenChange={(open) => !open && setIsInviteOpen(false)}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsInviteOpen(true)} variant="outline">
                <Mail className="h-4 w-4 mr-2" />
                Invite Recruiter
              </Button>
            </DialogTrigger>
            
            {/* Send Invite Dialog */}
            {isInviteOpen && (
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Send Recruiter Invite
                  </DialogTitle>
                  <DialogDescription>
                    Send an email invitation to join your organization as a recruiter.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email Address *</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="recruiter@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-name">Full Name *</Label>
                    <Input
                      id="invite-name"
                      placeholder="John Doe"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      required
                    />
                  </div>
                  {lastRecruiterInviteUrl && (
                    <div className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">Invite link (local email may be skipped)</p>
                      <p className="mt-1 break-all text-sm font-medium">{lastRecruiterInviteUrl}</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await navigator.clipboard.writeText(lastRecruiterInviteUrl);
                            toast.success("Copied invite link");
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(lastRecruiterInviteUrl, "_blank")}
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSendInvite} disabled={isSubmitting || !inviteEmail || !inviteName}>
                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Send Invitation
                  </Button>
                </DialogFooter>
              </DialogContent>
            )}
          </Dialog>
        </div>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Pending Invitations
              </CardTitle>
              <CardDescription>{pendingInvites.length} pending invite(s)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div>
                      <p className="font-medium">{invite.full_name || invite.email}</p>
                      {invite.full_name && <p className="text-sm text-muted-foreground">{invite.email}</p>}
                      <p className="mt-1 text-xs text-muted-foreground break-all">
                        Invite link: {buildInviteUrl(invite.invite_token)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Expires {new Date(invite.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-amber-500 text-amber-600">Pending</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await navigator.clipboard.writeText(buildInviteUrl(invite.invite_token));
                          toast.success("Copied invite link");
                        }}
                      >
                        Copy link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(buildInviteUrl(invite.invite_token), "_blank")}
                      >
                        Open
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReInvite(invite)}
                        disabled={isSubmitting}
                      >
                        Re-invite
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleCancelInvite(invite.id)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account Managers</CardTitle>
              <CardDescription>{managers.length} manager(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {managers.length === 0 ? (
                <p className="text-muted-foreground text-sm">No managers found.</p>
              ) : (
                <div className="space-y-3">
                  {managers.map((member) => (
                    <div key={member.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                      <Avatar>
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className="bg-manager/20 text-manager">
                          {member.full_name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{member.full_name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                      <Badge className="bg-manager/10 text-manager">Manager</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recruiters</CardTitle>
              <CardDescription>{recruiters.length} recruiter(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {recruiters.length === 0 ? (
                <p className="text-muted-foreground text-sm">No recruiters found. Add one using the buttons above.</p>
              ) : (
                <div className="space-y-3">
                  {recruiters.map((member) => (
                    <div key={member.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                      <Avatar>
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className="bg-recruiter/20 text-recruiter">
                          {member.full_name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{member.full_name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-recruiter/10 text-recruiter">Recruiter</Badge>
                        {member.user_id !== user?.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Recruiter</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove <strong>{member.full_name}</strong> from your organization? 
                                  They will lose access to all organization data.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleRemoveRecruiter(member.user_id, member.full_name)}
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
