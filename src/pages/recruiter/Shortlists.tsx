import { useEffect, useState } from 'react';
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
import { useSearchParams } from 'react-router-dom';

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
  const [searchParams, setSearchParams] = useSearchParams();
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
  const shortlistParam = searchParams.get('shortlist');

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

  // Deep-link support: /recruiter/shortlists?shortlist=<id>
  useEffect(() => {
    if (!shortlistParam) return;
    if (!shortlists || shortlists.length === 0) return;
    const target = shortlists.find((s) => String(s.id) === String(shortlistParam));
    if (target) setSelectedShortlist(target);
  }, [shortlistParam, shortlists]);

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
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('shortlist');
        return next;
      });
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
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-8 w-8 animate-spin text-recruiter" strokeWidth={1.5} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto">
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                  <ListChecks className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Candidate <span className="text-gradient-recruiter">Shortlists</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Organize candidates into project-based shortlists
              </p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold shrink-0">
              <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
              New Shortlist
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        {!shortlists?.length ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <EmptyState
              icon={ListChecks}
              title="No shortlists yet"
              description="Create your first shortlist to organize candidates"
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 h-auto lg:h-[calc(100vh-220px)] min-h-[300px] lg:min-h-[400px] items-stretch">
            {/* Shortlists */}
            <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-0">
              <div className="shrink-0 border-b border-recruiter/10 bg-recruiter/5 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-display font-bold text-foreground">Your Shortlists</h2>
                    <p className="text-sm text-muted-foreground font-sans">Click a shortlist to view candidates</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    <Input
                      placeholder="Search shortlists..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans"
                    />
                  </div>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'name' | 'date' | 'count')}>
                    <SelectTrigger className="w-[140px] h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans text-sm">
                      <ArrowUpDown className="h-3 w-3 mr-2" strokeWidth={1.5} />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Newest</SelectItem>
                      <SelectItem value="name">Name A-Z</SelectItem>
                      <SelectItem value="count">Most candidates</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                {shortlists.map((shortlist) => (
                  <div
                    key={shortlist.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedShortlist(shortlist);
                      setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('shortlist', String(shortlist.id));
                        return next;
                      });
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedShortlist(shortlist); setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('shortlist', String(shortlist.id)); return next; }); } }}
                    className={`group rounded-xl border p-4 cursor-pointer transition-all flex flex-col gap-2 hover:border-recruiter/30 hover:bg-recruiter/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-offset-2 ${selectedShortlist?.id === shortlist.id
                        ? 'border-recruiter/50 bg-recruiter/10 ring-1 ring-recruiter/20'
                        : 'border-border bg-card'
                      }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${selectedShortlist?.id === shortlist.id ? 'bg-recruiter/20 text-recruiter' : 'bg-muted text-muted-foreground'}`}>
                          <FolderOpen className="h-5 w-5" strokeWidth={1.5} />
                        </div>
                        <h4 className={`font-display font-semibold text-base ${selectedShortlist?.id === shortlist.id ? 'text-recruiter' : 'text-foreground'}`}>{shortlist.name}</h4>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className="h-8 w-8 rounded-lg hover:bg-recruiter/10 hover:text-recruiter -mr-2">
                            <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
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
                      <p className="text-sm text-muted-foreground font-sans mb-3 line-clamp-2 pl-[3.25rem]">{shortlist.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-sans pl-[3.25rem]">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {shortlist.candidates_count} candidates
                      </span>
                      <span>•</span>
                      <span>Created {safeFormatDate(shortlist.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Candidates in Shortlist */}
            <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col min-h-0">
              <div className="shrink-0 border-b border-recruiter/10 bg-recruiter/5 p-4">
                <h2 className="text-xl font-display font-bold text-foreground">
                  {selectedShortlist ? selectedShortlist.name : 'Select a Shortlist'}
                </h2>
                <p className="text-sm text-muted-foreground font-sans mt-1">
                  {selectedShortlist ? 'Candidates in this shortlist' : 'Click a shortlist to view candidates'}
                </p>
                {selectedShortlist && shortlistCandidates && shortlistCandidates.length > 0 && (
                  <div className="flex items-center gap-2 mt-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                      <Input
                        placeholder="Search candidates..."
                        value={candidateSearchQuery}
                        onChange={(e) => setCandidateSearchQuery(e.target.value)}
                        className="pl-9 h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans"
                      />
                    </div>
                    <Select value={candidateSortBy} onValueChange={(v) => setCandidateSortBy(v as 'name' | 'date' | 'status')}>
                      <SelectTrigger className="w-[130px] h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans text-sm">
                        <ArrowUpDown className="h-3 w-3 mr-2" strokeWidth={1.5} />
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
              </div>
              <div className="p-4 flex-1 min-h-0 overflow-y-auto">
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
                  <div className="space-y-3 pt-2">
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
              </div>
            </div>
          </div>
        )}

          </div>
        </div>
      </div>

        {/* Create Shortlist Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="rounded-xl border border-border bg-card max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display font-bold">Create Shortlist</DialogTitle>
              <DialogDescription className="font-sans">
                Create a new shortlist to organize candidates for a role or project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-sm font-sans">Shortlist Name</Label>
                <Input
                  placeholder="e.g., Frontend Dev - Q1 Hire"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-sans">Description (optional)</Label>
                <Textarea
                  placeholder="Notes about this shortlist..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans min-h-[100px] resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="rounded-lg h-11 border-border font-sans">Cancel</Button>
              <Button
                onClick={() => createShortlist.mutate()}
                disabled={!newName || createShortlist.isPending}
                className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold"
              >
                {createShortlist.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={1.5} /> : null}
                Create Shortlist
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      <TalentDetailSheet
        talentId={selectedTalentId}
        open={talentSheetOpen}
        onOpenChange={setTalentSheetOpen}
      />
    </DashboardLayout>
  );
}
