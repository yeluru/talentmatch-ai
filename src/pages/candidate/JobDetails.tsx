import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, MapPin, Briefcase, Clock, Building2, ArrowLeft, Send, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface Job {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  responsibilities: string | null;
  location: string | null;
  is_remote: boolean | null;
  job_type: string | null;
  experience_level: string | null;
  required_skills: string[] | null;
  nice_to_have_skills: string[] | null;
  posted_at: string | null;
  closes_at: string | null;
  organization: { name: string; logo_url: string | null; description: string | null } | null;
}

interface Resume {
  id: string;
  file_name: string;
  is_primary: boolean | null;
}

export default function JobDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [coverLetter, setCoverLetter] = useState('');

  useEffect(() => {
    if (id && user) {
      fetchJobDetails();
    }
  }, [id, user]);

  const fetchJobDetails = async () => {
    try {
      // Fetch job details
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select(`
          *,
          organization:organizations(name, logo_url, description)
        `)
        .eq('id', id)
        .single();

      if (jobError) throw jobError;
      setJob(jobData);

      // Fetch candidate profile and resumes
      const { data: cpData, error: cpError } = await supabase
        .from('candidate_profiles')
        .select('id, updated_at')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (cpError) throw cpError;
      const cp = (cpData || [])[0] as any;
      if (!cp?.id) throw new Error('Candidate profile not found');
      setCandidateId(cp.id);

      // Check if already applied
      const { data: applicationRows } = await supabase
        .from('applications')
        .select('id')
        .eq('job_id', id)
        .eq('candidate_id', cp.id)
        .order('applied_at', { ascending: false })
        .limit(1);

      setHasApplied(Boolean((applicationRows || [])[0]?.id));

      // Fetch resumes
      const { data: resumesData } = await supabase
        .from('resumes')
        .select('id, file_name, is_primary')
        .eq('candidate_id', cp.id);

      setResumes(resumesData || []);
      const primaryResume = resumesData?.find(r => r.is_primary);
      if (primaryResume) {
        setSelectedResumeId(primaryResume.id);
      }
    } catch (error) {
      console.error('Error fetching job details:', error);
      toast.error('Failed to load job details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = async () => {
    if (!candidateId || !selectedResumeId) {
      toast.error('Please select a resume');
      return;
    }

    setIsApplying(true);
    try {
      const { error } = await supabase
        .from('applications')
        .insert({
          job_id: id!,
          candidate_id: candidateId,
          resume_id: selectedResumeId,
          cover_letter: coverLetter || null,
          status: 'applied',
        });

      if (error) throw error;

      setHasApplied(true);
      setShowApplyDialog(false);
      toast.success('Application submitted successfully!');
    } catch (error) {
      console.error('Error applying:', error);
      toast.error('Failed to submit application');
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
          <div className="shrink-0 flex flex-col gap-4">
            <Button variant="ghost" onClick={() => navigate('/candidate/jobs')} className="rounded-lg w-fit -ml-2">
              <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.5} />
              Back to Jobs
            </Button>
            <div className="rounded-xl border border-dashed border-blue-500/20 bg-blue-500/5 p-12 text-center">
              <h2 className="text-xl font-display font-bold text-foreground">Job not found</h2>
              <p className="mt-2 text-muted-foreground font-sans text-sm">This job may have been removed or the link is incorrect.</p>
              <Button onClick={() => navigate('/candidate/jobs')} className="mt-6 rounded-lg h-11 px-6 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-sans font-semibold">
                Back to Jobs
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="shrink-0 flex flex-col gap-6">
          <Button variant="ghost" onClick={() => navigate('/candidate/jobs')} className="rounded-lg w-fit -ml-2 font-sans font-medium text-muted-foreground hover:text-foreground hover:bg-blue-500/5">
            <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.5} />
            Back to Jobs
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-2 pb-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Job Header */}
            <div className="rounded-xl border border-border bg-card p-8 relative overflow-hidden transition-all duration-300 hover:border-blue-500/20">
              <div className="absolute top-0 right-0 p-4 opacity-50">
                <Building2 className="h-48 w-48 text-muted-foreground/5 -rotate-12" strokeWidth={1.5} />
              </div>
              <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start">
                <div className="h-24 w-24 rounded-2xl bg-muted/30 flex items-center justify-center p-2 border border-border shrink-0">
                  {job.organization?.logo_url ? (
                    <img src={job.organization.logo_url} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <Building2 className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
                  )}
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground leading-tight">{job.title}</h1>
                  <p className="text-xl text-muted-foreground font-sans font-medium">{job.organization?.name}</p>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {job.location && (
                      <Badge variant="outline" className="text-sm font-sans py-1 px-3 border-border bg-background">
                        <MapPin className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
                        {job.location}
                      </Badge>
                    )}
                    {(job as any).work_mode && (job as any).work_mode !== 'unknown' ? (
                      <Badge variant="secondary" className="capitalize text-sm font-sans py-1 px-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                        {(job as any).work_mode}
                      </Badge>
                    ) : job.is_remote ? (
                      <Badge variant="secondary" className="text-sm font-sans py-1 px-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Remote</Badge>
                    ) : null}
                    {job.job_type && (
                      <Badge variant="outline" className="capitalize text-sm font-sans py-1 px-3 border-border bg-background">
                        {job.job_type.replace('_', ' ')}
                      </Badge>
                    )}
                    {job.experience_level && (
                      <Badge variant="outline" className="capitalize text-sm font-sans py-1 px-3 border-border bg-background">
                        {job.experience_level}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Job Description */}
            <div className="rounded-xl border border-border bg-card p-8 transition-all duration-300 hover:border-blue-500/20">
              <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-2 text-foreground">
                <Briefcase className="h-5 w-5 text-blue-500" strokeWidth={1.5} />
                About this role
              </h2>
              <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground font-sans leading-relaxed whitespace-pre-wrap">
                {job.description}
              </div>
            </div>

            {/* NOTE: responsibilities/requirements may contain internal recruiter notes; do not render in candidate view. */}

            {/* Skills */}
            {(job.required_skills?.length || job.nice_to_have_skills?.length) && (
              <div className="rounded-xl border border-border bg-card p-8 transition-all duration-300 hover:border-blue-500/20">
                <h2 className="font-display text-2xl font-bold mb-6 text-foreground">Skills & Requirements</h2>
                <div className="space-y-6">
                  {job.required_skills && job.required_skills.length > 0 && (
                    <div>
                      <h4 className="text-sm font-sans font-semibold uppercase tracking-wider text-muted-foreground mb-3">Required</h4>
                      <div className="flex flex-wrap gap-2">
                        {job.required_skills.map((skill, i) => (
                          <Badge key={i} variant="secondary" className="font-sans bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 px-3 py-1.5 transition-colors hover:bg-blue-500/20">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {job.nice_to_have_skills && job.nice_to_have_skills.length > 0 && (
                    <div>
                      <h4 className="text-sm font-sans font-semibold uppercase tracking-wider text-muted-foreground mb-3">Nice to have</h4>
                      <div className="flex flex-wrap gap-2">
                        {job.nice_to_have_skills.map((skill, i) => (
                          <Badge key={i} variant="outline" className="font-sans border-dashed border-border text-muted-foreground px-3 py-1.5">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 sticky top-6 transition-all duration-300 hover:border-blue-500/20">
              <div className="space-y-6">
                {/* Salary removed (contracting-first product) */}
                <div className="grid grid-cols-2 gap-4">
                  {job.posted_at && (
                    <div>
                      <p className="text-xs font-sans text-muted-foreground uppercase tracking-wide font-medium">Posted</p>
                      <p className="font-sans font-semibold mt-1 text-foreground">{format(new Date(job.posted_at), 'MMM d, yyyy')}</p>
                    </div>
                  )}
                  {job.closes_at && (
                    <div>
                      <p className="text-xs font-sans text-muted-foreground uppercase tracking-wide font-medium">Closes</p>
                      <p className="font-sans font-semibold mt-1 text-foreground">{format(new Date(job.closes_at), 'MMM d, yyyy')}</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border my-4" />

                {hasApplied ? (
                  <Button className="w-full h-11 rounded-lg text-base font-sans bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20" disabled>
                    <CheckCircle className="mr-2 h-5 w-5" strokeWidth={1.5} />
                    Application Submitted
                  </Button>
                ) : (
                  <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
                    <DialogTrigger asChild>
                      <Button className="w-full h-11 rounded-lg text-base font-sans font-bold border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 shadow-lg transition-all">
                        <Send className="mr-2 h-5 w-5" strokeWidth={1.5} />
                        Apply Now
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl rounded-xl border border-border bg-card">
                      <DialogHeader>
                        <DialogTitle className="text-2xl font-display font-bold text-foreground">Apply for {job.title}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-6 py-6">
                        <div className="space-y-2">
                          <Label className="text-sm font-sans font-medium text-muted-foreground">Select Resume</Label>
                          {resumes.length === 0 ? (
                            <div className="p-4 border border-dashed border-blue-500/20 rounded-xl bg-blue-500/5 text-center">
                              <p className="text-sm font-sans text-muted-foreground mb-3">
                                No resumes found. Please upload one to apply.
                              </p>
                              <Button variant="outline" size="sm" onClick={() => navigate('/candidate/resumes')} className="rounded-lg border border-blue-500/20 hover:bg-blue-500/10 font-sans">
                                Upload Resume
                              </Button>
                            </div>
                          ) : (
                            <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                              <SelectTrigger className="h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-blue-500/20 font-sans">
                                <SelectValue placeholder="Choose a resume to submit" />
                              </SelectTrigger>
                              <SelectContent>
                                {resumes.map((resume) => (
                                  <SelectItem key={resume.id} value={resume.id}>
                                    {resume.file_name} {resume.is_primary && '(Primary)'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-sans font-medium text-muted-foreground">Cover Letter (Optional)</Label>
                          <Textarea
                            placeholder="Tell the employer why you're a perfect fit..."
                            rows={6}
                            value={coverLetter}
                            onChange={(e) => setCoverLetter(e.target.value)}
                            className="rounded-lg border-border bg-background resize-none focus:ring-2 focus:ring-blue-500/20 font-sans"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowApplyDialog(false)} className="rounded-lg font-sans">
                          Cancel
                        </Button>
                        <Button onClick={handleApply} disabled={isApplying || !selectedResumeId} className="rounded-lg h-11 px-6 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-sans font-semibold">
                          {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} /> : null}
                          Submit Application
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>

            {job.organization?.description && (
              <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-blue-500/20">
                <h3 className="font-display font-bold text-lg mb-3 text-foreground">About {job.organization.name}</h3>
                <p className="text-sm font-sans text-muted-foreground leading-relaxed">{job.organization.description}</p>
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
