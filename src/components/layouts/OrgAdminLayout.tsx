import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { AdminShell, type AdminNavItem } from "@/components/layouts/AdminShell";
import { LayoutDashboard, Users, UserPlus, UserCheck, FileText, User, Shield } from "lucide-react";

const ORG_ADMIN_NAV: AdminNavItem[] = [
  { label: "Overview", href: "/org-admin", icon: LayoutDashboard, end: true },
  { label: "Account Managers", href: "/org-admin?tab=account_managers", icon: Users, end: true },
  { label: "Recruiters", href: "/org-admin?tab=recruiters", icon: Users, end: true },
  { label: "Candidates", href: "/org-admin?tab=candidates", icon: UserCheck, end: true },
  { label: "All Users", href: "/org-admin?tab=users", icon: UserPlus, end: true },
  { label: "Role Management", href: "/org-admin/roles", icon: Shield, end: true },
  { label: "Audit Logs", href: "/org-admin?tab=audit_logs", icon: FileText, end: true },
  { label: "Profile", href: "/org-admin/profile", icon: User, end: true },
];

type Props = {
  children: ReactNode;
  /** Ignored for header; title bar always shows name + "Org Admin" */
  title?: string;
  subtitle?: string;
  /** Org name: shown under UltraHire in sidebar and in footer as userLabel */
  orgName?: string;
};

export function OrgAdminLayout({ children, orgName }: Props) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const displayName = profile?.full_name?.trim() || profile?.email || "Org Admin";

  return (
    <AdminShell
      theme="org"
      navItems={ORG_ADMIN_NAV}
      title={displayName}
      subtitle="Org Admin"
      userLabel={(profile?.full_name?.trim() || profile?.email) ?? undefined}
      sidebarOrgName={orgName}
      onLogout={handleLogout}
    >
      {children}
    </AdminShell>
  );
}
