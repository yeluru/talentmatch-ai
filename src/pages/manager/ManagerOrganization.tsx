import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Building2, Globe, Users, Briefcase } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Organization {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
}

export default function ManagerOrganization() {
  const { organizationId, isLoading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    website: '',
    industry: '',
    size: ''
  });

  useEffect(() => {
    if (authLoading) return;
    if (organizationId) fetchOrganization();
    else setIsLoading(false);
  }, [organizationId, authLoading]);

  const fetchOrganization = async () => {
    if (!organizationId) return;
    
    try {
      const { data } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();
      
      if (data) {
        setOrganization(data);
        setFormData({
          name: data.name || '',
          description: data.description || '',
          website: data.website || '',
          industry: data.industry || '',
          size: data.size || ''
        });
      }
    } catch (error) {
      console.error('Error fetching organization:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!organizationId) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: formData.name,
          description: formData.description || null,
          website: formData.website || null,
          industry: formData.industry || null,
          size: formData.size || null
        })
        .eq('id', organizationId);
      
      if (error) throw error;
      
      toast.success('Organization updated successfully!');
    } catch (error) {
      console.error('Error updating organization:', error);
      toast.error('Failed to update organization');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-manager" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto">
          <div className="shrink-0 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Building2 className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">Organization <span className="text-gradient-manager">Settings</span></h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">You need to be linked to a tenant to manage organization settings.</p>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="pt-6 pb-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <p className="text-sm font-sans text-muted-foreground">
                  Ask a platform admin to re-invite you or reassign your account manager role to a tenant organization.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto">
        <div className="shrink-0 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                <Building2 className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Organization <span className="text-gradient-manager">Settings</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">
              Manage your organization's profile
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-5 w-5 text-manager" strokeWidth={1.5} />
            <h2 className="font-display text-lg font-bold text-foreground">Organization Details</h2>
          </div>
          <p className="text-sm text-muted-foreground font-sans mb-4">This information will be visible to candidates</p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-sans font-medium text-muted-foreground">Organization Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Acme Corp"
                className="h-11 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-sans font-medium text-muted-foreground">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Tell candidates about your organization..."
                rows={4}
                className="rounded-lg border-border focus:ring-2 focus:ring-manager/20 resize-none font-sans"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="website" className="text-sm font-sans font-medium text-muted-foreground">Website</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  <Input
                    id="website"
                    className="pl-10 h-11 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry" className="text-sm font-sans font-medium text-muted-foreground">Industry</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  <Input
                    id="industry"
                    className="pl-10 h-11 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    placeholder="Technology"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="size" className="text-sm font-sans font-medium text-muted-foreground">Company Size</Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <Input
                  id="size"
                  className="pl-10 h-11 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  placeholder="10-50 employees"
                />
              </div>
            </div>
            <Button onClick={handleSave} disabled={isSaving} className="rounded-lg h-11 px-6 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />}
              Save Changes
            </Button>
          </div>
        </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}