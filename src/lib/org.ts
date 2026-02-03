import type { AppRole } from '@/hooks/useAuth';

/** Org ID for recruiter-suite pages (Talent Sourcing, Jobs, etc.). Use for both recruiter and account_manager. */
export function orgIdForRecruiterSuite(
  roles: { role: AppRole; organization_id?: string }[]
): string | null {
  if (!roles?.length) return null;
  const r = roles.find((r) => r.role === 'recruiter' || r.role === 'account_manager');
  return r?.organization_id ?? null;
}

/**
 * When viewing recruiter-suite pages (Jobs, Applicants, Pipelines, Communications), data is scoped per recruiter.
 * - Recruiter role: show only current user's data (jobs, applications, engagements, etc.).
 * - Account Manager / Org Admin with ?owner=xxx: show that recruiter's data.
 * - Account Manager / Org Admin without owner: oversight view (all org data).
 */
export function effectiveRecruiterOwnerId(
  currentRole: AppRole | null | undefined,
  userId: string | undefined,
  ownerParam: string | null
): string | null {
  if (currentRole === 'recruiter') return userId ?? null;
  if (currentRole === 'account_manager' || currentRole === 'org_admin' || currentRole === 'super_admin') {
    return ownerParam || null;
  }
  return null;
}

export function orgIdForRole(
  roles: { role: AppRole; organization_id?: string }[],
  currentRole: AppRole | null | undefined
): string | null {
  if (!roles?.length) return null;
  const direct = currentRole ? roles.find((r) => r.role === currentRole)?.organization_id : undefined;
  if (direct) return String(direct);
  // Fallbacks for cross-suite access (e.g. account_manager viewing recruiter pages)
  const recruiterOrg = roles.find((r) => r.role === 'recruiter')?.organization_id;
  if (recruiterOrg) return String(recruiterOrg);
  const managerOrg = roles.find((r) => r.role === 'account_manager')?.organization_id;
  if (managerOrg) return String(managerOrg);
  const orgAdminOrg = roles.find((r) => r.role === 'org_admin')?.organization_id;
  if (orgAdminOrg) return String(orgAdminOrg);
  return null;
}

