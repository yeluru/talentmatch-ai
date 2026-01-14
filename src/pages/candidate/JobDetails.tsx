import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Job not found</h2>
          <Button onClick={() => navigate('/candidate/jobs')} className="mt-4">
            Back to Jobs
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/candidate/jobs')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Jobs
        </Button>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Job Header */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center">
                    {job.organization?.logo_url ? (
                      <img src={job.organization.logo_url} alt="" className="h-12 w-12 object-contain" />
                    ) : (
                      <Building2 className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h1 className="font-display text-2xl font-bold">{job.title}</h1>
                    <p className="text-lg text-muted-foreground">{job.organization?.name}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {job.location && (
                        <Badge variant="outline">
                          <MapPin className="mr-1 h-3 w-3" />
                          {job.location}
                        </Badge>
                      )}
                      {(job as any).work_mode && (job as any).work_mode !== 'unknown' ? (
                        <Badge variant="secondary" className="capitalize">
                          {(job as any).work_mode}
                        </Badge>
                      ) : job.is_remote ? (
                        <Badge variant="secondary">Remote</Badge>
                      ) : null}
                      {job.job_type && (
                        <Badge variant="outline" className="capitalize">
                          {job.job_type}
                        </Badge>
                      )}
                      {job.experience_level && (
                        <Badge variant="outline" className="capitalize">
                          {job.experience_level}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Job Description */}
            <Card>
              <CardHeader>
                <CardTitle>About this role</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap">{job.description}</p>
              </CardContent>
            </Card>

            {/* NOTE: responsibilities/requirements may contain internal recruiter notes; do not render in candidate view. */}

            {/* Skills */}
            {(job.required_skills?.length || job.nice_to_have_skills?.length) && (
              <Card>
                <CardHeader>
                  <CardTitle>Skills</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {job.required_skills && job.required_skills.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Required</h4>
                      <div className="flex flex-wrap gap-2">
                        {job.required_skills.map((skill, i) => (
                          <Badge key={i} variant="default">{skill}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {job.nice_to_have_skills && job.nice_to_have_skills.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Nice to have</h4>
                      <div className="flex flex-wrap gap-2">
                        {job.nice_to_have_skills.map((skill, i) => (
                          <Badge key={i} variant="secondary">{skill}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6 space-y-4">
                {/* Salary removed (contracting-first product) */}
                {job.posted_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Posted</p>
                    <p className="font-medium">{format(new Date(job.posted_at), 'MMMM d, yyyy')}</p>
                  </div>
                )}
                {job.closes_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Closes</p>
                    <p className="font-medium">{format(new Date(job.closes_at), 'MMMM d, yyyy')}</p>
                  </div>
                )}

                {hasApplied ? (
                  <Button className="w-full" disabled>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Applied
                  </Button>
                ) : (
                  <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
                    <DialogTrigger asChild>
                      <Button className="w-full">
                        <Send className="mr-2 h-4 w-4" />
                        Apply Now
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Apply for {job.title}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>Select Resume</Label>
                          {resumes.length === 0 ? (
                            <p className="text-sm text-muted-foreground mt-2">
                              No resumes uploaded.{' '}
                              <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/candidate/resumes')}>
                                Upload one
                              </Button>
                            </p>
                          ) : (
                            <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Choose a resume" />
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
                        <div>
                          <Label>Cover Letter (Optional)</Label>
                          <Textarea
                            placeholder="Tell the employer why you're a great fit..."
                            rows={5}
                            value={coverLetter}
                            onChange={(e) => setCoverLetter(e.target.value)}
                            className="mt-2"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowApplyDialog(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleApply} disabled={isApplying || !selectedResumeId}>
                          {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Submit Application
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardContent>
            </Card>

            {job.organization?.description && (
              <Card>
                <CardHeader>
                  <CardTitle>About {job.organization.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{job.organization.description}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
