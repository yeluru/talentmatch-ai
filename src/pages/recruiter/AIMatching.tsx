import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite } from '@/lib/org';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Sparkles,
  Loader2,
  Users,
  CheckCircle2,
  AlertCircle
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
  profile?: { user_id: string; full_name: string };
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

  // Fetch jobs
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['recruiter-jobs-matching', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'published');
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
          .select('user_id, full_name')
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

  // Fetch org talent pool candidates (not just job applicants)
  const { data: talentPoolCandidates, isLoading: talentPoolLoading } = useQuery<
    Array<{
      candidate_id: string;
      candidate_profiles: ApplicantWithProfile['candidate_profiles'];
      profile?: { user_id: string; full_name: string };
      skills?: string[];
    }>
  >({
    queryKey: ['org-talent-pool-candidates', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from('candidate_org_links')
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

      // Deduplicate by candidate_id (in case multiple link types exist)
      const byId = new Map<string, { candidate_id: string; candidate_profiles: any }>();
      for (const r of rows) if (!byId.has(r.candidate_id)) byId.set(r.candidate_id, r);
      const deduped = Array.from(byId.values());

      // Fetch profile names (fallback)
      const userIds = deduped.map((r) => r.candidate_profiles?.user_id).filter(Boolean);
      const { data: profiles } =
        userIds.length > 0
          ? await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds as any)
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
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-accent" />
            AI Candidate Matching
          </h1>
          <p className="mt-1">
            Use AI to score and rank candidates for your job openings
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select a Job</CardTitle>
            <CardDescription>
              Choose a job to run AI matching on its applicants
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
            <Select value={selectedJob} onValueChange={setSelectedJob}>
              <SelectTrigger>
                <SelectValue placeholder="Select a job..." />
              </SelectTrigger>
              <SelectContent>
                {jobs?.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
              <Select value={candidateSource} onValueChange={(v) => setCandidateSource(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Candidate set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="talent_pool">Talent Pool (all org candidates)</SelectItem>
                  <SelectItem value="applicants">Applicants (this job only)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedJobData && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">{selectedJobData.title}</h4>
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedJobData.required_skills?.map((skill) => (
                    <Badge key={skill} variant="secondary">{skill}</Badge>
                  ))}
                </div>
                <p className="text-sm">
                  {candidateSource === 'applicants'
                    ? `${applicants?.length || 0} applicant${(applicants?.length || 0) === 1 ? '' : 's'}`
                    : `${talentPoolCandidates?.length || 0} candidate${(talentPoolCandidates?.length || 0) === 1 ? '' : 's'} in Talent Pool`}
                </p>
              </div>
            )}

            <Button
              onClick={() => runMatching.mutate()}
              disabled={!selectedJob || !candidatesForMatching?.length || runMatching.isPending}
              className="w-full"
            >
              {runMatching.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Running AI Analysis...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Run AI Matching
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {matchResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Match Results</CardTitle>
              <CardDescription>
                Candidates ranked by AI match score
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {matchResults
                  .sort((a, b) => b.match_score - a.match_score)
                  .map((result, index) => {
                    const row = (candidatesForMatching as any[])?.find(
                      (r: any) => String(r?.candidate_id) === String(result.candidate_id),
                    );
                    const displayName =
                      row?.profile?.full_name ||
                      row?.candidate_profiles?.full_name ||
                      displayNameFromEmail(row?.candidate_profiles?.email) ||
                      'Candidate';
                    const subtitle = [
                      row?.candidate_profiles?.current_title,
                      row?.candidate_profiles?.current_company ? `at ${row.candidate_profiles.current_company}` : null,
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <div
                        key={result.candidate_id}
                        className={`flex items-center gap-3 py-2 px-3 border rounded-md cursor-pointer hover:bg-muted/40 transition-colors ${index % 2 === 1 ? 'bg-secondary/40' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setDetailTalentId(result.candidate_id);
                          setDetailOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setDetailTalentId(result.candidate_id);
                            setDetailOpen(true);
                          }
                        }}
                      >
                        <span className="text-xsw-6 shrink-0">#{index + 1}</span>
                        <span className="font-medium truncate shrink-0 max-w-[120px]">{displayName}</span>
                        <span className="text-smtruncate flex-1 min-w-0 max-w-[200px]" title={subtitle || undefined}>
                          {subtitle || '—'}
                        </span>
                        <ScoreBadge score={result.match_score} size="sm" showLabel={false} />
                        <span className="text-xstruncate max-w-[200px]" title={result.recommendation}>
                          {result.recommendation ? String(result.recommendation).slice(0, 60) + (result.recommendation.length > 60 ? '…' : '') : '—'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedJob && candidatesForMatching?.length && !runMatching.isPending && matchResults.length === 0 && (
          <EmptyState
            icon={AlertCircle}
            title="No match results to display"
            description="Run matching again to generate scores for this job."
          />
        )}

        {selectedJob &&
          !candidatesForMatching?.length &&
          !applicantsLoading &&
          !talentPoolLoading && (
          <EmptyState
            icon={Users}
            title={candidateSource === 'applicants' ? 'No applicants yet' : 'No candidates in Talent Pool'}
            description={
              candidateSource === 'applicants'
                ? 'Wait for candidates to apply (or switch to Talent Pool matching).'
                : 'Upload/import candidates or link candidates to your organization.'
            }
          />
        )}
      </div>

      <TalentDetailSheet
        talentId={detailTalentId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </DashboardLayout>
  );
}
