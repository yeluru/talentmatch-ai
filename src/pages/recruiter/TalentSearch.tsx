import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  Briefcase,
  X,
  Download,
  Save,
  Star,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Filter,
  CheckSquare,
  Square,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

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
    current_company?: string | null;
  } | null;
}

interface ParsedQuery {
  role?: string;
  location?: string;
  experience_level?: string;
  skills?: string[];
  industry?: string;
}

interface ManualFilters {
  minExperience: number;
  maxExperience: number;
  locations: string[];
  skills: string[];
  availabilityStatus: string[];
}

type SortColumn = 'name' | 'title' | 'experience' | 'location' | 'match_score';
type SortDirection = 'asc' | 'desc';

function displayNameFromEmail(email?: string | null) {
  const e = String(email || '').trim();
  if (!e) return '';
  return e.split('@')[0] || '';
}

// CSV export helper
function exportToCSV(results: SearchResult[], filename: string) {
  const headers = ['Name', 'Title', 'Years Experience', 'Location', 'Skills', 'Match Score'];
  const rows = results.map(r => {
    const candidate = r.candidate;
    return [
      candidate?.name || '',
      candidate?.title || '',
      candidate?.years_experience?.toString() || '',
      candidate?.location || '',
      candidate?.skills?.join('; ') || '',
      r.match_score.toString()
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export default function TalentSearch() {
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Search state
  const [searchMode, setSearchMode] = useState<'freeText' | 'byJob'>('freeText');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [strictMode, setStrictMode] = useState(false); // Must have ALL skills (Free Text only)
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedSearchJobId, setSelectedSearchJobId] = useState<string | null>(null);
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);
  const [searchThresholds, setSearchThresholds] = useState<Map<string, number>>(new Map()); // Per-search thresholds
  const [freeTextThreshold, setFreeTextThreshold] = useState(75); // Free Text search threshold - show top matches first

  // Get threshold for a specific search (default 75%)
  const getThreshold = (searchJobId: string) => searchThresholds.get(searchJobId) || 75;

  // Set threshold for a specific search
  const setThreshold = (searchJobId: string, threshold: number) => {
    setSearchThresholds(new Map(searchThresholds.set(searchJobId, threshold)));
  };

  // Manual filters state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [manualFilters, setManualFilters] = useState<ManualFilters>({
    minExperience: 0,
    maxExperience: 20,
    locations: [],
    skills: [],
    availabilityStatus: []
  });

  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>('match_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // UI state
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shortlistDialogOpen, setShortlistDialogOpen] = useState(false);
  const [shortlistTargetIds, setShortlistTargetIds] = useState<string[]>([]);
  const [selectedShortlistId, setSelectedShortlistId] = useState<string>('');
  const [newShortlistName, setNewShortlistName] = useState('');

  // Saved searches state
  const [saveSearchDialogOpen, setSaveSearchDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [savedSearchMenuOpen, setSavedSearchMenuOpen] = useState(false);

  const organizationId = orgIdForRecruiterSuite(roles);
  const STORAGE_KEY = `talent_search:last:${organizationId || 'no-org'}`;

  // Queries
  const { data: jobs, isLoading: jobsLoading, error: jobsError } = useQuery({
    queryKey: ['org-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      console.log('Fetching jobs for org:', organizationId);
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, required_skills, nice_to_have_skills')
        .eq('organization_id', organizationId)
        .order('title');

      if (error) {
        console.error('Jobs query error:', error);
        throw error;
      }

      console.log('Jobs fetched:', data?.length || 0, data);
      return data || [];
    },
    enabled: !!organizationId,
  });

  // Log jobs data for debugging
  useEffect(() => {
    if (jobsError) {
      console.error('Jobs fetch error:', jobsError);
    }
    if (jobs) {
      console.log('Jobs available:', jobs.length, jobs);
    }
  }, [jobs, jobsError]);

  const { data: shortlists } = useQuery({
    queryKey: ['shortlists', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error} = await supabase
        .from('candidate_shortlists')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const { data: savedSearches } = useQuery({
    queryKey: ['saved-searches', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('saved_talent_searches')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const { data: searchHistory } = useQuery({
    queryKey: ['search-history', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('talent_search_history')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  // Query for async search jobs (Search by Job mode)
  const { data: searchJobs, refetch: refetchSearchJobs } = useQuery({
    queryKey: ['talent-search-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('talent_search_jobs')
        .select('*, jobs(title)')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
    refetchInterval: (query) => {
      // Poll every 5s if there are pending/processing jobs
      const jobs = query.state.data as any[];
      const hasActive = jobs?.some((j: any) =>
        j.status === 'pending' || j.status === 'processing'
      );
      return hasActive ? 5000 : false;
    },
  });

  // Get available filter options from results
  const availableLocations = useMemo(() => {
    const locs = new Set<string>();
    results.forEach(r => {
      if (r.candidate?.location) locs.add(r.candidate.location);
    });
    return Array.from(locs).sort();
  }, [results]);

  const availableSkills = useMemo(() => {
    const skills = new Set<string>();
    results.forEach(r => {
      r.candidate?.skills?.forEach(s => skills.add(s));
    });
    return Array.from(skills).sort();
  }, [results]);

  // Mutations
  const saveSearchMutation = useMutation({
    mutationFn: async ({ name, query, filters }: { name: string; query: string; filters: any }) => {
      if (!organizationId || !user?.id) throw new Error('Missing organization or user');
      const { data, error } = await supabase
        .from('saved_talent_searches')
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          name,
          search_query: query,
          filters
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches', organizationId] });
      toast.success('Search saved');
      setSaveSearchDialogOpen(false);
      setSaveSearchName('');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save search'),
  });

  const deleteSavedSearchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('saved_talent_searches')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches', organizationId] });
      toast.success('Search deleted');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete search'),
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const { error } = await supabase
        .from('saved_talent_searches')
        .update({ is_favorite: isFavorite })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-searches', organizationId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update favorite'),
  });

  const saveSearchHistory = async (query: string, parsed: any, count: number) => {
    if (!organizationId || !user?.id) return;
    try {
      await supabase.from('talent_search_history').insert({
        user_id: user.id,
        organization_id: organizationId,
        search_query: query,
        parsed_filters: parsed,
        results_count: count
      });
    } catch (e) {
      console.error('Failed to save search history:', e);
    }
  };

  const addToShortlist = useMutation({
    mutationFn: async ({ shortlistId, candidateIds }: { shortlistId: string; candidateIds: string[] }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const inserts = candidateIds.map(candidateId => ({
        shortlist_id: shortlistId,
        candidate_id: candidateId,
        added_by: user.id
      }));
      const { error } = await supabase.from('shortlist_candidates').insert(inserts as any);
      if (error) {
        if ((error as any)?.code === '23505') throw new Error('Some candidates already in that shortlist');
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Added to shortlist');
      setShortlistDialogOpen(false);
      setShortlistTargetIds([]);
      setSelectedShortlistId('');
      setSelectedIds(new Set());
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
      // If Search by Job mode, send structured job data
      let body: any = {
        searchQuery: query,
        organizationId,
        prefilterLimit: 200,
        topN: 50,
        strictMode: searchMode === 'freeText' ? strictMode : false // Only for Free Text
      };

      if (searchMode === 'byJob' && selectedJobId && jobs) {
        const selectedJob = jobs.find(j => j.id === selectedJobId);
        if (selectedJob) {
          body = {
            ...body,
            structuredSearch: {
              jobId: selectedJob.id,
              role: selectedJob.title,
              skills: [
                ...(selectedJob.required_skills || []),
                ...(selectedJob.nice_to_have_skills || [])
              ]
            }
          };
        }
      }

      const { data, error } = await supabase.functions.invoke('talent-search', {
        body
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Check if this is an async search (Search by Job mode)
      if (data?.searchJobId) {
        // Async mode - job created, processing in background
        setSelectedSearchJobId(data.searchJobId);
        toast.success('Search started! Processing in background...');
        refetchSearchJobs(); // Refresh the list to show new job
        return;
      }

      // Sync mode (Free Text Search) - show results immediately
      const FREE_TEXT_MIN_SCORE = 25; // Show all matches for free text
      const enriched = ((data.matches || []) as any[])
        .filter((m: any) => Number(m?.match_score || 0) >= FREE_TEXT_MIN_SCORE)
        .map((m: any) => ({
          ...m,
          candidate_id: m?.candidate_id || m?.candidate?.id,
          candidate: {
            ...m?.candidate,
            current_company: m?.candidate?.company || m?.candidate?.current_company
          }
        } as SearchResult));

      setResults(enriched);
      setParsedQuery(data.parsed_query || null);
      toast.success(`Found ${enriched.length} candidates`);

      // Save to history
      saveSearchHistory(searchQuery, data.parsed_query, enriched.length);

      // Save to session storage
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
        // ignore
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

  // Auto-populate search query when a job is selected in "by Job" mode
  useEffect(() => {
    if (searchMode === 'byJob' && selectedJobId && jobs) {
      const selectedJob = jobs.find(j => j.id === selectedJobId);
      if (selectedJob) {
        const requiredSkills = selectedJob.required_skills || [];
        const niceToHaveSkills = selectedJob.nice_to_have_skills || [];
        const allSkills = [...requiredSkills, ...niceToHaveSkills];
        const skillsText = allSkills.join(', ');
        setSearchQuery(`${selectedJob.title}${skillsText ? `, ${skillsText}` : ''}`);
      }
    } else if (searchMode === 'freeText') {
      // Clear when switching back to free text
      setSelectedJobId('');
    }
  }, [searchMode, selectedJobId, jobs]);

  const handleLoadSavedSearch = (search: any) => {
    setSearchQuery(search.search_query);
    if (search.filters) {
      setManualFilters(search.filters);
    }
    setSavedSearchMenuOpen(false);
    // Auto-search
    setTimeout(() => {
      searchMutation.mutate(search.search_query);
    }, 100);
  };

  const removeFilterChip = (type: 'role' | 'location' | 'experience' | 'industry' | 'skill', value?: string) => {
    if (!parsedQuery) return;
    const updated = { ...parsedQuery };
    if (type === 'role') updated.role = undefined;
    if (type === 'location') updated.location = undefined;
    if (type === 'experience') updated.experience_level = undefined;
    if (type === 'industry') updated.industry = undefined;
    if (type === 'skill' && value) {
      updated.skills = updated.skills?.filter(s => s !== value);
    }
    setParsedQuery(updated);

    // Re-search with updated filters
    const parts: string[] = [];
    if (updated.role) parts.push(updated.role);
    if (updated.location) parts.push(updated.location);
    if (updated.experience_level) parts.push(updated.experience_level);
    if (updated.industry) parts.push(updated.industry);
    if (updated.skills) parts.push(...updated.skills);

    const newQuery = parts.join(', ');
    if (newQuery) {
      setSearchQuery(newQuery);
      searchMutation.mutate(newQuery);
    }
  };

  const clearAllFilters = () => {
    setParsedQuery(null);
    setManualFilters({
      minExperience: 0,
      maxExperience: 20,
      locations: [],
      skills: [],
      availabilityStatus: []
    });
    setResults([]);
  };

  // Apply manual filters to results
  const filteredResults = useMemo(() => {
    let filtered = [...results];

    // Threshold filter (match score)
    filtered = filtered.filter(r => {
      return Number(r?.match_score || 0) >= freeTextThreshold;
    });

    // Experience filter
    filtered = filtered.filter(r => {
      const exp = r.candidate?.years_experience ?? 0;
      return exp >= manualFilters.minExperience && exp <= manualFilters.maxExperience;
    });

    // Location filter
    if (manualFilters.locations.length > 0) {
      filtered = filtered.filter(r =>
        r.candidate?.location && manualFilters.locations.includes(r.candidate.location)
      );
    }

    // Skills filter
    if (manualFilters.skills.length > 0) {
      filtered = filtered.filter(r =>
        r.candidate?.skills?.some(s => manualFilters.skills.includes(s))
      );
    }

    return filtered;
  }, [results, manualFilters, freeTextThreshold]);

  // Sort results
  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults];
    sorted.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case 'name':
          aVal = a.candidate?.name || '';
          bVal = b.candidate?.name || '';
          break;
        case 'title':
          aVal = a.candidate?.title || '';
          bVal = b.candidate?.title || '';
          break;
        case 'experience':
          aVal = a.candidate?.years_experience || 0;
          bVal = b.candidate?.years_experience || 0;
          break;
        case 'location':
          aVal = a.candidate?.location || '';
          bVal = b.candidate?.location || '';
          break;
        case 'match_score':
          aVal = a.match_score;
          bVal = b.match_score;
          break;
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return sorted;
  }, [filteredResults, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedResults.map(r => r.candidate_id || r.candidate?.id).filter(Boolean) as string[]));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkAddToShortlist = () => {
    if (selectedIds.size === 0) {
      toast.error('Select candidates first');
      return;
    }
    if (!shortlists || shortlists.length === 0) {
      toast.error('No shortlists available. Create one first.');
      return;
    }
    setShortlistTargetIds(Array.from(selectedIds));
    setSelectedShortlistId((shortlists[0] as any)?.id ? String((shortlists[0] as any).id) : '');
    setShortlistDialogOpen(true);
  };

  const handleExport = () => {
    const toExport = selectedIds.size > 0
      ? sortedResults.filter(r => selectedIds.has(r.candidate_id || r.candidate?.id || ''))
      : sortedResults;

    if (toExport.length === 0) {
      toast.error('No candidates to export');
      return;
    }

    const filename = `talent-search-${new Date().toISOString().split('T')[0]}.csv`;
    exportToCSV(toExport, filename);
    toast.success(`Exported ${toExport.length} candidates`);
  };

  // Restore last search
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
    setShortlistTargetIds([talentId]);
    setSelectedShortlistId((shortlists[0] as any)?.id ? String((shortlists[0] as any).id) : '');
    setShortlistDialogOpen(true);
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        {/* Page header */}
        <div className="shrink-0 flex flex-col gap-4">
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
                AI-powered search with advanced filters and bulk actions
              </p>
            </div>

            {/* Saved searches dropdown */}
            <div className="flex gap-2">
              <DropdownMenu open={savedSearchMenuOpen} onOpenChange={setSavedSearchMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 rounded-lg border-border font-sans">
                    <Clock className="h-4 w-4 mr-2" />
                    Saved Searches
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <div className="p-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Favorites</p>
                    {(savedSearches || []).filter((s: any) => s.is_favorite).length === 0 && (
                      <p className="text-sm text-muted-foreground italic py-2">No favorites yet</p>
                    )}
                    {(savedSearches || []).filter((s: any) => s.is_favorite).map((search: any) => (
                      <div key={search.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded-lg group">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 justify-start h-auto py-2 text-left font-normal"
                          onClick={() => handleLoadSavedSearch(search)}
                        >
                          <div>
                            <p className="font-medium text-sm">{search.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{search.search_query}</p>
                          </div>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                          onClick={() => toggleFavoriteMutation.mutate({ id: search.id, isFavorite: false })}
                        >
                          <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                          onClick={() => deleteSavedSearchMutation.mutate(search.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent Searches</p>
                    {(savedSearches || []).filter((s: any) => !s.is_favorite).slice(0, 5).length === 0 && (
                      <p className="text-sm text-muted-foreground italic py-2">No saved searches</p>
                    )}
                    {(savedSearches || []).filter((s: any) => !s.is_favorite).slice(0, 5).map((search: any) => (
                      <div key={search.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded-lg group">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 justify-start h-auto py-2 text-left font-normal"
                          onClick={() => handleLoadSavedSearch(search)}
                        >
                          <div>
                            <p className="font-medium text-sm">{search.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{search.search_query}</p>
                          </div>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                          onClick={() => toggleFavoriteMutation.mutate({ id: search.id, isFavorite: true })}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                          onClick={() => deleteSavedSearchMutation.mutate(search.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
          {/* Filter Sidebar */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="flex-shrink-0">
            <div className={cn("flex flex-col gap-4 transition-all", filtersOpen ? "w-72" : "w-0 overflow-hidden")}>
              {filtersOpen && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-4 mt-6 overflow-y-auto max-h-[calc(100vh-240px)]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Filters
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => setFiltersOpen(false)} className="h-8 w-8 p-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Experience Range */}
                  <div className="space-y-2">
                    <Label className="text-sm font-sans font-medium">Years of Experience</Label>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <span>{manualFilters.minExperience}</span>
                      <span>-</span>
                      <span>{manualFilters.maxExperience}+ years</span>
                    </div>
                    <Slider
                      min={0}
                      max={20}
                      step={1}
                      value={[manualFilters.minExperience, manualFilters.maxExperience]}
                      onValueChange={([min, max]) => setManualFilters({ ...manualFilters, minExperience: min, maxExperience: max })}
                      className="py-2"
                    />
                  </div>

                  {/* Location Filter */}
                  {availableLocations.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-sans font-medium">Location</Label>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {availableLocations.map(loc => (
                          <div key={loc} className="flex items-center gap-2">
                            <Checkbox
                              id={`loc-${loc}`}
                              checked={manualFilters.locations.includes(loc)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setManualFilters({ ...manualFilters, locations: [...manualFilters.locations, loc] });
                                } else {
                                  setManualFilters({ ...manualFilters, locations: manualFilters.locations.filter(l => l !== loc) });
                                }
                              }}
                            />
                            <label htmlFor={`loc-${loc}`} className="text-sm cursor-pointer">{loc}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills Filter */}
                  {availableSkills.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-sans font-medium">Skills</Label>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {availableSkills.slice(0, 20).map(skill => (
                          <div key={skill} className="flex items-center gap-2">
                            <Checkbox
                              id={`skill-${skill}`}
                              checked={manualFilters.skills.includes(skill)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setManualFilters({ ...manualFilters, skills: [...manualFilters.skills, skill] });
                                } else {
                                  setManualFilters({ ...manualFilters, skills: manualFilters.skills.filter(s => s !== skill) });
                                }
                              }}
                            />
                            <label htmlFor={`skill-${skill}`} className="text-sm cursor-pointer">{skill}</label>
                          </div>
                        ))}
                        {availableSkills.length > 20 && (
                          <p className="text-xs text-muted-foreground italic">+{availableSkills.length - 20} more skills</p>
                        )}
                      </div>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    onClick={clearAllFilters}
                    className="w-full h-9 text-sm"
                  >
                    Clear All Filters
                  </Button>
                </div>
              )}
            </div>
          </Collapsible>

          {/* Main Content */}
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
                    Search by entering free text or selecting a job
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  {/* Search Mode Selection */}
                  <RadioGroup value={searchMode} onValueChange={(value: 'freeText' | 'byJob') => setSearchMode(value)} className="flex items-center gap-6">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="freeText" id="mode-freetext" />
                      <Label htmlFor="mode-freetext" className="font-normal cursor-pointer">Free Text Search</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="byJob" id="mode-byjob" />
                      <Label htmlFor="mode-byjob" className="font-normal cursor-pointer">Search by Job</Label>
                    </div>
                  </RadioGroup>

                  {/* Strict Mode Checkbox (Free Text only) */}
                  {searchMode === 'freeText' && (
                    <div className="flex items-center space-x-2 pl-1">
                      <input
                        type="checkbox"
                        id="strict-mode"
                        checked={strictMode}
                        onChange={(e) => setStrictMode(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-recruiter focus:ring-recruiter cursor-pointer"
                      />
                      <Label htmlFor="strict-mode" className="text-sm font-normal cursor-pointer text-muted-foreground">
                        Must have ALL skills (strict matching)
                      </Label>
                    </div>
                  )}

                  {/* Free Text Search Input */}
                  {searchMode === 'freeText' && (
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
                        onClick={() => setFiltersOpen(!filtersOpen)}
                        variant="outline"
                        className="shrink-0 h-11 px-4 rounded-lg border-border font-sans"
                      >
                        <Filter className="h-5 w-5 mr-2" strokeWidth={1.5} />
                        Filters
                      </Button>
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
                  )}

                  {/* Job-Based Search */}
                  {searchMode === 'byJob' && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1">
                        <Select value={selectedJobId} onValueChange={setSelectedJobId} disabled={jobsLoading}>
                          <SelectTrigger className="h-11 rounded-lg border-border bg-background font-sans">
                            <SelectValue placeholder={jobsLoading ? "Loading jobs..." : jobs && jobs.length > 0 ? "Select a job..." : "No jobs available"} />
                          </SelectTrigger>
                          <SelectContent>
                            {jobsLoading ? (
                              <SelectItem value="loading" disabled>Loading jobs...</SelectItem>
                            ) : jobs && jobs.length > 0 ? (
                              jobs.map((job) => (
                                <SelectItem key={job.id} value={job.id}>
                                  {job.title}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="none" disabled>No jobs found</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {jobsError && (
                          <p className="text-xs text-destructive mt-1">Error loading jobs</p>
                        )}
                      </div>
                      <Button
                        onClick={() => setFiltersOpen(!filtersOpen)}
                        variant="outline"
                        className="shrink-0 h-11 px-4 rounded-lg border-border font-sans"
                      >
                        <Filter className="h-5 w-5 mr-2" strokeWidth={1.5} />
                        Filters
                      </Button>
                      <Button
                        onClick={handleSearch}
                        disabled={searchMutation.isPending || !selectedJobId}
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
                  )}

                  {/* Filter Chips (Free Text mode only) */}
                  {searchMode === 'freeText' && parsedQuery && (Object.keys(parsedQuery).length > 0 || parsedQuery.skills?.length) && (
                    <div className="rounded-xl border border-recruiter/20 bg-recruiter/5 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-sans font-medium text-muted-foreground">Active filters:</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearAllFilters}
                          className="h-7 text-xs text-recruiter hover:text-recruiter hover:bg-recruiter/10"
                        >
                          Clear all
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {parsedQuery.role && (
                          <Badge
                            variant="secondary"
                            className="bg-recruiter/10 text-recruiter border-recruiter/20 font-sans px-2.5 py-1 cursor-pointer hover:bg-recruiter/20"
                            onClick={() => removeFilterChip('role')}
                          >
                            Role: {parsedQuery.role}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        )}
                        {parsedQuery.location && (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-sans px-2.5 py-1 cursor-pointer hover:bg-emerald-500/20"
                            onClick={() => removeFilterChip('location')}
                          >
                            Location: {parsedQuery.location}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        )}
                        {parsedQuery.experience_level && (
                          <Badge
                            variant="secondary"
                            className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-sans px-2.5 py-1 cursor-pointer hover:bg-amber-500/20"
                            onClick={() => removeFilterChip('experience')}
                          >
                            Level: {parsedQuery.experience_level}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        )}
                        {parsedQuery.industry && (
                          <Badge
                            variant="secondary"
                            className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-sans px-2.5 py-1 cursor-pointer hover:bg-purple-500/20"
                            onClick={() => removeFilterChip('industry')}
                          >
                            Industry: {parsedQuery.industry}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        )}
                        {parsedQuery.skills?.map(skill => (
                          <Badge
                            key={skill}
                            variant="outline"
                            className="border-border text-foreground font-sans px-2.5 py-1 cursor-pointer hover:bg-muted"
                            onClick={() => removeFilterChip('skill', skill)}
                          >
                            {skill}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        {results.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSaveSearchDialogOpen(true)}
                            className="h-8 text-xs text-recruiter hover:text-recruiter hover:bg-recruiter/10"
                          >
                            <Save className="h-3.5 w-3.5 mr-1" />
                            Save this search
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Async Search Jobs (Search by Job mode) */}
              {searchMode === 'byJob' && searchJobs && searchJobs.length > 0 && (
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Left: List of search jobs */}
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="border-b border-recruiter/10 bg-recruiter/5 px-6 py-4">
                      <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                        <Clock className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
                        Past Searches
                      </h2>
                      <p className="text-sm text-muted-foreground font-sans mt-0.5">
                        {searchJobs.length} {searchJobs.length === 1 ? 'search' : 'searches'}
                      </p>
                    </div>
                    <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
                      {searchJobs.map((job: any) => {
                        const isSelected = selectedSearchJobId === job.id;
                        const statusColor =
                          job.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                          job.status === 'processing' ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20' :
                          job.status === 'failed' ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20' :
                          'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20';

                        // Calculate filtered matches based on this job's threshold
                        const jobResults = job.results?.matches || [];
                        const jobThreshold = getThreshold(job.id);
                        const filteredCount = jobResults.filter((m: any) => Number(m?.match_score || 0) >= jobThreshold).length;

                        return (
                          <div
                            key={job.id}
                            onClick={() => setSelectedSearchJobId(job.id)}
                            className={cn(
                              "p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md",
                              isSelected
                                ? "border-recruiter bg-recruiter/5 shadow-sm"
                                : "border-border bg-card hover:border-recruiter/50"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-display font-semibold text-foreground truncate">
                                  {job.jobs?.title || 'Unknown Job'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  {new Date(job.created_at).toLocaleString()}
                                </p>
                                {job.status === 'completed' && job.total_candidates_searched !== null && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {filteredCount} matches (≥{jobThreshold}%) · {job.total_candidates_searched} searched
                                  </p>
                                )}
                              </div>
                              <Badge variant="secondary" className={cn("text-xs shrink-0", statusColor)}>
                                {job.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: Selected search results */}
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    {selectedSearchJobId ? (() => {
                      const selectedJob = searchJobs.find((j: any) => j.id === selectedSearchJobId);
                      if (!selectedJob) {
                        return (
                          <div className="p-8 text-center">
                            <p className="text-muted-foreground">Search job not found</p>
                          </div>
                        );
                      }

                      const jobResults = selectedJob.results?.matches || [];
                      const currentThreshold = getThreshold(selectedSearchJobId);
                      const filteredJobResults = jobResults.filter((m: any) => Number(m?.match_score || 0) >= currentThreshold);
                      const allResults = jobResults.filter((m: any) => Number(m?.match_score || 0) >= 25);

                      return (
                        <>
                          <div className="border-b border-recruiter/10 bg-recruiter/5 px-6 py-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h2 className="text-lg font-display font-bold text-foreground">
                                  {selectedJob.jobs?.title || 'Search Results'}
                                </h2>
                                <div className="flex items-center gap-3">
                                  <p className="text-sm text-muted-foreground font-sans mt-0.5">
                                    {selectedJob.status === 'pending' && 'Waiting to start...'}
                                    {selectedJob.status === 'processing' && `Processing... (${selectedJob.total_candidates_searched || 0} candidates)`}
                                    {selectedJob.status === 'completed' && `${filteredJobResults.length} matches (≥ ${currentThreshold}%)`}
                                    {selectedJob.status === 'failed' && 'Search failed'}
                                  </p>
                                  {selectedJob.status === 'completed' && allResults.length > 0 && (
                                    <Select value={String(currentThreshold)} onValueChange={(v) => setThreshold(selectedSearchJobId, Number(v))}>
                                      <SelectTrigger className="h-7 w-[140px] text-xs border-border">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="75">Show ≥ 75%</SelectItem>
                                        <SelectItem value="60">Show ≥ 60%</SelectItem>
                                        <SelectItem value="50">Show ≥ 50%</SelectItem>
                                        <SelectItem value="25">Show ≥ 25%</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                              </div>
                              {selectedJob.status === 'pending' || selectedJob.status === 'processing' ? (
                                <Loader2 className="h-5 w-5 text-recruiter animate-spin" />
                              ) : null}
                            </div>
                          </div>

                          <div className="p-6 max-h-[600px] overflow-y-auto">
                            {selectedJob.status === 'pending' && (
                              <EmptyState
                                icon={Clock}
                                title="Search queued"
                                description="Your search is waiting to start. This page will update automatically."
                              />
                            )}

                            {selectedJob.status === 'processing' && (
                              <EmptyState
                                icon={Loader2}
                                title="Processing search"
                                description={`Analyzing candidates... (${selectedJob.total_candidates_searched || 0} processed)`}
                              />
                            )}

                            {selectedJob.status === 'failed' && (
                              <EmptyState
                                icon={X}
                                title="Search failed"
                                description={selectedJob.error_message || 'An error occurred while processing this search.'}
                              />
                            )}

                            {selectedJob.status === 'completed' && filteredJobResults.length === 0 && (
                              <EmptyState
                                icon={Users}
                                title="No matches found"
                                description="No candidates matched this job. Try broadening your search criteria."
                              />
                            )}

                            {selectedJob.status === 'completed' && filteredJobResults.length > 0 && (
                              <div className="space-y-3">
                                {filteredJobResults.slice(0, 20).map((match: any, idx: number) => {
                                  const candidate = match.candidate;
                                  if (!candidate) return null;

                                  return (
                                    <div
                                      key={candidate.id || idx}
                                      onClick={() => openTalent(candidate.id)}
                                      className="p-4 rounded-lg border border-border bg-card hover:border-recruiter/50 hover:bg-recruiter/5 cursor-pointer transition-all"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                                            <p className="font-display font-semibold text-foreground truncate">
                                              {candidate.name || '—'}
                                            </p>
                                          </div>
                                          <p className="text-sm text-muted-foreground mt-1 truncate">
                                            {candidate.title || 'No title'}
                                          </p>
                                          {candidate.location && (
                                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                              <MapPin className="h-3 w-3" />
                                              {candidate.location}
                                            </p>
                                          )}
                                          {match.match_reason && (
                                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                                              {match.match_reason}
                                            </p>
                                          )}
                                          {candidate.skills && candidate.skills.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                              {candidate.skills.slice(0, 5).map((skill: string) => (
                                                <Badge key={skill} variant="secondary" className="text-xs">
                                                  {skill}
                                                </Badge>
                                              ))}
                                              {candidate.skills.length > 5 && (
                                                <span className="text-xs text-muted-foreground">
                                                  +{candidate.skills.length - 5}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        <ScoreBadge score={match.match_score || 0} size="md" showLabel={false} />
                                      </div>
                                    </div>
                                  );
                                })}
                                {filteredJobResults.length > 20 && (
                                  <p className="text-sm text-center text-muted-foreground py-4">
                                    Showing top 20 of {filteredJobResults.length} matches
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })() : (
                      <EmptyState
                        icon={ChevronRight}
                        title="Select a search"
                        description="Click a search on the left to view its results"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Results with bulk actions (Free Text mode) */}
              {searchMode === 'freeText' && results.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="shrink-0 border-b border-recruiter/10 bg-recruiter/5 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
                          <Users className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
                          {sortedResults.length} {sortedResults.length === 1 ? 'match' : 'matches'}
                          {selectedIds.size > 0 && <span className="text-muted-foreground font-normal">· {selectedIds.size} selected</span>}
                        </h2>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-sm text-muted-foreground font-sans">
                            Click row to view profile · Select for bulk actions · Showing ≥ {freeTextThreshold}%
                          </p>
                          <Select value={String(freeTextThreshold)} onValueChange={(v) => setFreeTextThreshold(Number(v))}>
                            <SelectTrigger className="h-7 w-[140px] text-xs border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="75">Show ≥ 75%</SelectItem>
                              <SelectItem value="60">Show ≥ 60%</SelectItem>
                              <SelectItem value="50">Show ≥ 50%</SelectItem>
                              <SelectItem value="25">Show ≥ 25%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {selectedIds.size > 0 && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleBulkAddToShortlist}
                            className="h-9 rounded-lg border-recruiter/20 bg-recruiter/5 hover:bg-recruiter/10 text-recruiter font-sans"
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add to Shortlist
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExport}
                            className="h-9 rounded-lg border-border font-sans"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Export
                          </Button>
                        </div>
                      )}
                      {selectedIds.size === 0 && sortedResults.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleExport}
                          className="h-9 rounded-lg border-border font-sans"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Export All
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="w-12 text-center">
                            <Checkbox
                              checked={selectedIds.size === sortedResults.length && sortedResults.length > 0}
                              onCheckedChange={toggleSelectAll}
                            />
                          </TableHead>
                          <TableHead className="w-12 text-center text-muted-foreground font-sans font-medium">#</TableHead>
                          <TableHead className="py-4 font-display font-semibold text-foreground cursor-pointer hover:text-recruiter" onClick={() => handleSort('name')}>
                            <div className="flex items-center gap-1">
                              Name
                              <SortIcon column="name" />
                            </div>
                          </TableHead>
                          <TableHead className="max-w-[180px] py-4 font-display font-semibold text-foreground cursor-pointer hover:text-recruiter" onClick={() => handleSort('title')}>
                            <div className="flex items-center gap-1">
                              Title
                              <SortIcon column="title" />
                            </div>
                          </TableHead>
                          <TableHead className="w-24 hidden sm:table-cell py-4 font-display font-semibold text-foreground cursor-pointer hover:text-recruiter" onClick={() => handleSort('experience')}>
                            <div className="flex items-center gap-1">
                              Exp
                              <SortIcon column="experience" />
                            </div>
                          </TableHead>
                          <TableHead className="max-w-[120px] hidden lg:table-cell py-4 font-display font-semibold text-foreground cursor-pointer hover:text-recruiter" onClick={() => handleSort('location')}>
                            <div className="flex items-center gap-1">
                              Location
                              <SortIcon column="location" />
                            </div>
                          </TableHead>
                          <TableHead className="hidden xl:table-cell py-4 font-display font-semibold text-foreground">Skills</TableHead>
                          <TableHead className="w-20 text-center py-4 font-display font-semibold text-foreground cursor-pointer hover:text-recruiter" onClick={() => handleSort('match_score')} title="Fit score for this search">
                            <div className="flex items-center justify-center gap-1">
                              Match
                              <SortIcon column="match_score" />
                            </div>
                          </TableHead>
                          <TableHead className="w-[140px] py-4 font-display font-semibold text-foreground">Shortlist</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedResults.length === 0 && results.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-12">
                              <div className="flex flex-col items-center gap-3">
                                <Filter className="h-12 w-12 text-muted-foreground/30" />
                                <div>
                                  <p className="text-lg font-semibold text-foreground">No matches at ≥ {freeTextThreshold}%</p>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Found {results.length} candidates, but all are below {freeTextThreshold}% match.
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Try lowering the threshold using the dropdown above.
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        {sortedResults.map((result, idx) => {
                          const candidate = getCandidateForResult(result);
                          if (!candidate) return null;
                          const candId = candidate.id;
                          const isSelected = selectedIds.has(candId);
                          const memberships = shortlistsForCandidateId.get(candId) || [];
                          return (
                            <TableRow
                              key={candId ?? idx}
                              className={cn(
                                "group border-border transition-colors hover:bg-recruiter/5 hover:border-recruiter/20",
                                isSelected && "bg-recruiter/10"
                              )}
                            >
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelect(candId)}
                                />
                              </TableCell>
                              <TableCell className="text-sm py-4 text-center text-muted-foreground font-sans tabular-nums cursor-pointer" onClick={() => openTalent(candId)}>{idx + 1}</TableCell>
                              <TableCell className="py-4 cursor-pointer" onClick={() => openTalent(candId)}>
                                <span className="font-display font-semibold text-foreground group-hover:text-recruiter transition-colors truncate block max-w-[140px]">{candidate.name ?? '—'}</span>
                              </TableCell>
                              <TableCell className="py-4 max-w-[180px] cursor-pointer" onClick={() => openTalent(candId)}>
                                <span className="text-sm text-muted-foreground font-sans truncate block" title={candidate.title || undefined}>
                                  {candidate.title || '—'}
                                </span>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell py-4 cursor-pointer" onClick={() => openTalent(candId)}>
                                <span className="text-sm text-muted-foreground font-sans">
                                  {candidate.years_experience ? `${candidate.years_experience}y` : '—'}
                                </span>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell py-4 max-w-[120px] cursor-pointer" onClick={() => openTalent(candId)}>
                                <span className="text-sm text-muted-foreground font-sans truncate block" title={candidate.location || undefined}>
                                  {candidate.location || '—'}
                                </span>
                              </TableCell>
                              <TableCell className="hidden xl:table-cell py-4 cursor-pointer" onClick={() => openTalent(candId)}>
                                <div className="flex flex-wrap gap-1">
                                  {candidate.skills?.slice(0, 3).map(skill => (
                                    <Badge key={skill} variant="secondary" className="text-xs px-1.5 py-0">{skill}</Badge>
                                  ))}
                                  {candidate.skills && candidate.skills.length > 3 && (
                                    <span className="text-xs text-muted-foreground">+{candidate.skills.length - 3}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center py-4 cursor-pointer" onClick={() => openTalent(candId)}>
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
                                    onClick={() => openAddToShortlist(candId)}
                                  >
                                    <UserPlus className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />
                                    Add
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

              {searchMode === 'freeText' && results.length === 0 && organizationId && !searchMutation.isPending && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <EmptyState
                    icon={Search}
                    title="Search your talent pool"
                    description="Describe a role, skills, or location above and hit Search. Results will appear here."
                  />
                </div>
              )}

              {searchMode === 'byJob' && (!searchJobs || searchJobs.length === 0) && !searchMutation.isPending && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <EmptyState
                    icon={Search}
                    title="No searches yet"
                    description="Select a job above and click Search to start an AI-powered talent search. Your searches will appear here."
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
      </div>

      <TalentDetailSheet talentId={selectedTalentId} open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* Add to Shortlist Dialog */}
      <Dialog open={shortlistDialogOpen} onOpenChange={setShortlistDialogOpen}>
        <DialogContent className="sm:max-w-md max-w-full rounded-xl border border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display font-bold">Add to shortlist</DialogTitle>
            <DialogDescription className="font-sans">
              {shortlistTargetIds.length === 1
                ? 'Pick a shortlist to save this candidate to, or create a new one below.'
                : `Add ${shortlistTargetIds.length} candidates to a shortlist.`
              }
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
                setShortlistTargetIds([]);
              }}
              className="rounded-lg h-11 border-border font-sans"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (shortlistTargetIds.length === 0) return;
                if (!selectedShortlistId) return toast.error('Select a shortlist');
                addToShortlist.mutate({ shortlistId: selectedShortlistId, candidateIds: shortlistTargetIds });
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

      {/* Save Search Dialog */}
      <Dialog open={saveSearchDialogOpen} onOpenChange={setSaveSearchDialogOpen}>
        <DialogContent className="sm:max-w-md max-w-full rounded-xl border border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-display font-bold">Save this search</DialogTitle>
            <DialogDescription className="font-sans">
              Give your search a name so you can quickly run it again later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-sans font-medium">Search name</Label>
              <Input
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
                placeholder="e.g. Senior React Developers"
                className="h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans"
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Query:</p>
              <p className="text-sm font-sans">{searchQuery}</p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setSaveSearchDialogOpen(false);
                setSaveSearchName('');
              }}
              className="rounded-lg h-11 border-border font-sans"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!saveSearchName.trim()) return toast.error('Enter a name for this search');
                saveSearchMutation.mutate({
                  name: saveSearchName,
                  query: searchQuery,
                  filters: manualFilters
                });
              }}
              disabled={saveSearchMutation.isPending}
              className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold"
            >
              {saveSearchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" strokeWidth={1.5} /> : <Save className="h-4 w-4 mr-2" strokeWidth={1.5} />}
              Save Search
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
