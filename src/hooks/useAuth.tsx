import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'candidate' | 'recruiter' | 'account_manager';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone?: string;
  location?: string;
  avatar_url?: string;
  bio?: string;
  linkedin_url?: string;
}

interface UserRoleData {
  role: AppRole;
  organization_id?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  roles: UserRoleData[];
  currentRole: AppRole | null;
  organizationId: string | null;
  isLoading: boolean;
  signUp: (email: string, password: string, fullName: string, role: AppRole, organizationName?: string, inviteCode?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; role?: AppRole }>;
  signOut: () => Promise<void>;
  switchRole: (role: AppRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<UserRoleData[]>([]);
  const [currentRole, setCurrentRole] = useState<AppRole | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setCurrentRole(null);
          setOrganizationId(null);
          setIsLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      const [profileResult, rolesResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_roles').select('role, organization_id').eq('user_id', userId)
      ]);

      if (profileResult.data) {
        setProfile(profileResult.data as UserProfile);
      }

      if (rolesResult.data && rolesResult.data.length > 0) {
        const userRoles = rolesResult.data.map(r => ({
          role: r.role as AppRole,
          organization_id: r.organization_id ?? undefined
        }));
        setRoles(userRoles);
        
        // Set organization ID from role data
        const orgId = userRoles.find(r => r.organization_id)?.organization_id || null;
        setOrganizationId(orgId);
        
        const savedRole = localStorage.getItem('currentRole') as AppRole;
        if (savedRole && userRoles.find(r => r.role === savedRole)) {
          setCurrentRole(savedRole);
        } else {
          setCurrentRole(userRoles[0].role);
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: AppRole, organizationName?: string, inviteCode?: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      // If candidate with invite code, validate it first
      let candidateOrgId: string | null = null;
      if (role === 'candidate' && inviteCode) {
        const { data: orgId, error: codeError } = await supabase.rpc('use_invite_code', { 
          invite_code: inviteCode 
        });
        
        if (codeError || !orgId) {
          throw new Error('Invalid or expired invite code');
        }
        candidateOrgId = orgId;
      }
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned');

      let newOrganizationId: string | null = null;

      // For recruiters/managers, create new org first
      if (role !== 'candidate' && organizationName) {
        console.log('Creating organization:', organizationName);
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .insert({ name: organizationName })
          .select()
          .single();

        if (orgError) {
          console.error('Organization creation error:', orgError);
          throw new Error(`Failed to create organization: ${orgError.message}`);
        }
        console.log('Organization created:', orgData);
        newOrganizationId = orgData.id;
      }

      // Create user role
      console.log('Creating user role:', role, 'with org:', newOrganizationId);
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          role,
          organization_id: newOrganizationId,
        });

      if (roleError) {
        console.error('Role creation error:', roleError);
        throw new Error(`Failed to create user role: ${roleError.message}`);
      }

      // Ensure a public profile row exists (used across the app for display names)
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('user_id', authData.user.id)
        .maybeSingle();

      if (existingProfileError) {
        console.error('Profile lookup error:', existingProfileError);
        throw new Error(`Failed to look up profile: ${existingProfileError.message}`);
      }

      const normalizedName = fullName.trim();
      const isPlaceholderName = ['candidate', 'recruiter', 'account_manager', 'unknown'].includes(
        normalizedName.toLowerCase()
      );

      if (!existingProfile) {
        const { error: profileInsertError } = await supabase.from('profiles').insert({
          user_id: authData.user.id,
          email,
          full_name: normalizedName,
        });
        if (profileInsertError) {
          console.error('Profile insert error:', profileInsertError);
          throw new Error(`Failed to create profile: ${profileInsertError.message}`);
        }
      } else if (!existingProfile.full_name || isPlaceholderName) {
        const { error: profileUpdateError } = await supabase
          .from('profiles')
          .update({ full_name: normalizedName, email })
          .eq('id', existingProfile.id);
        if (profileUpdateError) {
          console.error('Profile update error:', profileUpdateError);
          throw new Error(`Failed to update profile: ${profileUpdateError.message}`);
        }
      }

      // For candidates, create candidate profile
      if (role === 'candidate') {
        const { error: candidateError } = await supabase.from('candidate_profiles').insert({
          user_id: authData.user.id,
          organization_id: candidateOrgId,
        });

        if (candidateError) {
          console.error('Candidate profile creation error:', candidateError);
          throw new Error(`Failed to create candidate profile: ${candidateError.message}`);
        }
      }

      return { error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      
      // Fetch user role to determine redirect
      if (data.user) {
        const { data: rolesData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.user.id);
        
        if (rolesData && rolesData.length > 0) {
          return { error: null, role: rolesData[0].role as AppRole };
        }
      }
      
      return { error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setCurrentRole(null);
    setOrganizationId(null);
    localStorage.removeItem('currentRole');
  };

  const switchRole = (role: AppRole) => {
    if (roles.find(r => r.role === role)) {
      setCurrentRole(role);
      localStorage.setItem('currentRole', role);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      roles,
      currentRole,
      organizationId,
      isLoading,
      signUp,
      signIn,
      signOut,
      switchRole
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}