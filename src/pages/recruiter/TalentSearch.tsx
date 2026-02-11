import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite } from '@/lib/org';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Sparkles,
  Loader2,
  Users,
  Plus,
  UserPlus,
  MapPin,
  Briefcase
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface SearchResult {
  candidate_index: number;
  candidate_id?: string;
  match_score: number;
  match_reason: string;
  matched_criteria?: string[];
  missing_criteria?: string[];
  candidate?: {
    id: string;
    name?: string;
    title?: string | null;
    years_experience?: number | null;
    summary?: string | null;
    location?: string | null;
    skills?: string[];
  } | null;
}

interface ParsedQuery {
  role?: string;
  location?: string;
  experience_level?: string;
  skills?: string[];
  industry?: string;
}

function displayNameFromEmail(email?: string | null) {
  const e = String(email || '').trim();
  if (!e) return '';
  return e.split('@')[0] || '';
}

export default function TalentSearch() {
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shortlistDialogOpen, setShortlistDialogOpen] = useState(false);
  const [shortlistTargetId, setShortlistTargetId] = useState<string | null>(null);
  const [selectedShortlistId, setSelectedShortlistId] = useState<string>('');
  const [newShortlistName, setNewShortlistName] = useState('');

  const organizationId = orgIdForRecruiterSuite(roles);
  const STORAGE_KEY = `talent_search:last:${organizationId || 'no-org'}`;

  const { data: shortlists } = useQuery({
    queryKey: ['shortlists', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('candidate_shortlists')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const addToShortlist = useMutation({
    mutationFn: async ({ shortlistId, candidateId }: { shortlistId: string; candidateId: string }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('shortlist_candidates')
        .insert({ shortlist_id: shortlistId, candidate_id: candidateId, added_by: user.id } as any);
      if (error) {
        // Duplicate entry
        if ((error as any)?.code === '23505') throw new Error('Candidate already in that shortlist');
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Added to shortlist');
      setShortlistDialogOpen(false);
      setShortlistTargetId(null);
      setSelectedShortlistId('');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to add to shortlist'),
  });

  const createShortlist = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (!organizationId) throw new Error('Missing organization');
      if (!user?.id) throw new Error('Not authenticated');
      const clean = String(name || '').trim();
      if (!clean) throw new Error('Enter a shortlist name');
      const { data, error } = await supabase
        .from('candidate_shortlists')
        .insert({
          organization_id: organizationId,
          name: clean,
          created_by: user.id,
        } as any)
        .select('id, name')
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['shortlists', organizationId] });
      if (created?.id) setSelectedShortlistId(String(created.id));
      setNewShortlistName('');
      toast.success('Shortlist created');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create shortlist'),
  });

  const searchMutation = useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('talent-search', {
        body: { searchQuery: query, organizationId, prefilterLimit: 200, topN: 30 }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const MIN_SCORE = 25;
      const enriched = ((data.matches || []) as any[])
        .filter((m: any) => Number(m?.match_score || 0) >= MIN_SCORE)
        .map((m: any) => ({ ...m, candidate_id: m?.candidate_id || m?.candidate?.id } as SearchResult));

      setResults(enriched);
      setParsedQuery(data.parsed_query || null);
      toast.success(`Found ${enriched.length} candidates (≥ ${MIN_SCORE}%)`);

      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ts: Date.now(),
            searchQuery,
            parsedQuery: data.parsed_query || null,
            results: enriched,
          }),
        );
      } catch {
        // ignore storage failures
      }
    },
    onError: (error: any) => {
      console.error('Search error:', error);
      toast.error(error.message || 'Search failed');
    },
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    searchMutation.mutate(searchQuery);
  };

  // Restore last search when coming back to this page.
  useEffect(() => {
    if (!organizationId) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.searchQuery && typeof parsed.searchQuery === 'string') setSearchQuery(parsed.searchQuery);
      if (parsed?.parsedQuery) setParsedQuery(parsed.parsedQuery);
      if (Array.isArray(parsed?.results)) setResults(parsed.results);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const getCandidateForResult = (r: SearchResult) => {
    if (r?.candidate) return r.candidate;
    return null;
  };

  const resultCandidateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of results || []) {
      const id = r?.candidate_id || r?.candidate?.id;
      if (id) ids.add(String(id));
    }
    return Array.from(ids);
  }, [results]);

  const shortlistsById = useMemo(() => {
    const map = new Map<string, string>();
    (shortlists || []).forEach((s: any) => {
      if (s?.id) map.set(String(s.id), String(s.name || 'Shortlist'));
    });
    return map;
  }, [shortlists]);

  const { data: shortlistMembership } = useQuery({
    queryKey: ['shortlist-membership', organizationId, resultCandidateIds.join(','), (shortlists || []).length],
    queryFn: async () => {
      const shortlistIds = (shortlists || []).map((s: any) => String(s.id)).filter(Boolean);
      if (!shortlistIds.length) return [];
      if (!resultCandidateIds.length) return [];

      const { data, error } = await supabase
        .from('shortlist_candidates')
        .select('shortlist_id, candidate_id')
        .in('shortlist_id', shortlistIds)
        .in('candidate_id', resultCandidateIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && (shortlists || []).length > 0 && resultCandidateIds.length > 0,
  });

  const shortlistsForCandidateId = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const row of shortlistMembership || []) {
      const candidateId = String((row as any)?.candidate_id || '');
      const shortlistId = String((row as any)?.shortlist_id || '');
      if (!candidateId || !shortlistId) continue;
      const name = shortlistsById.get(shortlistId) || 'Shortlist';
      const arr = map.get(candidateId) || [];
      if (!arr.some((x) => x.id === shortlistId)) arr.push({ id: shortlistId, name });
      map.set(candidateId, arr);
    }
    // Stable ordering for display
    for (const [k, arr] of map.entries()) {
      map.set(k, [...arr].sort((a, b) => a.name.localeCompare(b.name)));
    }
    return map;
  }, [shortlistMembership, shortlistsById]);

  const openTalent = (talentId: string) => {
    setSelectedTalentId(talentId);
    setSheetOpen(true);
  };

  const openShortlistPage = (shortlistId: string) => {
    navigate(`/recruiter/shortlists?shortlist=${encodeURIComponent(shortlistId)}`);
  };

  const openAddToShortlist = (talentId: string) => {
    if (!shortlists || shortlists.length === 0) {
      toast.error('No shortlists available. Create one first.');
      return;
    }
    setShortlistTargetId(talentId);
    setSelectedShortlistId((shortlists[0] as any)?.id ? String((shortlists[0] as any).id) : '');
    setShortlistDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        {/* Page header */}
        <div className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                  <Search className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Find <span className="text-gradient-recruiter">Talent</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Describe the role or skills you need—we match against your talent pool in plain English.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6 pt-6 pb-6">
        {/* Search card */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-recruiter/10 bg-recruiter/5 px-6 pt-6 pb-2">
            <h2 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
              What are you looking for?
            </h2>
            <p className="text-sm text-muted-foreground font-sans mt-1">
              Type a role, skills, location, or experience—e.g. &quot;Senior React developer, 5+ years, remote&quot;
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" strokeWidth={1.5} />
                <Input
                  placeholder="e.g. Backend engineer, Python, 3+ years, fintech..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-12 h-11 rounded-lg border-border bg-background text-base font-sans focus:ring-2 focus:ring-recruiter/20 placeholder:text-muted-foreground/70"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={searchMutation.isPending}
                className="shrink-0 h-11 px-6 rounded-lg border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold"
              >
                {searchMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" strokeWidth={1.5} />
                    Search
                  </>
                )}
              </Button>
            </div>

            {parsedQuery && (
              <div className="rounded-xl border border-recruiter/20 bg-recruiter/5 p-4">
                <p className="text-sm font-sans font-medium text-muted-foreground mb-2">We understood:</p>
                <div className="flex flex-wrap gap-2">
                  {parsedQuery.role && <Badge variant="secondary" className="bg-recruiter/10 text-recruiter border-recruiter/20 font-sans px-2.5 py-0.5">Role: {parsedQuery.role}</Badge>}
                  {parsedQuery.location && <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-sans px-2.5 py-0.5">Location: {parsedQuery.location}</Badge>}
                  {parsedQuery.experience_level && <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-sans px-2.5 py-0.5">Level: {parsedQuery.experience_level}</Badge>}
                  {parsedQuery.industry && <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-sans px-2.5 py-0.5">Industry: {parsedQuery.industry}</Badge>}
                  {parsedQuery.skills?.map(skill => (
                    <Badge key={skill} variant="outline" className="border-border text-foreground font-sans px-2.5 py-0.5">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="shrink-0 border-b border-recruiter/10 bg-recruiter/5 px-6 py-4">
              <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                <Users className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
                {results.length} {results.length === 1 ? 'match' : 'matches'}
              </h2>
              <p className="text-sm text-muted-foreground font-sans mt-0.5">Click a row to view profile · Add to shortlist to save for later</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-12 text-center text-muted-foreground font-sans font-medium">#</TableHead>
                    <TableHead className="py-4 font-display font-semibold text-foreground">Name</TableHead>
                    <TableHead className="max-w-[180px] py-4 font-display font-semibold text-foreground">Title</TableHead>
                    <TableHead className="max-w-[120px] hidden sm:table-cell py-4 font-display font-semibold text-foreground">Location</TableHead>
                    <TableHead className="w-20 text-center py-4 font-display font-semibold text-foreground" title="Fit score for this search">Match</TableHead>
                    <TableHead className="w-[140px] py-4 font-display font-semibold text-foreground">Shortlist</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results
                    .sort((a, b) => b.match_score - a.match_score)
                    .map((result, idx) => {
                      const candidate = getCandidateForResult(result);
                      if (!candidate) return null;
                      const memberships = shortlistsForCandidateId.get(String(candidate.id)) || [];
                      return (
                        <TableRow
                          key={result.candidate_id ?? result.candidate?.id ?? idx}
                          className="group cursor-pointer border-border transition-colors hover:bg-recruiter/5 hover:border-recruiter/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-inset"
                          onClick={() => openTalent(candidate.id)}
                        >
                          <TableCell className="text-sm py-4 text-center text-muted-foreground font-sans tabular-nums">{idx + 1}</TableCell>
                          <TableCell className="py-4">
                            <span className="font-display font-semibold text-foreground group-hover:text-recruiter transition-colors truncate block max-w-[140px]">{candidate.name ?? '—'}</span>
                          </TableCell>
                          <TableCell className="py-4 max-w-[180px]">
                            <span className="text-sm text-muted-foreground font-sans truncate block" title={candidate.title || undefined}>
                              {candidate.title || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell py-4 max-w-[120px]">
                            <span className="text-sm text-muted-foreground font-sans truncate block" title={candidate.location || undefined}>
                              {candidate.location || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center py-4">
                            <ScoreBadge score={result.match_score} size="md" showLabel={false} />
                          </TableCell>
                          <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                            {memberships.length ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs rounded-lg border border-recruiter/20 bg-recruiter/5 hover:bg-recruiter/10 text-recruiter font-sans font-medium"
                                onClick={() => openShortlistPage(memberships[0].id)}
                              >
                                {memberships[0].name}
                                {memberships.length > 1 ? ` +${memberships.length - 1}` : ''}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs rounded-lg border border-recruiter/20 bg-recruiter/5 hover:bg-recruiter/10 text-recruiter font-sans font-medium"
                                onClick={() => openAddToShortlist(candidate.id)}
                              >
                                <UserPlus className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />
                                Add to shortlist
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {results.length === 0 && organizationId && !searchMutation.isPending && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <EmptyState
              icon={Search}
              title="Search your talent pool"
              description="Describe a role, skills, or location above and hit Search. Results will appear here."
            />
          </div>
        )}

        {!organizationId && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <EmptyState icon={Users} title="No organization" description="You need a recruiter organization to search. Ask your admin to add you." />
          </div>
        )}
          </div>
        </div>
      </div>

      <TalentDetailSheet talentId={selectedTalentId} open={sheetOpen} onOpenChange={setSheetOpen} />

      <Dialog open={shortlistDialogOpen} onOpenChange={setShortlistDialogOpen}>
        <DialogContent className="rounded-xl border border-border bg-card max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold">Add to shortlist</DialogTitle>
            <DialogDescription className="font-sans">
              Pick a shortlist to save this candidate to, or create a new one below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-sans font-medium text-foreground">Shortlist</label>
              <Select value={selectedShortlistId} onValueChange={(v) => setSelectedShortlistId(v)}>
                <SelectTrigger className="h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans">
                  <SelectValue placeholder="Choose shortlist" />
                </SelectTrigger>
                <SelectContent>
                  {(shortlists || []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Input
                value={newShortlistName}
                onChange={(e) => setNewShortlistName(e.target.value)}
                placeholder="New shortlist name…"
                className="flex-1 h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans"
              />
              <Button
                variant="outline"
                onClick={() => createShortlist.mutate({ name: newShortlistName })}
                disabled={createShortlist.isPending || !newShortlistName.trim()}
                className="shrink-0 h-11 rounded-lg border-recruiter/20 bg-recruiter/5 hover:bg-recruiter/10 text-recruiter font-sans font-semibold"
              >
                {createShortlist.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" strokeWidth={1.5} /> : <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />}
                Create
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShortlistDialogOpen(false);
                setShortlistTargetId(null);
              }}
              className="rounded-lg h-11 border-border font-sans"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!shortlistTargetId) return;
                if (!selectedShortlistId) return toast.error('Select a shortlist');
                addToShortlist.mutate({ shortlistId: selectedShortlistId, candidateId: shortlistTargetId });
              }}
              disabled={addToShortlist.isPending}
              className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold"
            >
              {addToShortlist.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" strokeWidth={1.5} /> : null}
              Add to shortlist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
