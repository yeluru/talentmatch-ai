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
import { Shield, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const t = themeClasses[theme];

  const handleLogout = async () => {
    if (onLogout) await onLogout();
    else navigate("/auth");
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-background">
        <Sidebar variant="floating" collapsible="icon" className="border-sidebar-border">
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
            <div className="flex items-center gap-2 rounded-lg px-2 py-2 group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className={cn("text-xs", theme === "org" ? "bg-accent text-accent-foreground" : "bg-destructive text-destructive-foreground")}>
                  {userLabel?.charAt(0)?.toUpperCase() ?? "A"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-xs font-medium text-foreground">{userLabel ?? "Admin"}</p>
                <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground" onClick={handleLogout}>
                  <LogOut className="mr-1 h-3 w-3" />
                  Log out
                </Button>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:px-6">
            <SidebarTrigger className="-ml-1" />
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-lg font-semibold truncate sm:text-xl">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground truncate sm:text-sm">{subtitle}</p>}
            </div>
          </header>

          <div className="flex-1 p-4 md:p-6 overflow-auto">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
