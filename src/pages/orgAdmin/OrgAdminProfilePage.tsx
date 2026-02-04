import { OrgAdminLayout } from "@/components/layouts/OrgAdminLayout";
import { AdminProfileForm } from "@/components/admin/AdminProfileForm";
import { useAuth } from "@/hooks/useAuth";

export default function OrgAdminProfilePage() {
  const { profile, organizationId } = useAuth();
  const orgName = ""; // Could be loaded from org if needed; layout uses subtitle

  return (
    <OrgAdminLayout title="Profile" subtitle={profile?.email} orgName={orgName}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Update your first name, last name, and phone. These are used for account identification.
        </p>
        <AdminProfileForm />
      </div>
    </OrgAdminLayout>
  );
}
