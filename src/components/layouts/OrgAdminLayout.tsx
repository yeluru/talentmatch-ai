import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  orgName?: string;
};

export function OrgAdminLayout({ children, title, subtitle, orgName }: Props) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-[var(--gradient-subtle)]">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Shield className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">{title ?? "Org Admin"}</h1>
              <p className="text-sm">
                {subtitle ?? (orgName ? `Organization: ${orgName}` : profile?.email)}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}


