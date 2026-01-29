import { useLocation, Navigate } from 'react-router-dom';
import { CategoryLanding } from '@/components/recruiter/CategoryLanding';
import { RECRUITER_CATEGORY_LANDINGS } from '@/lib/recruiterCategoryLandings';

const PATH_TO_CATEGORY: Record<string, string> = {
  '/recruiter/talent-management': 'TALENT MANAGEMENT',
  '/recruiter/jobs-home': 'Jobs',
  '/recruiter/pipelines': 'Pipelines',
  '/recruiter/communications': 'Communications',
  '/recruiter/insights-home': 'Insights',
  '/recruiter/automation-home': 'Automation',
};

export default function CategoryLandingPage() {
  const { pathname } = useLocation();
  const categoryKey = PATH_TO_CATEGORY[pathname];
  const config = categoryKey ? RECRUITER_CATEGORY_LANDINGS[categoryKey] : null;

  if (!config) {
    return <Navigate to="/recruiter" replace />;
  }

  return <CategoryLanding config={config} />;
}
