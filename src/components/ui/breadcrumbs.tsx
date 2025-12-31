import { Fragment } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

// Route label mappings
const routeLabels: Record<string, string> = {
  // Candidate routes
  'candidate': 'Dashboard',
  'profile': 'My Profile',
  'resumes': 'My Resumes',
  'ai-analysis': 'AI Resume Check',
  'jobs': 'Jobs',
  'applications': 'My Applications',
  
  // Recruiter routes
  'recruiter': 'Dashboard',
  'talent-sourcing': 'Talent Sourcing',
  'talent-pool': 'Talent Pool',
  'talent-search': 'Talent Search',
  'agents': 'AI Agents',
  'shortlists': 'Shortlists',
  'outreach': 'Outreach',
  'insights': 'Insights',
  'new': 'Post New Job',
  'candidates': 'Candidates',
  'ai-matching': 'AI Matching',
  'edit': 'Edit',
  'applicants': 'Applicants',
  
  // Manager routes
  'manager': 'Dashboard',
  'analytics': 'Analytics',
  'team': 'Team',
  'organization': 'Organization',
};

// Home paths for each role
const homeRoutes: Record<string, { label: string; href: string }> = {
  candidate: { label: 'Candidate', href: '/candidate' },
  recruiter: { label: 'Recruiter', href: '/recruiter' },
  manager: { label: 'Manager', href: '/manager' },
};

export function Breadcrumbs() {
  const location = useLocation();
  const params = useParams();
  
  // Parse the current path
  const pathSegments = location.pathname.split('/').filter(Boolean);
  
  if (pathSegments.length === 0) {
    return null;
  }
  
  // Determine the role/home from first segment
  const roleKey = pathSegments[0];
  const home = homeRoutes[roleKey];
  
  if (!home) {
    return null;
  }
  
  // Build breadcrumb items
  const breadcrumbs: BreadcrumbItem[] = [
    { label: home.label, href: home.href }
  ];
  
  let currentPath = '';
  
  pathSegments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    
    // Skip the first segment (role) as it's already added as home
    if (index === 0) return;
    
    // Check if this is a dynamic segment (UUID or other ID)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
    const isId = isUuid || /^\d+$/.test(segment);
    
    if (isId) {
      // For IDs, we'll use a generic label or try to get context from URL
      // The actual name will be populated by the page component if needed
      breadcrumbs.push({
        label: 'Details',
        href: currentPath,
      });
    } else {
      const label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
      
      // Don't add link for last item
      const isLast = index === pathSegments.length - 1;
      
      breadcrumbs.push({
        label,
        href: isLast ? undefined : currentPath,
      });
    }
  });
  
  // Don't show breadcrumbs if we're just on the home page
  if (breadcrumbs.length <= 1) {
    return null;
  }
  
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
      <Link 
        to={home.href}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home className="h-4 w-4" />
      </Link>
      
      {breadcrumbs.map((item, index) => (
        <Fragment key={index}>
          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          {item.href ? (
            <Link
              to={item.href}
              className="text-muted-foreground hover:text-foreground transition-colors max-w-[150px] truncate"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground max-w-[200px] truncate">
              {item.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
