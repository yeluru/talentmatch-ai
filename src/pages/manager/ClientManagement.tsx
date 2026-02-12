import { useMemo, useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2, Plus, Building2, Edit2, Trash2, Search, Globe, Briefcase
} from 'lucide-react';
import { format } from 'date-fns';
import { sortBy } from '@/lib/sort';
import { useTableSort } from '@/hooks/useTableSort';

interface Client {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  secondary_contact_name: string | null;
  secondary_contact_email: string | null;
  secondary_contact_phone: string | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  jobs_count?: number;
}

export default function ClientManagement() {
  const { user, organizationId, isLoading: authLoading } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const tableSort = useTableSort<'name' | 'contact' | 'industry' | 'jobs_count' | 'status' | 'created_at'>({
    key: 'name',
    dir: 'asc',
  });
  const [isDialogOpen, setIsDialogOpen] = useState(() => {
    // Restore dialog open state from localStorage on initial load
    const saved = localStorage.getItem('client-dialog-open');
    return saved === 'true';
  });
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    website: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    secondary_contact_name: '',
    secondary_contact_email: '',
    secondary_contact_phone: '',
    notes: '',
    status: 'active'
  });

  // Persist dialog open state to localStorage
  useEffect(() => {
    localStorage.setItem('client-dialog-open', String(isDialogOpen));
  }, [isDialogOpen]);

  // Load saved form data from localStorage when dialog opens
  useEffect(() => {
    if (isDialogOpen && !editingClient) {
      const saved = localStorage.getItem('client-form-draft');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Only restore if there's actual data (not empty form)
          if (parsed.name || parsed.industry || parsed.contact_name || parsed.website) {
            setFormData(parsed);
            toast.info('Draft restored - your previous work was saved');
          }
        } catch (e) {
          console.error('Failed to parse saved form data:', e);
        }
      }
    }
  }, [isDialogOpen, editingClient]);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    if (isDialogOpen && !editingClient) {
      localStorage.setItem('client-form-draft', JSON.stringify(formData));
    }
  }, [formData, isDialogOpen, editingClient]);

  useEffect(() => {
    if (authLoading) return;
    if (organizationId) fetchClients();
    else setIsLoading(false);
  }, [organizationId, authLoading]);

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.contact_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) throw error;

      // Get job counts per client
      const { data: jobs } = await supabase
        .from('jobs')
        .select('client_id')
        .eq('organization_id', organizationId);

      const jobCounts: Record<string, number> = {};
      jobs?.forEach(job => {
        if (job.client_id) {
          jobCounts[job.client_id] = (jobCounts[job.client_id] || 0) + 1;
        }
      });

      setClients((data || []).map(client => ({
        ...client,
        jobs_count: jobCounts[client.id] || 0
      })));
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Failed to load clients');
    } finally {
      setIsLoading(false);
    }
  };

  const sortedClients = useMemo(() => {
    return sortBy(filteredClients, tableSort.sort, (c, key) => {
      switch (key) {
        case 'name':
          return c.name;
        case 'contact':
          return c.contact_name || c.contact_email || '';
        case 'industry':
          return c.industry || '';
        case 'jobs_count':
          return c.jobs_count ?? 0;
        case 'status':
          return c.status || '';
        case 'created_at':
          return c.created_at;
        default:
          return c.name;
      }
    });
  }, [filteredClients, tableSort.sort]);

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.name.trim()) {
      toast.error('Company name is required');
      return;
    }
    if (!formData.industry.trim()) {
      toast.error('Industry is required');
      return;
    }
    if (!formData.website.trim()) {
      toast.error('Website is required');
      return;
    }
    if (!formData.contact_name.trim()) {
      toast.error('Primary contact name is required');
      return;
    }
    if (!formData.contact_email.trim()) {
      toast.error('Primary contact email is required');
      return;
    }
    if (!formData.contact_phone.trim()) {
      toast.error('Primary contact phone is required');
      return;
    }

    try {
      const clientData = {
        organization_id: organizationId,
        name: formData.name,
        industry: formData.industry,
        website: formData.website,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,
        secondary_contact_name: formData.secondary_contact_name || null,
        secondary_contact_email: formData.secondary_contact_email || null,
        secondary_contact_phone: formData.secondary_contact_phone || null,
        notes: formData.notes || null,
        status: formData.status,
        created_by: user!.id
      };

      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClient.id);
        if (error) throw error;
        toast.success('Client updated');
      } else {
        const { error } = await supabase
          .from('clients')
          .insert([clientData]);
        if (error) throw error;
        toast.success('Client created');
      }

      setIsDialogOpen(false);
      localStorage.removeItem('client-form-draft'); // Clear saved draft after successful submission
      localStorage.removeItem('client-dialog-open'); // Clear dialog open state
      resetForm();
      fetchClients();
    } catch (error) {
      console.error('Error saving client:', error);
      toast.error('Failed to save client');
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      industry: client.industry || '',
      website: client.website || '',
      contact_name: client.contact_name || '',
      contact_email: client.contact_email || '',
      contact_phone: client.contact_phone || '',
      secondary_contact_name: client.secondary_contact_name || '',
      secondary_contact_email: client.secondary_contact_email || '',
      secondary_contact_phone: client.secondary_contact_phone || '',
      notes: client.notes || '',
      status: client.status || 'active'
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this client?')) return;

    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Client deleted');
      fetchClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Failed to delete client');
    }
  };

  const resetForm = () => {
    setEditingClient(null);
    setFormData({
      name: '',
      industry: '',
      website: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      secondary_contact_name: '',
      secondary_contact_email: '',
      secondary_contact_phone: '',
      notes: '',
      status: 'active'
    });
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'active': return 'default';
      case 'inactive': return 'secondary';
      case 'prospect': return 'outline';
      default: return 'secondary';
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
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          <div className="shrink-0 flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                <Building2 className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Client <span className="text-gradient-manager">Management</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">You need to be linked to a tenant to manage clients.</p>
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
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <Building2 className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Client <span className="text-gradient-manager">Management</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">Manage client companies and their requirements.</p>
            </div>
            <div className="shrink-0">
              <Dialog open={isDialogOpen} onOpenChange={(open) => {
                if (!open) {
                  // User clicked X button - close and clear
                  setIsDialogOpen(false);
                  localStorage.removeItem('client-form-draft');
                  localStorage.removeItem('client-dialog-open');
                  resetForm();
                }
              }}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => setIsDialogOpen(true)}
                    className="rounded-lg h-11 px-6 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold"
                  >
                    <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Add Client
                  </Button>
                </DialogTrigger>
                <DialogContent
                  className="sm:max-w-lg max-w-full max-h-[90vh] overflow-y-auto"
                  onPointerDownOutside={(e) => e.preventDefault()}
                  onEscapeKeyDown={(e) => e.preventDefault()}
                  onInteractOutside={(e) => e.preventDefault()}
                >
                  <DialogHeader>
                    <DialogTitle className="font-display">{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="name" className="font-sans">Company Name *</Label>
                        <Input
                          id="name"
                          placeholder="Acme Corporation"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="industry" className="font-sans">Industry *</Label>
                        <Input
                          id="industry"
                          placeholder="Technology"
                          value={formData.industry}
                          onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                          className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="status" className="font-sans">Status *</Label>
                        <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                          <SelectTrigger className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="prospect">Prospect</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="website" className="font-sans">Website *</Label>
                        <Input
                          id="website"
                          placeholder="https://acme.com"
                          value={formData.website}
                          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                          className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                          required
                        />
                      </div>
                    </div>

                    <div className="border-t border-border pt-3">
                      <h4 className="font-display font-semibold mb-2 text-sm text-foreground">Primary Contact *</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="contact_name" className="font-sans">Name *</Label>
                          <Input
                            id="contact_name"
                            placeholder="John Smith"
                            value={formData.contact_name}
                            onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                            className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contact_phone" className="font-sans">Phone *</Label>
                          <Input
                            id="contact_phone"
                            placeholder="+1 (555) 123-4567"
                            value={formData.contact_phone}
                            onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                            className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                            required
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label htmlFor="contact_email" className="font-sans">Email *</Label>
                          <Input
                            id="contact_email"
                            type="email"
                            placeholder="john@acme.com"
                            value={formData.contact_email}
                            onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                            className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-3">
                      <h4 className="font-display font-semibold mb-2 text-sm text-foreground">Secondary Contact <span className="text-xs text-muted-foreground font-sans">(Optional)</span></h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="secondary_contact_name" className="font-sans">Name</Label>
                          <Input
                            id="secondary_contact_name"
                            placeholder="Jane Doe"
                            value={formData.secondary_contact_name}
                            onChange={(e) => setFormData({ ...formData, secondary_contact_name: e.target.value })}
                            className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="secondary_contact_phone" className="font-sans">Phone</Label>
                          <Input
                            id="secondary_contact_phone"
                            placeholder="+1 (555) 987-6543"
                            value={formData.secondary_contact_phone}
                            onChange={(e) => setFormData({ ...formData, secondary_contact_phone: e.target.value })}
                            className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label htmlFor="secondary_contact_email" className="font-sans">Email</Label>
                          <Input
                            id="secondary_contact_email"
                            type="email"
                            placeholder="jane@acme.com"
                            value={formData.secondary_contact_email}
                            onChange={(e) => setFormData({ ...formData, secondary_contact_email: e.target.value })}
                            className="h-10 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes" className="font-sans">Notes</Label>
                      <Textarea
                        id="notes"
                        placeholder="Additional notes about the client..."
                        rows={3}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans resize-none"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsDialogOpen(false);
                          localStorage.removeItem('client-form-draft');
                          localStorage.removeItem('client-dialog-open');
                          resetForm();
                        }}
                        className="flex-1 rounded-lg h-10 font-sans font-semibold"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSubmit}
                        className="flex-1 rounded-lg h-10 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold"
                      >
                        {editingClient ? 'Update Client' : 'Create Client'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                    <Building2 className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">{clients.length}</p>
                    <p className="text-sm font-sans text-muted-foreground">Total Clients</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                    <Building2 className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">{clients.filter(c => c.status === 'active').length}</p>
                    <p className="text-sm font-sans text-muted-foreground">Active Clients</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-manager/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                    <Briefcase className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-foreground">{clients.reduce((sum, c) => sum + (c.jobs_count || 0), 0)}</p>
                    <p className="text-sm font-sans text-muted-foreground">Total Jobs</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <Input
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
              />
            </div>

            {/* Clients List */}
            <div className="space-y-4">
              <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                <Building2 className="h-5 w-5 text-manager" strokeWidth={1.5} />
                All Clients
              </h2>

              {!sortedClients.length ? (
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                  <div className="h-12 w-12 rounded-full bg-manager/10 border border-manager/20 flex items-center justify-center mx-auto mb-4">
                    <Building2 className="h-6 w-6 text-manager opacity-60" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-display font-semibold mb-2 text-foreground">No clients yet</h3>
                  <p className="text-muted-foreground font-sans">Add your first client to get started.</p>
                </div>
              ) : (
                <>
                  <div className="hidden md:flex items-center px-6 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-widest font-sans">
                    <div className="flex-1">Company</div>
                    <div className="w-1/4">Contact</div>
                    <div className="w-32">Industry</div>
                    <div className="w-20 text-center">Jobs</div>
                    <div className="w-24 text-center">Status</div>
                    <div className="w-24 text-right">Actions</div>
                  </div>

                  <div className="space-y-3">
                    {sortedClients.map((client) => (
                      <div key={client.id} className="rounded-xl border border-border bg-card p-4 hover:border-manager/30 hover:bg-manager/5 hover:shadow-md transition-all flex items-center gap-4 group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-manager/10 text-manager border border-manager/20 flex items-center justify-center">
                              <Building2 className="h-5 w-5" strokeWidth={1.5} />
                            </div>
                            <div>
                              <p className="font-sans font-bold text-foreground truncate group-hover:text-manager transition-colors">{client.name}</p>
                              {client.website && (
                                <a
                                  href={client.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-muted-foreground hover:text-manager flex items-center gap-1 transition-colors font-sans"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Globe className="h-3 w-3" strokeWidth={1.5} />
                                  Website
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="w-1/4 hidden md:block">
                          {client.contact_name ? (
                            <div className="space-y-0.5">
                              <p className="text-sm font-sans font-medium">{client.contact_name}</p>
                              {client.contact_email && (
                                <p className="text-xs text-muted-foreground truncate font-sans">{client.contact_email}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm font-sans">-</span>
                          )}
                        </div>

                        <div className="w-32 hidden md:block text-sm text-muted-foreground truncate font-sans">
                          {client.industry || '-'}
                        </div>

                        <div className="w-20 hidden md:flex justify-center">
                          <Badge variant="outline" className="font-sans bg-muted/50 border-border">{client.jobs_count || 0}</Badge>
                        </div>

                        <div className="w-24 hidden md:flex justify-center">
                          <Badge variant={getStatusColor(client.status)} className="capitalize font-sans">
                            {client.status || 'active'}
                          </Badge>
                        </div>

                        <div className="w-24 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(client)} className="h-8 w-8 rounded-lg hover:bg-manager/10 hover:text-manager">
                            <Edit2 className="h-4 w-4" strokeWidth={1.5} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)} className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
