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
import { Loader2, Search, Sparkles, Briefcase, ArrowRight, Info, Target, BrainCircuit, Zap, FileText } from 'lucide-react';
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
          <Loader2 className="h-8 w-8 animate-spin text-primary" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="flex flex-col flex-1 min-h-0 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500">

          {/* Header & Controls Section */}
          <div className="shrink-0 flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    <Sparkles className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">ATS <span className="text-gradient-candidate">Checkpoint</span></h1>
                </div>
                <p className="text-lg text-muted-foreground font-sans">
                  Optimize your resume for applicant tracking systems with AI-driven insights.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !selectedResumeId || !getEffectiveJobDescription().trim()}
                  className="rounded-lg border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-sans font-semibold shadow-lg px-6 h-11 text-sm"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      Run Analysis
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Compact Control Bar */}
            <div className="rounded-xl border border-border bg-card p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start transition-all duration-300 hover:border-blue-500/20">
              {/* JD Input */}
              <div className="lg:col-span-7 space-y-2">
                <Label className="text-sm font-sans font-semibold text-muted-foreground flex items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Target Job
                </Label>
                <Tabs value={jobInputMode} onValueChange={(v) => setJobInputMode(v as 'existing' | 'custom')} className="w-full flex flex-col flex-1 min-h-0">
                  <div className="shrink-0">
                    <TabsList className="bg-muted/30 border border-blue-500/10 p-1 h-9 mb-2 w-fit rounded-lg">
                      <TabsTrigger value="existing" className="h-8 text-xs font-sans px-3 rounded-md data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400">Select Job</TabsTrigger>
                      <TabsTrigger value="custom" className="h-8 text-xs font-sans px-3 rounded-md data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400">Paste JD</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="existing" className="m-0 flex-1 min-h-0 data-[state=inactive]:hidden">
                    {/* Compact Job Selector */}
                    <div className="relative group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-blue-500 transition-colors" strokeWidth={1.5} />
                      <Input
                        placeholder="Search active jobs..."
                        value={jobSearchQuery}
                        onChange={(e) => setJobSearchQuery(e.target.value)}
                        className="pl-9 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-blue-500/20 text-sm font-sans"
                      />
                      {filteredJobs.length > 0 && jobSearchQuery && (
                        <div className="absolute top-full left-0 right-0 mt-1 max-h-[300px] overflow-y-auto border border-border rounded-xl bg-card shadow-lg z-50 p-1">
                          {filteredJobs.slice(0, 10).map((job) => (
                            <button
                              key={job.id}
                              onClick={() => { handleJobSelect(job.id); setJobSearchQuery(''); }}
                              className="w-full text-left p-2 rounded-lg hover:bg-blue-500/10 transition-colors text-sm font-sans"
                            >
                              <div className="font-medium text-foreground">{job.title}</div>
                              <div className="text-xs text-muted-foreground">{job.organization_name}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedJobId && (
                      <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <span className="font-semibold">Selected:</span>
                        {jobs.find(j => j.id === selectedJobId)?.title || 'Unknown Job'}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="custom" className="m-0 flex-1 min-h-0 data-[state=inactive]:hidden">
                    <Textarea
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste job description text here..."
                      className="min-h-[80px] h-[80px] resize-y rounded-lg border-border bg-background focus:ring-2 focus:ring-blue-500/20 text-sm font-sans leading-relaxed"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Resume Selector */}
              <div className="lg:col-span-5 space-y-2">
                <Label className="text-sm font-sans font-semibold text-muted-foreground flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Resume Profile
                </Label>
                <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                  <SelectTrigger className="h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-blue-500/20 text-sm font-sans">
                    <SelectValue placeholder="Select a resume version" />
                  </SelectTrigger>
                  <SelectContent>
                    {resumes.map((resume) => (
                      <SelectItem key={resume.id} value={resume.id}>
                        <span className="font-medium">{resume.file_name}</span>
                        <span className="ml-2 text-muted-foreground text-xs">
                          {resume.is_primary ? '(Primary)' : ''}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!resumes.length && (
                  <div className="text-sm font-sans text-muted-foreground">
                    No resumes found. <a href="/candidate/resumes" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Upload one</a>.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results Area — scrolls inside this container */}
          <div className="flex-1 min-h-0 overflow-y-auto">
          {!analysisResult ? (
            <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center justify-center text-center min-h-[400px] transition-all duration-300 hover:border-blue-500/20">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-blue-500" strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-display font-bold text-foreground mb-2">Ready to Analyze</h3>
              <p className="text-muted-foreground font-sans text-base max-w-md">
                Select a resume and a job description above to get a comprehensive ATS compatibility report.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch animate-in slide-in-from-bottom-4 duration-700">

              {/* 1. Score Card (Hero) */}
              <div className="rounded-xl border border-border bg-card p-6 md:col-span-1 relative overflow-hidden group min-h-[300px] flex flex-col justify-between transition-all duration-300 hover:border-blue-500/20 h-full">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <h3 className="text-sm font-display font-bold text-muted-foreground flex items-center gap-2">
                    <Info className="h-4 w-4" strokeWidth={1.5} /> Canonical Match
                  </h3>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className={`text-7xl font-bold tracking-tighter ${getScoreColor(analysisResult.match_score)}`}>
                      {analysisResult.match_score}
                    </span>
                    <span className="text-xl text-muted-foreground font-medium">%</span>
                  </div>
                  <div className="mt-2 text-lg font-sans font-medium text-foreground">
                    {getScoreLabel(analysisResult.match_score)}
                  </div>
                </div>
                <div className="relative z-10 pt-6 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm font-sans font-medium">
                      <span className="text-muted-foreground">Keyword Coverage</span>
                      <span className="text-foreground">{analysisResult.diagnostics?.scoring?.keyword_coverage_score ?? 0}%</span>
                    </div>
                    <Progress value={analysisResult.diagnostics?.scoring?.keyword_coverage_score ?? 0} className="h-1.5 bg-background/30" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm font-sans font-medium">
                      <span className="text-muted-foreground">Semantic Relevance</span>
                      <span className="text-foreground">{analysisResult.diagnostics?.scoring?.model_score ?? 0}%</span>
                    </div>
                    <Progress value={analysisResult.diagnostics?.scoring?.model_score ?? 0} className="h-1.5 bg-background/30" />
                  </div>
                </div>
              </div>

              {/* 2. AI Summary Card */}
              <div className="rounded-xl border border-border bg-card p-6 md:col-span-2 flex flex-col transition-all duration-300 hover:border-blue-500/20 h-full min-h-0">
                <div className="shrink-0 flex items-center justify-between mb-4">
                  <h3 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4" strokeWidth={1.5} /> Strategic Summary
                  </h3>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <p className="text-base font-sans leading-relaxed text-foreground/90 italic">
                    “{analysisResult.summary}”
                  </p>
                </div>
                <div className="shrink-0 grid grid-cols-3 gap-6 mt-8 pt-6 border-t border-border">
                  <div className="text-center">
                    <div className="text-2xl font-display font-bold text-emerald-500 dark:text-emerald-400">{matchedPhraseCount}</div>
                    <div className="text-xs font-sans text-muted-foreground uppercase tracking-wide">Matches</div>
                  </div>
                  <div className="text-center border-x border-border">
                    <div className="text-2xl font-display font-bold text-destructive">{missingPhrases.length}</div>
                    <div className="text-xs font-sans text-muted-foreground uppercase tracking-wide">Missing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-display font-bold text-blue-600 dark:text-blue-400">{topRecommendations.length}</div>
                    <div className="text-xs font-sans text-muted-foreground uppercase tracking-wide">Edits</div>
                  </div>
                </div>
              </div>

              {/* 3. Top Critical Gaps (Verbatim) */}
              <div className="rounded-xl border border-border bg-card p-6 space-y-4 transition-all duration-300 hover:border-blue-500/20 h-full flex flex-col min-h-0">
                <h3 className="text-lg font-display font-bold text-foreground flex items-center gap-2 shrink-0">
                  <Target className="h-4 w-4" strokeWidth={1.5} /> Critical Keyword Gaps
                </h3>
                <div className="flex flex-wrap gap-1.5 flex-1 min-h-0 overflow-y-auto">
                  {topKeywordGaps.length > 0 ? topKeywordGaps.map((k, i) => (
                    <Badge key={i} variant="outline" className="border-destructive/20 text-destructive font-sans py-1 px-2 text-xs font-medium">
                      {k}
                    </Badge>
                  )) : <p className="text-sm font-sans text-muted-foreground">No critical verbatim gaps.</p>}
                </div>
                <p className="text-sm font-sans text-muted-foreground leading-relaxed shrink-0 pt-2">
                  Add these exact phrases to your skills or bullet points to immediately improve ATS visibility.
                </p>
              </div>

              {/* 4. Model-Inferred Skill Gaps */}
              <div className="rounded-xl border border-border bg-card p-6 space-y-4 transition-all duration-300 hover:border-blue-500/20 h-full flex flex-col min-h-0">
                <h3 className="text-lg font-display font-bold text-foreground flex items-center gap-2 shrink-0">
                  <Zap className="h-4 w-4" strokeWidth={1.5} /> Inferred Skill Gaps
                </h3>
                <div className="flex flex-wrap gap-1.5 flex-1 min-h-0 overflow-y-auto">
                  {topSkillGaps.length > 0 ? topSkillGaps.map((k, i) => (
                    <Badge key={i} variant="outline" className="border-orange-500/20 text-orange-600 dark:text-orange-400 bg-orange-500/5 py-1 px-2 text-xs font-sans font-medium">
                      {k}
                    </Badge>
                  )) : <p className="text-sm font-sans text-muted-foreground">Semantic skills align well.</p>}
                </div>
                <p className="text-sm font-sans text-muted-foreground leading-relaxed shrink-0 pt-2">
                  The AI suggests these concepts are highly relevant to the role but missing from your profile.
                </p>
              </div>

              {/* 5. Key Recommendations */}
              <div className="rounded-xl border border-border bg-card p-6 space-y-4 transition-all duration-300 hover:border-blue-500/20 h-full flex flex-col min-h-0">
                <h3 className="text-lg font-display font-bold text-foreground flex items-center gap-2 shrink-0">
                  <Sparkles className="h-4 w-4" strokeWidth={1.5} /> Action Plan
                </h3>
                <div className="space-y-3">
                  {topRecommendations.slice(0, 3).map((rec, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="h-5 w-5 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{i + 1}</span>
                      </div>
                      <p className="text-[13px] leading-snug text-foreground/80">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 6. Deep Dive Accordion (Full Width) */}
              <div className="md:col-span-3 rounded-xl border border-border bg-card p-0 overflow-hidden">
                <Accordion type="single" collapsible className="w-full" defaultValue="details">
                  <AccordionItem value="details" className="border-b-0">
                    <AccordionTrigger className="px-6 py-3.5 hover:bg-blue-500/5 transition-colors text-sm font-display font-semibold text-foreground border-b border-blue-500/10">
                      Detailed Keyword Inventory
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-6 pt-2">
                      <Tabs defaultValue="missing" className="w-full flex flex-col flex-1 min-h-0">
                        <div className="shrink-0 flex items-center justify-between mb-4">
                          <TabsList className="bg-muted/30 border border-blue-500/10 p-1 h-9 rounded-lg">
                            <TabsTrigger value="missing" className="h-8 text-xs font-sans px-4 rounded-md data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400">Missing ({missingPhrases.length})</TabsTrigger>
                            <TabsTrigger value="matched" className="h-8 text-xs font-sans px-4 rounded-md data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400">Matched ({matchedPhraseCount})</TabsTrigger>
                          </TabsList>
                          <span className="text-xs font-sans text-muted-foreground uppercase tracking-wide font-medium">Verbatim Analysis</span>
                        </div>
                        <TabsContent value="missing" className="m-0 flex-1 min-h-0 data-[state=inactive]:hidden">
                          <ScrollArea className="h-[240px] w-full rounded-xl border border-border bg-blue-500/5 p-4">
                            <div className="flex flex-wrap gap-2">
                              {missingPhrases.map((k, i) => (
                                <Badge key={i} variant="secondary" className="bg-muted/50 hover:bg-muted text-muted-foreground border-border text-xs font-sans py-1">
                                  {k}
                                </Badge>
                              ))}
                            </div>
                          </ScrollArea>
                        </TabsContent>
                        <TabsContent value="matched" className="m-0 flex-1 min-h-0 data-[state=inactive]:hidden">
                          <ScrollArea className="h-[240px] w-full rounded-xl border border-border bg-blue-500/5 p-4">
                            <div className="flex flex-wrap gap-2">
                              {analysisResult.matched_skills.map((k, i) => (
                                <Badge key={i} variant="outline" className="border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 text-xs font-sans py-1">
                                  {k}
                                </Badge>
                              ))}
                            </div>
                          </ScrollArea>
                        </TabsContent>
                      </Tabs>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

            </div>
          )}
          </div>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
