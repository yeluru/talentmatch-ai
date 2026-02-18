import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Wand2, X, Loader2, Building2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function CreateJob() {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const organizationId = orgIdForRecruiterSuite(roles);

  // Fetch active clients for this organization
  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['clients', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, status')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const [mode, setMode] = useState<'paste' | 'manual'>('paste');
  const [jdText, setJdText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [lastExtractSource, setLastExtractSource] = useState<'llm' | 'heuristic' | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    work_mode: 'unknown',
    is_remote: false,
    job_type: 'full_time',
    experience_level: 'mid',
    visibility: 'private',
    // We repurpose this as recruiter-only notes / leftover raw metadata.
    requirements: '',
    responsibilities: '',
    required_skills: [] as string[],
    nice_to_have_skills: [] as string[],
    client_id: '' as string,
  });

  const [newSkill, setNewSkill] = useState('');
  const [newNiceSkill, setNewNiceSkill] = useState('');

  const canExtract = useMemo(() => jdText.trim().length >= 40, [jdText]);

  const createJob = useMutation({
    mutationFn: async (status: 'draft' | 'published') => {
      if (!user || !organizationId) throw new Error('Not authorized');

      // Validate client is selected (hard block)
      if (!formData.client_id) {
        throw new Error('Please select a client for this job');
      }

      const { data, error } = await supabase.from('jobs').insert({
        title: formData.title,
        description: formData.description,
        location: formData.location || null,
        work_mode: formData.work_mode || 'unknown',
        is_remote: formData.is_remote,
        job_type: formData.job_type,
        experience_level: formData.experience_level,
        visibility: formData.visibility,
        requirements: formData.requirements || null,
        responsibilities: formData.responsibilities || null,
        required_skills: formData.required_skills,
        nice_to_have_skills: formData.nice_to_have_skills,
        recruiter_id: user.id,
        created_by: user.id,
        organization_id: organizationId,
        client_id: formData.client_id,
        status,
        posted_at: status === 'published' ? new Date().toISOString() : null,
      }).select('id').single();

      if (error) throw error;
      return { jobId: data?.id, status };
    },
    onSuccess: (result, _variables) => {
      queryClient.invalidateQueries({ queryKey: ['recruiter-jobs', organizationId] });
      toast.success(result.status === 'published' ? 'Job published!' : 'Job saved as draft');
      const isAm = roles.some((r) => r.role === 'account_manager');
      if (isAm && result.jobId) {
        navigate(`/manager/jobs?assign=${result.jobId}`);
      } else {
        navigate('/recruiter/jobs');
      }
    },
    onError: (err: any) => {
      console.error('Failed to create job', err);
      toast.error(err?.message ? `Failed to create job: ${err.message}` : 'Failed to create job');
    },
  });

  const handleAddSkill = (type: 'required' | 'nice') => {
    const skill = type === 'required' ? newSkill.trim() : newNiceSkill.trim();
    if (!skill) return;
    
    if (type === 'required') {
      if (!formData.required_skills.includes(skill)) {
        setFormData({ ...formData, required_skills: [...formData.required_skills, skill] });
      }
      setNewSkill('');
    } else {
      if (!formData.nice_to_have_skills.includes(skill)) {
        setFormData({ ...formData, nice_to_have_skills: [...formData.nice_to_have_skills, skill] });
      }
      setNewNiceSkill('');
    }
  };

  const handleRemoveSkill = (skill: string, type: 'required' | 'nice') => {
    if (type === 'required') {
      setFormData({ ...formData, required_skills: formData.required_skills.filter(s => s !== skill) });
    } else {
      setFormData({ ...formData, nice_to_have_skills: formData.nice_to_have_skills.filter(s => s !== skill) });
    }
  };

  const isValid = formData.title.trim() && formData.description.trim() && formData.client_id;

  const dbWorkMode = (jobType: any): 'onsite' | 'hybrid' | 'remote' | 'unknown' => {
    switch (jobType) {
      case 'Onsite': return 'onsite';
      case 'Hybrid': return 'hybrid';
      case 'Remote': return 'remote';
      default: return 'unknown';
    }
  };

  const dbExperienceLevel = (lvl: any): string => {
    switch (lvl) {
      case 'Entry': return 'entry';
      case 'Mid': return 'mid';
      case 'Senior': return 'senior';
      case 'Lead': return 'lead';
      case 'Principal/Architect': return 'principal_architect';
      case 'Manager': return 'manager';
      case 'Director': return 'director';
      default: return 'unknown';
    }
  };

  const formatLocation = (loc: any): string => {
    if (!loc) return '';
    const parts: string[] = [];
    if (loc.site) parts.push(String(loc.site));
    const cityState = [loc.city, loc.state].filter(Boolean).join(', ');
    if (cityState) parts.push(cityState);
    if (loc.country) parts.push(String(loc.country));
    return parts.join(' • ');
  };

  const handleExtractFromJd = async () => {
    if (!canExtract) {
      toast.error('Paste a longer job description (at least a couple of sentences).');
      return;
    }

    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-job-description', {
        body: { text: jdText },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const parsed = data?.parsed as any;
      if (!parsed) throw new Error('No parsed data returned');

      // Merge: never wipe what the recruiter already typed.
      setFormData((prev) => ({
        ...prev,
        // Clean, public-facing JD
        description: prev.description || parsed.jd || '',

        // Fill title if empty.
        title: prev.title || parsed.title || '',

        // Location: keep user edits; fill from parsed location object.
        location: prev.location || formatLocation(parsed.location) || '',

        // Work mode: store in new jobs.work_mode column and derive is_remote.
        work_mode: prev.work_mode !== 'unknown' ? prev.work_mode : dbWorkMode(parsed.job_type),
        is_remote:
          prev.work_mode !== 'unknown'
            ? (prev.work_mode === 'remote' || prev.work_mode === 'hybrid')
            : (dbWorkMode(parsed.job_type) === 'remote' || dbWorkMode(parsed.job_type) === 'hybrid'),

        // Experience level (expanded enum)
        experience_level:
          prev.experience_level !== 'mid' && prev.experience_level !== 'unknown'
            ? prev.experience_level
            : dbExperienceLevel(parsed.experience_level),

        // Skills: map structured buckets into our two lists
        required_skills: prev.required_skills.length
          ? prev.required_skills
          : (parsed?.skills?.core || []),
        nice_to_have_skills: prev.nice_to_have_skills.length
          ? prev.nice_to_have_skills
          : [
              ...(parsed?.skills?.secondary || []),
              ...(parsed?.skills?.methods_tools || []),
              ...(parsed?.skills?.certs || []),
            ],

        // Vendor/private meta only in JD Notes (internal). Avoid generic extraction/debug notes.
        requirements: prev.requirements || parsed.internal_notes || '',
      }));

      setLastExtractSource(data?.source === 'llm' ? 'llm' : 'heuristic');
      setMode('manual');
      toast.success(data?.source === 'llm' ? 'Fields extracted' : 'Basic fields extracted (fallback)');
    } catch (err: any) {
      console.error('JD extraction failed', err);
      toast.error(err?.message ? `Failed to extract: ${err.message}` : 'Failed to extract fields');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                  <Sparkles className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Post a New <span className="text-gradient-recruiter">Job</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Create a job posting to attract top talent
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto w-full">
          <div className="space-y-6 pt-6 pb-6 w-full max-w-5xl">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-recruiter/10 bg-recruiter/5 px-6 pt-6 pb-2">
            <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
              Create a job (fast)
            </h2>
            <p className="text-sm text-muted-foreground font-sans mt-1">
              Paste the JD blurb and we’ll auto-fill, or switch to manual entry.
            </p>
          </div>
          <div className="p-6 space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="flex flex-col flex-1 min-h-0">
              <TabsList className="grid w-full grid-cols-2 shrink-0 rounded-lg border border-border bg-muted/30 p-1 font-sans">
                <TabsTrigger value="paste" className="rounded-lg font-sans data-[state=active]:bg-recruiter/10 data-[state=active]:text-recruiter data-[state=active]:border-recruiter/20">Paste & Auto‑Fill</TabsTrigger>
                <TabsTrigger value="manual" className="rounded-lg font-sans data-[state=active]:bg-recruiter/10 data-[state=active]:text-recruiter data-[state=active]:border-recruiter/20">Manual</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="jdText">Paste job blurb / JD</Label>
                  <Textarea
                    id="jdText"
                    placeholder="Paste the job description you received in email/text…"
                    rows={10}
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                  />
                  <p className="text-xs">
                    We’ll try to extract title, location, remote, job type, experience, salary (if present), and skills. You can edit everything after.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    onClick={handleExtractFromJd}
                    disabled={extracting || !canExtract}
                    className="btn-glow"
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Extract fields
                      </>
                    )}
                  </Button>

                  {lastExtractSource && (
                    <Badge variant="secondary" className="w-fit">
                      Last extract: {lastExtractSource === 'llm' ? 'LLM' : 'Fallback'}
                    </Badge>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="manual" className="pt-3">
                <p className="text-sm">
                  Tip: you can paste a JD first, extract fields, then fine-tune below.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {mode === 'manual' ? (
        <>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Essential details about the position</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Job Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Senior Frontend Developer"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client">Client *</Label>
              <Select
                value={formData.client_id}
                onValueChange={(value) => setFormData({ ...formData, client_id: value })}
              >
                <SelectTrigger id="client" className="w-full">
                  <SelectValue placeholder={clientsLoading ? "Loading clients..." : clients.length === 0 ? "No active clients available" : "Select a client"}>
                    {formData.client_id && clients.find(c => c.id === formData.client_id)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {client.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clients.length === 0 && !clientsLoading && (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No active clients found. Please create a client in Client Management before creating a job.
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                Select which client this job is for. This cannot be changed later.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Job Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe the role, team, and what makes this opportunity exciting..."
                rows={6}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., San Francisco, CA"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="work_mode">Work mode</Label>
                <Select
                  value={formData.work_mode}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      work_mode: value,
                      is_remote: value === 'remote' || value === 'hybrid',
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">Unknown</SelectItem>
                    <SelectItem value="onsite">Onsite</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="visibility">Job visibility</Label>
              <Select
                value={formData.visibility}
                onValueChange={(value) => setFormData({ ...formData, visibility: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (tenant-only)</SelectItem>
                  <SelectItem value="public">Public (marketplace)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs">
                Private jobs are visible only to candidates linked to your organization. Public jobs are visible to all registered candidates.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="job_type">Job Type</Label>
                <Select
                  value={formData.job_type}
                  onValueChange={(value) => setFormData({ ...formData, job_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full-time</SelectItem>
                    <SelectItem value="part_time">Part-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="internship">Internship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience">Experience Level</Label>
                <Select
                  value={formData.experience_level}
                  onValueChange={(value) => setFormData({ ...formData, experience_level: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entry">Entry Level</SelectItem>
                    <SelectItem value="mid">Mid Level</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                    <SelectItem value="lead">Lead / Manager</SelectItem>
                    <SelectItem value="principal_architect">Principal / Architect</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="director">Director</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Salary removed (contracting-first product) */}
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>JD Notes (internal)</CardTitle>
            <CardDescription>
              Anything we didn’t map into fields—rate, deadlines, job codes, client notes, etc. Not intended for the public job post.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="internal_notes">Notes</Label>
            <Textarea
              id="internal_notes"
              placeholder="Paste any leftover details here (rate, hybrid schedule, deadline, internal IDs)…"
              rows={6}
              value={formData.requirements}
              onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
            />
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Skills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Required Skills</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a skill..."
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill('required'))}
                />
                <Button type="button" variant="secondary" onClick={() => handleAddSkill('required')}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.required_skills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="gap-1">
                    {skill}
                    <button onClick={() => handleRemoveSkill(skill, 'required')} className="ml-1">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Nice to Have Skills</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a skill..."
                  value={newNiceSkill}
                  onChange={(e) => setNewNiceSkill(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill('nice'))}
                />
                <Button type="button" variant="secondary" onClick={() => handleAddSkill('nice')}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.nice_to_have_skills.map((skill) => (
                  <Badge key={skill} variant="outline" className="gap-1">
                    {skill}
                    <button onClick={() => handleRemoveSkill(skill, 'nice')} className="ml-1">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        </>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => createJob.mutate('draft')}
            disabled={!isValid || createJob.isPending}
            className="rounded-lg h-11 border-border font-sans"
          >
            {createJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={1.5} /> : null}
            Save as Draft
          </Button>
          <Button
            onClick={() => createJob.mutate('published')}
            disabled={!isValid || createJob.isPending}
            className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold"
          >
            {createJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={1.5} /> : null}
            Publish Job
          </Button>
        </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
