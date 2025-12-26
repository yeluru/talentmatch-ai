import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url?: string;
}

export default function ManagerTeam() {
  const { organizationId } = useAuth();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (organizationId) {
      fetchTeamMembers();
    }
  }, [organizationId]);

  const fetchTeamMembers = async () => {
    if (!organizationId) return;
    
    try {
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
    } catch (error) {
      console.error('Error fetching team members:', error);
    } finally {
      setIsLoading(false);
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

  const recruiters = teamMembers.filter(m => m.role === 'recruiter');
  const managers = teamMembers.filter(m => m.role === 'account_manager');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Team</h1>
          <p className="text-muted-foreground mt-1">Manage your organization's team members</p>
        </div>

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
                <p className="text-muted-foreground text-sm">No recruiters found.</p>
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
                      <Badge className="bg-recruiter/10 text-recruiter">Recruiter</Badge>
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