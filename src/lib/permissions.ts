import type { AppRole } from '@/hooks/useAuth';

export type Capability =
  | 'recruiter.suite.access'
  | 'jobs.edit.any'
  | 'engagement.override'
  | 'templates.manage'
  | 'candidates.merge'
  | 'candidates.link.override';

export function can(role: AppRole | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  if (role === 'super_admin') return true;
  if (role === 'org_admin') return true;

  switch (capability) {
    case 'recruiter.suite.access':
      return role === 'recruiter' || role === 'account_manager';
    case 'jobs.edit.any':
      return role === 'account_manager' || role === 'org_admin' || role === 'super_admin';
    case 'engagement.override':
      return role === 'account_manager' || role === 'org_admin' || role === 'super_admin';
    case 'templates.manage':
      return role === 'account_manager' || role === 'org_admin' || role === 'super_admin';
    case 'candidates.merge':
      return role === 'account_manager' || role === 'org_admin' || role === 'super_admin';
    case 'candidates.link.override':
      return role === 'account_manager' || role === 'org_admin' || role === 'super_admin';
    default:
      return false;
  }
}

