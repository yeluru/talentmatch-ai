import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

// Route label mappings - covers all routes
const routeLabels: Record<string, string> = {
  // Candidate routes
  'profile': 'My Profile',
  'resumes': 'My Resumes',
  'ai-analysis': 'AI Resume Check',
  'applications': 'My Applications',
  
  // Recruiter routes
  'talent-sourcing': 'Talent Sourcing',
  'talent-pool': 'Talent Pool',
  'talent-search': 'Talent Search',
  'agents': 'AI Agents',
  'shortlists': 'Shortlists',
  'outreach': 'Outreach',
  'insights': 'Insights',
  'new': 'Create New',
  'candidates': 'Candidates',
  'ai-matching': 'AI Matching',
  'edit': 'Edit',
  'applicants': 'Applicants',
  'jobs': 'Jobs',
  
  // Manager routes
  'analytics': 'Analytics',
  'team': 'Team',
  'organization': 'Organization',
};

// Home paths for each role
const roleConfig: Record<string, { label: string; href: string }> = {
  candidate: { label: 'Candidate', href: '/candidate' },
  recruiter: { label: 'Recruiter', href: '/recruiter' },
  manager: { label: 'Manager', href: '/manager' },
};

export function Breadcrumbs() {
  const location = useLocation();
  
  // Parse the current path
  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  if (pathSegments.length === 0) {
    return null;
  }
  
  // Determine the role/home from first segment
  const roleKey = pathSegments[0];
  const role = roleConfig[roleKey];
  
  if (!role) {
    return null;
  }
  
  // If we're on the dashboard (just /candidate, /recruiter, /manager), don't show breadcrumbs
  if (pathSegments.length === 1) {
    return null;
  }
  
  // Build breadcrumb items
  const breadcrumbs: BreadcrumbItem[] = [];
  let currentPath = '';
  
  pathSegments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    
    // First segment is the role - show as home
    if (index === 0) {
      breadcrumbs.push({
        label: role.label,
        href: role.href,
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
        to={role.href}
        className="flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </Link>
      
      {breadcrumbs.slice(1).map((item, index) => (
        <Fragment key={index}>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          {item.href ? (
            <Link
              to={item.href}
              className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[120px] sm:max-w-[150px]"
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
