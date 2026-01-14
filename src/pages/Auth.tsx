import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
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

const signUpSchema = z
  .object({
    email: z.string().trim().email('Invalid email address').max(255),
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    confirmPassword: z.string().min(8).max(72),
    fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    organizationName: z.string().trim().max(100).optional(),
    inviteCode: z.string().max(20).optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const signInSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const resetSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

const updatePasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters').max(72),
    confirmPassword: z.string().min(8).max(72),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type AuthView = 'main' | 'forgot-password' | 'reset-sent' | 'update-password';

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
  org_admin: {
    gradient: 'from-red-500/20 via-orange-500/10 to-rose-500/20',
    accent: 'text-red-500',
    border: 'border-red-500/30',
    bg: 'bg-red-500/10',
    label: 'Org Admin',
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
  const { signIn, signUp, signOut, user, currentRole } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const inviteToken = searchParams.get('invite');
  const nextPath = searchParams.get('next');
  const pendingInviteToken =
    typeof window !== 'undefined' ? window.localStorage.getItem('pendingInviteToken') : null;
  const effectiveInviteToken = inviteToken || pendingInviteToken;

  // Invite details (pre-filled for recruiter invite flow)
  const [inviteDetails, setInviteDetails] = useState<{ email: string; fullName: string; organizationName: string; role: 'recruiter' | 'account_manager' | 'org_admin' } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(!!effectiveInviteToken);
  const [otpExpired, setOtpExpired] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);

  // Only candidates can self-sign up. Staff roles are invite-only.
  const [selectedRole, setSelectedRole] = useState<'candidate' | 'recruiter' | 'account_manager' | 'org_admin'>(
    inviteToken ? 'recruiter' : 'candidate'
  );
  const [authView, setAuthView] = useState<AuthView>('main');

  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>(inviteToken ? 'signup' : 'signin');

  const [signInData, setSignInData] = useState({ email: '', password: '' });
  const [signUpData, setSignUpData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    organizationName: '',
    inviteCode: '',
    marketplaceOptIn: false,
  });
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Fetch invite details when invite token is present
  useEffect(() => {
    if (!effectiveInviteToken) return;

    const fetchInviteDetails = async () => {
      try {
        // Persist invite token across email confirmation flows (which redirect away from /auth?invite=...).
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('pendingInviteToken', effectiveInviteToken);
        }

        const { data, error } = await supabase.functions.invoke('get-invite-details', {
          body: { inviteToken: effectiveInviteToken },
        });

        if (error) {
          return;
        }

        if (data?.email && data?.fullName) {
          // If someone is already signed in (often platform admin) and opens an invite link,
          // sign them out so they can complete setup with the invited email.
          const currentEmail = user?.email?.toLowerCase().trim();
          const invitedEmail = String(data.email).toLowerCase().trim();
          if (currentEmail && invitedEmail && currentEmail !== invitedEmail) {
            toast.message('Switching accounts', {
              description: `You’re signed in as ${user?.email}. This invite is for ${data.email}. Signing you out so you can complete setup.`,
            });
            await signOut();
          }

          setInviteDetails({
            email: data.email,
            fullName: data.fullName,
            organizationName: data.organizationName || '',
            role: (data.role as any) || 'recruiter',
          });
          setSignUpData((prev) => ({
            ...prev,
            email: data.email,
            fullName: data.fullName,
          }));
          setSelectedRole(((data.role as any) || 'recruiter') as any);
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
  }, [effectiveInviteToken, signOut, user?.email]);

  // If user comes back from a password recovery link, show the "set new password" view.
  useEffect(() => {
    const isRecovery =
      searchParams.get('reset') === 'true' ||
      (typeof window !== 'undefined' && window.location.hash.includes('type=recovery'));

    if (isRecovery) {
      setAuthView('update-password');
    }
  }, [searchParams]);

  // If a Supabase email verification link is clicked after it expires, Supabase redirects back with:
  // #error=access_denied&error_code=otp_expired...
  // This is NOT the invite token expiring. It's the email verification OTP expiring.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash || '';
    if (hash.includes('error_code=otp_expired')) {
      setOtpExpired(true);
      toast.error('Email verification link expired. Please resend and try again.');
    }
  }, []);

  const clearUrlHash = () => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const resendConfirmationEmail = async () => {
    const email = inviteDetails?.email || signUpData.email;
    if (!email) return;

    setResendingConfirmation(true);
    try {
      const redirectTo = (() => {
        const url = new URL(`${window.location.origin}/auth`);
        if (effectiveInviteToken) url.searchParams.set('invite', effectiveInviteToken);
        if (nextPath) url.searchParams.set('next', nextPath);
        return url.toString();
      })();

      // Supabase JS v2 supports auth.resend for signup confirmation
      const { error } = await (supabase.auth as any).resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;

      toast.success('Verification email re-sent. Check your inbox (Mailpit locally).');
      setOtpExpired(false);
      clearUrlHash();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to resend verification email');
    } finally {
      setResendingConfirmation(false);
    }
  };

  const loadInviteDetails = async (token: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('get-invite-details', {
        body: { inviteToken: token },
      });
      if (error) return null;
      if (!data?.email || !data?.fullName) return null;
      return {
        email: data.email as string,
        fullName: data.fullName as string,
        organizationName: (data.organizationName as string) || '',
        role: (data.role as any) as 'recruiter' | 'account_manager' | 'org_admin',
      };
    } catch {
      return null;
    }
  };

  const acceptRecruiterInviteIfPresent = async () => {
    const token = effectiveInviteToken;
    if (!token) return { accepted: false };

    const details = inviteDetails || (await loadInviteDetails(token));
    if (!details?.role) return { accepted: false };

    const role = details.role || 'recruiter';
    const rpcName =
      role === 'org_admin'
        ? 'accept_org_admin_invite'
        : role === 'account_manager'
          ? 'accept_manager_invite'
          : 'accept_recruiter_invite';

    const { data, error } = await supabase.rpc(rpcName as any, { _invite_token: token } as any);

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

    // Clear pending invite after successful claim
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('pendingInviteToken');
    }

    return { accepted: true };
  };

  // If the user is already signed in and opens an invite link, accept and redirect immediately.
  useEffect(() => {
    if (!user || !effectiveInviteToken) return;

    (async () => {
      const { accepted } = await acceptRecruiterInviteIfPresent();
      if (accepted) {
        const role = inviteDetails?.role || 'recruiter';
        const dest =
          role === 'org_admin'
            ? '/org-admin'
            : role === 'account_manager'
              ? '/manager'
              : '/recruiter';
        navigate(nextPath || dest, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, effectiveInviteToken]);

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
          const role = inviteDetails?.role || 'recruiter';
          const dest =
            role === 'org_admin'
              ? '/org-admin'
              : role === 'account_manager'
                ? '/manager'
                : '/recruiter';
          navigate(nextPath || dest);
          return;
        }

        if (!role) {
          toast.error(
            "Your account is active, but no role has been assigned yet. Please contact your administrator.",
          );
          // Stay on the auth page instead of redirecting to a random area.
          return;
        }

        const redirectPath = role === 'super_admin'
          ? '/admin'
          : role === 'org_admin'
          ? '/org-admin'
          : role === 'candidate'
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

      signUpSchema.parse(signUpData);

      const inviteRedirectTo =
        isInviteFlow && inviteToken
          ? (() => {
              const url = new URL(`${window.location.origin}/auth`);
              url.searchParams.set('invite', inviteToken);
              if (nextPath) url.searchParams.set('next', nextPath);
              return url.toString();
            })()
          : undefined;

      // For invite signups, create the user and then claim the invite via RPC after sign-in.
      const { error } = await signUp(
        signUpData.email,
        signUpData.password,
        signUpData.fullName,
        isInviteFlow ? (inviteDetails?.role || 'recruiter') : 'candidate',
        undefined,
        isInviteFlow ? undefined : (signUpData.inviteCode || undefined),
        signUpData.marketplaceOptIn,
        inviteRedirectTo
      );

      if (error) {
        if (error.message.includes('already registered')) {
          // This is common when the invitee previously started signup (or was partially created).
          // In invite flows, the fastest path is password recovery so they can sign in and claim the invite.
          if (inviteToken) {
            const redirectTo = new URL(`${window.location.origin}/auth`);
            redirectTo.searchParams.set('reset', 'true');
            redirectTo.searchParams.set('invite', inviteToken);
            if (nextPath) redirectTo.searchParams.set('next', nextPath);

            const { error: resetErr } = await supabase.auth.resetPasswordForEmail(signUpData.email, {
              redirectTo: redirectTo.toString(),
            });

            if (resetErr) {
              toast.error('This email already has an account. Please sign in (or use “Forgot password”).');
            } else {
              toast.success('Account already exists — we sent you a password reset link to continue.');
              setAuthView('reset-sent');
              setResetEmail(signUpData.email);
            }
          } else {
            toast.error('An account with this email already exists. Please sign in to continue.');
            setActiveTab('signin');
          }
        } else {
          toast.error(error.message || 'Failed to create account');
        }
      } else {
        // If auth email confirmations are enabled, signUp may not create a session yet.
        // In that case, tell the user to confirm email (Mailpit locally) before signing in.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.success('Check your email to confirm your account, then sign in.');
          setActiveTab('signin');
          setIsLoading(false);
          return;
        }

        // If this signup was initiated via recruiter invite, accept it and route to recruiter.
        const { accepted } = await acceptRecruiterInviteIfPresent();

        toast.success(inviteToken ? 'Welcome to the team!' : 'Account created successfully!');

        if (accepted) {
          const role = inviteDetails?.role || 'recruiter';
          const dest =
            role === 'org_admin'
              ? '/org-admin'
              : role === 'account_manager'
                ? '/manager'
                : '/recruiter';
          navigate(nextPath || dest);
          return;
        }

        navigate('/candidate');
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
      
      const redirectTo = new URL(`${window.location.origin}/auth`);
      redirectTo.searchParams.set('reset', 'true');
      if (inviteToken) redirectTo.searchParams.set('invite', inviteToken);
      if (nextPath) redirectTo.searchParams.set('next', nextPath);

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: redirectTo.toString(),
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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      updatePasswordSchema.parse({ password: newPassword, confirmPassword: confirmNewPassword });

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message || 'Failed to update password');
        return;
      }

      // If this was opened via an invite recovery link, claim it now.
      const { accepted } = await acceptRecruiterInviteIfPresent();

      toast.success('Password updated successfully');

      if (accepted) {
        navigate(nextPath || '/recruiter', { replace: true });
        return;
      }

      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Update Password View (password recovery)
  if (authView === 'update-password') {
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
          <SEOHead title="Set New Password" description="Set a new password for your TalentMatch AI account" noIndex />
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
                <Logo />
              </Link>
            </div>

            <Card className="border border-border/50 shadow-2xl backdrop-blur-sm bg-card/80">
              <CardHeader>
                <CardTitle className="text-2xl font-display">Set a new password</CardTitle>
                <CardDescription>
                  {inviteToken ? 'Set your password to continue and join the team.' : 'Set a new password for your account.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-12"
                      minLength={8}
                      maxLength={72}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-new-password">Confirm new password</Label>
                    <Input
                      id="confirm-new-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="h-12"
                      minLength={8}
                      maxLength={72}
                      required
                    />
                  </div>

                  <Button type="submit" variant="gradient" className="w-full h-12" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Update password
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setAuthView('main');
                      setActiveTab('signin');
                    }}
                  >
                    Back to sign in
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

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
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'signin' | 'signup')}>
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
                    {otpExpired && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                        <p className="font-medium text-destructive">Email verification link expired</p>
                        <p className="mt-1 text-muted-foreground">
                          Your invite link is still valid, but the email verification step timed out. Resend the verification email and try again.
                        </p>
                        <div className="mt-3 flex gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={resendConfirmationEmail}
                            disabled={resendingConfirmation || !(inviteDetails?.email || signUpData.email)}
                          >
                            {resendingConfirmation ? 'Resending…' : 'Resend verification email'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => { clearUrlHash(); setOtpExpired(false); }}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    )}
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
                    {/* Candidate is the only self-signup role; staff roles use invite links */}

                    {/* Invite badge */}
                    {inviteToken && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-500/10 border border-violet-500/30">
                        <Briefcase className="h-5 w-5 text-violet-500" />
                        <span className="text-sm font-medium">
                          Joining {inviteDetails?.organizationName || 'the organization'} as{' '}
                          {inviteDetails?.role === 'org_admin'
                            ? 'Org Admin'
                            : inviteDetails?.role === 'account_manager'
                              ? 'Manager'
                              : 'Recruiter'}
                        </span>
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
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                      <Input
                        id="signup-confirm-password"
                        type="password"
                        placeholder="••••••••"
                        value={signUpData.confirmPassword}
                        onChange={(e) =>
                          setSignUpData({ ...signUpData, confirmPassword: e.target.value })}
                        className="h-12"
                        required
                        minLength={8}
                        maxLength={72}
                      />
                    </div>

                    {!inviteToken && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="signup-invite-code">Organization invite code (optional)</Label>
                          <Input
                            id="signup-invite-code"
                            placeholder="8-character code"
                            value={signUpData.inviteCode}
                            onChange={(e) => setSignUpData({ ...signUpData, inviteCode: e.target.value })}
                            className="h-12"
                            maxLength={20}
                          />
                          <p className="text-xs text-muted-foreground">
                            If you have an invite code from a recruiting company, enter it to see their private jobs.
                          </p>
                        </div>

                        <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                          <Checkbox
                            id="signup-marketplace-opt-in"
                            checked={signUpData.marketplaceOptIn}
                            onCheckedChange={(v) => setSignUpData({ ...signUpData, marketplaceOptIn: Boolean(v) })}
                          />
                          <div className="space-y-1">
                            <Label htmlFor="signup-marketplace-opt-in" className="cursor-pointer">
                              Allow employers to discover my profile
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              If enabled, recruiters from other organizations can view your profile (without contact details) and invite you to engage.
                            </p>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Staff org creation removed for SaaS: invite-only staff roles */}

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
