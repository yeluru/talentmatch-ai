import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save, User, Briefcase, MapPin, Check, Circle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const JOB_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
];

function completenessScore(profile: CandidateProfileData | null, skillsCount: number): { score: number; checklist: { key: string; label: string; done: boolean }[] } {
  if (!profile) return { score: 0, checklist: [] };
  const checks = [
    { key: 'name', label: 'Your name', done: !!profile.full_name?.trim() },
    { key: 'headline', label: 'Professional headline', done: !!profile.headline?.trim() },
    { key: 'summary', label: 'Short summary', done: !!profile.summary?.trim() && profile.summary.length >= 50 },
    { key: 'role', label: 'Current role or title', done: !!profile.current_title?.trim() },
    { key: 'skills', label: 'At least 3 skills', done: skillsCount >= 3 },
    { key: 'contact', label: 'One way to reach you (phone or LinkedIn)', done: !!(profile.phone?.trim() || profile.linkedin_url?.trim()) },
  ];
  const done = checks.filter(c => c.done).length;
  const score = Math.round((done / checks.length) * 100);
  return { score, checklist: checks };
}

export default function CandidateProfile() {
  const { user } = useAuth();
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfileData | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) fetchCandidateData();
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
        setSkills((skillsData || []) as any as Skill[]);
      }
    } catch (error) {
      console.error('Error fetching candidate data:', error);
      toast.error('Failed to load profile');
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
      toast.success('Profile saved');
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
        .insert({ candidate_id: candidateProfile.id, skill_name: newSkill.trim(), skill_type: 'technical' })
        .select()
        .single();
      if (error) throw error;
      setSkills([...skills, data as any as Skill]);
      setNewSkill('');
      toast.success('Skill added');
    } catch (error) {
      console.error('Error adding skill:', error);
      toast.error('Failed to add skill');
    }
  };

  const handleRemoveSkill = async (skillId: string) => {
    try {
      const { error } = await supabase.from('candidate_skills').delete().eq('id', skillId);
      if (error) throw error;
      setSkills(skills.filter(s => s.id !== skillId));
      toast.success('Skill removed');
    } catch (error) {
      console.error('Error removing skill:', error);
      toast.error('Failed to remove skill');
    }
  };

  const handleToggleJobType = (value: string) => {
    if (!candidateProfile) return;
    const current = candidateProfile.desired_job_types || [];
    const next = current.includes(value) ? current.filter(t => t !== value) : [...current, value];
    setCandidateProfile({ ...candidateProfile, desired_job_types: next.length ? next : null });
  };

  const handleAddLocation = () => {
    if (!newLocation.trim() || !candidateProfile) return;
    const current = candidateProfile.desired_locations || [];
    const loc = newLocation.trim();
    if (current.includes(loc)) return;
    setCandidateProfile({ ...candidateProfile, desired_locations: [...current, loc] });
    setNewLocation('');
  };

  const handleRemoveLocation = (loc: string) => {
    if (!candidateProfile) return;
    setCandidateProfile({
      ...candidateProfile,
      desired_locations: (candidateProfile.desired_locations || []).filter(l => l !== loc),
    });
  };

  const { score, checklist } = useMemo(() => completenessScore(candidateProfile, skills.length), [candidateProfile, skills.length]);
  const technicalSkills = skills.filter(s => (s.skill_type || 'technical') === 'technical');
  const desiredLocations = candidateProfile?.desired_locations || [];
  const desiredJobTypes = candidateProfile?.desired_job_types || [];

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!candidateProfile) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
          <div className="py-12 text-center">
            <p className="text-muted-foreground">Profile not found. Please complete onboarding first.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="pb-24 font-sans w-full">
        {/* Page title — match /candidates: font-display for headings, scale like landing */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
            My <span className="text-gradient-candidate">Profile</span>
          </h1>
          <p className="mt-2 text-lg text-muted-foreground leading-relaxed">
            Recruiters and job matching use this. Complete the steps below so we can show you the right opportunities.
          </p>
        </div>

        {/* Profile strength — what to do next */}
        <section className="mb-10 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-transparent p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2 font-sans">
                <Sparkles className="h-4 w-4" /> Profile strength
              </p>
              <p className="mt-2 text-3xl font-display font-bold text-foreground tabular-nums">{score}%</p>
              <p className="mt-1 text-base text-muted-foreground font-sans">
                {score === 100 ? 'Your profile looks great.' : 'Complete the items below to improve your matches.'}
              </p>
            </div>
            <ul className="space-y-2 min-w-[200px] font-sans">
              {checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-2 text-sm">
                  {item.done ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 1. Contact — compact, recruiters see this */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-display font-bold text-foreground">My Contact Info</h2>
          </div>
          <p className="text-base text-muted-foreground mb-4 font-sans">How recruiters can reach you. At least one is recommended.</p>
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 font-sans">
            <div>
              <Label htmlFor="full_name" className="text-sm font-medium text-muted-foreground font-sans">Full name</Label>
              <Input
                id="full_name"
                placeholder="Jane Smith"
                value={candidateProfile.full_name || ''}
                onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                className="mt-1.5 h-10 border-border bg-background font-sans text-base"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone" className="text-sm font-medium text-muted-foreground font-sans">Phone</Label>
                <Input
                  id="phone"
                  placeholder="+1 (555) 000-0000"
                  value={candidateProfile.phone || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
                  className="mt-1.5 h-10 border-border bg-background font-sans text-base"
                />
              </div>
              <div>
                <Label htmlFor="linkedin_url" className="text-sm font-medium text-muted-foreground font-sans">LinkedIn</Label>
                <Input
                  id="linkedin_url"
                  placeholder="linkedin.com/in/..."
                  value={candidateProfile.linkedin_url || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, linkedin_url: e.target.value } : null)}
                  className="mt-1.5 h-10 border-border bg-background font-sans text-base"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="github_url" className="text-sm font-medium text-muted-foreground font-sans">GitHub (optional)</Label>
              <Input
                id="github_url"
                placeholder="github.com/..."
                value={candidateProfile.github_url || ''}
                onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, github_url: e.target.value } : null)}
                className="mt-1.5 h-10 border-border bg-background font-sans text-base"
              />
            </div>
          </div>
        </section>

        {/* 2. About Me — headline + summary + current role */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-display font-bold text-foreground">About Me</h2>
          </div>
          <p className="text-base text-muted-foreground mb-4 font-sans">A short headline and summary help recruiters understand your background at a glance.</p>
          <div className="rounded-xl border border-border bg-card p-5 space-y-5 font-sans">
            <div>
              <Label htmlFor="headline" className="text-sm font-medium text-muted-foreground font-sans">Professional headline</Label>
              <Input
                id="headline"
                placeholder="e.g. Senior Software Engineer | React & TypeScript"
                value={candidateProfile.headline || ''}
                onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, headline: e.target.value } : null)}
                className="mt-1.5 h-10 border-border bg-background font-sans text-base font-medium"
              />
            </div>
            <div>
              <Label htmlFor="summary" className="text-sm font-medium text-muted-foreground font-sans">Summary (2–3 sentences)</Label>
              <Textarea
                id="summary"
                placeholder="Describe your experience and what you’re looking for. Aim for 50+ characters."
                rows={4}
                value={candidateProfile.summary || ''}
                onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, summary: e.target.value } : null)}
                className="mt-1.5 border-border bg-background resize-y min-h-[100px] font-sans text-base leading-relaxed"
              />
              <p className="mt-1 text-xs text-muted-foreground font-sans">{(candidateProfile.summary || '').length} characters</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-border/50">
              <div>
                <Label htmlFor="current_title" className="text-sm font-medium text-muted-foreground font-sans">Current title</Label>
                <Input
                  id="current_title"
                  placeholder="e.g. Software Engineer"
                  value={candidateProfile.current_title || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, current_title: e.target.value } : null)}
                  className="mt-1.5 h-10 border-border bg-background font-sans text-base"
                />
              </div>
              <div>
                <Label htmlFor="current_company" className="text-sm font-medium text-muted-foreground font-sans">Company</Label>
                <Input
                  id="current_company"
                  placeholder="e.g. Acme Inc"
                  value={candidateProfile.current_company || ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, current_company: e.target.value } : null)}
                  className="mt-1.5 h-10 border-border bg-background font-sans text-base"
                />
              </div>
              <div>
                <Label htmlFor="years_experience" className="text-sm font-medium text-muted-foreground font-sans">Years of experience</Label>
                <Input
                  id="years_experience"
                  type="number"
                  min={0}
                  placeholder="5"
                  value={candidateProfile.years_of_experience ?? ''}
                  onChange={(e) => setCandidateProfile(prev => prev ? { ...prev, years_of_experience: parseInt(e.target.value, 10) || null } : null)}
                  className="mt-1.5 h-10 border-border bg-background font-sans text-base"
                />
              </div>
            </div>
          </div>
        </section>

        {/* 3. My Skills — add skills for better matching */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-display font-bold text-foreground">My Skills</h2>
          </div>
          <p className="text-base text-muted-foreground mb-4 font-sans">Add at least 3 key skills. We use these to match you to jobs.</p>
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 font-sans">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. React, Python, Project management"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
                className="h-10 border-border bg-background flex-1 font-sans text-base"
              />
              <Button type="button" onClick={handleAddSkill} disabled={!newSkill.trim()} className="h-10 px-5 rounded-full bg-blue-600 hover:bg-blue-700 text-white shrink-0">
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {technicalSkills.map((skill) => (
                <Badge
                  key={skill.id}
                  variant="secondary"
                  className="pl-2.5 pr-1.5 py-1 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 rounded-full font-medium font-sans text-sm"
                >
                  {skill.skill_name}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill.id)}
                    className="ml-1.5 p-0.5 rounded-full hover:bg-blue-500/20 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${skill.skill_name}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
              {technicalSkills.length === 0 && (
                <p className="text-sm text-muted-foreground italic font-sans">No skills yet. Add your first one above.</p>
              )}
            </div>
            {technicalSkills.length > 0 && technicalSkills.length < 3 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-sans">Add {3 - technicalSkills.length} more to strengthen your profile.</p>
            )}
          </div>
        </section>

        {/* 4. Preferences — where & how you want to work */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-display font-semibold text-foreground">My Job Preferences</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Tell us where you’re open to work and how. We’ll filter jobs accordingly.</p>
          <div className="rounded-xl border border-border bg-card p-5 space-y-6">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Preferred locations (optional)</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {desiredLocations.map((loc) => (
                  <Badge key={loc} variant="secondary" className="pl-2.5 pr-1.5 py-1 rounded-full font-normal font-sans text-sm">
                    {loc}
                    <button type="button" onClick={() => handleRemoveLocation(loc)} className="ml-1.5 hover:text-destructive" aria-label={`Remove ${loc}`}>×</button>
                  </Badge>
                ))}
                <div className="flex gap-2 flex-1 min-w-[200px]">
                  <Input
                    placeholder="Add city or region"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLocation())}
                    className="h-9 border-border bg-background text-sm flex-1 font-sans"
                  />
                  <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-full h-9" onClick={handleAddLocation} disabled={!newLocation.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Job types you’re open to</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {JOB_TYPES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleToggleJobType(value)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                      desiredJobTypes.includes(value)
                        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                        : 'bg-muted/50 text-muted-foreground border-border hover:border-blue-500/20'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Open to relocate</p>
                  <p className="text-sm text-muted-foreground">Willing to relocate for the right opportunity</p>
                </div>
                <Switch
                  checked={candidateProfile.is_open_to_remote ?? true}
                  onCheckedChange={(checked) => setCandidateProfile(prev => prev ? { ...prev, is_open_to_remote: checked } : null)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground font-sans">Actively looking</p>
                  <p className="text-sm text-muted-foreground font-sans">Signal to recruiters that you’re available</p>
                </div>
                <Switch
                  checked={candidateProfile.is_actively_looking ?? true}
                  onCheckedChange={(checked) => setCandidateProfile(prev => prev ? { ...prev, is_actively_looking: checked } : null)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Bottom Save again for long scroll */}
        <div className="flex justify-end pt-4">
          <Button onClick={handleSaveProfile} disabled={isSaving} className="rounded-full bg-blue-600 hover:bg-blue-700 text-white">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save profile
          </Button>
        </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
