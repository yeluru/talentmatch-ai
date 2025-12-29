import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  MoreVertical,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { format, isValid } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShortlistCandidateCard } from '@/components/recruiter/ShortlistCandidateCard';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';

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
    full_name: string | null;
    current_title: string | null;
    email: string | null;
    recruiter_notes: string | null;
    recruiter_status: string | null;
  };
}

export default function Shortlists() {
  const { user, roles, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedShortlist, setSelectedShortlist] = useState<Shortlist | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [candidateSearchQuery, setCandidateSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'count'>('date');
  const [candidateSortBy, setCandidateSortBy] = useState<'name' | 'date' | 'status'>('date');
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [talentSheetOpen, setTalentSheetOpen] = useState(false);
  
  const organizationId = roles.find(r => r.role === 'recruiter' || r.role === 'account_manager')?.organization_id;

  const safeFormatDate = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    return isValid(d) ? format(d, 'MMM d, yyyy') : '—';
  };

  // Fetch shortlists - wait for auth to finish loading before enabling
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
    enabled: !authLoading && !!organizationId,
    select: (data) => {
      let filtered = data;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = data.filter(s => 
          s.name.toLowerCase().includes(q) || 
          s.description?.toLowerCase().includes(q)
        );
      }
      // Sort
      return [...filtered].sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'count') return (b.candidates_count || 0) - (a.candidates_count || 0);
        // date (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    },
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
          candidate_profiles(id, full_name, current_title, email, recruiter_notes, recruiter_status)
        `)
        .eq('shortlist_id', selectedShortlist.id)
        .order('added_at', { ascending: false });
      if (error) throw error;

      console.debug('[Shortlists] candidates:', (data || []).length);
      console.debug(
        '[Shortlists] first candidate recruiter_status/notes:',
        data?.[0]?.candidate_profiles?.recruiter_status,
        !!data?.[0]?.candidate_profiles?.recruiter_notes,
        'shortlist_notes:',
        !!data?.[0]?.notes
      );

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

  const copyToShortlist = useMutation({
    mutationFn: async ({ candidateId, targetShortlistId }: { candidateId: string; targetShortlistId: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('shortlist_candidates')
        .insert({
          shortlist_id: targetShortlistId,
          candidate_id: candidateId,
          added_by: user.id,
          status: 'added',
        });
      if (error) {
        if (error.code === '23505') throw new Error('Candidate already in that shortlist');
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['shortlists'] });
      toast.success('Candidate copied to shortlist');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to copy candidate');
    },
  });

  const moveToShortlist = useMutation({
    mutationFn: async ({ shortlistCandidateId, candidateId, targetShortlistId }: { shortlistCandidateId: string; candidateId: string; targetShortlistId: string }) => {
      if (!user) throw new Error('Not authenticated');
      // Insert into new shortlist
      const { error: insertError } = await supabase
        .from('shortlist_candidates')
        .insert({
          shortlist_id: targetShortlistId,
          candidate_id: candidateId,
          added_by: user.id,
          status: 'added',
        });
      if (insertError) {
        if (insertError.code === '23505') throw new Error('Candidate already in that shortlist');
        throw insertError;
      }
      // Remove from current shortlist
      const { error: deleteError } = await supabase
        .from('shortlist_candidates')
        .delete()
        .eq('id', shortlistCandidateId);
      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['shortlists'] });
      toast.success('Candidate moved to shortlist');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to move candidate');
    },
  });

  if (authLoading || isLoading) {
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
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Your Shortlists</CardTitle>
                    <CardDescription>Click a shortlist to view candidates</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search shortlists..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'name' | 'date' | 'count')}>
                    <SelectTrigger className="w-[140px]">
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Newest</SelectItem>
                      <SelectItem value="name">Name A-Z</SelectItem>
                      <SelectItem value="count">Most candidates</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                      <span>Created {safeFormatDate(shortlist.created_at)}</span>
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
                {selectedShortlist && shortlistCandidates && shortlistCandidates.length > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search candidates..."
                        value={candidateSearchQuery}
                        onChange={(e) => setCandidateSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={candidateSortBy} onValueChange={(v) => setCandidateSortBy(v as 'name' | 'date' | 'status')}>
                      <SelectTrigger className="w-[130px]">
                        <ArrowUpDown className="h-4 w-4 mr-2" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date">Date added</SelectItem>
                        <SelectItem value="name">Name A-Z</SelectItem>
                        <SelectItem value="status">Status</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                    {(() => {
                      const filtered = shortlistCandidates
                        .filter(c => {
                          if (!candidateSearchQuery.trim()) return true;
                          const q = candidateSearchQuery.toLowerCase();
                          return (
                            c.candidate_profiles?.full_name?.toLowerCase().includes(q) ||
                            c.candidate_profiles?.current_title?.toLowerCase().includes(q) ||
                            c.candidate_profiles?.email?.toLowerCase().includes(q)
                          );
                        })
                        .sort((a, b) => {
                          if (candidateSortBy === 'name') {
                            return (a.candidate_profiles?.full_name || '').localeCompare(b.candidate_profiles?.full_name || '');
                          }
                          if (candidateSortBy === 'status') {
                            return (a.status || '').localeCompare(b.status || '');
                          }
                          // date (newest first)
                          return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
                        });

                      if (filtered.length === 0 && candidateSearchQuery.trim()) {
                        return (
                          <EmptyState
                            icon={Search}
                            title="No candidates found"
                            description="Try adjusting your search query"
                          />
                        );
                      }

                      return filtered.map((candidate) => (
                        <ShortlistCandidateCard
                          key={candidate.id}
                          candidate={candidate}
                          shortlists={shortlists}
                          selectedShortlistId={selectedShortlist!.id}
                          onCopy={(candidateId, targetShortlistId) => 
                            copyToShortlist.mutate({ candidateId, targetShortlistId })
                          }
                          onMove={(shortlistCandidateId, candidateId, targetShortlistId) =>
                            moveToShortlist.mutate({ shortlistCandidateId, candidateId, targetShortlistId })
                          }
                          onRemove={(id) => removeFromShortlist.mutate(id)}
                          onViewProfile={(candidateId) => {
                            setSelectedTalentId(candidateId);
                            setTalentSheetOpen(true);
                          }}
                        />
                      ));
                    })()}
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

      <TalentDetailSheet
        talentId={selectedTalentId}
        open={talentSheetOpen}
        onOpenChange={setTalentSheetOpen}
      />
    </DashboardLayout>
  );
}
