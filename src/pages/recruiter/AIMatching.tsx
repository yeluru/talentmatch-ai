import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite, effectiveRecruiterOwnerId } from '@/lib/org';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Loader2,
  Users,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  TrendingUp,
  Brain
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';

interface MatchResult {
  candidate_id: string;
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  recommendation: string;
}

interface ApplicantWithProfile {
  id: string;
  candidate_id: string;
  ai_match_score: number | null;
  candidate_profiles: {
    id: string;
    current_title: string | null;
    current_company?: string | null;
    years_of_experience: number | null;
    summary?: string | null;
    email?: string | null;
    full_name?: string | null;
    user_id: string;
  } | null;
  profile?: { user_id: string; full_name: string; avatar_url?: string };
  skills?: string[];
}

function displayNameFromEmail(email?: string | null) {
  const e = String(email || '').trim();
  if (!e) return '';
  return e.split('@')[0] || '';
}

export default function AIMatching() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [candidateSource, setCandidateSource] = useState<'talent_pool' | 'applicants'>('talent_pool');
  const [detailTalentId, setDetailTalentId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const organizationId = orgIdForRecruiterSuite(roles);
  const { currentRole, user } = useAuth();
  const [searchParams] = useSearchParams();
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));
  const STORAGE_KEY_PREFIX = useMemo(
    () => `recruiter:ai-matching:last:${organizationId || 'no-org'}`,
    [organizationId],
  );

  // Restore last selected job on mount (per org)
  useEffect(() => {
    if (!organizationId) return;
    try {
      const savedJob = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}:selectedJob`);
      if (savedJob) setSelectedJob(savedJob);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  // Persist selected job (per org)
  useEffect(() => {
    if (!organizationId) return;
    try {
      sessionStorage.setItem(`${STORAGE_KEY_PREFIX}:selectedJob`, selectedJob);
    } catch {
      // ignore
    }
  }, [STORAGE_KEY_PREFIX, organizationId, selectedJob]);

  // Restore last match results for the selected job
  useEffect(() => {
    if (!organizationId) return;
    if (!selectedJob) {
      setMatchResults([]);
      return;
    }
    try {
      const raw = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}:job:${selectedJob}`);
      if (!raw) {
        setMatchResults([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.matchResults)) setMatchResults(parsed.matchResults as MatchResult[]);
    } catch {
      // ignore
    }
  }, [STORAGE_KEY_PREFIX, organizationId, selectedJob]);

  // Fetch jobs (only this recruiter's when ownerId is set)
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['recruiter-jobs-matching', organizationId, ownerId],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase.from('jobs').select('*').eq('organization_id', organizationId).eq('status', 'published');
      if (ownerId) q = q.eq('recruiter_id', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch candidates who applied for selected job
  const { data: applicants, isLoading: applicantsLoading } = useQuery<ApplicantWithProfile[]>({
    queryKey: ['job-applicants', selectedJob],
    queryFn: async (): Promise<ApplicantWithProfile[]> => {
      if (!selectedJob) return [];

      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          candidate_id,
          ai_match_score,
          candidate_profiles(
            id,
            current_title,
            current_company,
            years_of_experience,
            summary,
            email,
            full_name,
            user_id
          )
        `)
        .eq('job_id', selectedJob);

      if (error) throw error;

      // Fetch profile names
      const userIds = data?.map(a => a.candidate_profiles?.user_id).filter(Boolean) || [];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', userIds);

        // Fetch skills
        const candidateIds = data?.map(a => a.candidate_id) || [];
        const { data: skills } = await supabase
          .from('candidate_skills')
          .select('candidate_id, skill_name')
          .in('candidate_id', candidateIds);

        return data?.map(app => ({
          ...app,
          profile: profiles?.find(p => p.user_id === app.candidate_profiles?.user_id),
          skills: skills?.filter(s => s.candidate_id === app.candidate_id).map(s => s.skill_name) || []
        }));
      }

      return data;
    },
    enabled: !!selectedJob,
  });

  // Fetch org talent pool candidates
  const { data: talentPoolCandidates, isLoading: talentPoolLoading } = useQuery<
    Array<{
      candidate_id: string;
      candidate_profiles: ApplicantWithProfile['candidate_profiles'];
      profile?: { user_id: string; full_name: string; avatar_url?: string };
      skills?: string[];
    }>
  >({
    queryKey: ['org-talent-pool-candidates', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from('candidate_org_links' as any)
        .select(
          `
          candidate_id,
          candidate_profiles(
            id,
            current_title,
            current_company,
            years_of_experience,
            summary,
            email,
            full_name,
            user_id
          )
        `,
        )
        .eq('organization_id', organizationId)
        .eq('status', 'active');

      if (error) throw error;

      const rows =
        (data || []).filter((r: any) => r?.candidate_id).map((r: any) => ({
          candidate_id: String(r.candidate_id),
          candidate_profiles: (r.candidate_profiles as any) || null,
        })) || [];

      // Deduplicate
      const byId = new Map<string, { candidate_id: string; candidate_profiles: any }>();
      for (const r of rows) if (!byId.has(r.candidate_id)) byId.set(r.candidate_id, r);
      const deduped = Array.from(byId.values());

      // Fetch profile names
      const userIds = deduped.map((r) => r.candidate_profiles?.user_id).filter(Boolean);
      const { data: profiles } =
        userIds.length > 0
          ? await supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', userIds as any)
          : { data: [] as any[] };

      // Fetch skills
      const candidateIds = deduped.map((r) => r.candidate_id);
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name')
        .in('candidate_id', candidateIds);

      return deduped.map((c) => ({
        ...c,
        profile: profiles?.find((p: any) => p.user_id === c.candidate_profiles?.user_id),
        skills: skills?.filter((s: any) => String(s.candidate_id) === String(c.candidate_id)).map((s: any) => s.skill_name) || [],
      }));
    },
    enabled: !!organizationId && candidateSource === 'talent_pool',
  });

  const candidatesForMatching = useMemo(() => {
    if (candidateSource === 'applicants') return applicants || [];
    return talentPoolCandidates || [];
  }, [applicants, candidateSource, talentPoolCandidates]);

  const runMatching = useMutation({
    mutationFn: async () => {
      if (!selectedJob) throw new Error('No job selected');
      if (!candidatesForMatching?.length) throw new Error('No candidates available for matching');

      const job = jobs?.find(j => j.id === selectedJob);
      if (!job) throw new Error('Job not found');

      const requiredSkills: string[] = Array.isArray(job.required_skills) ? job.required_skills : [];

      const candidates = candidatesForMatching.map((row: any) => ({
        id: row.candidate_id,
        full_name:
          row.profile?.full_name ||
          row.candidate_profiles?.full_name ||
          displayNameFromEmail(row.candidate_profiles?.email) ||
          'Candidate',
        current_title: row.candidate_profiles?.current_title,
        current_company: row.candidate_profiles?.current_company,
        years_of_experience: row.candidate_profiles?.years_of_experience,
        summary: row.candidate_profiles?.summary,
        skills: row.skills || [],
      }));

      const { data, error } = await supabase.functions.invoke('match-candidates', {
        body: {
          jobTitle: job.title,
          jobDescription: job.description,
          requiredSkills,
          candidates,
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      const requiredSkills = Array.isArray(selectedJobData?.required_skills) ? (selectedJobData?.required_skills as string[]) : [];

      const rankings = (data?.rankings || []) as any[];
      const matches: MatchResult[] = rankings.map((r: any) => {
        const row = (candidatesForMatching as any[])?.find((a: any) => String(a.candidate_id) === String(r.candidate_id));
        const candidateSkills = row?.skills || [];
        const requiredLower = requiredSkills.map((s) => String(s).toLowerCase());
        const candLower = candidateSkills.map((s) => String(s).toLowerCase());
        const matched = requiredSkills.filter((s, i) => candLower.includes(requiredLower[i]));
        const missing = requiredSkills.filter((s, i) => !candLower.includes(requiredLower[i]));

        const points = Array.isArray(r?.matching_points) ? r.matching_points : [];
        const concerns = Array.isArray(r?.concerns) ? r.concerns : [];
        const rec = String(r?.recommendation || '').replace(/_/g, ' ');
        const detail = points[0] || (concerns[0] ? `Concern: ${concerns[0]}` : '');

        return {
          candidate_id: String(r?.candidate_id),
          match_score: Number(r?.match_score || 0),
          matched_skills: matched,
          missing_skills: missing,
          recommendation: [rec, detail].filter(Boolean).join(' — '),
        };
      }).filter((m) => m.candidate_id);

      setMatchResults(matches);
      try {
        sessionStorage.setItem(
          `${STORAGE_KEY_PREFIX}:job:${selectedJob}`,
          JSON.stringify({ ts: Date.now(), job: selectedJob, matchResults: matches }),
        );
      } catch {
        // ignore
      }

      // Update application scores only when matching job applicants
      if (candidateSource === 'applicants') {
        for (const match of matches) {
          const app = applicants?.find(a => a.candidate_id === match.candidate_id);
          if (app) {
            await supabase
              .from('applications')
              .update({
                ai_match_score: match.match_score,
                ai_match_details: {
                  matched_skills: match.matched_skills,
                  missing_skills: match.missing_skills,
                  recommendation: match.recommendation
                }
              })
              .eq('id', app.id);
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['job-applicants'] });
      toast.success('AI matching complete!');
    },
    onError: (error: any) => {
      console.error('Matching error:', error);
      if (error.message?.includes('Rate limit')) {
        toast.error('Rate limit exceeded. Please try again later.');
      } else {
        toast.error('Failed to run AI matching');
      }
    },
  });

  const selectedJobData = jobs?.find(j => j.id === selectedJob);

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-recruiter/10 dark:bg-recruiter/20 border-2 border-recruiter/70 dark:border-white/50">
                <Brain className="h-5 w-5 text-recruiter/60 dark:text-recruiter" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                AI <span className="text-gradient-recruiter">Matching</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">Rank candidates instantly using our deep learning engine.</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full shadow-sm glass-panel border-white/20 hover:bg-white/10">
              Export Report
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-6">
          {/* Controls Panel */}
          <Card className="lg:col-span-4 h-fit glass-card border-none">
            <CardHeader className="border-b border-white/10 bg-white/5 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Briefcase className="h-5 w-5 text-primary" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Job Requisition</label>
                  <Select value={selectedJob} onValueChange={setSelectedJob}>
                    <SelectTrigger className="w-full glass-input">
                      <SelectValue placeholder="Choose a job..." />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs?.map((job) => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Candidate Source</label>
                  <Select value={candidateSource} onValueChange={(v) => setCandidateSource(v as any)}>
                    <SelectTrigger className="w-full glass-input">
                      <SelectValue placeholder="Candidate set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="talent_pool">Talent Pool (Entire Org)</SelectItem>
                      <SelectItem value="applicants">Just Applicants</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedJobData && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-primary">{selectedJobData.title}</h4>
                    <Badge variant="outline" className="bg-background/50 border-primary/20 text-primary">Active</Badge>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Required Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedJobData.required_skills?.slice(0, 5).map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary-foreground hover:bg-primary/20 border-0">{skill}</Badge>
                      ))}
                      {(selectedJobData.required_skills?.length || 0) > 5 && (
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-primary/20">+{(selectedJobData.required_skills?.length || 0) - 5} more</Badge>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-primary/10 flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {candidateSource === 'applicants'
                      ? `${applicants?.length || 0} applicants found`
                      : `${talentPoolCandidates?.length || 0} candidates in pool`}
                  </div>
                </div>
              )}

              <Button
                onClick={() => runMatching.mutate()}
                disabled={!selectedJob || !candidatesForMatching?.length || runMatching.isPending}
                className="w-full shadow-lg shadow-primary/20 h-12 text-base font-semibold"
                size="lg"
              >
                {runMatching.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Analyzing Candidates...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Generate Match Scores
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Results Panel */}
          <div className="lg:col-span-8 space-y-6">
            {matchResults.length > 0 ? (
              <Card className="glass-card border-none overflow-hidden">
                <CardHeader className="border-b border-white/10 bg-white/5 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">Top Matches</CardTitle>
                    <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors border-0">
                      {matchResults.length} analyzed
                    </Badge>
                  </div>
                </CardHeader>

                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b-white/10">
                      <TableHead className="w-[80px]">Rank</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Experience</TableHead>
                      <TableHead>Match Score</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matchResults
                      .sort((a, b) => b.match_score - a.match_score)
                      .map((result, index) => {
                        const row = (candidatesForMatching as any[])?.find(
                          (r: any) => String(r?.candidate_id) === String(result.candidate_id),
                        );

                        const profile = row?.profile || row?.candidate_profiles;
                        const avatarUrl = profile?.avatar_url;
                        const displayName = profile?.full_name || displayNameFromEmail(profile?.email) || 'Candidate';
                        const currentRole = row?.candidate_profiles?.current_title || 'No title';
                        const company = row?.candidate_profiles?.current_company;

                        return (
                          <TableRow
                            key={result.candidate_id}
                            className="cursor-pointer group hover:bg-white/5 border-b-white/5 transition-colors"
                            onClick={() => {
                              setDetailTalentId(result.candidate_id);
                              setDetailOpen(true);
                            }}
                          >
                            <TableCell className="font-display font-bold text-lg text-muted-foreground/50 group-hover:text-primary transition-colors">
                              #{index + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 border-2 border-transparent group-hover:border-primary/50 transition-all ring-offset-background">
                                  <AvatarImage src={avatarUrl} />
                                  <AvatarFallback className="font-bold text-xs bg-muted text-muted-foreground">
                                    {displayName.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-bold text-foreground group-hover:text-primary transition-colors">
                                    {displayName}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                                    {currentRole}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {company ? <span className="font-medium">{company}</span> : <span className="text-muted-foreground italic">Unknown</span>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row?.candidate_profiles?.years_of_experience || 0} years exp
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <ScoreBadge score={result.match_score} size="md" showLabel={false} />
                                <div className="hidden sm:block">
                                  <div className="h-1.5 w-24 bg-muted/30 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-1000 ${result.match_score > 85 ? 'bg-green-500' :
                                        result.match_score > 70 ? 'bg-yellow-500' : 'bg-red-500'
                                        }`}
                                      style={{ width: `${result.match_score}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary hover:bg-primary/10">
                                View Analysis
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <div className="h-full min-h-[400px] flex items-center justify-center">
                {selectedJob && !runMatching.isPending && (
                  <EmptyState
                    icon={Sparkles}
                    title="Ready to Match"
                    description="Select a job and click 'Generate Match Scores' to see AI rankings."
                    className="glass-panel border-white/10 bg-white/5"
                  />
                )}
                {!selectedJob && (
                  <EmptyState
                    icon={Briefcase}
                    title="Select a Job"
                    description="Choose a job on the left to start matching candidates."
                    className="glass-panel border-white/10 bg-white/5"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <TalentDetailSheet
        talentId={detailTalentId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </DashboardLayout>
  );
}
