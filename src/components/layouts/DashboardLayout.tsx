import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';


interface DashboardLayoutProps {
  children: ReactNode;
}

const candidateNavItems = [
  { title: 'Dashboard', href: '/candidate', icon: Home },
  { title: 'My Profile', href: '/candidate/profile', icon: User },
  { title: 'My Resumes', href: '/candidate/resumes', icon: FileText },
  { title: 'AI Resume Check', href: '/candidate/ai-analysis', icon: Sparkles },
  { title: 'Find Jobs', href: '/candidate/jobs', icon: Search },
  { title: 'My Applications', href: '/candidate/applications', icon: Briefcase },
];

const recruiterNavItems = [
  { title: 'Dashboard', href: '/recruiter', icon: Home },
  { title: 'Talent Sourcing', href: '/recruiter/talent-sourcing', icon: Upload },
  { title: 'Talent Pool', href: '/recruiter/talent-pool', icon: Users },
  { title: 'Talent Search', href: '/recruiter/talent-search', icon: Search },
  { title: 'AI Agents', href: '/recruiter/agents', icon: Bot },
  { title: 'Shortlists', href: '/recruiter/shortlists', icon: ListChecks },
  { title: 'Outreach', href: '/recruiter/outreach', icon: Mail },
  { title: 'Insights', href: '/recruiter/insights', icon: BarChart3 },
  { title: 'Post a Job', href: '/recruiter/jobs/new', icon: PlusCircle },
  { title: 'My Jobs', href: '/recruiter/jobs', icon: Briefcase },
  { title: 'Candidates', href: '/recruiter/candidates', icon: Users },
  { title: 'AI Matching', href: '/recruiter/ai-matching', icon: Sparkles },
];

const managerNavItems = [
  { title: 'Dashboard', href: '/manager', icon: Home },
  { title: 'Analytics', href: '/manager/analytics', icon: BarChart3 },
  { title: 'Team', href: '/manager/team', icon: Users },
  { title: 'Jobs Overview', href: '/manager/jobs', icon: Briefcase },
  { title: 'Organization', href: '/manager/organization', icon: Building2 },
];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { profile, currentRole, roles, signOut, switchRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  const navItems = currentRole === 'candidate' 
    ? candidateNavItems 
    : currentRole === 'recruiter' 
    ? recruiterNavItems 
    : managerNavItems;

  const roleLabel = currentRole === 'candidate' 
    ? 'Candidate' 
    : currentRole === 'recruiter' 
    ? 'Recruiter' 
    : 'Account Manager';

  const roleColor = currentRole === 'candidate'
    ? 'bg-candidate/10 text-candidate'
    : currentRole === 'recruiter'
    ? 'bg-recruiter/10 text-recruiter'
    : 'bg-manager/10 text-manager';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleRoleSwitch = (role: 'candidate' | 'recruiter' | 'account_manager') => {
    switchRole(role);
    if (role === 'candidate') navigate('/candidate');
    else if (role === 'recruiter') navigate('/recruiter');
    else navigate('/manager');
  };

  return (
    <SidebarProvider>
      <div className="flex w-full bg-background" style={{ minHeight: '100vh' }}>
        <Sidebar className="border-r border-sidebar-border">
          <SidebarHeader className="border-b border-sidebar-border p-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span className="font-display font-bold text-xl tracking-tight">
                Talent<span className="text-accent">Match</span>
              </span>
            </Link>
          </SidebarHeader>
          
          <SidebarContent className="p-2">
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.href}
                    className={cn(
                      "w-full justify-start gap-3 px-3 py-2.5 rounded-lg transition-colors",
                      location.pathname === item.href
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    <Link to={item.href}>
                      <item.icon className="h-5 w-5" />
                      <span className="font-medium">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          
          <SidebarFooter className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="bg-accent text-accent-foreground">
                  {profile?.full_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
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
          <header className="sticky top-0 z-40 h-16 border-b bg-card/80 backdrop-blur-lg">
            <div className="flex h-full items-center justify-between px-4 lg:px-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="lg:hidden" />
                <Breadcrumbs />
              </div>
              
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsDark(!isDark)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>
                
                <NotificationsDropdown />
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile?.avatar_url || ''} />
                        <AvatarFallback className="bg-accent text-accent-foreground text-sm">
                          {profile?.full_name?.charAt(0) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span>{profile?.full_name}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {profile?.email}
                        </span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    
                    {roles.length > 1 && (
                      <>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          Switch Role
                        </DropdownMenuLabel>
                        {roles.map((r) => (
                          <DropdownMenuItem
                            key={r.role}
                            onClick={() => handleRoleSwitch(r.role)}
                            className={cn(
                              currentRole === r.role && "bg-accent/10"
                            )}
                          >
                            {r.role === 'candidate' && 'Candidate'}
                            {r.role === 'recruiter' && 'Recruiter'}
                            {r.role === 'account_manager' && 'Account Manager'}
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

          <main className="flex-1 min-w-0 p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}