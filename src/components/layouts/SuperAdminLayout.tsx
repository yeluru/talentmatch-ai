import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { AdminShell, type AdminNavItem } from "@/components/layouts/AdminShell";
import { LayoutDashboard, Building2, Users, UserCheck, FileText, User, Shield } from "lucide-react";

const PLATFORM_ADMIN_NAV: AdminNavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, end: true },
  { label: "Tenants", href: "/admin?tab=tenants", icon: Building2, end: true },
  { label: "Users", href: "/admin?tab=users", icon: Users, end: true },
  { label: "Candidates", href: "/admin?tab=candidates", icon: UserCheck, end: true },
  { label: "Role Management", href: "/admin/roles", icon: Shield, end: true },
  { label: "Audit logs", href: "/admin?tab=audit", icon: FileText, end: true },
  { label: "Profile", href: "/admin/profile", icon: User, end: true },
];

type Props = {
  children: ReactNode;
  /** Ignored for header; title bar always shows name + "Platform Admin" */
  title?: string;
  subtitle?: string;
};

export function SuperAdminLayout({ children }: Props) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const displayName = profile?.full_name?.trim() || profile?.email || "Platform Admin";

  return (
    <AdminShell
      theme="platform"
      navItems={PLATFORM_ADMIN_NAV}
      title={displayName}
      subtitle="Platform Admin"
      userLabel={(profile?.full_name?.trim() || profile?.email) ?? undefined}
      onLogout={handleLogout}
    >
      {children}
    </AdminShell>
  );
}
