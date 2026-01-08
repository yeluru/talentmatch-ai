import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, Plus, Building2, Edit2, Trash2, Search, Globe, 
  Mail, Phone, User, FileText, Briefcase 
} from 'lucide-react';
import { format } from 'date-fns';

interface Client {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    website: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    notes: '',
    status: 'active'
  });

  useEffect(() => {
    if (authLoading) return;
    if (organizationId) fetchClients();
    else setIsLoading(false);
  }, [organizationId, authLoading]);

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

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Client name is required');
      return;
    }

    try {
      const clientData = {
        organization_id: organizationId,
        name: formData.name,
        industry: formData.industry || null,
        website: formData.website || null,
        contact_name: formData.contact_name || null,
        contact_email: formData.contact_email || null,
        contact_phone: formData.contact_phone || null,
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
      notes: '',
      status: 'active'
    });
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.contact_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
            <CardDescription>You need to be linked to a tenant to manage clients.</CardDescription>
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Client Management</h1>
            <p className="text-muted-foreground mt-1">Manage client companies and their requirements</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">Company Name *</Label>
                    <Input
                      id="name"
                      placeholder="Acme Corporation"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      placeholder="Technology"
                      value={formData.industry}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger>
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
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      placeholder="https://acme.com"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">Primary Contact</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contact_name">Name</Label>
                      <Input
                        id="contact_name"
                        placeholder="John Smith"
                        value={formData.contact_name}
                        onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact_phone">Phone</Label>
                      <Input
                        id="contact_phone"
                        placeholder="+1 (555) 123-4567"
                        value={formData.contact_phone}
                        onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="contact_email">Email</Label>
                      <Input
                        id="contact_email"
                        type="email"
                        placeholder="john@acme.com"
                        value={formData.contact_email}
                        onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Additional notes about the client..."
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>

                <Button onClick={handleSubmit} className="w-full">
                  {editingClient ? 'Update Client' : 'Create Client'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{clients.length}</p>
                  <p className="text-sm text-muted-foreground">Total Clients</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Building2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{clients.filter(c => c.status === 'active').length}</p>
                  <p className="text-sm text-muted-foreground">Active Clients</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Briefcase className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{clients.reduce((sum, c) => sum + (c.jobs_count || 0), 0)}</p>
                  <p className="text-sm text-muted-foreground">Total Jobs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Clients Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredClients.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No clients yet</h3>
                <p className="text-muted-foreground">Add your first client to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Jobs</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{client.name}</p>
                            {client.website && (
                              <a 
                                href={client.website} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <Globe className="h-3 w-3" />
                                Website
                              </a>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.contact_name ? (
                          <div className="space-y-1">
                            <p className="text-sm">{client.contact_name}</p>
                            {client.contact_email && (
                              <p className="text-xs text-muted-foreground">{client.contact_email}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{client.industry || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{client.jobs_count || 0}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(client.status)} className="capitalize">
                          {client.status || 'active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(client.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(client)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(client.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
