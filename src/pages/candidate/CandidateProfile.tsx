import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, X, Save, User, Briefcase, MapPin } from 'lucide-react';

interface CandidateProfileData {
  id: string;
  full_name: string | null;
  phone: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  headline: string | null;
  summary: string | null;
  current_title: string | null;
  current_company: string | null;
  years_of_experience: number | null;
  desired_locations: string[] | null;
  desired_job_types: string[] | null;
  is_open_to_remote: boolean | null;
  is_actively_looking: boolean | null;
}

interface Skill {
  id: string;
  skill_name: string;
  skill_type: string | null;
  proficiency_level: string | null;
  years_of_experience: number | null;
}

export default function CandidateProfile() {
  const { user, profile } = useAuth();
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfileData | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchCandidateData();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const onUpdated = () => fetchCandidateData();
    window.addEventListener('candidate-profile-updated', onUpdated as any);
    return () => window.removeEventListener('candidate-profile-updated', onUpdated as any);
  }, [user]);

  const fetchCandidateData = async () => {
    try {
      const { data: cpData, error: cpError } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (cpError) throw cpError;

      const cp = (cpData || [])[0] as any;
      if (cp) {
        setCandidateProfile(cp);

        const { data: skillsData, error: skillsError } = await supabase
          .from('candidate_skills')
          .select('*')
          .eq('candidate_id', cp.id);

        if (skillsError) throw skillsError;
        setSkills(skillsData || []);
      }
    } catch (error) {
      console.error('Error fetching candidate data:', error);
      toast.error('Failed to load profile data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!candidateProfile) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('candidate_profiles')
        .update({
          full_name: candidateProfile.full_name,
          phone: candidateProfile.phone,
          linkedin_url: candidateProfile.linkedin_url,
          github_url: candidateProfile.github_url,
          headline: candidateProfile.headline,
          summary: candidateProfile.summary,
          current_title: candidateProfile.current_title,
          current_company: candidateProfile.current_company,
          years_of_experience: candidateProfile.years_of_experience,
          desired_locations: candidateProfile.desired_locations,
          desired_job_types: candidateProfile.desired_job_types,
          is_open_to_remote: candidateProfile.is_open_to_remote,
          is_actively_looking: candidateProfile.is_actively_looking,
        })
        .eq('id', candidateProfile.id);

      if (error) throw error;
      toast.success('Profile saved successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddSkill = async () => {
    if (!newSkill.trim() || !candidateProfile) return;

    try {
      const { data, error } = await supabase
        .from('candidate_skills')
        .insert({
          candidate_id: candidateProfile.id,
          skill_name: newSkill.trim(),
          skill_type: 'technical',
        })
        .select()
        .single();

      if (error) throw error;
      setSkills([...skills, data]);
      setNewSkill('');
      toast.success('Skill added');
    } catch (error) {
      console.error('Error adding skill:', error);
      toast.error('Failed to add skill');
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    try {
      const { error } = await supabase
        .from('candidate_skills')
        .delete()
        .eq('id', skillId);

      if (error) throw error;
      setSkills(skills.filter(s => s.id !== skillId));
      toast.success('Skill removed');
    } catch (error) {
      console.error('Error removing skill:', error);
      toast.error('Failed to remove skill');
    }
  };

  const handleAddLocation = (location: string) => {
    if (!location.trim() || !candidateProfile) return;
    const currentLocations = candidateProfile.desired_locations || [];
    if (!currentLocations.includes(location.trim())) {
      setCandidateProfile({
        ...candidateProfile,
        desired_locations: [...currentLocations, location.trim()]
      });
    }
  };

  const handleRemoveLocation = (location: string) => {
    if (!candidateProfile) return;
    setCandidateProfile({
      ...candidateProfile,
      desired_locations: (candidateProfile.desired_locations || []).filter(l => l !== location)
    });
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">My Profile</h1>
            <p className="mt-1">
              Complete your profile to improve job matches
            </p>
          </div>
          <Button onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>

        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Info
            </CardTitle>
            <CardDescription>
              How recruiters can reach you. Keep this accurate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Name</Label>
                <Input
                  id="full_name"
                  placeholder="Your full name"
                  value={candidateProfile?.full_name || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="e.g., +1 (555) 123-4567"
                  value={candidateProfile?.phone || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkedin_url">LinkedIn</Label>
                <Input
                  id="linkedin_url"
                  placeholder="https://linkedin.com/in/..."
                  value={candidateProfile?.linkedin_url || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, linkedin_url: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="github_url">GitHub</Label>
                <Input
                  id="github_url"
                  placeholder="https://github.com/..."
                  value={candidateProfile?.github_url || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, github_url: e.target.value } : null)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="headline">Professional Headline</Label>
                <Input
                  id="headline"
                  placeholder="e.g., Senior Software Engineer | React Expert"
                  value={candidateProfile?.headline || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, headline: e.target.value } : null)}
                />
              </div>
              <div>
                <Label htmlFor="summary">Professional Summary</Label>
                <Textarea
                  id="summary"
                  placeholder="Tell employers about your experience and career goals..."
                  rows={4}
                  value={candidateProfile?.summary || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, summary: e.target.value } : null)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Current Role */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Current Role
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="current_title">Current Job Title</Label>
                <Input
                  id="current_title"
                  placeholder="e.g., Software Engineer"
                  value={candidateProfile?.current_title || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, current_title: e.target.value } : null)}
                />
              </div>
              <div>
                <Label htmlFor="current_company">Current Company</Label>
                <Input
                  id="current_company"
                  placeholder="e.g., Tech Corp"
                  value={candidateProfile?.current_company || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, current_company: e.target.value } : null)}
                />
              </div>
              <div>
                <Label htmlFor="years_experience">Years of Experience</Label>
                <Input
                  id="years_experience"
                  type="number"
                  min="0"
                  placeholder="5"
                  value={candidateProfile?.years_of_experience || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, years_of_experience: parseInt(e.target.value) || 0 } : null)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle>Skills</CardTitle>
              <CardDescription>Add your technical and professional skills</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a skill (e.g., React, Python)"
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddSkill()}
                />
                <Button onClick={handleAddSkill} size="icon">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {skills.filter((s) => (s.skill_type || 'technical') === 'technical').map((skill) => (
                    <Badge key={skill.id} variant="secondary" className="px-3 py-1">
                      {skill.skill_name}
                      <button
                        onClick={() => handleRemoveSkill(skill.id)}
                        className="ml-2 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {skills.filter((s) => (s.skill_type || 'technical') === 'technical').length === 0 && (
                    <p className="text-sm">No technical skills yet</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {skills.filter((s) => (s.skill_type || 'technical') === 'soft').map((skill) => (
                    <Badge key={skill.id} variant="outline" className="px-3 py-1">
                      {skill.skill_name}
                      <button
                        onClick={() => handleRemoveSkill(skill.id)}
                        className="ml-2 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {skills.filter((s) => (s.skill_type || 'technical') === 'soft').length === 0 && (
                    <p className="text-sm">No soft skills yet</p>
                  )}
                </div>
              </div>
              {skills.length === 0 && <p className="text-sm">No skills added yet</p>}
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Job Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Open to Remote Work</Label>
                  <p className="text-sm">Consider remote positions</p>
                </div>
                <Switch
                  checked={candidateProfile?.is_open_to_remote ?? true}
                  onCheckedChange={(checked) => setCandidateProfile(prev => prev ? { ...prev, is_open_to_remote: checked } : null)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Actively Looking</Label>
                  <p className="text-sm">Show recruiters you're available</p>
                </div>
                <Switch
                  checked={candidateProfile?.is_actively_looking ?? true}
                  onCheckedChange={(checked) => setCandidateProfile(prev => prev ? { ...prev, is_actively_looking: checked } : null)}
                />
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
