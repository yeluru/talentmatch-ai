import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, MapPin, Building2, Send, Upload, FileText, 
  CheckCircle, User, Mail, Briefcase, ArrowRight, LogIn
} from 'lucide-react';
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
  salary_min: number | null;
  salary_max: number | null;
  required_skills: string[] | null;
  nice_to_have_skills: string[] | null;
  posted_at: string | null;
  closes_at: string | null;
  organization: { id: string; name: string; logo_url: string | null; description: string | null } | null;
}

interface ParsedResume {
  full_name: string;
  email?: string;
  phone?: string;
  location?: string;
  current_title?: string;
  current_company?: string;
  years_of_experience?: number;
  skills: string[];
  summary?: string;
}

type ApplicationStep = 'view' | 'upload' | 'parsing' | 'existing_user' | 'new_user' | 'success';

export default function PublicJobPage() {
  const { orgSlug, jobId } = useParams<{ orgSlug: string; jobId: string }>();
  const navigate = useNavigate();
  
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState<ApplicationStep>('view');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedResume | null>(null);
  const [existingUserEmail, setExistingUserEmail] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Form fields for new user
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    coverLetter: ''
  });

  useEffect(() => {
    fetchJobDetails();
  }, [orgSlug, jobId]);

  const fetchJobDetails = async () => {
    try {
      // First find the organization by name (slug)
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, name')
        .ilike('name', orgSlug?.replace(/-/g, ' ') || '')
        .maybeSingle();

      if (orgError) {
        console.error('Org error:', orgError);
      }

      // Fetch job with organization
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select(`
          *,
          organization:organizations(id, name, logo_url, description)
        `)
        .eq('id', jobId)
        .eq('status', 'published')
        .maybeSingle();

      if (jobError) throw jobError;
      
      if (!jobData) {
        setJob(null);
      } else {
        setJob(jobData);
      }
    } catch (error) {
      console.error('Error fetching job:', error);
      toast.error('Failed to load job details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setResumeFile(file);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleUploadAndParse = async () => {
    if (!resumeFile) {
      toast.error('Please select a resume file');
      return;
    }

    setStep('parsing');
    setIsProcessing(true);

    try {
      // Convert file to base64 for the edge function
      const fileBase64 = await fileToBase64(resumeFile);

      // Call the parse-resume edge function
      const { data, error } = await supabase.functions.invoke('parse-resume', {
        body: { 
          fileBase64,
          fileName: resumeFile.name,
          fileType: resumeFile.type
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const parsed = data.parsed as ParsedResume;
      setParsedData(parsed);

      // Pre-fill form with parsed data
      setFormData(prev => ({
        ...prev,
        fullName: parsed.full_name || '',
        email: parsed.email || '',
        phone: parsed.phone || ''
      }));

      // Check if email exists in the database
      if (parsed.email) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('email')
          .eq('email', parsed.email)
          .maybeSingle();

        if (profileData) {
          setExistingUserEmail(parsed.email);
          setStep('existing_user');
        } else {
          setStep('new_user');
        }
      } else {
        setStep('new_user');
      }
    } catch (error) {
      console.error('Parse error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to parse resume');
      setStep('upload');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoginRedirect = () => {
    // Store application intent in sessionStorage
    sessionStorage.setItem('pendingApplication', JSON.stringify({
      jobId: job?.id,
      resumeFile: resumeFile?.name,
      parsedData
    }));
    navigate(`/auth?returnTo=/jobs/${orgSlug}/${jobId}&email=${encodeURIComponent(existingUserEmail || '')}`);
  };

  const handleNewUserSignup = async () => {
    if (!formData.email || !formData.password || !formData.fullName) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsProcessing(true);
    try {
      // Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/jobs/${orgSlug}/${jobId}`,
          data: {
            full_name: formData.fullName
          }
        }
      });

      if (authError) throw authError;

      if (authData.user) {
        // Create candidate role
        await supabase.from('user_roles').insert({
          user_id: authData.user.id,
          role: 'candidate',
          organization_id: job?.organization?.id
        });

        // Create candidate profile
        const { data: cpData } = await supabase.from('candidate_profiles').insert({
          user_id: authData.user.id,
          organization_id: job?.organization?.id,
          current_title: parsedData?.current_title,
          current_company: parsedData?.current_company,
          years_of_experience: parsedData?.years_of_experience,
          headline: parsedData?.summary
        }).select('id').single();

        if (cpData && resumeFile) {
          // Upload resume to storage
          const filePath = `${authData.user.id}/${Date.now()}_${resumeFile.name}`;
          const { error: uploadError } = await supabase.storage
            .from('resumes')
            .upload(filePath, resumeFile);

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('resumes').getPublicUrl(filePath);
            
            // Create resume record
            const { data: resumeData } = await supabase.from('resumes').insert({
              candidate_id: cpData.id,
              file_name: resumeFile.name,
              file_url: urlData.publicUrl,
              file_type: resumeFile.type,
              is_primary: true
            }).select('id').single();

            // Create application
            if (resumeData) {
              await supabase.from('applications').insert({
                job_id: job!.id,
                candidate_id: cpData.id,
                resume_id: resumeData.id,
                cover_letter: formData.coverLetter || null,
                status: 'applied'
              });
            }
          }
        }

        setStep('success');
        toast.success('Application submitted! Please check your email to verify your account.');
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create account');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return 'Salary not disclosed';
    if (min && max) return `$${min.toLocaleString()} - $${max.toLocaleString()}`;
    if (min) return `From $${min.toLocaleString()}`;
    return `Up to $${max!.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold mb-4">Job Not Found</h1>
        <p className="text-muted-foreground mb-6">This job posting may have been removed or is no longer available.</p>
        <Button onClick={() => navigate('/')}>Go to Homepage</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {job.organization?.logo_url ? (
              <img src={job.organization.logo_url} alt="" className="h-10 w-10 object-contain rounded" />
            ) : (
              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <span className="font-semibold">{job.organization?.name}</span>
          </div>
          <Button variant="outline" asChild>
            <Link to="/auth">
              <LogIn className="mr-2 h-4 w-4" />
              Sign In
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Job Details - Left Column */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="pt-6">
                <h1 className="font-display text-3xl font-bold mb-2">{job.title}</h1>
                <p className="text-lg text-muted-foreground mb-4">{job.organization?.name}</p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {job.location && (
                    <Badge variant="outline">
                      <MapPin className="mr-1 h-3 w-3" />
                      {job.location}
                    </Badge>
                  )}
                  {job.is_remote && <Badge variant="secondary">Remote</Badge>}
                  {job.job_type && <Badge variant="outline" className="capitalize">{job.job_type}</Badge>}
                  {job.experience_level && <Badge variant="outline" className="capitalize">{job.experience_level}</Badge>}
                </div>

                <p className="text-lg font-semibold text-primary">
                  {formatSalary(job.salary_min, job.salary_max)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>About this role</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{job.description}</p>
              </CardContent>
            </Card>

            {job.responsibilities && (
              <Card>
                <CardHeader>
                  <CardTitle>Responsibilities</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-muted-foreground">{job.responsibilities}</p>
                </CardContent>
              </Card>
            )}

            {job.requirements && (
              <Card>
                <CardHeader>
                  <CardTitle>Requirements</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-muted-foreground">{job.requirements}</p>
                </CardContent>
              </Card>
            )}

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

          {/* Application Panel - Right Column */}
          <div className="space-y-6">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>
                  {step === 'view' && 'Apply Now'}
                  {step === 'upload' && 'Upload Your Resume'}
                  {step === 'parsing' && 'Analyzing Resume...'}
                  {step === 'existing_user' && 'Welcome Back!'}
                  {step === 'new_user' && 'Complete Your Application'}
                  {step === 'success' && 'Application Submitted!'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Step: View */}
                {step === 'view' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Start by uploading your resume. We'll parse it automatically to speed up your application.
                    </p>
                    <Button className="w-full" onClick={() => setStep('upload')}>
                      <Upload className="mr-2 h-4 w-4" />
                      Start Application
                    </Button>
                    <div className="text-center">
                      <span className="text-sm text-muted-foreground">Already have an account? </span>
                      <Link to="/auth" className="text-sm text-primary hover:underline">Sign in</Link>
                    </div>
                  </div>
                )}

                {/* Step: Upload */}
                {step === 'upload' && (
                  <div className="space-y-4">
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <input
                        type="file"
                        id="resume-upload"
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label htmlFor="resume-upload" className="cursor-pointer">
                        {resumeFile ? (
                          <div className="flex items-center justify-center gap-2">
                            <FileText className="h-8 w-8 text-primary" />
                            <span className="font-medium">{resumeFile.name}</span>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                              Click to upload or drag and drop
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              PDF, DOC, DOCX, or TXT (max 10MB)
                            </p>
                          </>
                        )}
                      </label>
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={handleUploadAndParse}
                      disabled={!resumeFile}
                    >
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Step: Parsing */}
                {step === 'parsing' && (
                  <div className="text-center py-6">
                    <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-4" />
                    <p className="font-medium">Analyzing your resume...</p>
                    <p className="text-sm text-muted-foreground">This may take a few seconds</p>
                  </div>
                )}

                {/* Step: Existing User */}
                {step === 'existing_user' && (
                  <div className="space-y-4">
                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="text-sm">
                        We found an account with <strong>{existingUserEmail}</strong>. 
                        Please sign in to continue your application.
                      </p>
                    </div>
                    <Button className="w-full" onClick={handleLoginRedirect}>
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign In to Apply
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        setExistingUserEmail(null);
                        setStep('new_user');
                      }}
                    >
                      Use a Different Email
                    </Button>
                  </div>
                )}

                {/* Step: New User */}
                {step === 'new_user' && (
                  <div className="space-y-4">
                    {parsedData && (
                      <div className="bg-muted/50 rounded-lg p-3 mb-4">
                        <p className="text-xs text-muted-foreground mb-1">Parsed from your resume</p>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">{parsedData.full_name}</span>
                        </div>
                        {parsedData.skills?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {parsedData.skills.slice(0, 5).map((skill, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                            ))}
                            {parsedData.skills.length > 5 && (
                              <Badge variant="secondary" className="text-xs">+{parsedData.skills.length - 5} more</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="fullName">Full Name *</Label>
                        <Input
                          id="fullName"
                          value={formData.fullName}
                          onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="john@example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="password">Create Password *</Label>
                        <Input
                          id="password"
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                          placeholder="••••••••"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Phone (optional)</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="coverLetter">Cover Letter (optional)</Label>
                        <Textarea
                          id="coverLetter"
                          value={formData.coverLetter}
                          onChange={(e) => setFormData(prev => ({ ...prev, coverLetter: e.target.value }))}
                          placeholder="Tell us why you're interested..."
                          rows={4}
                        />
                      </div>
                    </div>

                    <Button 
                      className="w-full" 
                      onClick={handleNewUserSignup}
                      disabled={isProcessing}
                    >
                      {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Send className="mr-2 h-4 w-4" />
                      Submit Application
                    </Button>
                  </div>
                )}

                {/* Step: Success */}
                {step === 'success' && (
                  <div className="text-center py-6">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h3 className="font-semibold text-lg mb-2">Application Submitted!</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Thank you for applying. Please check your email to verify your account and track your application status.
                    </p>
                    <Button asChild>
                      <Link to="/auth">Sign In to Your Account</Link>
                    </Button>
                  </div>
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

            {job.posted_at && (
              <p className="text-sm text-muted-foreground text-center">
                Posted {format(new Date(job.posted_at), 'MMMM d, yyyy')}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
