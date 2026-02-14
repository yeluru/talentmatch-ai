import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shield, LogOut, Moon, Sun, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/hooks/useAuth";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  end?: boolean; // match exactly (for dashboard root)
};

type AdminShellProps = {
  theme: "org" | "platform";
  navItems: AdminNavItem[];
  /** Top title bar line 1: user display name */
  title: string;
  /** Top title bar line 2: static role e.g. "Platform Admin" / "Org Admin" */
  subtitle?: string;
  children: ReactNode;
  /** Sidebar footer: user label (email or org name) */
  userLabel?: string;
  /** Sidebar top: org name shown under "UltraHire" for Org Admin only */
  sidebarOrgName?: string;
  /** @deprecated unused; sidebar brand is always UltraHire */
  brandText?: string;
  onLogout?: () => void | Promise<void>;
};

const themeClasses = {
  org: {
    accent: "accent",
    bg: "bg-accent/10",
    border: "border-accent/20",
    text: "text-accent",
    active: "bg-accent/10 border-accent/20 before:bg-accent",
    hover: "hover:bg-accent/5 hover:border-accent/20",
  },
  platform: {
    accent: "destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
    text: "text-destructive",
    active: "bg-destructive/10 border-destructive/20 before:bg-destructive",
    hover: "hover:bg-destructive/5 hover:border-destructive/20",
  },
};

export function AdminShell({
  theme,
  navItems,
  title,
  subtitle,
  userLabel,
  sidebarOrgName,
  onLogout,
  children,
}: AdminShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme: currentTheme, toggleTheme } = useTheme();
  const { roles, currentRole, switchRole } = useAuth();
  const t = themeClasses[theme];

  const handleLogout = async () => {
    if (onLogout) await onLogout();
    else navigate("/auth");
  };

  const handleRoleSwitch = (role: string) => {
    switchRole(role as any);
    // Navigate to the appropriate dashboard for the selected role
    if (role === 'super_admin') {
      navigate('/admin');
    } else if (role === 'org_admin') {
      navigate('/org-admin');
    } else if (role === 'account_manager') {
      navigate('/manager');
    } else if (role === 'recruiter') {
      navigate('/recruiter');
    } else if (role === 'candidate') {
      navigate('/candidate');
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-800">
        <Sidebar variant="floating" collapsible="icon" className="border-sidebar-border bg-white dark:bg-gray-900">
          <SidebarHeader className="border-b border-sidebar-border p-4">
            <Link to={navItems[0]?.href ?? "#"} className="flex flex-col gap-0.5 group-data-[collapsible=icon]:items-center">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    theme === "org" ? "bg-accent" : "bg-destructive",
                  )}
                >
                  <Shield className="h-5 w-5 text-white" strokeWidth={1.5} />
                </div>
                <span className="font-display font-bold text-lg tracking-tight group-data-[collapsible=icon]:hidden">
                  UltraHire
                </span>
              </div>
              {theme === "org" && sidebarOrgName && (
                <span className="text-xs text-muted-foreground pl-11 group-data-[collapsible=icon]:hidden truncate max-w-[180px]">
                  {sidebarOrgName}
                </span>
              )}
            </Link>
          </SidebarHeader>

          <SidebarContent className="px-2 py-4">
            <SidebarMenu>
              {navItems.map((item) => {
                const fullUrl = location.pathname + location.search;
                const pathOnly = item.href.split("?")[0];
                const isActive = item.end
                  ? fullUrl === item.href
                  : fullUrl === item.href || location.pathname.startsWith(pathOnly + "/");
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label} className={cn(
                      "w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2",
                      isActive
                        ? cn("relative border font-medium", t.active, "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:rounded-full")
                        : cn("border border-transparent text-muted-foreground", t.hover),
                    )}>
                      <Link to={item.href}>
                        <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                        <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent/5 transition-colors group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className={cn("text-xs", theme === "org" ? "bg-accent text-accent-foreground" : "bg-destructive text-destructive-foreground")}>
                      {userLabel?.charAt(0)?.toUpperCase() ?? "A"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-xs font-medium text-foreground">{userLabel ?? "Admin"}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentRole === 'super_admin' ? 'Platform Admin' :
                       currentRole === 'org_admin' ? 'Org Admin' :
                       currentRole === 'account_manager' ? 'Account Manager' :
                       currentRole === 'recruiter' ? 'Recruiter' : 'Candidate'}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{userLabel ?? "Admin"}</p>
                    <p className="text-xs text-muted-foreground">
                      {currentRole === 'super_admin' ? 'Platform Admin' :
                       currentRole === 'org_admin' ? 'Org Admin' :
                       currentRole === 'account_manager' ? 'Account Manager' :
                       currentRole === 'recruiter' ? 'Recruiter' : 'Candidate'}
                    </p>
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

                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-lg font-semibold truncate sm:text-xl">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground truncate sm:text-sm">{subtitle}</p>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-9 w-9 p-0"
              title={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
            >
              {currentTheme === 'light' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>
          </header>

          <div className="flex-1 p-4 md:p-6 overflow-auto">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
