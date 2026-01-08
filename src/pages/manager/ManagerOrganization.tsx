import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!organizationId) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Organization not assigned</CardTitle>
            <CardDescription>You need to be linked to a tenant to manage organization settings.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ask a platform admin to re-invite you or reassign your account manager role to a tenant organization.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Organization Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your organization's profile</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization Details
            </CardTitle>
            <CardDescription>This information will be visible to candidates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Acme Corp"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Tell candidates about your organization..."
                rows={4}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="website"
                    className="pl-10"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="industry"
                    className="pl-10"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    placeholder="Technology"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="size">Company Size</Label>
              <div className="relative">
                <Users className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="size"
                  className="pl-10"
                  value={formData.size}
                  onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                  placeholder="10-50 employees"
                />
              </div>
            </div>

            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}