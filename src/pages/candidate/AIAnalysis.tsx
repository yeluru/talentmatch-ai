import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search, Sparkles, Briefcase, ArrowRight, Info } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getSignedResumeUrl } from '@/lib/resumeLinks';

interface Resume {
  id: string;
  file_name: string;
  file_url: string;
  file_type?: string;
  is_primary: boolean | null;
  parsed_content?: any;
}

interface Job {
  id: string;
  title: string;
  description: string;
  organization_name: string;
  location: string | null;
}

interface AnalysisResult {
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  key_strengths?: string[];
  areas_for_improvement?: string[];
  recommendations: string[];
  summary: string;
  diagnostics?: any;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  // Chunked conversion to avoid call stack limits on large files
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function buildResumeTextFromParsed(parsed: any): string {
  const tech = Array.isArray(parsed?.technical_skills) ? parsed.technical_skills : [];
  const soft = Array.isArray(parsed?.soft_skills) ? parsed.soft_skills : [];
  const isPlaceholder = (v: unknown) => {
    const s = String(v ?? '').trim();
    if (!s) return true;
    const n = s.toLowerCase();
    if (n.includes('not found')) return true;
    if (n === 'n/a' || n === 'na' || n === 'unknown') return true;
    return false;
  };

  const lines: string[] = [];
  if (parsed?.full_name && !isPlaceholder(parsed.full_name)) lines.push(`Name: ${parsed.full_name}`);
  if (parsed?.email && !isPlaceholder(parsed.email)) lines.push(`Email: ${parsed.email}`);
  if (parsed?.phone && !isPlaceholder(parsed.phone)) lines.push(`Phone: ${parsed.phone}`);
  if (parsed?.linkedin_url && !isPlaceholder(parsed.linkedin_url)) lines.push(`LinkedIn: ${parsed.linkedin_url}`);
  if (parsed?.github_url && !isPlaceholder(parsed.github_url)) lines.push(`GitHub: ${parsed.github_url}`);
  if (parsed?.location && !isPlaceholder(parsed.location)) lines.push(`Location: ${parsed.location}`);
  if (parsed?.current_title && !isPlaceholder(parsed.current_title)) lines.push(`Current Title: ${parsed.current_title}`);
  if (parsed?.current_company && !isPlaceholder(parsed.current_company)) lines.push(`Current Company: ${parsed.current_company}`);
  if (typeof parsed?.years_of_experience === 'number') lines.push(`Years of Experience: ${parsed.years_of_experience}`);

  if (parsed?.summary) {
    lines.push('');
    lines.push('Professional Summary:');
    lines.push(String(parsed.summary));
  }

  if (tech.length) {
    lines.push('');
    lines.push(`Technical Skills: ${tech.join(', ')}`);
  }
  if (soft.length) {
    lines.push('');
    lines.push(`Soft Skills: ${soft.join(', ')}`);
  }

  // Include structured experience/education if present (DETAILED: bullets matter for ATS matching)
  if (Array.isArray(parsed?.experience) && parsed.experience.length) {
    lines.push('');
    lines.push('Experience:');
    for (const e of parsed.experience) {
      const company = e?.company || e?.company_name || '';
      const title = e?.title || e?.job_title || '';
      const start = e?.start || '';
      const end = e?.end || '';
      const loc = e?.location || '';
      const header = [title, company].filter(Boolean).join(' — ');
      const meta = [start && end ? `${start} → ${end}` : start || end, loc].filter(Boolean).join(' • ');
      if (header) lines.push(header);
      if (meta) lines.push(meta);
      const bullets = Array.isArray(e?.bullets) ? e.bullets : [];
      for (const b of bullets) {
        const s = String(b || '').trim();
        if (s) lines.push(`- ${s}`);
      }
      lines.push('');
    }
  }

  if (Array.isArray(parsed?.education) && parsed.education.length) {
    lines.push('');
    lines.push('Education:');
    for (const ed of parsed.education.slice(0, 10)) {
      const school = ed?.school || ed?.institution || '';
      const degree = ed?.degree || '';
      const field = ed?.field || '';
      const year = ed?.year || ed?.end || ed?.start || '';
      const row = [school, degree, field, year].filter(Boolean).join(' • ');
      if (row) lines.push(`- ${row}`);
    }
  }

  if (Array.isArray(parsed?.certifications) && parsed.certifications.length) {
    lines.push('');
    lines.push('Certifications:');
    for (const c of parsed.certifications.slice(0, 30)) {
      const s = String(c || '').trim();
      if (s) lines.push(`- ${s}`);
    }
  }

  return lines.join('\n').trim();
}

function buildResumeTextFromResumeDoc(doc: any): string {
  const c = doc?.contact || {};
  const tech = Array.isArray(doc?.skills?.technical) ? doc.skills.technical : [];
  const soft = Array.isArray(doc?.skills?.soft) ? doc.skills.soft : [];
  const exp = Array.isArray(doc?.experience) ? doc.experience : [];
  const edu = Array.isArray(doc?.education) ? doc.education : [];
  const certs = Array.isArray(doc?.certifications) ? doc.certifications : [];
  const isPlaceholder = (v: unknown) => {
    const s = String(v ?? '').trim();
    if (!s) return true;
    const n = s.toLowerCase();
    if (n.includes('not found')) return true;
    if (n === 'n/a' || n === 'na' || n === 'unknown') return true;
    return false;
  };

  const lines: string[] = [];
  if (c.full_name && !isPlaceholder(c.full_name)) lines.push(String(c.full_name));
  const contactLine = [c.location, c.phone, c.email, c.linkedin_url, c.github_url]
    .map((v) => String(v ?? '').trim())
    .filter((v) => v && !isPlaceholder(v))
    .join(' • ');
  if (contactLine) lines.push(contactLine);

  if (doc?.summary) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push(String(doc.summary));
  }

