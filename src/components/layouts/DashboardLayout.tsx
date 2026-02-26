import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Home,
  Briefcase,
  FileText,
  Users,
  Settings,
  LogOut,
  User,
  Search,
  PlusCircle,
  BarChart3,
  Sparkles,
  Building2,
  ChevronDown,
  Bot,
  Mail,
  ListChecks,
  Upload,
  Moon,
  Sun,
  BookOpen,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CATEGORY_LANDING_HREFS } from '@/lib/recruiterCategoryLandings';


interface DashboardLayoutProps {
  children: ReactNode;
}

const SIDEBAR_DESKTOP_OPEN_KEY = 'sidebar:desktopOpen';

const candidateNavItems = [
  { title: 'Dashboard', href: '/candidate', icon: Home },
  { title: 'My Profile', href: '/candidate/profile', icon: User },
  { title: 'My Resumes', href: '/candidate/resumes', icon: FileText },
  { title: 'Resume Workspace', href: '/candidate/resume-workspace', icon: FileText },
  { title: 'ATS Checkpoint', href: '/candidate/ai-analysis', icon: Sparkles },
  { title: 'Find Jobs', href: '/candidate/jobs', icon: Search },
  { title: 'Job Alerts', href: '/candidate/job-alerts', icon: Mail },
  { title: 'My Applications', href: '/candidate/applications', icon: Briefcase },
  { title: 'Help & How-to', href: '/candidate/help', icon: BookOpen },
];

const recruiterNavItems = [
  // kept for non-grouped contexts (e.g., breadcrumbs/tooltips); grouped rendering uses recruiterNavGroups below
  { title: 'Dashboard', href: '/recruiter', icon: Home },
];

type NavItem = { title: string; href: string; icon: any };
type NavGroup = { label: string; items: NavItem[] };

const recruiterNavGroups: NavGroup[] = [
  {
    label: 'TALENT MANAGEMENT',
    items: [
      { title: 'Talent Pool', href: '/recruiter/talent-pool', icon: Users },
      { title: 'Talent Search', href: '/recruiter/search', icon: Search }, // Unified: Internal Pool + External Web
      { title: 'Shortlists', href: '/recruiter/shortlists', icon: ListChecks },
      // OLD ROUTES (kept for rollback):
      // { title: 'ATS Match Search', href: '/recruiter/ats-match-search', icon: Search },
      // { title: 'Talent Search', href: '/recruiter/talent-search/search', icon: Search },
      // { title: 'Bulk Upload Profiles', href: '/recruiter/talent-search/uploads', icon: Upload },
      // { title: 'Marketplace Profiles', href: '/recruiter/marketplace', icon: Search },
      // { title: 'API Integration', href: '/recruiter/talent-search/api', icon: Sparkles },
    ],
  },
  {
    label: 'Jobs',
    items: [
      { title: 'Jobs', href: '/recruiter/jobs', icon: Briefcase },
      { title: 'Post a Job', href: '/recruiter/jobs/new', icon: PlusCircle },
      { title: 'My Applicants', href: '/recruiter/candidates', icon: Users },
      // { title: 'AI Matching', href: '/recruiter/ai-matching', icon: Sparkles },
    ],
  },
  {
    label: 'Pipelines',
    items: [
      { title: 'Pipelines', href: '/recruiter/pipeline', icon: ListChecks },
      { title: 'Interviews', href: '/recruiter/interviews', icon: Briefcase },
    ],
  },
  // Hidden for prod push – code/routes remain; uncomment to re-enable in nav
  // {
  //   label: 'Communications',
  //   items: [
  //     { title: 'Outreach', href: '/recruiter/outreach', icon: Mail },
  //     { title: 'Email Templates', href: '/recruiter/email-templates', icon: Mail },
  //   ],
  // },
  // {
  //   label: 'Insights',
  //   items: [{ title: 'Insights', href: '/recruiter/insights', icon: BarChart3 }],
  // },
  {
    label: 'Support',
    items: [{ title: 'Help & How-to', href: '/recruiter/help', icon: BookOpen }],
  },
];

