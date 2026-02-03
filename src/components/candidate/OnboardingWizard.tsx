import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowRight, ArrowLeft, CheckCircle2, User, Briefcase, MapPin, Target } from 'lucide-react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const steps = [
  { id: 1, title: 'Basic Info', icon: User },
  { id: 2, title: 'Experience', icon: Briefcase },
  { id: 3, title: 'Preferences', icon: Target },
  { id: 4, title: 'Complete', icon: CheckCircle2 },
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: '',
    headline: '',
    location: '',
    phone: '',
    linkedin_url: '',
    current_title: '',
    current_company: '',
    years_of_experience: '',
    summary: '',
    desired_locations: [] as string[],
    desired_job_types: [] as string[],
    is_open_to_remote: true,
  });

  const progress = (currentStep / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('candidate_profiles')
        .update({
          full_name: formData.full_name || null,
          headline: formData.headline || null,
          location: formData.location || null,
          phone: formData.phone || null,
          linkedin_url: formData.linkedin_url || null,
          current_title: formData.current_title || null,
          current_company: formData.current_company || null,
          years_of_experience: formData.years_of_experience ? parseInt(formData.years_of_experience) : null,
          summary: formData.summary || null,
          desired_locations: formData.desired_locations.length > 0 ? formData.desired_locations : null,
          desired_job_types: formData.desired_job_types.length > 0 ? formData.desired_job_types : null,
          is_open_to_remote: formData.is_open_to_remote,
          onboarding_completed: true,
        })
        .eq('user_id', user!.id);

      if (error) throw error;
      toast.success('Profile setup complete!');
      onComplete();
    } catch (error) {
      console.error('Error completing onboarding:', error);
      toast.error('Failed to save profile');
    } finally {
      setIsLoading(false);
    }
  };

  const jobTypes = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-4 mb-4">
            {steps.map((step) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 ${
                    isActive ? 'text-primary' : isCompleted ? 'text-primary/60' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isActive ? 'bg-primary text-primary-foreground' : 
                    isCompleted ? 'bg-primary/20' : 'bg-muted'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium hidden sm:inline">{step.title}</span>
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="h-2" />
          <CardTitle className="mt-4">
            {currentStep === 1 && 'Tell us about yourself'}
            {currentStep === 2 && 'Your experience'}
            {currentStep === 3 && 'Job preferences'}
            {currentStep === 4 && 'All set!'}
          </CardTitle>
          <CardDescription>
            {currentStep === 1 && 'Basic information to get started'}
            {currentStep === 2 && 'Share your professional background'}
            {currentStep === 3 && 'Help us find the right jobs for you'}
            {currentStep === 4 && 'Your profile is ready to go'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    placeholder="John Doe"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    placeholder="+1 (555) 123-4567"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="headline">Professional Headline</Label>
                <Input
                  id="headline"
                  placeholder="Senior Software Engineer | React Specialist"
                  value={formData.headline}
                  onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="San Francisco, CA"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                  <Input
                    id="linkedin_url"
                    placeholder="https://linkedin.com/in/johndoe"
                    value={formData.linkedin_url}
                    onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="current_title">Current Job Title</Label>
                  <Input
                    id="current_title"
                    placeholder="Senior Developer"
                    value={formData.current_title}
                    onChange={(e) => setFormData({ ...formData, current_title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current_company">Current Company</Label>
                  <Input
                    id="current_company"
                    placeholder="Acme Inc"
                    value={formData.current_company}
                    onChange={(e) => setFormData({ ...formData, current_company: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="years_of_experience">Years of Experience</Label>
                <Input
                  id="years_of_experience"
                  type="number"
                  placeholder="5"
                  value={formData.years_of_experience}
                  onChange={(e) => setFormData({ ...formData, years_of_experience: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Professional Summary</Label>
                <Textarea
                  id="summary"
                  placeholder="Brief overview of your experience and skills..."
                  rows={4}
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Job Types (select all that apply)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {jobTypes.map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox
                        id={type}
                        checked={formData.desired_job_types.includes(type.toLowerCase())}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              desired_job_types: [...formData.desired_job_types, type.toLowerCase()]
                            });
                          } else {
                            setFormData({
                              ...formData,
                              desired_job_types: formData.desired_job_types.filter(t => t !== type.toLowerCase())
                            });
                          }
                        }}
                      />
                      <label htmlFor={type} className="text-sm cursor-pointer">{type}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="relocate"
                  checked={formData.is_open_to_remote}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_open_to_remote: checked as boolean })}
                />
                <label htmlFor="relocate" className="text-sm cursor-pointer">Open to relocate</label>
              </div>
              {/* Salary expectations removed (contracting-first product) */}
            </div>
          )}

          {currentStep === 4 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">You're all set!</h3>
              <p className="mb-6">
                Your profile is ready. Start exploring job opportunities that match your skills.
              </p>
            </div>
          )}

          <div className="flex justify-between pt-4">
            {currentStep > 1 && currentStep < 4 && (
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
            {currentStep === 1 && <div />}
            {currentStep < 3 && (
              <Button onClick={handleNext} className="ml-auto">
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {currentStep === 3 && (
              <Button onClick={handleNext} className="ml-auto">
                Finish Setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {currentStep === 4 && (
              <Button onClick={handleComplete} disabled={isLoading} className="mx-auto">
                {isLoading ? 'Saving...' : 'Go to Dashboard'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