  if (tech.length || soft.length) {
    lines.push('');
    lines.push('SKILLS');
    if (tech.length) lines.push(`Technical: ${tech.join(', ')}`);
    if (soft.length) lines.push(`Soft: ${soft.join(', ')}`);
  }

  if (exp.length) {
    lines.push('');
    lines.push('EXPERIENCE');
    for (const e of exp) {
      const header = [e?.title, e?.company].filter(Boolean).join(' — ');
      const meta = [e?.start && e?.end ? `${e.start} → ${e.end}` : e?.start || e?.end, e?.location].filter(Boolean).join(' • ');
      if (header) lines.push(header);
      if (meta) lines.push(meta);
      const bullets = Array.isArray(e?.bullets) ? e.bullets : [];
      for (const b of bullets) {
        const s = String(b || '').trim();
        if (s) lines.push(`- ${s}`);
      }
      lines.push('');
    }
  }

  if (edu.length) {
    lines.push('');
    lines.push('EDUCATION');
    for (const e of edu.slice(0, 12)) {
      const row = [e?.school, e?.degree, e?.field, e?.year].filter(Boolean).join(' • ');
      if (row) lines.push(`- ${row}`);
    }
  }

  if (certs.length) {
    lines.push('');
    lines.push('CERTIFICATIONS');
    for (const c of certs.slice(0, 30)) {
      const s = String(c || '').trim();
      if (s) lines.push(`- ${s}`);
    }
  }

  return lines.join('\n').trim();
}

