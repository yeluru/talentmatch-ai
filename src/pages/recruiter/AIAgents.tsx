import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Bot,
  Plus,
  Play,
  Pause,
  Trash2,
  Loader2,
  Clock,
  Users,
  Sparkles,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { format } from 'date-fns';
import { ScoreBadge } from '@/components/ui/score-badge';

interface Agent {
  id: string;
  name: string;
  job_id: string | null;
  search_criteria: any;
  is_active: boolean;
  auto_outreach: boolean;
  last_run_at: string | null;
  candidates_found: number;
  created_at: string;
  jobs?: { title: string } | null;
}

interface Recommendation {
  id: string;
  candidate_id: string;
  match_score: number;
  recommendation_reason: string;
  status: string;
  created_at: string;
  candidate_profiles?: {
    id: string;
    current_title: string | null;
    user_id: string;
  };
  profile?: { full_name: string };
}

export default function AIAgents() {
  const { user, roles } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentJobId, setNewAgentJobId] = useState('');
  const [newAgentSkills, setNewAgentSkills] = useState('');
  const [autoOutreach, setAutoOutreach] = useState(false);
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

  // Fetch jobs
  const { data: jobs } = useQuery({
    queryKey: ['org-jobs-agents', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, required_skills')
        .eq('organization_id', organizationId);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch agents
  const { data: agents, isLoading } = useQuery({
    queryKey: ['ai-agents', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('ai_recruiting_agents')
        .select(`
          *,
          jobs(title)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!organizationId,
  });

  // Fetch recommendations for selected agent
  const { data: recommendations } = useQuery({
    queryKey: ['agent-recommendations', selectedAgent?.id],
    queryFn: async () => {
      if (!selectedAgent) return [];
      const { data, error } = await supabase
        .from('agent_recommendations')
        .select(`
          *,
          candidate_profiles(id, current_title, user_id)
        `)
        .eq('agent_id', selectedAgent.id)
        .order('match_score', { ascending: false });
      if (error) throw error;

      // Fetch profile names
      const userIds = data?.map(r => r.candidate_profiles?.user_id).filter(Boolean) || [];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        
        return data?.map(r => ({
          ...r,
          profile: profiles?.find(p => p.user_id === r.candidate_profiles?.user_id)
        })) as Recommendation[];
      }
      
      return data as Recommendation[];
    },
    enabled: !!selectedAgent,
  });

  // Fetch ALL candidates who are actively looking (public talent pool)
  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ['all-candidates-for-agent'],
    queryFn: async () => {
      // Recruiters search the public candidate pool - not org-specific
      const { data: profiles, error } = await supabase
        .from('candidate_profiles')
        .select('id, current_title, years_of_experience, summary, user_id')
        .eq('is_actively_looking', true)
        .limit(100);

      if (error) {
        console.error('Error fetching candidates:', error);
        throw error;
      }

      if (!profiles?.length) {
        console.log('No active candidates found in pool');
        return [];
      }

      const userIds = profiles.map(p => p.user_id).filter(Boolean);
      const { data: userProfiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const candidateIds = profiles.map(p => p.id);
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name')
        .in('candidate_id', candidateIds);

      return profiles.map(p => ({
        id: p.id,
        name: userProfiles?.find(up => up.user_id === p.user_id)?.full_name || 'Unknown Candidate',
        title: p.current_title || 'No title specified',
        years_experience: p.years_of_experience || 0,
        summary: p.summary || 'No summary available',
        skills: skills?.filter(s => s.candidate_id === p.id).map(s => s.skill_name) || []
      }));
    },
    enabled: true,
  });

  const createAgent = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user) throw new Error('Missing data');
      
      const searchCriteria = {
        skills: newAgentSkills.split(',').map(s => s.trim()).filter(Boolean),
        job_id: newAgentJobId || null
      };

      const { error } = await supabase
        .from('ai_recruiting_agents')
        .insert({
          organization_id: organizationId,
          name: newAgentName,
          job_id: newAgentJobId || null,
          search_criteria: searchCriteria,
          auto_outreach: autoOutreach,
          created_by: user.id
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      setShowCreateDialog(false);
      setNewAgentName('');
      setNewAgentJobId('');
      setNewAgentSkills('');
      setAutoOutreach(false);
      toast.success('AI Agent created!');
    },
    onError: (error) => {
      console.error('Create agent error:', error);
      toast.error('Failed to create agent');
    },
  });

  const runAgent = useMutation({
    mutationFn: async (agent: Agent) => {
      console.log('Running agent:', agent.name, 'with', candidates?.length || 0, 'candidates');
      
      if (!candidates?.length) {
        throw new Error('No candidates available in the talent pool. Add some test candidates first.');
      }
      
      toast.info(`Analyzing ${candidates.length} candidates...`, { duration: 3000 });
      
      const { data, error } = await supabase.functions.invoke('run-agent', {
        body: {
          agentId: agent.id,
          searchCriteria: agent.search_criteria,
          candidates
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to run AI agent');
      }
      
      if (data?.error) {
        console.error('Agent error:', data.error);
        throw new Error(data.error);
      }
      
      console.log('Agent results:', data);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-recommendations'] });
      const matchCount = data?.recommendations?.length || 0;
      toast.success(`Agent found ${matchCount} candidate matches!`);
    },
    onError: (error: any) => {
      console.error('Run agent error:', error);
      toast.error(error.message || 'Failed to run agent');
    },
  });

  const toggleAgent = useMutation({
    mutationFn: async (agent: Agent) => {
      const { error } = await supabase
        .from('ai_recruiting_agents')
        .update({ is_active: !agent.is_active })
        .eq('id', agent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
    },
  });

  const deleteAgent = useMutation({
    mutationFn: async (agentId: string) => {
      const { error } = await supabase
        .from('ai_recruiting_agents')
        .delete()
        .eq('id', agentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      setSelectedAgent(null);
      toast.success('Agent deleted');
    },
  });

  const updateRecommendationStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('agent_recommendations')
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-recommendations'] });
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-3">
              <Bot className="h-8 w-8 text-accent" />
              AI Recruiting Agents
            </h1>
            <p className="text-muted-foreground mt-1">
              Autonomous agents that source and recommend candidates 24/7
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Agent
          </Button>
        </div>

        {/* Candidate Pool Status */}
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Talent Pool</p>
                  <p className="text-sm text-muted-foreground">
                    {candidatesLoading ? 'Loading...' : `${candidates?.length || 0} active candidates available`}
                  </p>
                </div>
              </div>
              {!candidatesLoading && !candidates?.length && (
                <Badge variant="destructive">No candidates</Badge>
              )}
              {!candidatesLoading && (candidates?.length || 0) > 0 && (
                <Badge variant="default">{candidates?.length} ready</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {!agents?.length ? (
          <EmptyState
            icon={Bot}
            title="No AI agents yet"
            description="Create your first AI agent to start automatic candidate sourcing"
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Agents List */}
            <Card>
              <CardHeader>
                <CardTitle>Your Agents</CardTitle>
                <CardDescription>Click an agent to view recommendations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {agents.map((agent) => (
                  <div 
                    key={agent.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedAgent?.id === agent.id ? 'border-accent bg-accent/5' : 'hover:bg-muted/30'
                    }`}
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Bot className={`h-5 w-5 ${agent.is_active ? 'text-success' : 'text-muted-foreground'}`} />
                        <h4 className="font-semibold">{agent.name}</h4>
                        <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                          {agent.is_active ? 'Active' : 'Paused'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAgent.mutate(agent);
                          }}
                        >
                          {agent.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            runAgent.mutate(agent);
                          }}
                          disabled={runAgent.isPending}
                        >
                          {runAgent.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {agent.jobs && (
                      <p className="text-sm text-muted-foreground mb-2">
                        For: {agent.jobs.title}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {agent.candidates_found} found
                      </span>
                      {agent.last_run_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last run: {format(new Date(agent.last_run_at), 'MMM d, h:mm a')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedAgent ? `Recommendations from ${selectedAgent.name}` : 'Select an Agent'}
                </CardTitle>
                <CardDescription>
                  {selectedAgent ? 'Review and approve AI-recommended candidates' : 'Click an agent to see its recommendations'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedAgent ? (
                  <EmptyState
                    icon={Bot}
                    title="No agent selected"
                    description="Click an agent from the list to view recommendations"
                  />
                ) : !recommendations?.length ? (
                  <EmptyState
                    icon={Users}
                    title="No recommendations yet"
                    description="Run the agent to generate candidate recommendations"
                  />
                ) : (
                  <div className="space-y-3">
                    {recommendations.map((rec) => (
                      <div key={rec.id} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                                {rec.profile?.full_name?.charAt(0) || 'C'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{rec.profile?.full_name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">
                                {rec.candidate_profiles?.current_title || 'No title'}
                              </p>
                            </div>
                          </div>
                          <ScoreBadge score={rec.match_score || 0} size="sm" />
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {rec.recommendation_reason}
                        </p>
                        {rec.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-success"
                              onClick={() => updateRecommendationStatus.mutate({ id: rec.id, status: 'approved' })}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              onClick={() => updateRecommendationStatus.mutate({ id: rec.id, status: 'rejected' })}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                        {rec.status !== 'pending' && (
                          <Badge variant={rec.status === 'approved' ? 'default' : 'secondary'}>
                            {rec.status}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Create Agent Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create AI Recruiting Agent</DialogTitle>
              <DialogDescription>
                Set up an autonomous agent to continuously find matching candidates
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Agent Name</Label>
                <Input
                  placeholder="e.g., Senior Engineer Agent"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Link to Job (optional)</Label>
                <Select value={newAgentJobId} onValueChange={setNewAgentJobId}>
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
              <div className="space-y-2">
                <Label>Required Skills (comma-separated)</Label>
                <Input
                  placeholder="React, TypeScript, Node.js"
                  value={newAgentSkills}
                  onChange={(e) => setNewAgentSkills(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-outreach</Label>
                  <p className="text-xs text-muted-foreground">Automatically send emails to matches</p>
                </div>
                <Switch checked={autoOutreach} onCheckedChange={setAutoOutreach} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button 
                onClick={() => createAgent.mutate()}
                disabled={!newAgentName || createAgent.isPending}
              >
                {createAgent.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Agent
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
