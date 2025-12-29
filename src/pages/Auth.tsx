import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Sparkles, User, Briefcase, Building2, Loader2, ArrowLeft, Mail } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { SEOHead } from '@/components/SEOHead';

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

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'candidate' | 'recruiter' | 'account_manager'>('candidate');
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

  // Forgot Password View
  if (authView === 'forgot-password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <SEOHead 
          title="Reset Password" 
          description="Reset your MatchTalAI account password"
          noIndex
        />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-4">
              <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-accent-foreground" />
              </div>
              <span className="font-display text-2xl font-bold">
                MatchTal<span className="text-accent">AI</span>
              </span>
            </Link>
          </div>

          <Card className="border-0 shadow-xl">
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
              <CardTitle>Reset your password</CardTitle>
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
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Reset Email Sent View
  if (authView === 'reset-sent') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
        <SEOHead 
          title="Check Your Email" 
          description="Password reset email sent"
          noIndex
        />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-4">
              <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-accent-foreground" />
              </div>
              <span className="font-display text-2xl font-bold">
                MatchTal<span className="text-accent">AI</span>
              </span>
            </Link>
          </div>

          <Card className="border-0 shadow-xl">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center">
                <Mail className="h-8 w-8 text-accent" />
              </div>
              <CardTitle>Check your email</CardTitle>
              <CardDescription className="text-base">
                We've sent a password reset link to <strong>{resetEmail}</strong>
              </CardDescription>
              <p className="text-sm text-muted-foreground">
                Didn't receive the email? Check your spam folder or{' '}
                <button 
                  className="text-accent hover:underline"
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
    );
  }

  // Main Auth View
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <SEOHead 
        title="Sign In" 
        description="Sign in to your MatchTalAI account to access AI-powered recruitment tools"
      />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-accent-foreground" />
            </div>
            <span className="font-display text-2xl font-bold">
              MatchTal<span className="text-accent">AI</span>
            </span>
          </Link>
          <p className="text-muted-foreground">AI-Powered Recruitment Platform</p>
        </div>

        <Card className="border-0 shadow-xl">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn}>
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
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
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password">Password</Label>
                      <button
                        type="button"
                        className="text-sm text-accent hover:underline"
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
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>
                </CardContent>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp}>
                <CardHeader>
                  <CardTitle>Create an account</CardTitle>
                  <CardDescription>Get started with MatchTalAI</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>I am a...</Label>
                    <RadioGroup value={selectedRole} onValueChange={(v) => setSelectedRole(v as any)}>
                      <div className="grid grid-cols-3 gap-2">
                        <Label htmlFor="role-candidate" className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer hover:border-accent transition-colors [&:has([data-state=checked])]:border-accent [&:has([data-state=checked])]:bg-accent/5">
                          <RadioGroupItem value="candidate" id="role-candidate" className="sr-only" />
                          <User className="h-5 w-5 text-candidate" />
                          <span className="text-xs font-medium">Candidate</span>
                        </Label>
                        <Label htmlFor="role-recruiter" className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer hover:border-accent transition-colors [&:has([data-state=checked])]:border-accent [&:has([data-state=checked])]:bg-accent/5">
                          <RadioGroupItem value="recruiter" id="role-recruiter" className="sr-only" />
                          <Briefcase className="h-5 w-5 text-recruiter" />
                          <span className="text-xs font-medium">Recruiter</span>
                        </Label>
                        <Label htmlFor="role-manager" className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 cursor-pointer hover:border-accent transition-colors [&:has([data-state=checked])]:border-accent [&:has([data-state=checked])]:bg-accent/5">
                          <RadioGroupItem value="account_manager" id="role-manager" className="sr-only" />
                          <Building2 className="h-5 w-5 text-manager" />
                          <span className="text-xs font-medium">Manager</span>
                        </Label>
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
                        placeholder="Enter invite code to join an organization"
                        value={signUpData.inviteCode}
                        onChange={(e) => setSignUpData({ ...signUpData, inviteCode: e.target.value.toUpperCase() })}
                        maxLength={20}
                      />
                      <p className="text-xs text-muted-foreground">
                        Get this code from a recruiter to see their organization's jobs
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
                        required
                        maxLength={100}
                      />
                    </div>
                  )}
                  
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </CardContent>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
