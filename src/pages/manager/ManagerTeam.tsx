import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
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
import { Loader2, Mail, Trash2, Clock, XCircle, ArrowRight, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

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
  const [assignedRecruiterIds, setAssignedRecruiterIds] = useState<Set<string>>(new Set());

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

      // Fetch team members: build from user_roles (source of truth) so everyone in org shows,
      // then merge profile data where visible (avoids RLS or missing profile hiding members).
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

        const profileByUserId = new Map((profiles || []).map(p => [p.user_id, p]));
        const members: TeamMember[] = rolesData.map(r => {
          const p = profileByUserId.get(r.user_id);
          return {
            id: p?.id ?? r.user_id,
            user_id: r.user_id,
            full_name: p?.full_name || 'Team member',
            email: p?.email || '',
            avatar_url: p?.avatar_url ?? undefined,
            role: r.role || 'unknown',
          };
        });
        setTeamMembers(members);
      }

      // For account managers: limit recruiter list to those explicitly assigned.
      if (user?.id) {
        const { data: assigned } = await supabase
          .from('account_manager_recruiter_assignments')
          .select('recruiter_user_id')
          .eq('organization_id', organizationId)
          .eq('account_manager_user_id', user.id);
        setAssignedRecruiterIds(new Set((assigned || []).map((a: any) => String(a.recruiter_user_id)).filter(Boolean)));
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

  // Derived data (must be above any early returns; no hooks used here)
  const recruitersAll = teamMembers.filter((m) => m.role === 'recruiter');
  const recruiters = assignedRecruiterIds.size
    ? recruitersAll.filter((r) => assignedRecruiterIds.has(String(r.user_id)))
    : [];
  const managers = teamMembers.filter((m) => m.role === 'account_manager');

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-manager" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto">
          <div className="shrink-0 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Users className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">Team <span className="text-gradient-manager">Management</span></h1>
              </div>
              <p className="mt-1 text-lg text-muted-foreground font-sans">We couldn’t find an organization for this manager account.</p>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="pt-6 pb-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="font-display text-xl font-bold text-foreground mb-2">Action needed</h2>
                <p className="text-muted-foreground font-sans mb-4">
                  This page requires an organization to be linked to your user role. If you were just invited/changed roles, try signing out and back in.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => supabase.auth.signOut()} className="rounded-lg border-border hover:bg-manager/10 hover:text-manager font-sans">
                    Sign out
                  </Button>
                  <Button onClick={() => (window.location.href = '/auth')} className="rounded-lg h-11 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold">
                    Go to login
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Users className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Team <span className="text-gradient-manager">Management</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Manage recruiters in your organization
              </p>
            </div>
            <div className="shrink-0">
              <Dialog open={isInviteOpen} onOpenChange={(open) => !open && setIsInviteOpen(false)}>
                <DialogTrigger asChild>
                  <Button onClick={() => setIsInviteOpen(true)} variant="outline" className="rounded-lg h-11 px-6 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold">
                    <Mail className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Invite Recruiter
                  </Button>
                </DialogTrigger>

                {isInviteOpen && (
                  <DialogContent className="rounded-xl border border-border bg-card max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-display text-xl font-bold text-foreground flex items-center gap-2">
                        <Mail className="h-5 w-5 text-manager" strokeWidth={1.5} />
                        Send Recruiter Invite
                      </DialogTitle>
                      <DialogDescription className="font-sans text-muted-foreground">
                        Send an email invitation to join your organization as a recruiter.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="invite-email" className="text-sm font-sans font-medium text-muted-foreground">Email Address *</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          placeholder="recruiter@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="h-11 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invite-name" className="text-sm font-sans font-medium text-muted-foreground">Full Name *</Label>
                        <Input
                          id="invite-name"
                          placeholder="John Doe"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                          required
                          className="h-11 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                        />
                      </div>
                      {lastRecruiterInviteUrl && (
                        <div className="rounded-xl border border-border bg-muted/30 p-3">
                          <p className="text-xs font-sans text-muted-foreground">Invite link (local email may be skipped)</p>
                          <p className="mt-1 break-all text-sm font-sans font-medium">{lastRecruiterInviteUrl}</p>
                          <div className="mt-2 flex gap-2">
                            <Button type="button" variant="outline" size="sm" className="rounded-lg border-border hover:bg-manager/10 font-sans" onClick={async () => { await navigator.clipboard.writeText(lastRecruiterInviteUrl!); toast.success("Copied invite link"); }}>
                              Copy
                            </Button>
                            <Button type="button" variant="outline" size="sm" className="rounded-lg border-manager/20 hover:bg-manager/10 text-manager font-sans" onClick={() => window.open(lastRecruiterInviteUrl!, "_blank")}>
                              Open
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsInviteOpen(false)} className="rounded-lg font-sans">
                        Cancel
                      </Button>
                      <Button onClick={handleSendInvite} disabled={isSubmitting || !inviteEmail || !inviteName} className="rounded-lg h-11 px-6 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold">
                        {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" strokeWidth={1.5} />}
                        Send Invitation
                      </Button>
                    </DialogFooter>
              </DialogContent>
                )}
              </Dialog>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-manager" strokeWidth={1.5} />
              <h2 className="font-display text-xl font-bold text-foreground">Pending Invitations</h2>
            </div>
            <p className="text-sm text-muted-foreground font-sans mb-4">{pendingInvites.length} pending invite(s)</p>
            <div className="space-y-3">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="p-4 rounded-xl border border-manager/20 bg-manager/5 hover:bg-manager/10 transition-all flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="font-sans font-medium">{invite.full_name || invite.email}</p>
                    {invite.full_name && <p className="text-sm font-sans text-muted-foreground">{invite.email}</p>}
                    <p className="mt-1 text-xs font-sans break-all text-muted-foreground">
                      Invite link: {buildInviteUrl(invite.invite_token)}
                    </p>
                    <p className="text-xs mt-1 font-sans text-muted-foreground">
                      Expires {new Date(invite.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="border-manager/30 text-manager font-sans">Pending</Badge>
                    <Button variant="outline" size="sm" className="rounded-lg border-border hover:bg-manager/10 font-sans" onClick={async () => { await navigator.clipboard.writeText(buildInviteUrl(invite.invite_token)); toast.success("Copied invite link"); }}>
                      Copy link
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-lg border-manager/20 hover:bg-manager/10 text-manager font-sans" onClick={() => window.open(buildInviteUrl(invite.invite_token), "_blank")}>
                      Open
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-lg border-manager/20 hover:bg-manager/20 text-manager font-sans" onClick={() => handleReInvite(invite)} disabled={isSubmitting}>
                      Re-invite
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleCancelInvite(invite.id)}>
                      <XCircle className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
            <h2 className="font-display text-lg font-bold text-foreground mb-1">Account Managers</h2>
            <p className="text-sm text-muted-foreground font-sans mb-4">{managers.length} manager(s)</p>
            {managers.length === 0 ? (
              <p className="text-sm font-sans text-muted-foreground">No managers found.</p>
            ) : (
              <div className="space-y-3">
                {managers.map((member) => (
                  <div key={member.id} className="p-4 rounded-xl border border-border hover:bg-manager/5 transition-all flex items-center gap-4">
                    <Avatar>
                      <AvatarImage src={member.avatar_url} />
                      <AvatarFallback className="bg-manager/20 text-manager font-sans">
                        {(member.full_name?.[0] || 'U').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans font-medium">{member.full_name}</p>
                      <p className="text-sm font-sans text-muted-foreground">{member.email}</p>
                    </div>
                    <Badge className="bg-manager/10 text-manager border-manager/20 font-sans shrink-0">Manager</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
            <h2 className="font-display text-lg font-bold text-foreground mb-1">Recruiters</h2>
            <p className="text-sm text-muted-foreground font-sans mb-4">{recruiters.length} recruiter(s)</p>
            {recruiters.length === 0 ? (
              <p className="text-sm font-sans text-muted-foreground">
                No recruiters assigned to you yet. Ask an Org Admin to assign recruiters under your account.
              </p>
            ) : (
              <div className="space-y-3">
                {recruiters.map((member) => (
                  <div key={member.id} className="p-4 rounded-xl border border-border hover:bg-manager/5 transition-all flex items-center gap-4 flex-wrap">
                    <Avatar>
                      <AvatarImage src={member.avatar_url} />
                      <AvatarFallback className="bg-recruiter/20 text-recruiter font-sans">
                        {(member.full_name?.[0] || 'U').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-sans font-medium">{member.full_name}</p>
                      <p className="text-sm font-sans text-muted-foreground">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className="bg-recruiter/10 text-recruiter border-recruiter/20 font-sans">Recruiter</Badge>
                      <Button asChild size="sm" variant="outline" className="rounded-lg border-manager/20 hover:bg-manager/10 text-manager font-sans">
                        <Link to={`/manager/team/recruiters/${member.user_id}`}>
                          View progress
                          <ArrowRight className="h-4 w-4 ml-2" strokeWidth={1.5} />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
