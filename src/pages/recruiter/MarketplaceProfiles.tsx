import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { Loader2, Search, UserPlus, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite } from '@/lib/org';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { openResumeInNewTab } from '@/lib/resumeLinks';
import { useNavigate } from 'react-router-dom';
import { sortBy } from '@/lib/sort';
import { useTableSort } from '@/hooks/useTableSort';

type ProfileRow = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  email?: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  years_of_experience: number | null;
  headline: string | null;
  marketplace_visibility_level?: 'anonymous' | 'limited' | 'full' | null;
  top_skills?: string[];
  primary_resume?: { file_name: string; file_url: string } | null;
};

const STAGES = [
  { value: 'outreach', label: 'Engaged' },
  { value: 'rate_confirmation', label: 'Rate confirmation' },
  { value: 'right_to_represent', label: 'Right to represent' },
  { value: 'screening', label: 'Screening' },
  { value: 'submission', label: 'Submission' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'onboarding', label: 'Onboarding' },
];

export default function MarketplaceProfiles() {
  const { user, roles } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const organizationId = orgIdForRecruiterSuite(roles);

  const [q, setQ] = useState('');
  const [stage, setStage] = useState('outreach');
  const [jobId, setJobId] = useState('');
  const tableSort = useTableSort<'full_name' | 'has_resume' | 'skills' | 'current_title' | 'current_company'>({
    key: 'full_name',
    dir: 'asc',
  });

  const { data: jobs } = useQuery({
    queryKey: ['recruiter-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase.from('jobs').select('id, title').eq('organization_id', organizationId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['marketplace-profiles', organizationId],
    queryFn: async (): Promise<ProfileRow[]> => {
      // RLS enforces org settings + opt-in visibility.
      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('id, user_id, full_name, email, current_title, current_company, location, years_of_experience, headline, marketplace_visibility_level')
        .eq('marketplace_opt_in', true)
        .eq('is_actively_looking', true)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data || []) as any as ProfileRow[];

      const ids = rows.map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return rows;

      // Fetch top skills for these candidates (RLS allows marketplace opt-in)
      const { data: skillsData } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name, skill_type')
        .in('candidate_id', ids)
        .eq('skill_type', 'technical')
        .limit(2000);

      const skillsByCandidate = new Map<string, string[]>();
      for (const s of (skillsData || []) as any[]) {
        const list = skillsByCandidate.get(s.candidate_id) || [];
        if (s.skill_name && !list.includes(s.skill_name)) list.push(s.skill_name);
        skillsByCandidate.set(s.candidate_id, list);
      }

      // Fetch the most recent resume if present (marketplace should reflect latest)
      const { data: resumesData } = await supabase
        .from('resumes')
        .select('candidate_id, file_name, file_url, is_primary, created_at')
        .in('candidate_id', ids)
        .order('created_at', { ascending: false })
        .limit(1000);

      const resumeByCandidate = new Map<string, { file_name: string; file_url: string }>();
      for (const r of (resumesData || []) as any[]) {
        if (!resumeByCandidate.has(r.candidate_id) && r.file_url) {
          resumeByCandidate.set(r.candidate_id, { file_name: r.file_name, file_url: r.file_url });
        }
      }

      return rows.map((r) => ({
        ...r,
        top_skills: (skillsByCandidate.get(r.id) || []).slice(0, 8),
        primary_resume: resumeByCandidate.get(r.id) || null,
      }));
    },
    enabled: !!organizationId,
  });

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return profiles || [];
    return (profiles || []).filter((p) => {
      return (
        (p.full_name || '').toLowerCase().includes(qq) ||
        (p.current_title || '').toLowerCase().includes(qq) ||
        (p.current_company || '').toLowerCase().includes(qq) ||
        (p.location || '').toLowerCase().includes(qq) ||
        (p.headline || '').toLowerCase().includes(qq)
      );
    });
  }, [profiles, q]);

  const sorted = useMemo(() => {
    return sortBy(filtered, tableSort.sort, (p, key) => {
      switch (key) {
        case 'full_name':
          return p.full_name || '';
        case 'has_resume':
          return Boolean(p.primary_resume?.file_url);
        case 'skills':
          return (p.top_skills || []).join(', ');
        case 'current_title':
          return p.current_title || '';
        case 'current_company':
          return p.current_company || '';
        default:
          return p.full_name || '';
      }
    });
  }, [filtered, tableSort.sort]);

  const startEngagement = useMutation({
    mutationFn: async (candidateId: string) => {
      if (!organizationId || !user) throw new Error('Not authorized');
      if (!jobId) throw new Error('Select a job first');

      // Ensure org link (talent pool) + create engagement workflow record.
      // candidate_org_links is unique on (candidate_id, organization_id) but its PK is `id`,
      // so upsert must use onConflict. We also avoid overwriting an existing link_type by:
      // 1) best-effort re-activating an existing link
      // 2) inserting only if missing (ignoreDuplicates).
      await supabase
        .from('candidate_org_links')
        .update({ status: 'active' })
        .eq('candidate_id', candidateId)
        .eq('organization_id', organizationId);

      const { error: linkErr } = await supabase.from('candidate_org_links').upsert(
        {
          candidate_id: candidateId,
          organization_id: organizationId,
          link_type: 'engagement',
          status: 'active',
          created_by: user.id,
        } as any,
        { onConflict: 'candidate_id,organization_id', ignoreDuplicates: true }
      );
      if (linkErr) throw linkErr;

      // Engagements are job-scoped (org ↔ candidate ↔ job)
      const { error: engErr } = await supabase.from('candidate_engagements').upsert(
        {
          organization_id: organizationId,
          candidate_id: candidateId,
          job_id: jobId,
          created_by: user.id,
          owner_user_id: user.id,
          stage,
        } as any,
        { onConflict: 'organization_id,candidate_id,job_id' }
      );
      if (engErr) throw engErr;

      const { error: appErr } = await supabase.from('applications').upsert(
        {
          job_id: jobId,
          candidate_id: candidateId,
          status: 'outreach',
          applied_at: new Date().toISOString(),
        } as any,
        { onConflict: 'job_id,candidate_id', ignoreDuplicates: true }
      );
      if (appErr) throw appErr;
    },
    onSuccess: async () => {
      toast.success('Engagement started');
      await queryClient.invalidateQueries({ queryKey: ['recruiter-engagements', organizationId] });
      await queryClient.invalidateQueries({ queryKey: ['recruiter-applications'], exact: false });
      navigate('/recruiter/pipeline');
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(err?.message || 'Failed to start engagement');
    },
  });

  const viewResume = async (fileUrl: string) => {
    try {
      await openResumeInNewTab(fileUrl, { expiresInSeconds: 900 });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to open resume');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        <PageHeader
          title={<>Marketplace <span className="text-accent">Profiles</span></>}
          description="Browse opt-in profiles. When you’re ready, start an engagement workflow to move them into your tenant pipeline."
        />

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Search</CardTitle>
            <CardDescription>Only includes candidates who opted-in to be discoverable.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, title, location…" className="pl-10" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger className="w-full sm:w-[260px]">
                  <SelectValue placeholder="Select job for engagement" />
                </SelectTrigger>
                <SelectContent>
                  {(jobs || []).map((j: any) => (
                    <SelectItem key={j.id} value={String(j.id)} className="max-w-[320px]">
                      <span className="block max-w-[300px] truncate">{j.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary">{filtered.length} profiles</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Profiles</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead label="Profile" sortKey="full_name" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Resume" sortKey="has_resume" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Top skills" sortKey="skills" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Title" sortKey="current_title" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <SortableTableHead label="Company" sortKey="current_company" sort={tableSort.sort} onToggle={tableSort.toggle} />
                      <TableHead className="w-[180px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10">
                          No discoverable profiles found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      sorted.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{p.full_name || 'Candidate'}</span>
                              </div>
                              {p.email ? (
                                <div className="text-xs">{p.email}</div>
                              ) : null}
                              {p.headline ? (
                                <div className="text-xsline-clamp-2">{p.headline}</div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            {p.primary_resume?.file_url ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => viewResume(p.primary_resume!.file_url)}
                              >
                                <FileText className="h-4 w-4 mr-2" />
                                View
                              </Button>
                            ) : (
                              <span className="text-sm">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(p.top_skills || []).length ? (
                                (p.top_skills || []).slice(0, 6).map((s) => (
                                  <Badge key={s} variant="secondary" className="text-xs">
                                    {s}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm">N/A</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="">{p.current_title || 'N/A'}</TableCell>
                          <TableCell className="">{p.current_company || 'N/A'}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              className="btn-glow"
                              onClick={() => startEngagement.mutate(p.id)}
                              disabled={startEngagement.isPending}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Start engagement
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

