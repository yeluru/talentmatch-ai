import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Users, Briefcase, MapPin } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { format } from 'date-fns';

interface TalentProfile {
  id: string;
  current_title: string | null;
  current_company: string | null;
  years_of_experience: number | null;
  headline: string | null;
  created_at: string;
  profile: {
    full_name: string;
    email: string;
    location: string | null;
  } | null;
  resumes: {
    ats_score: number | null;
  }[];
  skills: {
    skill_name: string;
  }[];
}

export default function TalentPool() {
  const { roles } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

  const { data: talents, isLoading } = useQuery({
    queryKey: ['talent-pool', organizationId],
    queryFn: async (): Promise<TalentProfile[]> => {
      if (!organizationId) return [];
      
      // Get candidate profiles for this organization
      const { data: candidates, error } = await supabase
        .from('candidate_profiles')
        .select(`
          id,
          current_title,
          current_company,
          years_of_experience,
          headline,
          created_at,
          user_id
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (!candidates?.length) return [];

      // Get profiles for these candidates
      const userIds = candidates.map(c => c.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, location')
        .in('user_id', userIds);

      // Get resumes with ATS scores
      const candidateIds = candidates.map(c => c.id);
      const { data: resumes } = await supabase
        .from('resumes')
        .select('candidate_id, ats_score')
        .in('candidate_id', candidateIds);

      // Get skills
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name')
        .in('candidate_id', candidateIds);

      return candidates.map(c => ({
        ...c,
        profile: profiles?.find(p => p.user_id === c.user_id) || null,
        resumes: resumes?.filter(r => r.candidate_id === c.id) || [],
        skills: skills?.filter(s => s.candidate_id === c.id) || [],
      }));
    },
    enabled: !!organizationId,
  });

  const filteredTalents = talents?.filter((t) => {
    const name = t.profile?.full_name || '';
    const title = t.current_title || '';
    const skills = t.skills.map(s => s.skill_name).join(' ');
    const searchLower = searchQuery.toLowerCase();
    return (
      name.toLowerCase().includes(searchLower) ||
      title.toLowerCase().includes(searchLower) ||
      skills.toLowerCase().includes(searchLower)
    );
  });

  const getAtsScore = (t: TalentProfile) => {
    const scores = t.resumes.map(r => r.ats_score).filter(Boolean) as number[];
    return scores.length > 0 ? Math.max(...scores) : null;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Talent Pool</h1>
          <p className="text-muted-foreground mt-1">
            Sourced profiles from bulk uploads and searches
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, title, or skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent>
            {!filteredTalents?.length ? (
              <EmptyState
                icon={Users}
                title="No profiles in talent pool"
                description="Import candidates via Talent Sourcing to build your pool"
              />
            ) : (
              <div className="divide-y">
                {filteredTalents.map((talent) => {
                  const atsScore = getAtsScore(talent);
                  return (
                    <div 
                      key={talent.id} 
                      className="py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-start gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-accent text-accent-foreground">
                            {(talent.profile?.full_name || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">
                              {talent.profile?.full_name || 'Unknown'}
                            </h3>
                            {atsScore && <ScoreBadge score={atsScore} size="sm" />}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {talent.current_title && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="h-3.5 w-3.5" />
                                {talent.current_title}
                                {talent.current_company && ` at ${talent.current_company}`}
                              </span>
                            )}
                            {talent.profile?.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {talent.profile.location}
                              </span>
                            )}
                          </div>
                          {talent.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {talent.skills.slice(0, 5).map((skill, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {skill.skill_name}
                                </Badge>
                              ))}
                              {talent.skills.length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{talent.skills.length - 5} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Added {format(new Date(talent.created_at), 'MMM d')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
