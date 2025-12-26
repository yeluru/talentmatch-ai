import { useState } from 'react';
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
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CreateJob() {
  const { user, roles } = useAuth();
  const navigate = useNavigate();
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    is_remote: false,
    job_type: 'full-time',
    experience_level: 'mid',
    salary_min: '',
    salary_max: '',
    requirements: '',
    responsibilities: '',
    required_skills: [] as string[],
    nice_to_have_skills: [] as string[],
  });

  const [newSkill, setNewSkill] = useState('');
  const [newNiceSkill, setNewNiceSkill] = useState('');

  const createJob = useMutation({
    mutationFn: async (status: 'draft' | 'published') => {
      if (!user || !organizationId) throw new Error('Not authorized');
      
      const { error } = await supabase.from('jobs').insert({
        title: formData.title,
        description: formData.description,
        location: formData.location || null,
        is_remote: formData.is_remote,
        job_type: formData.job_type,
        experience_level: formData.experience_level,
        salary_min: formData.salary_min ? parseInt(formData.salary_min) : null,
        salary_max: formData.salary_max ? parseInt(formData.salary_max) : null,
        requirements: formData.requirements || null,
        responsibilities: formData.responsibilities || null,
        required_skills: formData.required_skills,
        nice_to_have_skills: formData.nice_to_have_skills,
        recruiter_id: user.id,
        organization_id: organizationId,
        status,
        posted_at: status === 'published' ? new Date().toISOString() : null,
      });
      
      if (error) throw error;
    },
    onSuccess: (_, status) => {
      toast.success(status === 'published' ? 'Job published!' : 'Job saved as draft');
      navigate('/recruiter/jobs');
    },
    onError: () => {
      toast.error('Failed to create job');
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

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-3xl font-bold">Post a New Job</h1>
            <p className="text-muted-foreground mt-1">
              Create a job posting to attract top talent
            </p>
          </div>
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
              <div className="flex items-center space-x-2 pt-8">
                <Switch
                  id="remote"
                  checked={formData.is_remote}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_remote: checked })}
                />
                <Label htmlFor="remote">Remote friendly</Label>
              </div>
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
                    <SelectItem value="full-time">Full-time</SelectItem>
                    <SelectItem value="part-time">Part-time</SelectItem>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="salary_min">Salary Range (Min)</Label>
                <Input
                  id="salary_min"
                  type="number"
                  placeholder="e.g., 100000"
                  value={formData.salary_min}
                  onChange={(e) => setFormData({ ...formData, salary_min: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_max">Salary Range (Max)</Label>
                <Input
                  id="salary_max"
                  type="number"
                  placeholder="e.g., 150000"
                  value={formData.salary_max}
                  onChange={(e) => setFormData({ ...formData, salary_max: e.target.value })}
                />
              </div>
            </div>
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
          <Button
            variant="outline"
            onClick={() => createJob.mutate('draft')}
            disabled={!isValid || createJob.isPending}
          >
            {createJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save as Draft
          </Button>
          <Button
            onClick={() => createJob.mutate('published')}
            disabled={!isValid || createJob.isPending}
          >
            {createJob.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Publish Job
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
