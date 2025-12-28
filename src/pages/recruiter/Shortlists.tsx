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
  ListChecks,
  Plus,
  Trash2,
  Loader2,
  Users,
  FolderOpen,
  Briefcase,
  MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Shortlist {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  candidates_count?: number;
}

interface ShortlistCandidate {
  id: string;
  candidate_id: string;
  notes: string | null;
  status: string;
  added_at: string;
  candidate_profiles?: {
    id: string;
    current_title: string | null;
    user_id: string;
  };
  profile?: { full_name: string; email: string };
}

export default function Shortlists() {
  const { user, roles } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedShortlist, setSelectedShortlist] = useState<Shortlist | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;
  
  console.log('Shortlists - roles:', roles, 'organizationId:', organizationId);

  // Fetch shortlists
  const { data: shortlists, isLoading } = useQuery({
    queryKey: ['shortlists', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('candidate_shortlists')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Get candidate counts
      const shortlistIds = data?.map(s => s.id) || [];
      const { data: counts } = await supabase
        .from('shortlist_candidates')
        .select('shortlist_id')
        .in('shortlist_id', shortlistIds);
      
      return data?.map(s => ({
        ...s,
        candidates_count: counts?.filter(c => c.shortlist_id === s.id).length || 0
      })) as Shortlist[];
    },
    enabled: !!organizationId,
  });

  // Fetch candidates in selected shortlist
  const { data: shortlistCandidates } = useQuery({
    queryKey: ['shortlist-candidates', selectedShortlist?.id],
    queryFn: async () => {
      if (!selectedShortlist) return [];
      const { data, error } = await supabase
        .from('shortlist_candidates')
        .select(`
          *,
          candidate_profiles(id, current_title, user_id)
        `)
        .eq('shortlist_id', selectedShortlist.id)
        .order('added_at', { ascending: false });
      if (error) throw error;

      // Fetch profile names
      const userIds = data?.map(c => c.candidate_profiles?.user_id).filter(Boolean) || [];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds);
        
        return data?.map(c => ({
          ...c,
          profile: profiles?.find(p => p.user_id === c.candidate_profiles?.user_id)
        })) as ShortlistCandidate[];
      }
      
      return data as ShortlistCandidate[];
    },
    enabled: !!selectedShortlist,
  });

  const createShortlist = useMutation({
    mutationFn: async () => {
      if (!organizationId || !user) throw new Error('Missing data');

      const { error } = await supabase
        .from('candidate_shortlists')
        .insert({
          organization_id: organizationId,
          name: newName,
          description: newDescription || null,
          created_by: user.id
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlists'] });
      setShowCreateDialog(false);
      setNewName('');
      setNewDescription('');
      toast.success('Shortlist created!');
    },
    onError: (error) => {
      console.error('Create shortlist error:', error);
      toast.error('Failed to create shortlist');
    },
  });

  const deleteShortlist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('candidate_shortlists')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlists'] });
      setSelectedShortlist(null);
      toast.success('Shortlist deleted');
    },
  });

  const removeFromShortlist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('shortlist_candidates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['shortlists'] });
      toast.success('Candidate removed from shortlist');
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
              <ListChecks className="h-8 w-8 text-accent" />
              Candidate Shortlists
            </h1>
            <p className="text-muted-foreground mt-1">
              Organize candidates into project-based shortlists
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Shortlist
          </Button>
        </div>

        {!shortlists?.length ? (
          <EmptyState
            icon={ListChecks}
            title="No shortlists yet"
            description="Create your first shortlist to organize candidates"
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Shortlists */}
            <Card>
              <CardHeader>
                <CardTitle>Your Shortlists</CardTitle>
                <CardDescription>Click a shortlist to view candidates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {shortlists.map((shortlist) => (
                  <div 
                    key={shortlist.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedShortlist?.id === shortlist.id ? 'border-accent bg-accent/5' : 'hover:bg-muted/30'
                    }`}
                    onClick={() => setSelectedShortlist(shortlist)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-accent" />
                        <h4 className="font-semibold">{shortlist.name}</h4>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteShortlist.mutate(shortlist.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {shortlist.description && (
                      <p className="text-sm text-muted-foreground mb-2">{shortlist.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {shortlist.candidates_count} candidates
                      </span>
                      <span>Created {format(new Date(shortlist.created_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Candidates in Shortlist */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedShortlist ? selectedShortlist.name : 'Select a Shortlist'}
                </CardTitle>
                <CardDescription>
                  {selectedShortlist ? 'Candidates in this shortlist' : 'Click a shortlist to view candidates'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedShortlist ? (
                  <EmptyState
                    icon={FolderOpen}
                    title="No shortlist selected"
                    description="Click a shortlist from the list to view candidates"
                  />
                ) : !shortlistCandidates?.length ? (
                  <EmptyState
                    icon={Users}
                    title="No candidates"
                    description="Add candidates to this shortlist from the Talent Search page"
                  />
                ) : (
                  <div className="space-y-3">
                    {shortlistCandidates.map((candidate) => (
                      <div key={candidate.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-accent text-accent-foreground">
                              {candidate.profile?.full_name?.charAt(0) || 'C'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{candidate.profile?.full_name || 'Unknown'}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Briefcase className="h-3 w-3" />
                              {candidate.candidate_profiles?.current_title || 'No title'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{candidate.status}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFromShortlist.mutate(candidate.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Create Shortlist Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Shortlist</DialogTitle>
              <DialogDescription>
                Create a new shortlist to organize candidates for a role or project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Shortlist Name</Label>
                <Input
                  placeholder="e.g., Frontend Dev - Q1 Hire"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  placeholder="Notes about this shortlist..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button 
                onClick={() => createShortlist.mutate()}
                disabled={!newName || createShortlist.isPending}
              >
                {createShortlist.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Shortlist
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
