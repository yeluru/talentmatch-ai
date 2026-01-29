import type { AppRole } from '@/hooks/useAuth';

/** Org ID for recruiter-suite pages (Talent Sourcing, Jobs, etc.). Use for both recruiter and account_manager. */
export function orgIdForRecruiterSuite(
  roles: { role: AppRole; organization_id?: string }[]
): string | null {
  if (!roles?.length) return null;
  const r = roles.find((r) => r.role === 'recruiter' || r.role === 'account_manager');
  return r?.organization_id ?? null;
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

