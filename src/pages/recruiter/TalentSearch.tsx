import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Search className="h-8 w-8 text-accent" />
            ATS Match Search
          </h1>
          <p className="mt-1">
            ATS-style matching for candidates in your org
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What are you looking for?</CardTitle>
            <CardDescription>
              Search by skills, title, location, or a short description. Example: "React developer, 5+ years, fintech"
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                <Input
                  placeholder="Senior software engineer in San Francisco with startup experience..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleSearch} disabled={searchMutation.isPending}>
                {searchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>

            {parsedQuery && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-smmb-2">Interpreted search criteria:</p>
                <div className="flex flex-wrap gap-2">
                  {parsedQuery.role && <Badge variant="secondary">Role: {parsedQuery.role}</Badge>}
                  {parsedQuery.location && <Badge variant="secondary">Location: {parsedQuery.location}</Badge>}
                  {parsedQuery.experience_level && <Badge variant="secondary">Level: {parsedQuery.experience_level}</Badge>}
                  {parsedQuery.industry && <Badge variant="secondary">Industry: {parsedQuery.industry}</Badge>}
                  {parsedQuery.skills?.map(skill => (
                    <Badge key={skill} variant="outline">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results - compact table, one row per candidate */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Search Results ({results.length} candidates)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="max-w-[160px]">Title</TableHead>
                    <TableHead className="max-w-[100px] hidden sm:table-cell">Location</TableHead>
                    <TableHead className="w-16 text-right" title="Resume quality (ATS-friendly)">ATS</TableHead>
                    <TableHead className="w-[120px]">Shortlist</TableHead>
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
                          className="cursor-pointer"
                          onClick={() => openTalent(candidate.id)}
                        >
                          <TableCell className="text-xs py-2">{idx + 1}</TableCell>
                          <TableCell className="font-medium truncate max-w-[120px] py-2">{candidate.name ?? '—'}</TableCell>
                          <TableCell className="truncate max-w-[160px] py-2" title={candidate.title || undefined}>
                            {candidate.title || '—'}
                          </TableCell>
                          <TableCell className="truncate max-w-[100px] hidden sm:table-cell py-2" title={candidate.location || undefined}>
                            {candidate.location || '—'}
                          </TableCell>
                          <TableCell className="text-right py-2">
                            <ScoreBadge score={result.match_score} size="sm" showLabel={false} />
                          </TableCell>
                          <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                            {memberships.length ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => openShortlistPage(memberships[0].id)}
                              >
                                {memberships[0].name}
                                {memberships.length > 1 ? ` +${memberships.length - 1}` : ''}
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => openAddToShortlist(candidate.id)}
                              >
                                <UserPlus className="h-3.5 w-3.5 mr-1" />
                                Shortlist
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {!organizationId && (
          <EmptyState icon={Users} title="No organization" description="You must be in a recruiter role with an organization to search." />
        )}
      </div>

      <TalentDetailSheet talentId={selectedTalentId} open={sheetOpen} onOpenChange={setSheetOpen} />

      <Dialog open={shortlistDialogOpen} onOpenChange={setShortlistDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to shortlist</DialogTitle>
            <DialogDescription>Select a shortlist to add this candidate to.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Select value={selectedShortlistId} onValueChange={(v) => setSelectedShortlistId(v)}>
              <SelectTrigger>
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

            <div className="flex gap-2">
              <Input
                value={newShortlistName}
                onChange={(e) => setNewShortlistName(e.target.value)}
                placeholder="Create new shortlist…"
              />
              <Button
                variant="secondary"
                onClick={() => createShortlist.mutate({ name: newShortlistName })}
                disabled={createShortlist.isPending || !newShortlistName.trim()}
              >
                {createShortlist.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Create
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShortlistDialogOpen(false);
                setShortlistTargetId(null);
              }}
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
            >
              {addToShortlist.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