const managerNavItems = [
  { title: 'Dashboard', href: '/manager', icon: Home },
  { title: 'Team', href: '/manager/team', icon: Users },
  { title: 'Candidates', href: '/manager/candidates', icon: User },
  { title: 'Clients', href: '/manager/clients', icon: Building2 },
  { title: 'Jobs', href: '/manager/jobs', icon: Briefcase },
  { title: 'Organization', href: '/manager/organization', icon: Building2 },
  { title: 'Audit Logs', href: '/manager/audit-logs', icon: FileText },
  { title: 'Team Activity', href: '/manager/team-activity', icon: Activity },
  { title: 'Help & How-to', href: '/manager/help', icon: BookOpen },
];

/** Account Manager: oversight-only nav (Manager Dashboard, Team, etc.). */
const accountManagerOversightNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/manager', icon: Home },
  { title: 'Team', href: '/manager/team', icon: Users },
  { title: 'Candidates', href: '/manager/candidates', icon: User },
  { title: 'Jobs', href: '/manager/jobs', icon: Briefcase },
  { title: 'Clients', href: '/manager/clients', icon: Building2 },
  { title: 'Organization', href: '/manager/organization', icon: Building2 },
  { title: 'Audit Logs', href: '/manager/audit-logs', icon: FileText },
  { title: 'Team Activity', href: '/manager/team-activity', icon: Activity },
  { title: 'Help & How-to', href: '/manager/help', icon: BookOpen },
];

const orgAdminNavItems = [
  { title: 'Dashboard', href: '/org-admin', icon: Home },
  { title: 'Team Activity', href: '/org-admin/team-activity', icon: Activity },
];