export default function AIAnalysis() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobInputMode, setJobInputMode] = useState<'existing' | 'custom'>('existing');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    await Promise.all([fetchResumes(), fetchJobs()]);
    // Load the most recent analysis (retain last run)
    await fetchLatestAnalysis();
    setIsLoading(false);
  };

  const fetchLatestAnalysis = async () => {
    try {
      if (!user?.id) return;
      // Defensive: avoid maybeSingle() coercion errors if duplicate candidate_profiles exist.
      const { data: cpRows } = await supabase
        .from('candidate_profiles')
        .select('id, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      const cpId = (cpRows || [])[0]?.id;
      if (!cpId) return;

      const { data, error } = await supabase
        .from('ai_resume_analyses')
        .select('match_score, full_analysis, resume_id, job_id, job_description_text, created_at')
        .eq('candidate_id', cpId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      // Restore last-used inputs best-effort
      if (data.resume_id) setSelectedResumeId(data.resume_id);
      if (data.job_id) {
        setJobInputMode('existing');
        setSelectedJobId(data.job_id);
      }
      if (data.job_description_text) {
        // Always restore the exact JD text that was analyzed (even for existing jobs),
        // so edits are reflected.
        setJobDescription(data.job_description_text);
      } else if (data.job_id) {
        // Fallback: keep stored job description if no saved text (should be rare)
        const j = jobs.find((x) => x.id === data.job_id);
        if (j?.description) setJobDescription(j.description);
      } else {
        setJobInputMode('custom');
      }

      const fa = data.full_analysis as any;
      if (fa && typeof fa === 'object' && typeof fa.match_score === 'number') {
        setAnalysisResult({
          match_score: fa.match_score,
          matched_skills: Array.isArray(fa.matched_skills) ? fa.matched_skills : [],
          missing_skills: Array.isArray(fa.missing_skills) ? fa.missing_skills : [],
          key_strengths: Array.isArray(fa.key_strengths) ? fa.key_strengths : undefined,
          areas_for_improvement: Array.isArray(fa.areas_for_improvement) ? fa.areas_for_improvement : undefined,
          recommendations: Array.isArray(fa.recommendations) ? fa.recommendations : [],
          summary: typeof fa.summary === 'string' ? fa.summary : '',
          diagnostics: fa?.diagnostics || null,
        });
      }
    } catch (e) {
      console.warn('Failed to load latest analysis', e);
    }
  };

  const fetchResumes = async () => {
    try {
      // Defensive: avoid single() coercion errors if duplicate candidate_profiles exist.
      const { data: cpRows } = await supabase
        .from('candidate_profiles')
        .select('id, updated_at')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      const cpData = (cpRows || [])[0];
      if (cpData?.id) {
        setCandidateId(cpData.id);

        const { data: resumesData } = await supabase
          .from('resumes')
          .select('id, file_name, file_url, file_type, is_primary, parsed_content')
          .eq('candidate_id', cpData.id);

        const list = (resumesData || []) as Resume[];
        // Prefer Resume Workspace generated resumes for consistency (same resume_doc used for tailoring).
        const sorted = [...list].sort((a, b) => {
          const aGen = (a as any)?.parsed_content?.source === 'resume_workspace' ? 1 : 0;
          const bGen = (b as any)?.parsed_content?.source === 'resume_workspace' ? 1 : 0;
          if (aGen !== bGen) return bGen - aGen;
          // Keep primary near the top among same type
          const aP = a.is_primary ? 1 : 0;
          const bP = b.is_primary ? 1 : 0;
          return bP - aP;
        });

        setResumes(sorted);
        // Default selection: most recent saved analysis wins; otherwise prefer generated; otherwise primary.
        if (!selectedResumeId) {
          const generated = sorted.find((r) => (r as any)?.parsed_content?.source === 'resume_workspace');
          const primaryResume = sorted.find((r) => r.is_primary);
          const pick = generated || primaryResume || sorted[0];
          if (pick?.id) setSelectedResumeId(pick.id);
        }
      }
    } catch (error) {
      console.error('Error fetching resumes:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('id, title, description, location, organization_id')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(100);

      if (jobsData) {
        // Fetch organization names
        const orgIds = [...new Set(jobsData.map(j => j.organization_id))];
        const { data: orgsData } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', orgIds);

        const orgMap = new Map(orgsData?.map(o => [o.id, o.name]) || []);

        setJobs(jobsData.map(j => ({
          id: j.id,
          title: j.title,
          description: j.description,
          location: j.location,
          organization_name: orgMap.get(j.organization_id) || 'Unknown Company',
        })));
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const filteredJobs = jobs.filter(job => 
    job.title.toLowerCase().includes(jobSearchQuery.toLowerCase()) ||
    job.organization_name.toLowerCase().includes(jobSearchQuery.toLowerCase())
  );

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      setJobDescription(job.description);
    }
  };

  const getEffectiveJobDescription = () => {
    if (jobInputMode === 'existing') {
      // IMPORTANT: allow editing even when starting from an existing job
      return jobDescription;
    }
    return jobDescription;
  };

  const handleAnalyze = async () => {
    if (!selectedResumeId) {
      toast.error('Please select a resume');
      return;
    }

    const effectiveJD = getEffectiveJobDescription();
    if (!effectiveJD.trim()) {
      toast.error('Please provide a job description');
      return;
    }

    const selectedResume = resumes.find(r => r.id === selectedResumeId);
    if (!selectedResume) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      // Prefer resume_workspace generated structured doc when available (ensures consistency with Resume Workspace score).
      const pc = (selectedResume as any)?.parsed_content;
      const resumeDoc = pc?.resume_doc;
      if (pc?.source === 'resume_workspace' && resumeDoc && typeof resumeDoc === 'object') {
        const resumeText = buildResumeTextFromResumeDoc(resumeDoc);
        if (!resumeText || resumeText.length < 50) throw new Error('Saved resume_doc produced insufficient text to analyze');

        const { data, error } = await supabase.functions.invoke('analyze-resume', {
          body: {
            resumeText,
            jobDescription: effectiveJD,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.analysis) throw new Error('No analysis returned');

        setAnalysisResult({ ...(data.analysis as any), diagnostics: (data as any)?.diagnostics || null });
        // Save analysis to database (same as below)
        if (candidateId) {
          const { error: insertErr } = await supabase.from('ai_resume_analyses').insert({
            candidate_id: candidateId,
            resume_id: selectedResumeId,
            job_id: jobInputMode === 'existing' ? (selectedJobId || null) : null,
            job_description_text: effectiveJD,
            match_score: data.analysis.match_score,
            matched_skills: data.analysis.matched_skills,
            missing_skills: data.analysis.missing_skills,
            recommendations: data.analysis.recommendations,
            full_analysis: { ...(data.analysis as any), diagnostics: (data as any)?.diagnostics || null },
          });
          if (insertErr) {
            console.error('Failed to save analysis', insertErr);
            toast.error(`Analysis ran, but couldn’t save history (${insertErr.message})`);
          } else {
            await queryClient.invalidateQueries({ queryKey: ['latest-ai-analysis', candidateId] });
          }
        }

        toast.success('Analysis complete!');
        return;
      }

      // Otherwise, build a real resumeText from parse-resume extraction.
      const signedUrl = await getSignedResumeUrl(selectedResume.file_url, { expiresInSeconds: 900 });

      const resp = await fetch(signedUrl);
      if (!resp.ok) throw new Error(`Failed to download resume (${resp.status})`);
      const buf = await resp.arrayBuffer();
      const fileBase64 = arrayBufferToBase64(buf);

      const { data: parsedResp, error: parseErr } = await supabase.functions.invoke('parse-resume', {
        body: {
          fileBase64,
          fileName: selectedResume.file_name,
          fileType: selectedResume.file_type || 'application/octet-stream',
        },
      });
      if (parseErr) throw parseErr;
      const parsed = (parsedResp as any)?.parsed;
      if (!parsed) throw new Error('Resume parse failed (no parsed output)');

      const extractedText = String((parsedResp as any)?.extracted_text || '').trim();
      let resumeText = buildResumeTextFromParsed(parsed);
      // Reliability fallback: DOCX (and some PDFs) can yield weak structure even when extracted_text is good.
      if (!resumeText || resumeText.trim().length < 50) {
        resumeText = extractedText;
      }
      if (!resumeText || resumeText.trim().length < 50) {
        throw new Error('Resume parse produced insufficient text to analyze');
      }

      const { data, error } = await supabase.functions.invoke('analyze-resume', {
        body: {
          resumeText,
          jobDescription: effectiveJD,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.analysis) throw new Error('No analysis returned');

      setAnalysisResult({ ...(data.analysis as any), diagnostics: (data as any)?.diagnostics || null });

      // Save analysis to database
      if (candidateId) {
        const { error: insertErr } = await supabase.from('ai_resume_analyses').insert({
          candidate_id: candidateId,
          resume_id: selectedResumeId,
          job_id: jobInputMode === 'existing' ? (selectedJobId || null) : null,
          job_description_text: effectiveJD,
          match_score: data.analysis.match_score,
          matched_skills: data.analysis.matched_skills,
          missing_skills: data.analysis.missing_skills,
          recommendations: data.analysis.recommendations,
          full_analysis: { ...(data.analysis as any), diagnostics: (data as any)?.diagnostics || null },
        });
        if (insertErr) {
          console.error('Failed to save analysis', insertErr);
          toast.error(`Analysis ran, but couldn’t save history (${insertErr.message})`);
        } else {
          // Refresh dashboard stat card and any other consumers
          await queryClient.invalidateQueries({ queryKey: ['latest-ai-analysis', candidateId] });
        }
      }

      toast.success('Analysis complete!');
    } catch (err: unknown) {
      console.error('Error analyzing resume:', err);

      // Supabase Functions errors often include a Response in err.context
      const anyErr = err as any;
      const ctx = anyErr?.context;

      let message: string | null = null;

      // Try to read JSON/text from the underlying Response
      if (ctx && typeof ctx === 'object' && typeof ctx.status === 'number') {
        try {
          const cloned = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
          if (typeof cloned.json === 'function') {
            const body = await cloned.json();
            message = body?.error ? String(body.error) : null;
          } else if (typeof cloned.text === 'function') {
            const t = await cloned.text();
            message = t ? String(t) : null;
          }

          if (!message) {
            message = `Analyze failed (status ${ctx.status})`;
          }
        } catch {
          message = `Analyze failed (status ${ctx.status})`;
        }
      }

      if (!message) {
        message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Failed to analyze resume. Please try again.';
      }

      toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent Match';
    if (score >= 60) return 'Good Match';
    if (score >= 40) return 'Partial Match';
    return 'Needs Improvement';
  };

  const missingPhrases: string[] = Array.isArray((analysisResult as any)?.diagnostics?.keyword_coverage?.missing)
    ? ((analysisResult as any).diagnostics.keyword_coverage.missing as string[])
    : [];
  const matchedPhraseCount: number =
    typeof (analysisResult as any)?.diagnostics?.keyword_coverage?.matched_count === 'number'
      ? (analysisResult as any).diagnostics.keyword_coverage.matched_count
      : 0;
  const totalPhraseCount: number =
    typeof (analysisResult as any)?.diagnostics?.keyword_coverage?.total === 'number'
      ? (analysisResult as any).diagnostics.keyword_coverage.total
      : 0;

  const topKeywordGaps = missingPhrases.slice(0, 5);
  const topSkillGaps = (analysisResult?.missing_skills || []).slice(0, 5);
  const topRecommendations = (analysisResult?.recommendations || []).slice(0, 5);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <TooltipProvider>
      <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
        <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-accent" />
                <h1 className="font-display text-3xl font-bold">ATS Checkpoint</h1>
              </div>
          <p className="mt-1">
                Optimize for ATS shortlisting. The canonical score comes from deterministic JD keyword coverage + a model estimate.
          </p>
        </div>
                  </div>

          {/* Inputs (top panel) */}
          <Card className="bg-gradient-to-br from-primary/5 via-background to-background">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Job Description
                </Label>
                <Tabs value={jobInputMode} onValueChange={(v) => setJobInputMode(v as 'existing' | 'custom')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="existing">Select Job</TabsTrigger>
                    <TabsTrigger value="custom">Paste JD</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="existing" className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                      <Input
                        placeholder="Search jobs by title or company..."
                        value={jobSearchQuery}
                        onChange={(e) => setJobSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="max-h-[240px] overflow-y-auto space-y-2 border rounded-md p-2 bg-background">
                      {filteredJobs.length === 0 ? (
                        <p className="text-sm text-center py-4">
                          {jobs.length === 0 ? 'No published jobs available' : 'No jobs match your search'}
                        </p>
                      ) : (
                        filteredJobs.slice(0, 20).map((job) => (
                          <div
                            key={job.id}
                            className={`p-3 rounded-md cursor-pointer transition-colors ${
                              selectedJobId === job.id ? 'bg-primary/10 border border-primary' : 'bg-muted/50 hover:bg-muted'
                            }`}
                            onClick={() => handleJobSelect(job.id)}
                          >
                            <p className="font-medium text-sm">{job.title}</p>
                            <p className="text-xs">
                              {job.organization_name} {job.location && `• ${job.location}`}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="custom">
                    <Textarea
                      placeholder="Paste the job description here..."
                      rows={10}
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="w-full md:max-w-[520px] space-y-2">
                  <Label>Resume</Label>
                  <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a resume" />
                    </SelectTrigger>
                    <SelectContent>
                      {resumes.map((resume) => (
                        <SelectItem key={resume.id} value={resume.id}>
                          {resume.file_name}{' '}
                          {(resume as any)?.parsed_content?.source === 'resume_workspace'
                            ? '(Generated — Resume Workspace)'
                            : resume.is_primary
                              ? '(Primary)'
                              : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!resumes.length && (
                    <div className="text-xs">
                      No resumes yet. <a className="underline" href="/candidate/resumes">Upload one</a>.
                    </div>
                  )}
                </div>

                <div className="w-full md:w-auto">
            <Button 
              onClick={handleAnalyze} 
              disabled={isAnalyzing || !selectedResumeId || !getEffectiveJobDescription().trim()}
                    className="w-full md:w-auto"
                    size="default"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Running...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                        Run check
                </>
              )}
            </Button>
          </div>
              </div>
            </CardContent>
          </Card>

          {/* Results (bottom panel) */}
          <div className="space-y-6">
              {!analysisResult ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="max-w-xl mx-auto text-center space-y-2">
                      <div className="text-2xl font-semibold">Run a check</div>
                      <div className="">
                        Select your resume and paste/select a JD. We’ll show exactly what phrases to add to raise the canonical score.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="border-primary bg-gradient-to-br from-primary/5 via-background to-background">
                    <CardContent className="pt-6">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="text-smflex items-center gap-2">
                            ATS match score (canonical)
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center">
                                  <Info className="h-4 w-4" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Canonical score = deterministic JD keyword coverage blended with a model estimate.
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className={`text-5xl font-bold tracking-tight ${getScoreColor(analysisResult.match_score)}`}>
                            {analysisResult.match_score}%
                          </div>
                          <div className="mt-1 text-sm font-medium text-foreground">{getScoreLabel(analysisResult.match_score)}</div>
                        {/* ATS Checkpoint is for findings; edits happen in Resume Workspace */}
                        </div>

                        <div className="w-full md:max-w-[420px]">
                          <Progress value={analysisResult.match_score} className="h-2" />
                          {analysisResult.diagnostics?.scoring && (
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-md border bg-background p-2">
                                <div className="font-medium text-foreground">Keyword coverage</div>
                                <div>
                                  {analysisResult.diagnostics.scoring.keyword_coverage_score}% · {matchedPhraseCount}/{totalPhraseCount} phrases
                                </div>
                              </div>
                              <div className="rounded-md border bg-background p-2">
                                <div className="font-medium text-foreground">Model estimate</div>
                                <div>{analysisResult.diagnostics.scoring.model_score}%</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                  </CardContent>
                </Card>

                  {String(analysisResult.summary || '').trim() ? (
                    <Card className="card-elevated">
                  <CardHeader>
                        <CardTitle className="text-base">Summary</CardTitle>
                        <CardDescription>What the analysis thinks you should do next.</CardDescription>
                  </CardHeader>
                  <CardContent>
                        <div className="text-smwhitespace-pre-wrap">
                          {analysisResult.summary}
                    </div>
                  </CardContent>
                </Card>
                  ) : null}

                  <div className="grid gap-6 lg:grid-cols-3">
                    <Card className="card-elevated">
                      <CardHeader>
                        <CardTitle className="text-base">Top keyword gaps (verbatim)</CardTitle>
                        <CardDescription>Top phrases not found verbatim in your resume text.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {topKeywordGaps.length ? (
                          <div className="flex flex-wrap gap-2">
                            {topKeywordGaps.map((k, i) => (
                              <Badge key={`${k}-${i}`} variant="secondary">
                                {k}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm">No keyword gaps detected.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="card-elevated">
                      <CardHeader>
                        <CardTitle className="text-base">Top skill gaps (model)</CardTitle>
                        <CardDescription>Model-inferred skills to consider adding (only if true).</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {topSkillGaps.length ? (
                          <div className="flex flex-wrap gap-2">
                            {topSkillGaps.map((s, i) => (
                              <Badge key={`${s}-${i}`} variant="outline" className="border-destructive/20 text-destructive">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm">No model skill gaps detected.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="card-elevated">
                      <CardHeader>
                        <CardTitle className="text-base">Top recommendations</CardTitle>
                        <CardDescription>Highest impact edits suggested by the analysis.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {topRecommendations.length ? (
                          <ul className="space-y-2 text-sm">
                            {topRecommendations.map((rec, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="mt-1">•</span>
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-sm">No recommendations available.</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Accordion type="multiple" className="w-full" defaultValue={['matched']}>
                    <AccordionItem value="keywords">
                      <AccordionTrigger>All keyword gaps (verbatim)</AccordionTrigger>
                      <AccordionContent>
                        {missingPhrases.length ? (
                          <div className="rounded-md border bg-background p-3">
                            <ScrollArea className="h-[260px]">
                              <div className="flex flex-wrap gap-2">
                                {missingPhrases.slice(0, 120).map((k, i) => (
                                  <Badge key={`${k}-${i}`} variant="secondary">
                                    {k}
                                  </Badge>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        ) : (
                          <div className="text-sm">No keyword gaps detected.</div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="matched">
                      <AccordionTrigger>Matched skills</AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-wrap gap-2">
                          {analysisResult.matched_skills.slice(0, 60).map((s, i) => (
                            <Badge key={`${s}-${i}`} variant="outline">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="missing">
                      <AccordionTrigger>Missing skills (model)</AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-wrap gap-2">
                          {analysisResult.missing_skills.slice(0, 60).map((s, i) => (
                            <Badge key={`${s}-${i}`} variant="outline" className="border-destructive/20 text-destructive">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </>
            )}
          </div>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
