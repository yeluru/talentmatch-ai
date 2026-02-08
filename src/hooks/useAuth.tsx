// Auth provider and hook for managing user sessions
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'candidate' | 'recruiter' | 'account_manager' | 'org_admin' | 'super_admin';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  location?: string;
  avatar_url?: string;
  bio?: string;
  linkedin_url?: string;
  is_suspended?: boolean;
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
  isSuperAdmin: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: AppRole,
    organizationName?: string,
    inviteCode?: string,
    marketplaceOptIn?: boolean,
    emailRedirectToOverride?: string,
  ) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; role?: AppRole }>;
  signOut: () => Promise<void>;
  switchRole: (role: AppRole) => void;
  /** Refetch current user profile (e.g. after editing profile). */
  refetchProfile: () => Promise<void>;
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (!session?.user) {
          setProfile(null);
          setRoles([]);
          setCurrentRole(null);
          setOrganizationId(null);
          setIsSuperAdmin(false);
          setIsLoading(false);
          return;
        }

        // IMPORTANT:
        // Supabase emits TOKEN_REFRESHED (and sometimes USER_UPDATED) when the tab regains focus.
        // If we flip global `isLoading` after the app has already hydrated, ProtectedRoute will
        // unmount the current page and users will lose in-progress form input.
        //
        // Rule:
        // - Before first hydration: allow blocking load.
        // - After hydration: always refresh silently (no global loading gate).
        const isBlockingAllowed = !hasHydrated;

        if (isBlockingAllowed && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
          setIsLoading(true);
          const token = session.access_token;
          setTimeout(() => {
            fetchUserData(session.user.id, { silent: false, accessToken: token });
          }, 0);
          return;
        }

        // Everything else (TOKEN_REFRESHED, USER_UPDATED, etc.) should be silent.
        fetchUserData(session.user.id, { silent: true, accessToken: session.access_token }).catch(() => { });
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setIsLoading(true);
        fetchUserData(session.user.id, { silent: false, accessToken: session.access_token });
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string, opts?: { silent?: boolean; accessToken?: string }) => {
    const silent = Boolean(opts?.silent);
    const accessToken = opts?.accessToken;
    // Never re-enable the global loading gate after first hydration.
    if (!silent && !hasHydrated) setIsLoading(true);
    try {
      // Pass token explicitly when we have it (e.g. right after sign-in) so the Edge Function receives it
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
      const { data, error } = await supabase.functions.invoke('get-my-auth-data', { headers });
      if (error) throw error;
      const profileRow = (data as { profile?: UserProfile | null } | null)?.profile ?? null;
      const rolesData = (data as { roles?: { role: string; organization_id?: string }[] } | null)?.roles ?? [];

      if (profileRow) setProfile(profileRow as UserProfile);

      if (rolesData.length > 0) {
        const userRoles = rolesData.map(r => ({
          role: r.role as AppRole,
          organization_id: r.organization_id ?? undefined
        }));
        // All account managers can switch to Recruiter: add synthetic recruiter role if not already present
        const hasAccountManager = userRoles.some(r => r.role === 'account_manager');
        const hasRecruiter = userRoles.some(r => r.role === 'recruiter');
        if (hasAccountManager && !hasRecruiter) {
          const amRole = userRoles.find(r => r.role === 'account_manager');
          if (amRole?.organization_id) {
            userRoles.push({ role: 'recruiter' as AppRole, organization_id: amRole.organization_id });
          }
        }
        setRoles(userRoles);

        // Check if user is super admin
        const hasSuperAdmin = userRoles.some(r => r.role === 'super_admin');
        setIsSuperAdmin(hasSuperAdmin);

        const orgId = userRoles.find(r => r.organization_id)?.organization_id || null;
        setOrganizationId(orgId);

        // For super admins, prioritize super_admin role.
        // For tenant org admins, prioritize org_admin role.
        const hasOrgAdmin = userRoles.some(r => r.role === 'org_admin');
        if (hasSuperAdmin) {
          setCurrentRole('super_admin');
        } else if (hasOrgAdmin) {
          setCurrentRole('org_admin');
        } else {
          const savedRole = localStorage.getItem('currentRole') as AppRole;
          if (savedRole && userRoles.find(r => r.role === savedRole)) {
            setCurrentRole(savedRole);
          } else {
            // Default account_manager to Account Manager view (they can switch to Recruiter)
            const defaultRole = userRoles.some(r => r.role === 'account_manager') ? 'account_manager' : userRoles[0].role;
            setCurrentRole(defaultRole);
          }
        }
      } else {
        setRoles([]);
        setCurrentRole(null);
        setOrganizationId(null);
        setIsSuperAdmin(false);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      if (!silent) setIsLoading(false);
      if (!hasHydrated) setHasHydrated(true);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: AppRole,
    organizationName?: string,
    inviteCode?: string,
    marketplaceOptIn?: boolean,
    emailRedirectToOverride?: string,
  ) => {
    try {
      const redirectUrl = emailRedirectToOverride || `${window.location.origin}/`;
      const isInviteStaffSignup =
        role !== 'candidate' && (!organizationName || organizationName.trim().length === 0);

      // If candidate with invite code, validate it first
      let candidateOrgId: string | null = null;
      if (role === 'candidate' && inviteCode) {
        // Validate only (do not consume; consuming requires an authenticated session)
        const { data: orgId, error: codeError } = await supabase.rpc('validate_invite_code', {
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
            full_name: fullName,
            intended_role: role,
            marketplace_opt_in: !!marketplaceOptIn,
            candidate_invite_code: role === 'candidate' ? (inviteCode || null) : null,
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('No user returned');

      // IMPORTANT:
      // When auth email confirmations are enabled, signUp may return NO session.
      // In that case, client-side inserts into RLS-protected tables (profiles/candidate_profiles/user_roles)
      // will fail because auth.uid() is null. We rely on the database trigger `handle_new_user()`
      // to create the `profiles` row on auth.users insert.

      let newOrganizationId: string | null = null;

      // For org creation (only allowed for non-invite signups).
      // In our SaaS flow, staff accounts are normally invite-only; org creation is handled by platform/ops.
      if (!isInviteStaffSignup && role !== 'candidate' && organizationName) {
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

      // If we don't have a session yet (e.g. email confirmation required), defer role/profile creation
      // until the user actually signs in.
      if (!authData.session) {
        return { error: null };
      }

      // Create user role using secure RPC function.
      // NOTE: invite signups should NOT self-assign roles here; the role is granted when the invite is accepted.
      if (!isInviteStaffSignup) {
        // Safety: if this user was bootstrapped as a platform admin (e.g. via allowlist trigger),
        // do NOT also assign candidate role / create candidate profile.
        if (role === 'candidate') {
          const signUpToken = authData.session?.access_token;
          const { data: authDataCheck } = await supabase.functions.invoke('get-my-auth-data', {
            headers: signUpToken ? { Authorization: `Bearer ${signUpToken}` } : undefined,
          });
          const rolesCheck = (authDataCheck as { roles?: { role: string }[] } | null)?.roles ?? [];
          if (rolesCheck.some((r: { role: string }) => r.role === 'super_admin')) {
            return { error: null };
          }
        }

        console.log('Creating user role:', role, 'with org:', newOrganizationId);
        const { error: roleError } = await supabase.rpc('assign_user_role', {
          _user_id: authData.user.id,
          _role: role,
          _organization_id: newOrganizationId,
        });

        if (roleError) {
          console.error('Role creation error:', roleError);
          throw new Error(`Failed to create user role: ${roleError.message}`);
        }
      }

      // For candidates, create candidate profile
      if (role === 'candidate') {
        const visibilityLevel = marketplaceOptIn ? 'full' : 'anonymous';
        const { data: cpRow, error: candidateError } = await supabase
          .from('candidate_profiles')
          .insert({
            user_id: authData.user.id,
            marketplace_opt_in: !!marketplaceOptIn,
            marketplace_visibility_level: visibilityLevel,
            full_name: fullName,
            email,
          })
          .select('id')
          .single();

        if (candidateError) {
          console.error('Candidate profile creation error:', candidateError);
          throw new Error(`Failed to create candidate profile: ${candidateError.message}`);
        }

        // If candidate signed up with an org invite code and we have a session, consume it now
        // (this increments uses_count and creates candidate_org_links).
        if (inviteCode) {
          try {
            await supabase.rpc('consume_invite_code', { invite_code: inviteCode });
          } catch (e) {
            // Soft-fail: the candidate can still use the product; they just won't see private jobs
            // until they link (org admin) or re-enter the code later.
            console.warn('Failed to consume invite code', e);
          }
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

      const token = data.session?.access_token;

      // Fetch roles via edge function (avoids RLS 500 on user_roles)
      if (data.user) {
        const { data: authData } = await supabase.functions.invoke('get-my-auth-data', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const rolesData = (authData as { roles?: { role: string }[] } | null)?.roles ?? [];
        if (rolesData.length > 0) {
          return { error: null, role: rolesData[0].role as AppRole };
        }

        // If the user has no roles, attempt platform-admin bootstrap (allowlist-based).
        try {
          await supabase.functions.invoke('bootstrap-platform-admin', {
            body: {},
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          const { data: authDataAfter } = await supabase.functions.invoke('get-my-auth-data', {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          const rolesAfter = (authDataAfter as { roles?: { role: string }[] } | null)?.roles ?? [];
          if (rolesAfter.length > 0) {
            return { error: null, role: rolesAfter[0].role as AppRole };
          }
        } catch {
          // ignore; fall through to candidate bootstrap logic below
        }

        // Bootstrap candidate role ONLY when we have a clear signal this is a candidate account:
        // - New candidate signup sets user_metadata.intended_role = 'candidate'
        // - Or we already have a candidate_profiles row (legacy accounts)
        //
        // Never default unknown/no-role users to candidate (platform/staff accounts are invite/manual).
        const intended = (data.user.user_metadata as any)?.intended_role as AppRole | undefined;

        // Defensive: avoid maybeSingle() coercion errors if duplicate candidate_profiles exist.
        const { data: existingCandidateRows } = await supabase
          .from('candidate_profiles')
          .select('id, updated_at')
          .eq('user_id', data.user.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        const existingCandidate = (existingCandidateRows || [])[0] || null;

        const shouldBootstrapCandidate = intended === 'candidate' || !!existingCandidate;

        if (shouldBootstrapCandidate) {
          const { error: roleError } = await supabase.rpc('assign_user_role', {
            _user_id: data.user.id,
            _role: 'candidate',
            _organization_id: null,
          });
          if (roleError) throw roleError;

          if (!existingCandidate) {
            const desiredOptIn = !!(data.user.user_metadata as any)?.marketplace_opt_in;
            const visibilityLevel = desiredOptIn ? 'full' : 'anonymous';
            const fullName = (data.user.user_metadata as any)?.full_name || null;
            const email = (data.user.email as string | undefined) || null;
            const { error: candErr } = await supabase.from('candidate_profiles').insert({
              user_id: data.user.id,
              marketplace_opt_in: desiredOptIn,
              marketplace_visibility_level: visibilityLevel,
              full_name: fullName,
              email,
            });
            if (candErr) throw candErr;
          } else {
            const desiredOptIn = !!(data.user.user_metadata as any)?.marketplace_opt_in;
            if (desiredOptIn) {
              await supabase
                .from('candidate_profiles')
                .update({ marketplace_opt_in: true, marketplace_visibility_level: 'full' } as any)
                .eq('user_id', data.user.id);
            }
          }

          // If the user signed up with a candidate invite code but didn't have a session at signup time,
          // consume it now to link candidate ↔ org.
          const inviteCode = (data.user.user_metadata as any)?.candidate_invite_code as string | null | undefined;
          if (inviteCode) {
            try {
              await supabase.rpc('consume_invite_code', { invite_code: inviteCode });
            } catch (e) {
              console.warn('Failed to consume invite code on sign-in bootstrap', e);
            }
          }

          return { error: null, role: 'candidate' as AppRole };
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
    setIsSuperAdmin(false);
    localStorage.removeItem('currentRole');
  };

  const switchRole = (role: AppRole) => {
    if (roles.find(r => r.role === role)) {
      setCurrentRole(role);
      localStorage.setItem('currentRole', role);
    }
  };

  const refetchProfile = async () => {
    if (user?.id) await fetchUserData(user.id, { silent: true });
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
      isSuperAdmin,
      signUp,
      signIn,
      signOut,
      switchRole,
      refetchProfile
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