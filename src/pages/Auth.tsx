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
import { Sparkles, User, Briefcase, Building2, Loader2 } from 'lucide-react';
import { z } from 'zod';

const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  organizationName: z.string().optional(),
  inviteCode: z.string().optional(),
});

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'candidate' | 'recruiter' | 'account_manager'>('candidate');
  
  const [signInData, setSignInData] = useState({ email: '', password: '' });
  const [signUpData, setSignUpData] = useState({ 
    email: '', 
    password: '', 
    fullName: '', 
    organizationName: '',
    inviteCode: ''
  });

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const { error, role } = await signIn(signInData.email, signInData.password);
    
    if (error) {
      toast.error(error.message || 'Failed to sign in');
    } else {
      toast.success('Welcome back!');
      // Redirect based on actual role from DB
      const redirectPath = role === 'candidate' 
        ? '/candidate' 
        : role === 'recruiter' 
        ? '/recruiter' 
        : '/manager';
      navigate(redirectPath);
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
        toast.error(error.message || 'Failed to create account');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
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
                    <Label htmlFor="signin-password">Password</Label>
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
                    />
                  </div>
                  
                  {selectedRole === 'candidate' && (
                    <div className="space-y-2">
                      <Label htmlFor="signup-invite">Invite Code (optional)</Label>
                      <Input
                        id="signup-invite"
                        placeholder="Enter invite code to join an organization"
                        value={signUpData.inviteCode}
                        onChange={(e) => setSignUpData({ ...signUpData, inviteCode: e.target.value.toUpperCase() })}
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