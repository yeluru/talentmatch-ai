import { useState } from 'react';
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
import { Zap } from 'lucide-react';

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

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  
  // Get role from URL or default to candidate
  const roleFromUrl = searchParams.get('role') as 'candidate' | 'recruiter' | 'account_manager' | null;
  const [selectedRole, setSelectedRole] = useState<'candidate' | 'recruiter' | 'account_manager'>(
    roleFromUrl && roleThemes[roleFromUrl] ? roleFromUrl : 'candidate'
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
        toast.success('Welcome back!');
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
      signUpSchema.parse(signUpData);
      
      const { error } = await signUp(
        signUpData.email,
        signUpData.password,
        signUpData.fullName,
        selectedRole,
        selectedRole !== 'candidate' ? signUpData.organizationName : undefined,
        selectedRole === 'candidate' ? signUpData.inviteCode : undefined
      );
      
      if (error) {
        if (error.message.includes('already registered')) {
          toast.error('An account with this email already exists. Please sign in instead.');
        } else {
          toast.error(error.message || 'Failed to create account');
        }
      } else {
        toast.success('Account created successfully!');
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

  // Background component with animated gradient
  const AuthBackground = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen relative overflow-hidden bg-background">
      {/* Animated gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${currentTheme.gradient} transition-all duration-700`} />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />
      
      {/* Floating orbs */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  );

  // Forgot Password View
  if (authView === 'forgot-password') {
    return (
      <AuthBackground>
        <SEOHead 
          title="Reset Password" 
          description="Reset your TalentMatch AI account password"
          noIndex
        />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
              <Zap className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-foreground">TalentMatch</span>
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
      </AuthBackground>
    );
  }

  // Reset Email Sent View
  if (authView === 'reset-sent') {
    return (
      <AuthBackground>
        <SEOHead 
          title="Check Your Email" 
          description="Password reset email sent"
          noIndex
        />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
              <Zap className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-foreground">TalentMatch</span>
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
      </AuthBackground>
    );
  }

  // Main Auth View
  return (
    <AuthBackground>
      <SEOHead 
        title="Sign In" 
        description="Sign in to your TalentMatch AI account to access AI-powered recruitment tools"
      />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
            <Zap className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">TalentMatch</span>
          </Link>
          <p className="text-muted-foreground flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI-Powered Recruitment Platform
          </p>
        </div>

        <Card className="border border-border/50 shadow-2xl backdrop-blur-sm bg-card/80">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2 p-1 bg-muted/50">
              <TabsTrigger value="signin" className="data-[state=active]:bg-background">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="data-[state=active]:bg-background">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn}>
                <CardHeader>
                  <CardTitle className="text-2xl font-display">Welcome back</CardTitle>
                  <CardDescription>Sign in to your account</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signInData.email}
                      onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                      className="h-12"
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
                  <CardTitle className="text-2xl font-display">Create an account</CardTitle>
                  <CardDescription>Get started with TalentMatch AI</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                  
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      placeholder="John Doe"
                      value={signUpData.fullName}
                      onChange={(e) => setSignUpData({ ...signUpData, fullName: e.target.value })}
                      className="h-12"
                      required
                      maxLength={100}
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
                      className="h-12"
                      required
                      maxLength={255}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
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
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be at least 8 characters
                    </p>
                  </div>
                  
                  {selectedRole === 'candidate' && (
                    <div className="space-y-2">
                      <Label htmlFor="signup-invite">Invite Code (optional)</Label>
                      <Input
                        id="signup-invite"
                        placeholder="Enter invite code"
                        value={signUpData.inviteCode}
                        onChange={(e) => setSignUpData({ ...signUpData, inviteCode: e.target.value.toUpperCase() })}
                        className="h-12"
                        maxLength={20}
                      />
                      <p className="text-xs text-muted-foreground">
                        Get this code from a recruiter to join their organization
                      </p>
                    </div>
                  )}
                  
                  {selectedRole !== 'candidate' && (
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
                    Create Account
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
    </AuthBackground>
  );
}
