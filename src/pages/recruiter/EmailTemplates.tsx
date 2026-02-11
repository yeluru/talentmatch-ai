import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite, effectiveRecruiterOwnerId } from '@/lib/org';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Mail, Edit2, Trash2, Copy, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  is_default: boolean;
  created_at: string;
}

const TEMPLATE_CATEGORIES = [
  { value: 'outreach', label: 'Initial Outreach' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejection', label: 'Rejection' },
  { value: 'general', label: 'General' },
];

const TEMPLATE_VARIABLES = [
  '{{candidate_name}}',
  '{{job_title}}',
  '{{company_name}}',
  '{{recruiter_name}}',
  '{{interview_date}}',
  '{{interview_time}}',
];

export default function EmailTemplates() {
  const { user, roles, currentRole } = useAuth();
  const [searchParams] = useSearchParams();
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', body: '', category: 'general' });

  const organizationId = orgIdForRecruiterSuite(roles);

  const { data: templates, isLoading } = useQuery({
    queryKey: ['email-templates', organizationId, ownerId],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from('email_templates')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (ownerId) q = q.eq('created_by', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: !!organizationId,
  });

  const createTemplate = useMutation({
    mutationFn: async (data: typeof form) => {
      const { error } = await supabase.from('email_templates').insert({
        ...data,
        organization_id: organizationId,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template created');
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => toast.error('Failed to create template'),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) => {
      const { error } = await supabase
        .from('email_templates')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template updated');
      setIsDialogOpen(false);
      setEditingTemplate(null);
      resetForm();
    },
    onError: () => toast.error('Failed to update template'),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast.success('Template deleted');
    },
    onError: () => toast.error('Failed to delete template'),
  });

  const resetForm = () => {
    setForm({ name: '', subject: '', body: '', category: 'general' });
  };

  const openEditDialog = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      subject: template.subject,
      body: template.body,
      category: template.category,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingTemplate) {
      updateTemplate.mutate({ id: editingTemplate.id, data: form });
    } else {
      createTemplate.mutate(form);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                <Mail className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Email <span className="text-gradient-recruiter">Templates</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">Create reusable email templates for outreach</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingTemplate(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-w-full">
              <DialogHeader>
                <DialogTitle>
                  {editingTemplate ? 'Edit Template' : 'Create Template'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Template Name</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g., Initial Outreach"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={form.category}
                      onValueChange={(value) => setForm(f => ({ ...f, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_CATEGORIES.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Subject Line</Label>
                  <Input
                    value={form.subject}
                    onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="e.g., Exciting opportunity at {{company_name}}"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Body</Label>
                  <Textarea
                    value={form.body}
                    onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))}
                    placeholder="Write your email template..."
                    rows={10}
                  />
                </div>
                <div>
                  <Label className="text-sm">Available Variables:</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {TEMPLATE_VARIABLES.map(variable => (
                      <Badge
                        key={variable}
                        variant="outline"
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => {
                          setForm(f => ({ ...f, body: f.body + ' ' + variable }));
                        }}
                      >
                        {variable}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSubmit}
                    disabled={createTemplate.isPending || updateTemplate.isPending}
                  >
                    {(createTemplate.isPending || updateTemplate.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingTemplate ? 'Update' : 'Create'} Template
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {!templates?.length ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState
                icon={Mail}
                title="No email templates yet"
                description="Create your first email template to streamline your outreach"
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map(template => (
              <Card key={template.id} className="relative group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <Badge variant="secondary" className="mt-1">
                        {TEMPLATE_CATEGORIES.find(c => c.value === template.category)?.label || template.category}
                      </Badge>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(template.body)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(template)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive"
                        onClick={() => deleteTemplate.mutate(template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-mediummb-2">
                    Subject: {template.subject}
                  </p>
                  <p className="text-smline-clamp-3">
                    {template.body}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
