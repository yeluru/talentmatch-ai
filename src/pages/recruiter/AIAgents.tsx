import { useEffect, useMemo, useState } from 'react';
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { orgIdForRecruiterSuite, effectiveRecruiterOwnerId } from '@/lib/org';
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
    user_id: string | null;
    full_name?: string | null;
    email?: string | null;
  };
  profile?: { full_name: string };
}

function displayNameFromEmail(email?: string | null) {
  const e = String(email || '').trim();
  if (!e) return '';
  return e.split('@')[0] || '';
}

export default function AIAgents() {
  const { user, roles, currentRole } = useAuth();
  const [searchParams] = useSearchParams();
  const ownerId = effectiveRecruiterOwnerId(currentRole ?? null, user?.id, searchParams.get('owner'));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentJobId, setNewAgentJobId] = useState('');
  const [newAgentSkills, setNewAgentSkills] = useState('');
  const [autoOutreach, setAutoOutreach] = useState(false);
  
  const organizationId = orgIdForRecruiterSuite(roles);
  // Use an org-scoped key (stable across auth bootstrapping and browser tabs).
  const SELECTED_AGENT_KEY = useMemo(() => `recruiter:agents:selected:${organizationId || 'no-org'}`, [organizationId]);

  const persistSelectedAgentId = (agentId?: string | null) => {
    if (!agentId) return;
    try {
      localStorage.setItem(SELECTED_AGENT_KEY, String(agentId));
      sessionStorage.setItem(SELECTED_AGENT_KEY, String(agentId));
    } catch {
      // ignore
    }
  };

  // Fetch jobs (only this recruiter's when ownerId is set)
  const { data: jobs } = useQuery({
    queryKey: ['org-jobs-agents', organizationId, ownerId],
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

  // Fetch agents (only this recruiter's when ownerId is set)
  const { data: agents, isLoading } = useQuery({
    queryKey: ['ai-agents', organizationId, ownerId],
    queryFn: async () => {
      if (!organizationId) return [];
      let q = supabase
        .from('ai_recruiting_agents')
        .select(`
          *,
          jobs(title)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (ownerId) q = q.eq('created_by', ownerId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!organizationId,
  });

  // Persist/restore which agent was selected (so "last run" info stays visible after navigation).
  useEffect(() => {
    if (!organizationId) return;
    try {
      const raw = localStorage.getItem(SELECTED_AGENT_KEY) || sessionStorage.getItem(SELECTED_AGENT_KEY);
      const savedId = raw ? String(raw) : '';
      if (!savedId) return;
      if (!agents?.length) return;
      // Only set if current selection is empty.
      setSelectedAgent((prev) => {
        if (prev?.id) return prev;
        return agents.find((a) => String(a.id) === savedId) || null;
      });
    } catch {
      // ignore
    }
  }, [agents, organizationId, SELECTED_AGENT_KEY]);

  useEffect(() => {
    if (!organizationId) return;
    if (!selectedAgent?.id) return;
    persistSelectedAgentId(selectedAgent.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent?.id, organizationId]);

  // If we have agents but nothing selected, default to most recently run (or first).
  useEffect(() => {
    if (!agents?.length) return;
    setSelectedAgent((prev) => {
      if (prev?.id) return prev;
      const byLastRun = [...agents].sort((a, b) => {
        const ta = a.last_run_at ? new Date(a.last_run_at).getTime() : 0;
        const tb = b.last_run_at ? new Date(b.last_run_at).getTime() : 0;
        return tb - ta;
      });
      return byLastRun[0] || null;
    });
  }, [agents]);

  // Fetch recommendations for selected agent
  const { data: recommendations, isFetching: recommendationsFetching } = useQuery({
    queryKey: ['agent-recommendations', selectedAgent?.id],
    queryFn: async () => {
      if (!selectedAgent) return [];
      const { data, error } = await supabase
        .from('agent_recommendations')
        .select(`
          *,
          candidate_profiles(id, current_title, user_id, full_name, email)
        `)
        .eq('agent_id', selectedAgent.id)
        .order('match_score', { ascending: false });
      if (error) throw error;

      // Fetch profile names
      const userIds = Array.from(new Set(data?.map(r => r.candidate_profiles?.user_id).filter(Boolean) || []));
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
  const { data: candidates, isLoading: candidatesLoading, error: candidatesError } = useQuery({
    queryKey: ['all-candidates-for-agent'],
    queryFn: async () => {
      console.log('Fetching candidates for talent pool...');
      
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

      console.log('Fetched candidate profiles:', profiles?.length || 0);

      if (!profiles?.length) {
        console.log('No active candidates found in pool');
        return [];
      }

      const userIds = profiles.map(p => p.user_id).filter(Boolean);
      const { data: userProfiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      console.log('Fetched user profiles:', userProfiles?.length || 0);

      const candidateIds = profiles.map(p => p.id);
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name')
        .in('candidate_id', candidateIds);

      console.log('Fetched skills:', skills?.length || 0);

      const result = profiles.map(p => ({
        id: p.id,
        name:
          userProfiles?.find(up => up.user_id === p.user_id)?.full_name ||
          (p as any)?.full_name ||
          displayNameFromEmail((p as any)?.email) ||
          'Candidate',
        title: p.current_title || 'No title specified',
        years_experience: p.years_of_experience || 0,
        summary: p.summary || 'No summary available',
        skills: skills?.filter(s => s.candidate_id === p.id).map(s => s.skill_name) || []
      }));

      console.log('Mapped candidates for agent:', result);
      return result;
    },
    enabled: true,
  });

  // Log candidates error
  if (candidatesError) {
    console.error('Candidates query error:', candidatesError);
  }

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
      queryClient.invalidateQueries({ queryKey: ['ai-agents'], exact: false });
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
    onSuccess: (data, agent) => {
      // Ensure we remember the agent you just ran.
      persistSelectedAgentId(agent?.id);
      queryClient.invalidateQueries({ queryKey: ['ai-agents'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['agent-recommendations'], exact: false });
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
      queryClient.invalidateQueries({ queryKey: ['ai-agents'], exact: false });
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
      queryClient.invalidateQueries({ queryKey: ['ai-agents'], exact: false });
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
      queryClient.invalidateQueries({ queryKey: ['agent-recommendations'], exact: false });
    },
  });

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
                <Bot className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                AI Recruiting <span className="text-gradient-recruiter">Agents</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">Create agents to match candidates against your job criteria. Click <strong>"Run"</strong> to analyze.</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Agent
          </Button>
        </div>

        {/* Candidate Pool Status */}
        <Card
          className="border-dashed cursor-pointer hover:bg-muted/20 transition-colors"
          onClick={() => navigate('/recruiter/talent-pool')}
          role="button"
        >
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5" />
                <div>
                  <p className="font-medium">Talent Pool</p>
                  <p className="text-sm">
                    {candidatesLoading ? 'Loading...' : `${candidates?.length || 0} candidates available for matching`}
                  </p>
                </div>
              </div>
              {!candidatesLoading && !candidates?.length && (
                <Badge variant="destructive">No candidates</Badge>
              )}
              {!candidatesLoading && (candidates?.length || 0) > 0 && (
                <Badge variant="default">{candidates?.length} ready to match</Badge>
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
                    onClick={() => {
                      persistSelectedAgentId(agent.id);
                      setSelectedAgent(agent);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-accent" />
                        <h4 className="font-semibold">{agent.name}</h4>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('Run button clicked for agent:', agent.name);
                          console.log('Current candidates count:', candidates?.length || 0);
                          if (!candidates?.length) {
                            toast.error('No candidates in talent pool to analyze. Check if you have recruiter permissions.');
                            return;
                          }
                          runAgent.mutate(agent);
                        }}
                        disabled={runAgent.isPending || candidatesLoading}
                      >
                        {runAgent.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Running...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Run Now
                          </>
                        )}
                      </Button>
                    </div>
                    {agent.jobs && (
                      <p className="text-smmb-2">
                        For: {agent.jobs.title}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs">
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
                ) : recommendationsFetching ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-3 text-sm">Loading recommendations…</span>
                  </div>
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
                        {(() => {
                          const name =
                            rec.profile?.full_name ||
                            rec.candidate_profiles?.full_name ||
                            displayNameFromEmail(rec.candidate_profiles?.email) ||
                            'Candidate';
                          const initial = (name?.[0] || 'C').toUpperCase();

                          return (
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                                {initial}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">{name}</p>
                              <p className="text-xs">
                                {rec.candidate_profiles?.current_title || 'No title'}
                              </p>
                            </div>
                          </div>
                          <ScoreBadge score={rec.match_score || 0} size="sm" />
                        </div>
                          );
                        })()}
                        <p className="text-xsmb-2">
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
                  <p className="text-xs">Automatically send emails to matches</p>
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
        </div>
      </div>
    </DashboardLayout>
  );
}
