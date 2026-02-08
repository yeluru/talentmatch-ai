import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

// Route label mappings - covers all routes
const routeLabels: Record<string, string> = {
  // Candidate routes
  'profile': 'My Profile',
  'resumes': 'My Resumes',
  'ai-analysis': 'ATS Checkpoint',
  'applications': 'My Applications',
  
  // Recruiter routes
  'talent-sourcing': 'Talent Sourcing',
  'talent-pool': 'Talent Pool',
  'talent-search': 'Talent Search',
  'talent-management': 'Talent Management',
  'ats-match-search': 'ATS Match Search',
  'jobs-home': 'Jobs',
  'pipelines': 'Pipelines',
  'communications': 'Communications',
  'insights-home': 'Insights',
  'automation-home': 'Automation',
  'uploads': 'Bulk Upload Profiles',
  'search': 'Talent Search',
  'api': 'API Integration',
  'agents': 'AI Agents',
  'shortlists': 'Shortlists',
  'outreach': 'Outreach',
  'insights': 'Insights',
  'new': 'Create New',
  'candidates': 'My Candidates',
  'ai-matching': 'AI Matching',
  'edit': 'Edit',
  'applicants': 'Applicants',
  'jobs': 'Jobs',
  'pipeline': 'Candidates Pipeline',

  // Manager routes
  'analytics': 'Analytics',
  'team': 'Team',
  'organization': 'Organization',
};

// Home paths for each role (by URL segment)
const roleConfig: Record<string, { label: string; href: string }> = {
  candidate: { label: 'Candidate', href: '/candidate' },
  recruiter: { label: 'Recruiter', href: '/recruiter' },
  manager: { label: 'Manager', href: '/manager' },
  'org-admin': { label: 'Org Admin', href: '/org-admin' },
};

export function Breadcrumbs() {
  const location = useLocation();
  const { currentRole } = useAuth();

  // Parse the current path
  const pathSegments = location.pathname.split('/').filter(Boolean);

  if (pathSegments.length === 0) {
    return null;
  }

  // Determine the role/home from first segment
  const roleKey = pathSegments[0];
  const role = roleConfig[roleKey] ?? (roleKey === 'org-admin' ? roleConfig['org-admin'] : null);
  const pathBasedRole = role;

  if (!pathBasedRole) {
    return null;
  }

  // When AM or Org Admin is viewing a recruiter URL (e.g. Open Pipeline), Home should go to their dashboard, not recruiter
  const homeLabel =
    currentRole === 'account_manager' && roleKey === 'recruiter'
      ? 'Manager'
      : currentRole === 'org_admin' && roleKey === 'recruiter'
        ? 'Org Admin'
        : pathBasedRole.label;
  const homeHref =
    currentRole === 'account_manager' && roleKey === 'recruiter'
      ? '/manager'
      : currentRole === 'org_admin' && roleKey === 'recruiter'
        ? '/org-admin'
        : pathBasedRole.href;

  // If we're on the dashboard (just /candidate, /recruiter, /manager), don't show breadcrumbs
  if (pathSegments.length === 1) {
    return null;
  }

  // Build breadcrumb items
  const breadcrumbs: BreadcrumbItem[] = [];
  let currentPath = '';

  pathSegments.forEach((segment, index) => {
    currentPath += `/${segment}`;

    // First segment is the role - show as home (use homeHref/homeLabel so AM on /recruiter goes to Manager)
    if (index === 0) {
      breadcrumbs.push({
        label: homeLabel,
        href: homeHref,
      });
      return;
    }
    
    // Check if this is a dynamic segment (UUID or other ID)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
    const isNumericId = /^\d+$/.test(segment);
    const isId = isUuid || isNumericId;
    
    // Get the label
    let label: string;
    if (isId) {
      // For IDs, use a contextual label based on previous segment
      const prevSegment = pathSegments[index - 1];
      if (prevSegment === 'jobs') {
        label = 'Job Details';
      } else if (prevSegment === 'shortlists') {
        label = 'Shortlist';
      } else if (prevSegment === 'candidates') {
        label = 'Candidate';
      } else {
        label = 'Details';
      }
    } else {
      label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
    }
    
    // Last item doesn't get a link
    const isLast = index === pathSegments.length - 1;
    
    breadcrumbs.push({
      label,
      href: isLast ? undefined : currentPath,
    });
  });
  
  return (
    <nav className="flex items-center gap-1.5 text-sm overflow-x-auto" aria-label="Breadcrumb">
      <Link
        to={homeHref}
        className="flex items-center hover:text-foreground transition-colors shrink-0"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </Link>
      
      {breadcrumbs.slice(1).map((item, index) => (
        <Fragment key={index}>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          {item.href ? (
            <Link
              to={item.href}
              className="hover:text-foreground transition-colors truncate max-w-[120px] sm:max-w-[150px]"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground truncate max-w-[120px] sm:max-w-[200px]">
              {item.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
