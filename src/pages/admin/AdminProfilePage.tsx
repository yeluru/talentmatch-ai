import { SuperAdminLayout } from "@/components/layouts/SuperAdminLayout";
import { AdminProfileForm } from "@/components/admin/AdminProfileForm";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/SEOHead";

export default function AdminProfilePage() {
  const { profile } = useAuth();

  return (
    <>
      <SEOHead title="Profile" description="Platform admin profile" />
      <SuperAdminLayout title="Profile" subtitle={profile?.email}>
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Update your contact details. These are used for account identification.
          </p>
          <AdminProfileForm />
        </div>
      </SuperAdminLayout>
    </>
  );
}
