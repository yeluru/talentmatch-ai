import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { User, Briefcase, Building2, Loader2, ArrowLeft, Mail, Sparkles } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';

// Logo component matching Navbar
function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <span className="font-bold text-2xl tracking-tight">
        Talent<span className="text-accent">Match</span>
      </span>
    </div>
  );
}

const signUpSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  organizationName: z.string().trim().max(100).optional(),
  inviteCode: z.string().max(20).optional(),
});

const signInSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const resetSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

type AuthView = 'main' | 'forgot-password' | 'reset-sent';

// Role theme configurations
const roleThemes = {
  candidate: {
    gradient: 'from-emerald-500/20 via-teal-500/10 to-cyan-500/20',
    accent: 'text-emerald-500',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    label: 'Candidate',
    icon: User,
  },
  recruiter: {
    gradient: 'from-violet-500/20 via-purple-500/10 to-fuchsia-500/20',
    accent: 'text-violet-500',
    border: 'border-violet-500/30',
    bg: 'bg-violet-500/10',
    label: 'Recruiter',
    icon: Briefcase,
  },
  account_manager: {
    gradient: 'from-amber-500/20 via-orange-500/10 to-rose-500/20',
    accent: 'text-amber-500',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    label: 'Manager',
    icon: Building2,
  },
};