function DashboardLayoutInner({
  children,
  isDark,
  setIsDark,
}: DashboardLayoutProps & { isDark: boolean; setIsDark: (next: boolean) => void }) {
  const { profile, currentRole, roles, signOut, switchRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobile, setOpenMobile } = useSidebar();

  // Auto-close mobile nav after navigation
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, location.pathname, setOpenMobile]);

  const navItems =
    currentRole === 'candidate'
      ? candidateNavItems
      : currentRole === 'recruiter'
        ? recruiterNavItems
        : currentRole === 'org_admin'
          ? orgAdminNavItems
          : managerNavItems;

  const roleLabel =
    currentRole === 'candidate'
      ? 'Candidate'
      : currentRole === 'recruiter'
        ? 'Recruiter'
        : currentRole === 'org_admin'
          ? 'Org Admin'
          : currentRole === 'super_admin'
            ? 'Super Admin'
            : 'Account Manager';

  const roleColor =
    currentRole === 'candidate'
      ? 'bg-candidate/10 text-candidate'
      : currentRole === 'recruiter'
        ? 'bg-recruiter/10 text-recruiter'
        : currentRole === 'org_admin'
          ? 'bg-accent/10 text-accent'
          : currentRole === 'super_admin'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-manager/10 text-manager';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleRoleSwitch = (role: 'candidate' | 'recruiter' | 'account_manager' | 'org_admin' | 'super_admin') => {
    switchRole(role);
    if (role === 'super_admin') {
      navigate('/admin');
    } else if (role === 'org_admin') {
      navigate('/org-admin');
    } else if (role === 'candidate') {
      navigate('/candidate');
    } else if (role === 'recruiter') {
      // Stay on current recruiter path but strip ?owner= so we're 100% in recruiter mode (no AM view-as state).
      if (location.pathname.startsWith('/recruiter')) {
        const params = new URLSearchParams(location.search);
        params.delete('owner');
        const search = params.toString();
        navigate(location.pathname + (search ? `?${search}` : ''), { replace: true });
      } else {
        navigate('/recruiter');
      }
      // Invalidate recruiter-scoped queries so no stale data from AM view (e.g. pipeline, jobs, applications).
      queryClient.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === 'string' && (
          key.startsWith('pipeline-') || key.startsWith('recruiter-') || key.startsWith('owner-') ||
          key === 'talent-pool' || key === 'talent-detail' || key === 'job-applicants' ||
          key.startsWith('job-applicants') || key === 'interviews' ||
          key === 'org-jobs-agents' || key === 'org-jobs-outreach' || key === 'outreach-campaigns' ||
          key === 'email-templates' || key === 'shortlist-candidates' || key === 'shortlists'
        );
      } });
    } else {
      navigate('/manager');
    }
  };

  const isCandidate = currentRole === 'candidate';

  return (
    <div className={cn("flex w-full", isCandidate ? "candidate-dashboard-bg" : "dashboard-bg")} style={{ minHeight: '100vh' }}>
      <Sidebar variant="floating" collapsible="icon" className="border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border p-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 text-primary-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <span className="font-display font-bold text-xl tracking-tight group-data-[collapsible=icon]:hidden">
              Ultra<span className="text-accent">Hire</span>
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent className="p-2">
          <SidebarMenu>
            {currentRole === 'recruiter' ? (
              <>
                <SidebarMenuItem key="/recruiter">
                  <SidebarMenuButton
                    asChild
                    tooltip="Dashboard"
                    isActive={location.pathname === '/recruiter'}
                    className={cn(
                      "relative w-full justify-start gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                      "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
                      location.pathname === '/recruiter'
                        ? "bg-accent/10 text-sidebar-foreground border border-sidebar-border shadow-sm before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:rounded-full before:bg-accent group-data-[collapsible=icon]:before:hidden"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                    )}
                  >
                    <Link
                      to="/recruiter"
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <Home className="h-4 w-4 shrink-0" />
                      <span className="font-medium group-data-[collapsible=icon]:hidden">Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {recruiterNavGroups.map((group) => {
                  const landingHref = CATEGORY_LANDING_HREFS[group.label];
                  return (
                  <div key={group.label} className="mt-2">
                    {landingHref ? (
                      <Link
                        to={landingHref}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                        className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors cursor-pointer group-data-[collapsible=icon]:hidden block"
                      >
                        {group.label}
                      </Link>
                    ) : (
                      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
                        {group.label}
                      </div>
                    )}
                    {group.items.map((item) => {
                      const active =
                        location.pathname === item.href ||
                        (location.pathname.startsWith(item.href + '/') && item.href !== '/recruiter');
                      return (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton
                            asChild
                            tooltip={item.title}
                            isActive={active}
                            className={cn(
                              "relative w-full justify-start gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
                              active
                                ? "bg-accent/10 text-sidebar-foreground border border-sidebar-border shadow-sm before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:rounded-full before:bg-accent group-data-[collapsible=icon]:before:hidden"
                                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                            )}
                          >
                            <Link
                              to={item.href}
                              onClick={() => {
                                if (isMobile) setOpenMobile(false);
                              }}
                            >
                              <item.icon className="h-4 w-4 shrink-0" />
                              <span className="font-medium group-data-[collapsible=icon]:hidden">{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </div>
                  );
                })}
              </>
            ) : currentRole === 'account_manager' ? (
              <>
                {/* TEAM & OVERSIGHT ONLY — AM sees oversight nav only; switch to Recruiter role for recruiting. */}
                <div className="space-y-1 group-data-[collapsible=icon]:space-y-0">
                  <div className="px-3 py-2 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-manager group-data-[collapsible=icon]:hidden">
                      Team &amp; Oversight
                    </div>
                    <div className="text-[10px] text-sidebar-foreground/50 mt-0.5 group-data-[collapsible=icon]:hidden">
                      Manage team, view org, track progress
                    </div>
                  </div>
                  {accountManagerOversightNavItems.map((item) => {
                    const active =
                      location.pathname === item.href ||
                      (item.href !== '/manager' && location.pathname.startsWith(item.href + '/'));
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          tooltip={item.title}
                          isActive={active}
                          className={cn(
                            "relative w-full justify-start gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
                            active
                              ? "bg-manager/10 text-sidebar-foreground border border-manager/20 shadow-sm before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:rounded-full before:bg-manager group-data-[collapsible=icon]:before:hidden"
                              : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-manager/5"
                          )}
                        >
                          <Link to={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                            <span className="font-medium group-data-[collapsible=icon]:hidden">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </div>
              </>
            ) : (
              navItems.map((item) => {
                const active = location.pathname === item.href || (item.href !== '/candidate' && location.pathname.startsWith(item.href + '/'));
                const candidateActive = isCandidate
                  ? "bg-blue-500/10 text-sidebar-foreground border border-blue-500/20 shadow-sm before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:rounded-full before:bg-blue-500 group-data-[collapsible=icon]:before:hidden"
                  : "bg-accent/10 text-sidebar-foreground border border-sidebar-border shadow-sm before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:rounded-full before:bg-accent group-data-[collapsible=icon]:before:hidden";
                const candidateInactive = isCandidate
                  ? "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-blue-500/5"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60";
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={active}
                      className={cn(
                        "relative w-full justify-start gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                        "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
                        active ? candidateActive : candidateInactive
                      )}
                    >
                      <Link
                        to={item.href}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="font-medium group-data-[collapsible=icon]:hidden">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })
            )}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className={cn(isCandidate ? "bg-blue-500 text-white" : "bg-accent text-accent-foreground")}>
                {profile?.full_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {profile?.full_name || 'User'}
              </p>
              <Badge variant="secondary" className={cn("text-xs mt-0.5", roleColor)}>
                {roleLabel}
              </Badge>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 h-12 border-b bg-background/80 backdrop-blur-lg">
          <div className="flex h-full items-center justify-between px-3 lg:px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              {(() => {
                const full = profile?.full_name?.trim() || '';
                const spaceIdx = full.indexOf(' ');
                const firstName = spaceIdx > 0 ? full.slice(0, spaceIdx) : full;
                const lastName = spaceIdx > 0 ? full.slice(spaceIdx + 1) : '';
                return (
                  <span className="text-lg font-semibold tracking-tight sm:text-xl">
                    {firstName && <span className="text-foreground">{firstName}</span>}
                    {lastName && <span className="ml-1.5">{lastName}</span>}
                  </span>
                );
              })()}
              <Breadcrumbs />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsDark(!isDark)}
                className="h-8 w-8 hover:text-foreground"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              <NotificationsDropdown />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 gap-1.5 px-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={profile?.avatar_url || ''} />
                      <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                        {profile?.full_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{profile?.full_name}</span>
                      <span className="text-xs font-normal">
                        {profile?.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {roles.length > 1 && (
                    <>
                      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                        Switch Role
                      </DropdownMenuLabel>
                      {roles.map((r) => (
                        <DropdownMenuItem
                          key={r.role}
                          onClick={() => handleRoleSwitch(r.role)}
                          className={cn(
                            "cursor-pointer",
                            currentRole === r.role && "bg-accent/10 font-medium"
                          )}
                        >
                          <span className="mr-2">
                            {r.role === 'super_admin' && '⚡'}
                            {r.role === 'org_admin' && '👑'}
                            {r.role === 'account_manager' && '💼'}
                            {r.role === 'recruiter' && '🔍'}
                            {r.role === 'candidate' && '👤'}
                          </span>
                          <span className="flex-1">
                            {r.role === 'candidate' && 'Candidate'}
                            {r.role === 'recruiter' && 'Recruiter'}
                            {r.role === 'account_manager' && 'Account Manager'}
                            {r.role === 'org_admin' && 'Org Admin'}
                            {r.role === 'super_admin' && 'Platform Admin'}
                          </span>
                          {r.is_primary && (
                            <span className="ml-2 text-xs font-semibold text-amber-600 dark:text-amber-400">⭐ Primary</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}

                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className={cn("flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col", isCandidate ? "candidate-dashboard-bg font-sans" : "dashboard-bg")}>
          <div className="w-full flex-1 min-h-0 flex flex-col max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8">
            {children ?? (
              import.meta.env.DEV ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Route rendered no content</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      This route returned <code className="font-mono">null</code>. Check the debug banner (bottom-left) for role/orgId,
                      and check the browser console for errors.
                    </p>
                    <p className="mt-2 text-xs">
                      Path: <code className="font-mono">{location.pathname}</code>
                    </p>
                  </CardContent>
                </Card>
              ) : null
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  // Dark mode state with localStorage persistence
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  // Desktop sidebar state persistence (expanded vs icon-rail)
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(SIDEBAR_DESKTOP_OPEN_KEY);
    if (saved === null) return true;
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_DESKTOP_OPEN_KEY, String(desktopSidebarOpen));
  }, [desktopSidebarOpen]);

  return (
    <SidebarProvider open={desktopSidebarOpen} onOpenChange={setDesktopSidebarOpen}>
      <DashboardLayoutInner isDark={isDark} setIsDark={setIsDark}>
        {children}
      </DashboardLayoutInner>
    </SidebarProvider>
  );
}