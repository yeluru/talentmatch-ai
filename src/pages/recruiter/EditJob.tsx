import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, X, Loader2, Building2, AlertCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function EditJob() {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  const { id: jobId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  
  const organizationId = orgIdForRecruiterSuite(roles);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    work_mode: 'unknown',
    is_remote: false,
    job_type: 'full_time',
    experience_level: 'mid',
    visibility: 'private',
    requirements: '',
    responsibilities: '',
    required_skills: [] as string[],
    nice_to_have_skills: [] as string[],
    status: 'draft' as string,
    client_id: '' as string,
  });

  const [newSkill, setNewSkill] = useState('');
  const [newNiceSkill, setNewNiceSkill] = useState('');

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

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      if (!jobId) throw new Error('No job ID');
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          client:clients(id, name, status)
        `)
        .eq('id', jobId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });

  useEffect(() => {
    if (job) {
      setFormData({
        title: job.title || '',
        description: job.description || '',
        location: job.location || '',
        work_mode: (job as any).work_mode || 'unknown',
        is_remote: job.is_remote || false,
        job_type: job.job_type || 'full_time',
        experience_level: job.experience_level || 'mid',
        visibility: (job as any).visibility || 'private',
        requirements: job.requirements || '',
        responsibilities: job.responsibilities || '',
        required_skills: job.required_skills || [],
        nice_to_have_skills: job.nice_to_have_skills || [],
        status: job.status || 'draft',
        client_id: (job as any).client_id || '',
      });
    }
  }, [job]);

  const updateJob = useMutation({
    mutationFn: async (newStatus?: 'draft' | 'published' | 'closed') => {
      if (!user || !organizationId || !jobId) throw new Error('Not authorized');

      const status = newStatus || formData.status;

      // Build update payload
      const updatePayload: any = {
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
        status,
        posted_at: status === 'published' && job?.status !== 'published'
          ? new Date().toISOString()
          : job?.posted_at,
      };

      // Only allow setting client_id if not already set (cannot change once assigned)
      if (formData.client_id && !(job as any)?.client_id) {
        updatePayload.client_id = formData.client_id;
      }

      const { error } = await supabase.from('jobs').update(updatePayload).eq('id', jobId);

      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['recruiter-jobs', organizationId] });
      toast.success(
        status === 'published' ? 'Job published!' : 
        status === 'closed' ? 'Job closed' : 
        'Job updated!'
      );
      navigate('/recruiter/jobs');
    },
    onError: (err: Error) => {
      console.error('Failed to update job', err);
      toast.error(`Failed to update job: ${err.message}`);
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

  const isValid = formData.title.trim() && formData.description.trim();

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
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-6 pt-6 pb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                <Briefcase className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Edit <span className="text-gradient-recruiter">Job</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">Update your job posting</p>
          </div>
          <Badge variant={formData.status === 'published' ? 'default' : 'secondary'}>
            {formData.status}
          </Badge>
        </div>

        <Card>
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
              {(job as any)?.client_id ? (
                // Client already assigned - show as read-only
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/50">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{(job as any).client?.name || 'Unknown Client'}</span>
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
              ) : (
                // No client assigned yet - allow selection
                <>
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
                  {!formData.client_id && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        This job needs a client assigned. Please select a client before saving.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
              <p className="text-xs text-muted-foreground">
                {(job as any)?.client_id
                  ? "Client cannot be changed once assigned."
                  : "Select which client this job is for. This cannot be changed later."}
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
                    <SelectItem value="executive">Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Salary removed (contracting-first product) */}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requirements & Responsibilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="requirements">Requirements</Label>
              <Textarea
                id="requirements"
                placeholder="List the requirements for this position..."
                rows={4}
                value={formData.requirements}
                onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsibilities">Responsibilities</Label>
              <Textarea
                id="responsibilities"
                placeholder="Describe day-to-day responsibilities..."
                rows={4}
                value={formData.responsibilities}
                onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
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

        <div className="flex justify-end gap-3">
          {formData.status === 'published' && (
            <Button
              variant="destructive"
              onClick={() => updateJob.mutate('closed')}
              disabled={updateJob.isPending}
            >
              Close Job
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => updateJob.mutate('draft')}
            disabled={!isValid || updateJob.isPending}
          >
            {updateJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save as Draft
          </Button>
          <Button
            onClick={() => updateJob.mutate('published')}
            disabled={!isValid || updateJob.isPending}
          >
            {updateJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {formData.status === 'published' ? 'Update Job' : 'Publish Job'}
          </Button>
        </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