// Invite flow
// IMPORTANT: recruiter_invites is protected by backend access rules (managers only),
// so invited users cannot read it directly from the client. We therefore treat the
// invite token as a "claim" that is validated when the user signs in/up.

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, user, currentRole } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const inviteToken = searchParams.get('invite');
  const nextPath = searchParams.get('next');

  // Invite details (pre-filled for recruiter invite flow)
  const [inviteDetails, setInviteDetails] = useState<{ email: string; fullName: string; organizationName: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);

  // Get role from URL or default to candidate
  const roleFromUrl = searchParams.get('role') as 'candidate' | 'recruiter' | 'account_manager' | null;
  const [selectedRole, setSelectedRole] = useState<'candidate' | 'recruiter' | 'account_manager'>(
    inviteToken ? 'recruiter' : (roleFromUrl && roleThemes[roleFromUrl] ? roleFromUrl : 'candidate')
  );
  const [authView, setAuthView] = useState<AuthView>('main');

  const [signInData, setSignInData] = useState({ email: '', password: '' });
  const [signUpData, setSignUpData] = useState({
    email: '',
    password: '',
    fullName: '',
    organizationName: '',
    inviteCode: ''
  });
  const [resetEmail, setResetEmail] = useState('');

  // Fetch invite details when invite token is present
  useEffect(() => {
    if (!inviteToken) return;

    const fetchInviteDetails = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-invite-details', {
          body: { inviteToken },
        });

        if (error) {
          return;
        }

        if (data?.email && data?.fullName) {
          setInviteDetails({
            email: data.email,
            fullName: data.fullName,
            organizationName: data.organizationName || '',
          });
          setSignUpData((prev) => ({
            ...prev,
            email: data.email,
            fullName: data.fullName,
          }));
          // Also pre-fill sign-in email for existing users
          setSignInData((prev) => ({
            ...prev,
            email: data.email,
          }));
        }
      } finally {
        setInviteLoading(false);
      }
    };

    fetchInviteDetails();
  }, [inviteToken]);

  const acceptRecruiterInviteIfPresent = async () => {
    if (!inviteToken) return { accepted: false };

    const { data, error } = await supabase.rpc('accept_recruiter_invite', {
      _invite_token: inviteToken,
    });

    // The RPC returns NULL when the invite is invalid/expired/already used.
    if (error) {
      toast.error(error.message || 'Failed to accept invitation');
      return { accepted: false };
    }

    if (!data) {
      toast.error('Invalid or expired invitation link.');
      return { accepted: false };
    }

    // Trigger role re-hydration in AuthProvider via auth event.
    await supabase.auth.refreshSession();

    return { accepted: true };
  };

  // If the user is already signed in and opens an invite link, accept and redirect immediately.
  useEffect(() => {
    if (!user || !inviteToken) return;

    (async () => {
      const { accepted } = await acceptRecruiterInviteIfPresent();
      if (accepted) {
        navigate(nextPath || '/recruiter', { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, inviteToken]);

  const currentTheme = roleThemes[selectedRole];

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      signInSchema.parse(signInData);

      const { error, role } = await signIn(signInData.email, signInData.password);

      if (error) {
        if (error.message.includes('Invalid login')) {
          toast.error('Invalid email or password');
        } else {
          toast.error(error.message || 'Failed to sign in');
        }
      } else {
        // If arriving from a recruiter invite, accept it before redirecting.
        const { accepted } = await acceptRecruiterInviteIfPresent();

        toast.success('Welcome back!');

        if (accepted) {
          navigate(nextPath || '/recruiter');
          return;
        }

        const redirectPath = role === 'candidate'
          ? '/candidate'
          : role === 'recruiter'
          ? '/recruiter'
          : '/manager';
        navigate(redirectPath);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    }
    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const isInviteFlow = !!inviteToken;

      signUpSchema.parse({
        ...signUpData,
        // Organization name is not required when joining via an invite link
        organizationName: isInviteFlow ? undefined : signUpData.organizationName,
      });

      // For invite signups, we create the user and then claim the invite via RPC.
      const { error } = await signUp(
        signUpData.email,
        signUpData.password,
        signUpData.fullName,
        isInviteFlow ? 'recruiter' : selectedRole,
        // Don't create an org for invite signups
        !isInviteFlow && selectedRole !== 'candidate' ? signUpData.organizationName : undefined,
        selectedRole === 'candidate' ? signUpData.inviteCode : undefined
      );

      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('An account with this email already exists. Please sign in instead.');
        } else {
          toast.error(error.message || 'Failed to create account');
        }
      } else {
        // If this signup was initiated via recruiter invite, accept it and route to recruiter.
        const { accepted } = await acceptRecruiterInviteIfPresent();

        toast.success(inviteToken ? 'Welcome to the team!' : 'Account created successfully!');

        if (accepted) {
          navigate(nextPath || '/recruiter');
          return;
        }

        const redirectPath = selectedRole === 'candidate' ? '/candidate' : selectedRole === 'recruiter' ? '/recruiter' : '/manager';
        navigate(redirectPath);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    }
    setIsLoading(false);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      resetSchema.parse({ email: resetEmail });
      
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });
      
      if (error) {
        toast.error(error.message || 'Failed to send reset email');
      } else {
        setAuthView('reset-sent');
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    }
    setIsLoading(false);
  };

  const currentGradient = currentTheme.gradient;

  // Forgot Password View
  if (authView === 'forgot-password') {
    return (
      <div className="min-h-screen relative overflow-hidden bg-background">
        <div className={`absolute inset-0 bg-gradient-to-br ${currentGradient} transition-all duration-700`} />
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <SEOHead 
            title="Reset Password" 
            description="Reset your TalentMatch AI account password"
            noIndex
          />
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
                <Logo />
              </Link>
            </div>

            <Card className="border border-border/50 shadow-2xl backdrop-blur-sm bg-card/80">
              <CardHeader>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit -ml-2 mb-2"
                  onClick={() => setAuthView('main')}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to sign in
                </Button>
                <CardTitle className="text-2xl font-display">Reset your password</CardTitle>
                <CardDescription>
                  Enter your email address and we'll send you a link to reset your password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="you@example.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="h-12"
                      required
                    />
                  </div>
                  <Button type="submit" variant="gradient" className="w-full h-12" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send reset link
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Reset Email Sent View
  if (authView === 'reset-sent') {
    return (
      <div className="min-h-screen relative overflow-hidden bg-background">
        <div className={`absolute inset-0 bg-gradient-to-br ${currentGradient} transition-all duration-700`} />
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <SEOHead 
            title="Check Your Email" 
            description="Password reset email sent"
            noIndex
          />
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
                <Logo />
              </Link>
            </div>

            <Card className="border border-border/50 shadow-2xl backdrop-blur-sm bg-card/80">
              <CardContent className="pt-8 pb-8 text-center space-y-4">
                <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                  <Mail className="h-10 w-10 text-primary" />
                </div>
                <CardTitle className="text-2xl font-display">Check your email</CardTitle>
                <CardDescription className="text-base">
                  We've sent a password reset link to <strong className="text-foreground">{resetEmail}</strong>
                </CardDescription>
                <p className="text-sm text-muted-foreground">
                  Didn't receive the email? Check your spam folder or{' '}
                  <button 
                    className="text-primary hover:underline font-medium"
                    onClick={() => setAuthView('forgot-password')}
                  >
                    try again
                  </button>
                </p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => {
                    setAuthView('main');
                    setResetEmail('');
                  }}
                >
                  Back to sign in
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Main Auth View
  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      <div className={`absolute inset-0 bg-gradient-to-br ${currentGradient} transition-all duration-700`} />
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <SEOHead 
          title="Sign In" 
          description="Sign in to your TalentMatch AI account to access AI-powered recruitment tools"
        />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
              <Logo />
            </Link>
            <p className="text-muted-foreground flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI-Powered Recruitment Platform
            </p>
          </div>

          <Card className="border border-border/50 shadow-2xl backdrop-blur-sm bg-card/80">
            <Tabs defaultValue={inviteToken ? "signup" : "signin"}>
              <TabsList className="grid w-full grid-cols-2 p-1 bg-muted/50">
                <TabsTrigger value="signin" className="data-[state=active]:bg-background">Sign In</TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-background">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn}>
                  <CardHeader>
                    <CardTitle className="text-2xl font-display">
                      {inviteDetails ? 'Welcome back' : 'Welcome back'}
                    </CardTitle>
                    <CardDescription>
                      {inviteDetails 
                        ? `Sign in to join ${inviteDetails.organizationName || 'the team'}` 
                        : 'Sign in to your account'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Invite badge for sign-in */}
                    {inviteDetails && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-500/10 border border-violet-500/30">
                        <Briefcase className="h-5 w-5 text-violet-500" />
                        <span className="text-sm font-medium">Joining {inviteDetails.organizationName} as Recruiter</span>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="you@example.com"
                        value={signInData.email}
                        onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                        className={`h-12 ${inviteDetails ? 'bg-muted/50' : ''}`}
                        readOnly={!!inviteDetails}
                        disabled={!!inviteDetails}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="signin-password">Password</Label>
                        <button
                          type="button"
                          className="text-sm text-primary hover:underline font-medium"
                          onClick={() => setAuthView('forgot-password')}
                        >
                          Forgot password?
                        </button>
                      </div>
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="••••••••"
                        value={signInData.password}
                        onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                        className="h-12"
                        required
                      />
                    </div>
                    <Button type="submit" variant="gradient" className="w-full h-12" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign In
                    </Button>
                  </CardContent>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignUp}>
                  <CardHeader>
                    {inviteToken ? (
                      <>
                        <CardTitle className="text-2xl font-display">
                          {inviteDetails?.organizationName 
                            ? `Join ${inviteDetails.organizationName}` 
                            : "You're invited"}
                        </CardTitle>
                        <CardDescription>Create your password to complete your account setup.</CardDescription>
                      </>
                    ) : (
                      <>
                        <CardTitle className="text-2xl font-display">Create an account</CardTitle>
                        <CardDescription>Get started with TalentMatch AI</CardDescription>
                      </>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {inviteLoading && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                    {/* Role selection - hidden when coming from recruiter invite */}
                    {!inviteToken && (
                      <div className="space-y-3">
                        <Label>I am a...</Label>
                        <RadioGroup value={selectedRole} onValueChange={(v) => setSelectedRole(v as any)}>
                          <div className="grid grid-cols-3 gap-3">
                            {(['candidate', 'recruiter', 'account_manager'] as const).map((role) => {
                              const theme = roleThemes[role];
                              const Icon = theme.icon;
                              return (
                                <Label
                                  key={role}
                                  htmlFor={`role-${role}`}
                                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:scale-[1.02] ${
                                    selectedRole === role
                                      ? `${theme.border} ${theme.bg}`
                                      : 'border-border hover:border-muted-foreground/30'
                                  }`}
                                >
                                  <RadioGroupItem value={role} id={`role-${role}`} className="sr-only" />
                                  <div className={`p-2 rounded-lg ${theme.bg}`}>
                                    <Icon className={`h-5 w-5 ${theme.accent}`} />
                                  </div>
                                  <span className="text-xs font-medium">{theme.label}</span>
                                </Label>
                              );
                            })}
                          </div>
                        </RadioGroup>
                      </div>
                    )}

                    {/* Invite badge */}
                    {inviteToken && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-500/10 border border-violet-500/30">
                        <Briefcase className="h-5 w-5 text-violet-500" />
                        <span className="text-sm font-medium">Joining as Recruiter</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input
                        id="signup-name"
                        placeholder="John Doe"
                        value={signUpData.fullName}
                        onChange={(e) => setSignUpData({ ...signUpData, fullName: e.target.value })}
                        className={`h-12 ${inviteDetails ? 'bg-muted cursor-not-allowed' : ''}`}
                        required
                        maxLength={100}
                        readOnly={!!inviteDetails}
                        disabled={!!inviteDetails}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        value={signUpData.email}
                        onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                        className={`h-12 ${inviteDetails ? 'bg-muted cursor-not-allowed' : ''}`}
                        required
                        maxLength={255}
                        readOnly={!!inviteDetails}
                        disabled={!!inviteDetails}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password">{inviteToken ? 'Create Password' : 'Password'}</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={signUpData.password}
                        onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                        className="h-12"
                        required
                        minLength={8}
                        maxLength={72}
                        autoFocus={!!inviteDetails}
                      />
                      <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
                    </div>

                    {selectedRole === 'candidate' && !inviteToken && (
                      <div className="space-y-2">
                        <Label htmlFor="signup-invite">Invite Code (optional)</Label>
                        <Input
                          id="signup-invite"
                          placeholder="Enter invite code"
                          value={signUpData.inviteCode}
                          onChange={(e) =>
                            setSignUpData({ ...signUpData, inviteCode: e.target.value.toUpperCase() })
                          }
                          className="h-12"
                          maxLength={20}
                        />
                        <p className="text-xs text-muted-foreground">
                          Get this code from a recruiter to join their organization
                        </p>
                      </div>
                    )}

                    {selectedRole !== 'candidate' && !inviteToken && (
                      <div className="space-y-2">
                        <Label htmlFor="signup-org">Organization Name</Label>
                        <Input
                          id="signup-org"
                          placeholder="Acme Corp"
                          value={signUpData.organizationName}
                          onChange={(e) => setSignUpData({ ...signUpData, organizationName: e.target.value })}
                          className="h-12"
                          required
                          maxLength={100}
                        />
                      </div>
                    )}

                    <Button type="submit" variant="gradient" className="w-full h-12" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {inviteToken ? 'Complete Setup' : 'Create Account'}
                    </Button>
                  </CardContent>
                </form>
              </TabsContent>
            </Tabs>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            By continuing, you agree to our{' '}
            <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
