import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite, effectiveRecruiterOwnerId } from '@/lib/org';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Plus,
  Send,
  Loader2,
  Users,
  Sparkles,
  Eye,
  Reply,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { format } from 'date-fns';

interface Campaign {
  id: string;
  name: string;
  job_id: string | null;
  status: string;
  created_at: string;
  jobs?: { title: string } | null;
  recipients_count?: number;
}

interface EmailSequence {
  id: string;
  name: string;
  subject_template: string;
  body_template: string;
  delay_days: number;
  sequence_order: number;
}

export default function OutreachCampaigns() {
  const { user, roles, profile, currentRole } = useAuth();
  const [searchParams] = useSearchParams();
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignJobId, setNewCampaignJobId] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [generatedEmail, setGeneratedEmail] = useState<{ subject: string; body: string } | null>(null);

  const organizationId = orgIdForRecruiterSuite(roles);

  // Fetch organization
  const { data: organization } = useQuery({
    queryKey: ['org-details', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch jobs (only this recruiter's when ownerId is set)
  const { data: jobs } = useQuery({
    queryKey: ['org-jobs-outreach', organizationId, ownerId],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase.from('jobs').select('id, title, required_skills').eq('organization_id', organizationId);
      if (ownerId) q = q.eq('recruiter_id', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch campaigns (only this recruiter's when ownerId is set)
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['outreach-campaigns', organizationId, ownerId],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from('outreach_campaigns')
        .select(`
          *,
          jobs(title)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (ownerId) q = q.eq('created_by', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Campaign[];
    },
    enabled: !!organizationId,
  });

  // Fetch email sequences
  const { data: sequences } = useQuery({
    queryKey: ['email-sequences', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('organization_id', organizationId)
        .order('sequence_order');
      if (error) throw error;
      return data as EmailSequence[];
    },
    enabled: !!organizationId,
  });

  // Fetch candidates for a campaign
  const { data: candidates } = useQuery({
    queryKey: ['org-candidates-outreach', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('id, current_title, current_company, user_id')
        .eq('organization_id', organizationId);

      const userIds = profiles?.map(p => p.user_id) || [];
      const { data: userProfiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);

      const candidateIds = profiles?.map(p => p.id) || [];
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name')
        .in('candidate_id', candidateIds);

      return profiles?.map(p => {
        const userProfile = userProfiles?.find(up => up.user_id === p.user_id);
        return {
          id: p.id,
          name: userProfile?.full_name || 'Unknown',
          email: userProfile?.email,
          title: p.current_title,
          company: p.current_company,
          skills: skills?.filter(s => s.candidate_id === p.id).map(s => s.skill_name) || []
        };
      }) || [];
    },
    enabled: !!organizationId,
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user) throw new Error('Missing data');

      const { data, error } = await supabase
        .from('outreach_campaigns')
        .insert({
          organization_id: organizationId,
          name: newCampaignName,
          job_id: newCampaignJobId || null,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      // Create default email sequence
      if (emailSubject && emailBody) {
        await supabase
          .from('email_sequences')
          .insert({
            organization_id: organizationId,
            name: 'Initial Outreach',
            subject_template: emailSubject,
            body_template: emailBody,
            delay_days: 0,
            sequence_order: 1,
            created_by: user.id
          });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outreach-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['email-sequences'] });
      setShowCreateDialog(false);
      setNewCampaignName('');
      setNewCampaignJobId('');
      setEmailSubject('');
      setEmailBody('');
      toast.success('Campaign created!');
    },
    onError: (error) => {
      console.error('Create campaign error:', error);
      toast.error('Failed to create campaign');
    },
  });

  const generateEmail = useMutation({
    mutationFn: async () => {
      if (!selectedCandidate) throw new Error('No candidate selected');

      const job = jobs?.find(j => j.id === newCampaignJobId);

      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: {
          candidate: selectedCandidate,
          job: job || { title: newCampaignName, required_skills: [] },
          recruiterName: profile?.full_name,
          companyName: organization?.name
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setGeneratedEmail(data);
      setEmailSubject(data.subject);
      setEmailBody(data.body);
      toast.success('Email generated!');
    },
    onError: (error: any) => {
      console.error('Generate email error:', error);
      toast.error(error.message || 'Failed to generate email');
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-success/10 text-success';
      case 'paused': return 'bg-warning/10 text-warning';
      case 'completed': return 'bg-muted';
      default: return 'bg-muted';
    }
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
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto w-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                <Mail className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Outreach <span className="text-gradient-recruiter">Campaigns</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">Create personalized email sequences to engage candidates</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>

        {!campaigns?.length ? (
          <EmptyState
            icon={Mail}
            title="No campaigns yet"
            description="Create your first outreach campaign to start engaging candidates"
          />
        ) : (
          <div className="grid gap-4">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="glass-panel p-6 hover-card-premium group rounded-xl">

                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{campaign.name}</h3>
                      <Badge className={getStatusColor(campaign.status)}>
                        {campaign.status}
                      </Badge>
                    </div>
                    {campaign.jobs && (
                      <p className="text-smmb-2">
                        For: {campaign.jobs.title}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Created {format(new Date(campaign.created_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="flex items-center gap-1">
                        <Send className="h-4 w-4" />
                        <span className="text-lg font-semibold">0</span>
                      </div>
                      <p className="text-xs">Sent</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        <span className="text-lg font-semibold">0</span>
                      </div>
                      <p className="text-xs">Opened</p>
                    </div>
                    <div className="text-center">
                      <div className="flex items-center gap-1">
                        <Reply className="h-4 w-4" />
                        <span className="text-lg font-semibold">0</span>
                      </div>
                      <p className="text-xs">Replied</p>
                    </div>
                    <Button variant="outline">Manage</Button>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

        {/* Create Campaign Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Outreach Campaign</DialogTitle>
              <DialogDescription>
                Set up a personalized email campaign to engage candidates
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="setup" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="setup">Campaign Setup</TabsTrigger>
                <TabsTrigger value="email">Email Template</TabsTrigger>
              </TabsList>

              <TabsContent value="setup" className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Campaign Name</Label>
                  <Input
                    placeholder="e.g., Senior Engineer Outreach Q1"
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Link to Job (optional)</Label>
                  <Select value={newCampaignJobId} onValueChange={setNewCampaignJobId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a job..." />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs?.map((job) => (
                        <SelectItem key={job.id} value={job.id}>{job.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="email" className="space-y-4 py-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="space-y-2 flex-1 mr-4">
                    <Label>Select Candidate for Preview</Label>
                    <Select
                      value={selectedCandidate?.id || ''}
                      onValueChange={(val) => setSelectedCandidate(candidates?.find(c => c.id === val))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a candidate..." />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name} - {c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => generateEmail.mutate()}
                    disabled={!selectedCandidate || generateEmail.isPending}
                  >
                    {generateEmail.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generate with AI
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Email Subject</Label>
                  <Input
                    placeholder="Exciting opportunity at {{company}}"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Body</Label>
                  <Textarea
                    placeholder="Hi {{name}}, I came across your profile..."
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    rows={8}
                  />
                  <p className="text-xs">
                    Use {'{{name}}'}, {'{{title}}'}, {'{{company}}'} as placeholders
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button
                onClick={() => createCampaign.mutate()}
                disabled={!newCampaignName || createCampaign.isPending}
              >
                {createCampaign.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Campaign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
