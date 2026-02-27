import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScoreBadge } from '@/components/ui/score-badge';
import { Database, Globe, Search as SearchIcon, Sparkles, Filter, X, Loader2, SlidersHorizontal, Users, UserPlus, Download, ArrowUpDown, ArrowUp, ArrowDown, Clock, MapPin, ChevronRight, Star, Plus, Copy, Trash2, StopCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite } from '@/lib/org';
import { toast } from 'sonner';
import { useRef, useEffect } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { UnifiedResultsDisplay } from '@/components/search/UnifiedResultsDisplay';
import { adaptInternalResult, adaptExternalResult } from '@/types/search-results';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';

/**
 * Unified Talent Search - EXTREME Real Estate Optimization
 *
 * Target: Mode controls + search = <100px, Results get 90%+
 *
 * Hierarchical modes:
 * - Talent Pool (Internal) → Free Text | Search by Job
 *   - Free Text: Instant sync search with user query, shows results immediately
 *   - Search by Job: Async background search, creates saved search jobs
 * - Web (External) → Web Search | Google X-Ray | Serp Search
 *   - Web Search: General web profiles
 *   - Google X-Ray: LinkedIn via Google CSE
 *   - Serp Search: LinkedIn via SerpAPI
 */

type PrimaryMode = 'pool' | 'web';
type PoolMode = 'freeText' | 'byJob';
type SearchMode = 'web' | 'basic' | 'deep';

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
}

export default function Search() {
  const { roles } = useAuth();
  const organizationId = orgIdForRecruiterSuite(roles);
  const queryClient = useQueryClient();

  // Mode state
  const [primaryMode, setPrimaryMode] = useState<PrimaryMode>('pool');
  const [poolMode, setPoolMode] = useState<PoolMode>('freeText');
  const [searchMode, setSearchMode] = useState<'web' | 'basic' | 'deep'>('web');

  // Pool - Free Text state
  const [freeTextQuery, setFreeTextQuery] = useState('');
  const [strictMode, setStrictMode] = useState(false);
  const [poolFiltersOpen, setPoolFiltersOpen] = useState(false);
  const [manualFilters, setManualFilters] = useState<ManualFilters>({
    minExperience: 0,
    maxExperience: 20,
    locations: [],
    skills: [],
  });
  const [freeTextResults, setFreeTextResults] = useState<SearchResult[]>([]);
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);
  const [freeTextThreshold, setFreeTextThreshold] = useState(75);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<'name' | 'title' | 'experience' | 'location' | 'match_score'>('match_score');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pool - By Job state
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedSearchJobId, setSelectedSearchJobId] = useState<string | null>(null);
  const [searchThresholds, setSearchThresholds] = useState<Map<string, number>>(new Map());
  const [jobResultsLimit, setJobResultsLimit] = useState(20);
  const prevSearchJobsRef = useRef<Map<string, string>>(new Map());

  // Web - Web Search state
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [webFiltersOpen, setWebFiltersOpen] = useState(false);
  const [webCountry, setWebCountry] = useState<'us' | 'any'>('us');
  const [webIncludeLinkedIn, setWebIncludeLinkedIn] = useState(false);
  const [webPages, setWebPages] = useState<Array<{ id: string; results: any[]; ts: number }>>([]);
  const [activeWebPage, setActiveWebPage] = useState<number>(0);
  const [webSearchResults, setWebSearchResults] = useState<any[]>([]);
  const [webStrategyIndex, setWebStrategyIndex] = useState<number>(0);
  const [webSelectedKeys, setWebSelectedKeys] = useState<Set<string>>(new Set());

  // Web - LinkedIn Search state (Basic = Google CSE, Deep = Serp API)
  const [leadResultsBasic, setLeadResultsBasic] = useState<any[]>([]);
  const [leadResultsDeep, setLeadResultsDeep] = useState<any[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [activeResultKey, setActiveResultKey] = useState<string>('');
  const [googleNextStartBasic, setGoogleNextStartBasic] = useState<number>(1);
  const [googleTotalFoundBasic, setGoogleTotalFoundBasic] = useState<number>(0);
  const [googleNextStartDeep, setGoogleNextStartDeep] = useState<number>(1);
  const [googleTotalFoundDeep, setGoogleTotalFoundDeep] = useState<number>(0);
  const [leadPage, setLeadPage] = useState<number>(1);
  const [leadPageSize, setLeadPageSize] = useState<number>(20);

  // Web - LinkedIn Query Builder state
  const [linkedInJobId, setLinkedInJobId] = useState('');
  const [queryBuilderOpen, setQueryBuilderOpen] = useState(false);
  const [isParsingJD, setIsParsingJD] = useState(false);
  const [isBuildingQuery, setIsBuildingQuery] = useState(false);
  const [parsedJD, setParsedJD] = useState<any>(null);
  const [selectedSkills, setSelectedSkills] = useState<{
    core: string[];
    secondary: string[];
    methods_tools: string[];
    certs: string[];
  }>({ core: [], secondary: [], methods_tools: [], certs: [] });
  const [generatedQuery, setGeneratedQuery] = useState('');
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [queryCacheId, setQueryCacheId] = useState<string | null>(null);

  // UI state - Talent Detail Sheet
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Load latest Google X-ray (basic) search results from DB (shared across all recruiters)
  const { data: latestBasicLinkedInSearch } = useQuery({
    queryKey: ['latest-linkedin-search-basic', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from('talent_search_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('search_query', 'linkedin_xray_basic') // Google X-ray (CSE)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Load latest Serp Search (deep) results from DB (shared across all recruiters)
  const { data: latestDeepLinkedInSearch } = useQuery({
    queryKey: ['latest-linkedin-search-deep', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from('talent_search_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('search_query', 'linkedin_xray_deep') // Serp API
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Load Google X-ray (basic) results from latest search
  useEffect(() => {
    if (latestBasicLinkedInSearch?.results) {
      const results = latestBasicLinkedInSearch.results as any;
      if (Array.isArray(results.results)) {
        setLeadResultsBasic(results.results);
        if (typeof results.nextStart === 'number') setGoogleNextStartBasic(results.nextStart);
        if (typeof results.totalFound === 'number') setGoogleTotalFoundBasic(results.totalFound);
      }
      // Restore query builder state
      if (results.generatedQuery) setGeneratedQuery(results.generatedQuery);
      if (results.linkedInJobId) setLinkedInJobId(results.linkedInJobId);
    }
  }, [latestBasicLinkedInSearch]);

  // Load Serp Search (deep) results from latest search
  useEffect(() => {
    if (latestDeepLinkedInSearch?.results) {
      const results = latestDeepLinkedInSearch.results as any;
      if (Array.isArray(results.results)) {
        setLeadResultsDeep(results.results);
        if (typeof results.nextStart === 'number') setGoogleNextStartDeep(results.nextStart);
        if (typeof results.totalFound === 'number') setGoogleTotalFoundDeep(results.totalFound);
      }
      // Restore query builder state (only if not already set by basic mode)
      if (results.generatedQuery && !generatedQuery) setGeneratedQuery(results.generatedQuery);
      if (results.linkedInJobId && !linkedInJobId) setLinkedInJobId(results.linkedInJobId);
    }
  }, [latestDeepLinkedInSearch]);

  // Fetch jobs for Pool By Job and Web Deep modes
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['org-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, description, required_skills, nice_to_have_skills')
        .eq('organization_id', organizationId)
        .order('title');
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  // Query for async search jobs (Search by Job mode ONLY)
  const { data: searchJobs, refetch: refetchSearchJobs } = useQuery({
    queryKey: ['talent-search-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('talent_search_jobs')
        .select('*, jobs(title)')
        .eq('organization_id', organizationId)
        .eq('search_type', 'by_job')
        .not('job_id', 'is', null)
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

  // Show notification when search completes
  useEffect(() => {
    if (!searchJobs) return;

    searchJobs.forEach((job: any) => {
      const prevStatus = prevSearchJobsRef.current.get(job.id);
      const currentStatus = job.status;

      // Detect transition to "completed"
      if (
        prevStatus &&
        (prevStatus === 'pending' || prevStatus === 'processing') &&
        currentStatus === 'completed'
      ) {
        const jobTitle = job.jobs?.title || 'Job search';
        const matchCount = job.matches_found || 0;
        toast.success(`${jobTitle} search complete! Found ${matchCount} matches.`, {
          duration: 5000,
          action: {
            label: 'View Results',
            onClick: () => setSelectedSearchJobId(job.id),
          },
        });
      }

      // Update tracking map
      prevSearchJobsRef.current.set(job.id, currentStatus);
    });
  }, [searchJobs]);

  // Reset job results limit when selected search changes
  useEffect(() => {
    setJobResultsLimit(20);
  }, [selectedSearchJobId]);

  // Pool - Free Text search mutation
  // Load latest Free Text search results on mount (shared across all recruiters)
  const { data: latestFreeTextSearch } = useQuery({
    queryKey: ['latest-free-text-search', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from('talent_search_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('search_type', 'free_text')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Load results from latest search when it changes
  useEffect(() => {
    if (latestFreeTextSearch?.results?.matches) {
      const enriched = (latestFreeTextSearch.results.matches as any[]).map((m: any) => ({
        ...m,
        candidate_id: m?.candidate_id || m?.candidate?.id,
        candidate: {
          ...m?.candidate,
          current_company: m?.candidate?.company || m?.candidate?.current_company
        }
      } as SearchResult));
      setFreeTextResults(enriched);
      setFreeTextQuery(latestFreeTextSearch.search_query || '');
      if (latestFreeTextSearch.results.parsed_query) {
        setParsedQuery(latestFreeTextSearch.results.parsed_query);
      }
    }
  }, [latestFreeTextSearch]);

  const freeTextSearchMutation = useMutation({
    mutationFn: async ({ query, strictMode }: { query: string; strictMode: boolean }) => {
      const body = {
        searchQuery: query,
        organizationId,
        prefilterLimit: 200,
        topN: 50,
        strictMode: strictMode
      };

      const { data, error } = await supabase.functions.invoke('talent-search', {
        body
      });
      if (error) throw error;
      return { searchData: data, query };
    },
    onSuccess: async ({ searchData, query }) => {
      const FREE_TEXT_MIN_SCORE = 25;
      const enriched = ((searchData.matches || []) as any[])
        .filter((m: any) => Number(m?.match_score || 0) >= FREE_TEXT_MIN_SCORE)
        .map((m: any) => ({
          ...m,
          candidate_id: m?.candidate_id || m?.candidate?.id,
          candidate: {
            ...m?.candidate,
            current_company: m?.candidate?.company || m?.candidate?.current_company
          }
        } as SearchResult));

      setFreeTextResults(enriched);
      setParsedQuery(searchData.parsed_query || null);

      // Edge function already saved results to database, just invalidate cache to refresh
      queryClient.invalidateQueries({ queryKey: ['latest-free-text-search', organizationId] });

      const matchingThreshold = enriched.filter(m => Number(m?.match_score || 0) >= freeTextThreshold);
      toast.success(`Found ${matchingThreshold.length} candidates ≥${freeTextThreshold}%`);
    },
    onError: (error: any) => {
      console.error('Search error:', error);
      toast.error(error.message || 'Search failed');
    },
  });

  // Get available filter options from Pool Free Text results
  const availableLocations = useMemo(() => {
    const locs = new Set<string>();
    freeTextResults.forEach(r => {
      if (r.candidate?.location) locs.add(r.candidate.location);
    });
    return Array.from(locs).sort();
  }, [freeTextResults]);

  const availableSkills = useMemo(() => {
    const skills = new Set<string>();
    freeTextResults.forEach(r => {
      r.candidate?.skills?.forEach(s => skills.add(s));
    });
    return Array.from(skills).sort();
  }, [freeTextResults]);

  // Apply manual filters to Pool Free Text results
  const filteredResults = useMemo(() => {
    let filtered = [...freeTextResults];

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
  }, [freeTextResults, manualFilters, freeTextThreshold]);

  // Sort Pool Free Text results
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

  // Adapt Pool Free Text results for UnifiedResultsDisplay
  const adaptedFreeTextResults = useMemo(() => {
    return freeTextResults.map(result => adaptInternalResult(result));
  }, [freeTextResults]);

  const handleSort = (column: 'name' | 'title' | 'experience' | 'location' | 'match_score') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const clearAllFilters = () => {
    setManualFilters({
      minExperience: 0,
      maxExperience: 20,
      locations: [],
      skills: [],
    });
  };

  const handleFreeTextSearch = () => {
    if (!freeTextQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    setFreeTextResults([]);
    setParsedQuery(null);
    setSelectedIds(new Set());
    freeTextSearchMutation.mutate({ query: freeTextQuery, strictMode });
  };

  // Pool - By Job search mutation
  const byJobSearchMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const selectedJob = jobs?.find(j => j.id === jobId);
      if (!selectedJob) throw new Error('Job not found');

      // Delete any existing searches for this job
      const existingSearches = searchJobs?.filter((sj: any) => sj.job_id === jobId) || [];
      if (existingSearches.length > 0) {
        const deleteIds = existingSearches.map((s: any) => s.id);
        await supabase
          .from('talent_search_jobs')
          .delete()
          .in('id', deleteIds);
      }

      const body = {
        searchQuery: `${selectedJob.title}`,
        organizationId,
        prefilterLimit: 200,
        topN: 50,
        strictMode: false,
        structuredSearch: {
          jobId: selectedJob.id,
          role: selectedJob.title,
          skills: [
            ...(selectedJob.required_skills || []),
            ...(selectedJob.nice_to_have_skills || [])
          ]
        }
      };

      const { data, error } = await supabase.functions.invoke('talent-search', {
        body
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.searchJobId) {
        setSelectedSearchJobId(data.searchJobId);
        toast.success('Search started! Processing in background...');
        refetchSearchJobs();
      }
    },
    onError: (error: any) => {
      console.error('Search error:', error);
      toast.error(error.message || 'Search failed');
    },
  });

  // Stop/Cancel search mutation
  const cancelSearchMutation = useMutation({
    mutationFn: async (searchJobId: string) => {
      const { error } = await supabase
        .from('talent_search_jobs')
        .update({
          status: 'cancelled',
          completed_at: new Date().toISOString()
        })
        .eq('id', searchJobId);
      if (error) throw error;
      return searchJobId;
    },
    onSuccess: () => {
      toast.success('Search stopped. Results saved.');
      refetchSearchJobs();
    },
    onError: (error: any) => {
      console.error('Cancel error:', error);
      toast.error('Failed to stop search');
    },
  });

  // Delete search mutation
  const deleteSearchMutation = useMutation({
    mutationFn: async (searchJobId: string) => {
      const { error } = await supabase
        .from('talent_search_jobs')
        .delete()
        .eq('id', searchJobId);
      if (error) throw error;
      return searchJobId;
    },
    onSuccess: (deletedId) => {
      toast.success('Search deleted');
      if (selectedSearchJobId === deletedId) {
        setSelectedSearchJobId(null);
      }
      // Invalidate cache to force fresh data
      queryClient.invalidateQueries({ queryKey: ['talent-search-jobs', organizationId] });
      refetchSearchJobs();
    },
    onError: (error: any) => {
      console.error('Delete error:', error);
      toast.error('Failed to delete search');
    },
  });

  const handleByJobSearch = () => {
    if (!selectedJobId) {
      toast.error('Please select a job');
      return;
    }
    byJobSearchMutation.mutate(selectedJobId);
  };

  // Helper functions
  const getThreshold = (searchJobId: string) => searchThresholds.get(searchJobId) || 75;
  const setThreshold = (searchJobId: string, threshold: number) => {
    setSearchThresholds(new Map(searchThresholds.set(searchJobId, threshold)));
  };

  // Adapt Pool By Job results for UnifiedResultsDisplay
  const adaptedByJobResults = useMemo(() => {
    if (!selectedSearchJobId || !searchJobs) return [];
    const selectedJob = searchJobs.find((j: any) => j.id === selectedSearchJobId);
    if (!selectedJob || (selectedJob.status !== 'completed' && selectedJob.status !== 'processing' && selectedJob.status !== 'cancelled')) return [];
    const jobResults = selectedJob.results?.matches || [];
    return jobResults.map((result: any) => adaptInternalResult(result));
  }, [selectedSearchJobId, searchJobs]);

  // Adapt Web Search results for UnifiedResultsDisplay
  const adaptedWebSearchResults = useMemo(() => {
    return webSearchResults.map(result => adaptExternalResult(result));
  }, [webSearchResults]);

  const rowKey = (mode: string, row: any, fallbackIndex: number) => {
    return String(row?.linkedin_url || row?.website || row?.source_url || `profile#${fallbackIndex}`);
  };

  // Load latest Web Search results on mount (shared across all recruiters)
  const { data: latestWebSearch } = useQuery({
    queryKey: ['latest-web-search', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase
        .from('talent_search_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('search_query', 'web_search') // Use special marker for web searches
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Load Web Search results from latest search when it changes
  useEffect(() => {
    if (latestWebSearch?.results?.pages) {
      const pages = latestWebSearch.results.pages as any[];
      setWebPages(pages);
      setActiveWebPage(0);
      if (pages.length > 0 && pages[0].results?.length > 0) {
        setWebSearchResults(pages[0].results);
        setActiveResultKey(rowKey('web', pages[0].results[0], 0));
      }
      setWebStrategyIndex(latestWebSearch.results.strategyIndex || 0);
    }
  }, [latestWebSearch]);

  // Web Search mutations
  const webSearchInitial = useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('web-search', {
        body: {
          query,
          limit: 20,
          country: webCountry === 'us' ? 'us' : 'any',
          includeLinkedIn: webIncludeLinkedIn,
          excludeUrls: [],
          strategyIndex: 0
        }
      });
      if (error) throw error;
      return { searchData: data, query };
    },
    onSuccess: async ({ searchData, query }) => {
      console.log('Web search succeeded', { resultCount: searchData?.profiles?.length });
      const results = Array.isArray(searchData?.profiles) ? searchData.profiles : [];
      setWebSelectedKeys(new Set());
      setActiveResultKey(results[0] ? rowKey('web', results[0], 0) : '');

      const page = { id: crypto.randomUUID(), results, ts: Date.now() };
      setWebPages([page]);
      setActiveWebPage(0);
      setWebSearchResults(results);
      setWebStrategyIndex(0);
      console.log('State updated', { webPages: [page], resultsCount: results.length });

      // Save to database so all recruiters see the same results (but don't invalidate to avoid race condition)
      try {
        const { data: userData } = await supabase.auth.getUser();
        await supabase.from('talent_search_jobs').insert({
          organization_id: organizationId,
          created_by: userData?.user?.id,
          job_id: null,
          search_query: query, // Use actual query
          search_type: 'web_search',
          status: 'completed',
          results: {
            pages: [page],
            strategyIndex: 0,
            originalQuery: query,
            filters: { country: webCountry, includeLinkedIn: webIncludeLinkedIn }
          },
          total_candidates_searched: results.length,
          matches_found: results.length,
          completed_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Failed to save web search results:', err);
      }

      if (results.length) toast.success(`Found ${results.length} results`);
      else toast.info(searchData?.message || 'No profiles found. Try different search terms.');
    },
    onError: (error: any) => {
      console.error('Web search failed', error);
      setWebPages([]);
      setActiveWebPage(0);
      setWebSearchResults([]);
      setWebSelectedKeys(new Set());
      setActiveResultKey('');
      toast.error(error?.message || 'Search failed');
    }
  });

  const webSearchMore = useMutation({
    mutationFn: async (query: string) => {
      const excludeUrls = webPages
        .flatMap(p => p.results || [])
        .map((r: any) => String(r?.source_url || r?.website || r?.linkedin_url || '').trim())
        .filter(Boolean);

      const { data, error } = await supabase.functions.invoke('web-search', {
        body: {
          query,
          limit: 20,
          country: webCountry === 'us' ? 'us' : 'any',
          includeLinkedIn: webIncludeLinkedIn,
          excludeUrls,
          strategyIndex: webStrategyIndex
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      const results = Array.isArray(data?.profiles) ? data.profiles : [];
      if (!results.length) {
        toast.info(data?.message || 'No more results');
        return;
      }

      setWebSelectedKeys(new Set());
      setActiveResultKey(rowKey('web', results[0], 0));

      const newPage = { id: crypto.randomUUID(), results, ts: Date.now() };
      let updatedPages: any[];
      setWebPages(prev => {
        const next = [...prev, newPage];
        updatedPages = next.slice(0, 20);
        return updatedPages;
      });
      setActiveWebPage(prev => prev + 1);
      setWebSearchResults(results);
      const newStrategyIndex = (webStrategyIndex + 1) % 3;
      setWebStrategyIndex(newStrategyIndex);

      // Update saved search with new pages (but don't invalidate to avoid race condition)
      if (latestWebSearch?.id) {
        try {
          await supabase.from('talent_search_jobs').update({
            results: {
              ...latestWebSearch.results,
              pages: updatedPages,
              strategyIndex: newStrategyIndex
            },
            updated_at: new Date().toISOString()
          }).eq('id', latestWebSearch.id);
        } catch (err) {
          console.error('Failed to update web search results:', err);
        }
      }

      toast.success(`Loaded ${results.length}`);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Load more failed');
    }
  });

  const handleWebSearch = () => {
    if (!webSearchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    console.log('Starting web search...', { query: webSearchQuery, organizationId });
    setWebPages([]);
    setActiveWebPage(0);
    setWebSearchResults([]);
    setWebSelectedKeys(new Set());
    setActiveResultKey('');
    setWebStrategyIndex(0);
    webSearchInitial.mutate(webSearchQuery);
  };

  const handleLoadMoreWeb = () => {
    if (!webSearchQuery.trim()) return;
    webSearchMore.mutate(webSearchQuery);
  };

  const clearWebSearchSession = () => {
    setWebPages([]);
    setActiveWebPage(0);
    setWebSearchResults([]);
    setWebSelectedKeys(new Set());
    setActiveResultKey('');
    setWebStrategyIndex(0);
  };

  // Helper functions for mode-specific state
  const isDeepMode = searchMode === 'deep';
  const leadResults = isDeepMode ? leadResultsDeep : leadResultsBasic;
  const setLeadResults = isDeepMode ? setLeadResultsDeep : setLeadResultsBasic;
  const googleNextStart = isDeepMode ? googleNextStartDeep : googleNextStartBasic;
  const setGoogleNextStart = isDeepMode ? setGoogleNextStartDeep : setGoogleNextStartBasic;
  const googleTotalFound = isDeepMode ? googleTotalFoundDeep : googleTotalFoundBasic;
  const setGoogleTotalFound = isDeepMode ? setGoogleTotalFoundDeep : setGoogleTotalFoundBasic;
  const effectiveLinkedInProvider: 'google_cse' | 'serpapi' = isDeepMode ? 'serpapi' : 'google_cse';

  // LinkedIn pagination computed values
  const isLinkedInMode = primaryMode === 'web' && searchMode !== 'web';
  const googleFilteredCount = isLinkedInMode ? leadResults.length : 0;
  const effectiveLeadPageSize = leadPageSize;
  const googlePagingEnabled = isLinkedInMode && leadResults.length > effectiveLeadPageSize;
  const googlePageCount = googlePagingEnabled
    ? Math.max(1, Math.ceil(googleFilteredCount / Math.max(1, effectiveLeadPageSize)))
    : 1;
  const safeLeadPage = Math.max(1, Math.min(leadPage, googlePageCount));
  const googlePageStartIndex = googlePagingEnabled
    ? (safeLeadPage - 1) * Math.max(1, effectiveLeadPageSize)
    : 0;
  const googlePageEndIndex = googlePagingEnabled
    ? googlePageStartIndex + Math.max(1, effectiveLeadPageSize)
    : googleFilteredCount;
  const googleHasMore = isLinkedInMode && googleNextStart > 0 && leadResults.length > 0;

  // Get paginated results for display
  const paginatedLeadResults = googlePagingEnabled
    ? leadResults.slice(googlePageStartIndex, googlePageEndIndex)
    : leadResults;

  // LinkedIn X-ray / Serp Search mutation
  const linkedInSearchMutation = useMutation({
    mutationFn: async (args: {
      xray: string;
      limit?: number;
      start?: number;
      append?: boolean;
      country?: 'us' | 'any';
    }) => {
      const provider = effectiveLinkedInProvider;
      const fn = provider === 'serpapi' ? 'serpapi-search-linkedin' : 'google-search-linkedin';
      const { data, error } = await supabase.functions.invoke(fn, {
        body: {
          query: '',
          xray: args.xray,
          limit: args.limit ?? 20,
          start: args.start ?? 1,
          country: args.country ?? 'us'
        }
      });
      if (error) throw error;
      return { data, append: args.append };
    },
    onSuccess: async ({ data, append }) => {
      if (data?.success === false && data?.error) {
        setLeadResults([]);
        toast.error(String(data.error));
        return;
      }
      const results = Array.isArray(data?.results) ? data.results : [];
      const totalFound = typeof data?.total_found === 'number' ? data.total_found : 0;
      const nextStartRaw = typeof data?.next_start === 'number' ? data.next_start : 0;
      const nextStart = Math.max(0, Math.trunc(nextStartRaw));

      let finalResults: any[];
      if (append) {
        setLeadResults(prev => {
          const map = new Map<string, any>();
          for (const r of prev) map.set(String(r.linkedin_url), r);
          for (const r of results) map.set(String(r.linkedin_url), r);
          finalResults = Array.from(map.values());
          return finalResults;
        });
      } else {
        finalResults = results;
        setLeadResults(results);
        setSelectedKeys(new Set());
        setLeadPage(1);
      }

      setGoogleNextStart(nextStart);
      setGoogleTotalFound(totalFound);

      // Save to database so all recruiters see the same results (only on initial search, not append)
      if (!append) {
        try {
          const { data: userData } = await supabase.auth.getUser();
          const searchType = searchMode === 'basic' ? 'linkedin_xray_basic' : 'linkedin_xray_deep';
          await supabase.from('talent_search_jobs').insert({
            organization_id: organizationId,
            created_by: userData?.user?.id,
            job_id: linkedInJobId || null,
            search_query: generatedQuery || 'LinkedIn X-Ray Search',
            search_type: searchType,
            status: 'completed',
            results: {
              mode: searchMode, // 'basic' or 'deep'
              results: finalResults,
              generatedQuery,
              linkedInJobId,
              nextStart,
              totalFound
            },
            total_candidates_searched: totalFound,
            matches_found: finalResults.length,
            completed_at: new Date().toISOString()
          });
        } catch (err) {
          console.error('Failed to save LinkedIn search results:', err);
        }
      }

      if (!append) {
        if (results.length > 0) {
          toast.success(`Found ${results.length} LinkedIn profiles`);
        } else {
          toast.info('No profiles found. Try different search terms.');
        }
      } else {
        if (results.length > 0) {
          toast.success(`Loaded ${results.length} more`);
        } else {
          toast.info('No more results');
        }
      }
    },
    onError: (error: any) => {
      console.error('LinkedIn search error:', error);
      toast.error(error.message || 'Search failed');
      setLeadResults([]);
    }
  });

  // Query Builder: Parse job description
  const parseJobDescriptionMutation = useMutation({
    mutationFn: async (jdText: string) => {
      const { data, error } = await supabase.functions.invoke('parse-job-description', {
        body: { text: jdText }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (!data?.parsed) {
        toast.error('Failed to parse job description');
        return;
      }
      setParsedJD(data.parsed);
      // Pre-select all skills
      setSelectedSkills({
        core: data.parsed.skills.core || [],
        secondary: data.parsed.skills.secondary || [],
        methods_tools: data.parsed.skills.methods_tools || [],
        certs: data.parsed.skills.certs || []
      });
      setIsParsingJD(false);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to parse job description');
      setIsParsingJD(false);
    }
  });

  // Query Builder: Build LinkedIn X-ray query from selections
  const buildQueryFromSelections = async () => {
    if (!parsedJD || !linkedInJobId) return;

    setIsBuildingQuery(true);
    try {
      const job = jobs?.find(j => j.id === linkedInJobId);
      if (!job) throw new Error('Job not found');

      console.log('[Query Builder] Building query with skills:', selectedSkills);

      // Use LLM to generate query
      const { data: llmResult, error: llmError } = await supabase.functions.invoke('generate-linkedin-query', {
        body: {
          jobTitle: parsedJD.title || job.title,
          jobDescription: job.description,
          skills: selectedSkills,
        }
      });

      console.log('[Query Builder] LLM Result:', { success: llmResult?.success, query: llmResult?.query, error: llmError });

      if (!llmError && llmResult?.success && llmResult?.query) {
        const query = llmResult.query.trim();
        console.log('[Query Builder] Setting generated query:', query);
        setGeneratedQuery(query);

        // Save to cache
        const { data: userData } = await supabase.auth.getUser();
        if (organizationId && userData?.user) {
          await supabase
            .from('query_builder_cache')
            .upsert({
              job_id: linkedInJobId,
              user_id: userData.user.id,
              organization_id: organizationId,
              parsed_data: parsedJD,
              selected_data: selectedSkills,
              generated_query: query,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'job_id,user_id',
              ignoreDuplicates: false
            });
        }

        toast.success('Query generated successfully!');
        setQueryBuilderOpen(false); // Close the dialog
      } else {
        throw new Error(llmError?.message || 'Failed to generate query');
      }
    } catch (err: any) {
      console.error('Failed to build query:', err);
      toast.error(err?.message || 'Failed to generate query');
    } finally {
      setIsBuildingQuery(false);
    }
  };

  // Query Builder: Check cache
  const checkQueryCache = async (jobId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!organizationId || !userData?.user) return null;

    try {
      const { data, error } = await supabase
        .from('query_builder_cache')
        .select('*')
        .eq('job_id', jobId)
        .eq('user_id', userData.user.id)
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('Failed to check query cache:', e);
      return null;
    }
  };

  // Query Builder: Handle job selection
  const handleQueryBuilderJobSelect = async (jobId: string) => {
    console.log('[Query Builder] Job selected:', jobId);
    setLinkedInJobId(jobId);

    // Check cache first
    const cached = await checkQueryCache(jobId);
    if (cached && cached.parsed_data && cached.selected_data) {
      console.log('[Query Builder] Loaded from cache:', { skills: cached.selected_data, query: cached.generated_query });
      setParsedJD(cached.parsed_data);
      setSelectedSkills(cached.selected_data);
      setGeneratedQuery(cached.generated_query || '');
      setQueryCacheId(cached.id);
      toast.success('Loaded from cache');
      return;
    }

    console.log('[Query Builder] No cache found, parsing JD');
    // If not cached, parse the JD
    const job = jobs?.find(j => j.id === jobId);
    if (!job) return;

    setIsParsingJD(true);
    setParsedJD(null);
    setSelectedSkills({ core: [], secondary: [], methods_tools: [], certs: [] });
    setGeneratedQuery('');
    setQueryCacheId(null);

    parseJobDescriptionMutation.mutate(job.description);
  };

  const copyQueryToClipboard = () => {
    if (generatedQuery) {
      navigator.clipboard.writeText(generatedQuery);
      toast.success('Query copied to clipboard!');
    }
  };

  const handleLinkedInSearch = () => {
    if (!generatedQuery) {
      toast.error('No query generated');
      return;
    }
    // Clear old results before starting new search
    setLeadResults([]);
    setSelectedKeys(new Set());
    setGoogleNextStart(0);
    setGoogleTotalFound(0);

    linkedInSearchMutation.mutate({
      xray: generatedQuery,
      limit: 20,
      start: 1,
      append: false,
      country: 'us'
    });
  };

  const handleLoadMoreLinkedIn = () => {
    if (!generatedQuery || !googleNextStart || googleNextStart <= 0) return;
    linkedInSearchMutation.mutate({
      xray: generatedQuery,
      limit: 20,
      start: googleNextStart,
      append: true,
      country: 'us'
    });
  };

  // Open talent detail drawer
  const openTalent = (talentId: string) => {
    setSelectedTalentId(talentId);
    setSheetOpen(true);
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedResults.length && sortedResults.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedResults.map(r => r.candidate_id || r.candidate?.id).filter(Boolean) as string[]));
    }
  };

  const SortIcon = ({ column }: { column: typeof sortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
  };

  return (
    <DashboardLayout>
      {/* PAGE HEADER */}
        <div className="shrink-0">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 pb-6">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="p-2 rounded-xl bg-recruiter/10 dark:bg-recruiter/20 border-2 border-recruiter/70 dark:border-white/50">
                <SearchIcon className="h-4 w-4 text-recruiter/60 dark:text-recruiter" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                Talent <span className="text-gradient-recruiter">Search</span>
              </h1>
            </div>
            <p className="text-lg text-muted-foreground font-sans">
              {primaryMode === 'pool'
                ? 'Search your internal talent pool with AI-powered matching'
                : 'Find external candidates using web search and LinkedIn X-ray queries'
              }
            </p>
          </div>
        </div>

        {/* ULTRA-COMPACT MODE SELECTOR - Sticky, ~50-60px */}
        <div className="shrink-0 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">

            {/* Primary Mode - Compact Tabs */}
            <div className="py-2 border-b border-border/50">
              <Tabs value={primaryMode} onValueChange={(v) => setPrimaryMode(v as PrimaryMode)}>
                <TabsList className="h-9 bg-muted/50">
                  <TabsTrigger value="pool" className="text-xs gap-1.5 px-3">
                    <Database className="h-3.5 w-3.5" />
                    Talent Pool
                  </TabsTrigger>
                  <TabsTrigger value="web" className="text-xs gap-1.5 px-3">
                    <Globe className="h-3.5 w-3.5" />
                    Talent Search
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Secondary Mode - Below Primary */}
            <div className="py-3">
              {primaryMode === 'pool' ? (
                <RadioGroup
                  value={poolMode}
                  onValueChange={(v) => setPoolMode(v as PoolMode)}
                  className="flex items-center gap-6"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="freeText" id="pool-ft" className="h-3.5 w-3.5" />
                    <Label htmlFor="pool-ft" className="text-xs font-normal cursor-pointer">
                      Free Text
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="byJob" id="pool-bj" className="h-3.5 w-3.5" />
                    <Label htmlFor="pool-bj" className="text-xs font-normal cursor-pointer">
                      Search by Job
                    </Label>
                  </div>
                </RadioGroup>
              ) : (
                <RadioGroup
                  value={searchMode}
                  onValueChange={(v) => setSearchMode(v as SearchMode)}
                  className="flex items-center gap-6"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="web" id="web-ws" className="h-3.5 w-3.5" />
                    <Label htmlFor="web-ws" className="text-xs font-normal cursor-pointer">
                      Web Search
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="basic" id="web-gx" className="h-3.5 w-3.5" />
                    <Label htmlFor="web-gx" className="text-xs font-normal cursor-pointer">
                      Google X-Ray
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="deep" id="web-ss" className="h-3.5 w-3.5" />
                    <Label htmlFor="web-ss" className="text-xs font-normal cursor-pointer">
                      Serp Search
                    </Label>
                  </div>
                </RadioGroup>
              )}
            </div>
          </div>
        </div>

        {/* SEARCH CONTROLS - Ultra-compact, ~50px */}
        <div className="shrink-0">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 pb-3">

            {/* Pool + Free Text */}
            {primaryMode === 'pool' && poolMode === 'freeText' && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[300px]">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" strokeWidth={1.5} />
                  <Input
                    placeholder="e.g. Backend engineer, Python, 3+ years, fintech..."
                    value={freeTextQuery}
                    onChange={(e) => setFreeTextQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFreeTextSearch()}
                    className="pl-10 h-9 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="strict-mode"
                    checked={strictMode}
                    onCheckedChange={(v) => setStrictMode(Boolean(v))}
                    className="h-3.5 w-3.5"
                  />
                  <Label htmlFor="strict-mode" className="text-xs font-normal cursor-pointer text-muted-foreground whitespace-nowrap">
                    Must have ALL skills
                  </Label>
                </div>
                <Button
                  size="sm"
                  onClick={handleFreeTextSearch}
                  disabled={!freeTextQuery.trim() || freeTextSearchMutation.isPending}
                  className="h-9 px-4 text-xs"
                >
                  {freeTextSearchMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Search
                </Button>
              </div>
            )}

            {/* Pool + By Job */}
            {primaryMode === 'pool' && poolMode === 'byJob' && (
              <div className="flex items-center gap-2 flex-nowrap">
                <Label className="text-sm font-bold shrink-0">Job:</Label>
                <Select value={selectedJobId} onValueChange={setSelectedJobId} disabled={jobsLoading}>
                  <SelectTrigger className="h-9 text-sm flex-[3] min-w-0">
                    <SelectValue placeholder={jobsLoading ? "Loading jobs..." : "Select a job..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs && jobs.length > 0 ? (
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
                <Button
                  size="sm"
                  onClick={handleByJobSearch}
                  disabled={!selectedJobId || byJobSearchMutation.isPending}
                  className="h-9 px-4 text-xs shrink-0"
                >
                  {byJobSearchMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Search
                </Button>
              </div>
            )}

            {/* Web + Web Search */}
            {primaryMode === 'web' && searchMode === 'web' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. Senior Python developer, 5+ years, AWS, New York"
                    value={webSearchQuery}
                    onChange={(e) => setWebSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleWebSearch()}
                    className="flex-1 h-9 text-sm"
                  />
                  <Sheet open={webFiltersOpen} onOpenChange={setWebFiltersOpen}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWebFiltersOpen(true)}
                      className="h-9 px-3 text-xs"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                      Filters
                    </Button>
                    <SheetContent side="right" className="w-full sm:max-w-md">
                      <SheetHeader>
                        <SheetTitle className="font-display">Web search filters</SheetTitle>
                        <SheetDescription className="font-sans">Keep it simple; refine only when needed.</SheetDescription>
                      </SheetHeader>
                      <div className="mt-5 space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-sans text-muted-foreground">Country</label>
                          <Select value={webCountry} onValueChange={(v) => setWebCountry(v as any)}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="us">United States</SelectItem>
                              <SelectItem value="any">Any</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-sans cursor-pointer">
                          <Checkbox
                            checked={webIncludeLinkedIn}
                            onCheckedChange={(v) => setWebIncludeLinkedIn(Boolean(v))}
                          />
                          Include LinkedIn results in web search
                        </label>
                        <div className="flex justify-end gap-2 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setWebCountry('us');
                              setWebIncludeLinkedIn(false);
                            }}
                          >
                            Reset
                          </Button>
                          <Button onClick={() => setWebFiltersOpen(false)}>
                            Done
                          </Button>
                        </div>
                      </div>
                    </SheetContent>
                  </Sheet>
                  <Button
                    size="sm"
                    onClick={handleWebSearch}
                    disabled={!webSearchQuery.trim() || webSearchInitial.isPending}
                    className="h-9 px-4 text-xs"
                  >
                    {webSearchInitial.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <SearchIcon className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Search
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearWebSearchSession}
                    disabled={webSearchInitial.isPending || webSearchMore.isPending}
                    className="h-9 px-2 text-xs"
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Clear
                  </Button>
                </div>
                <div className="flex items-center text-xs text-muted-foreground px-1">
                  {webCountry === 'us' ? 'US' : 'Any'} · {webIncludeLinkedIn ? 'LinkedIn included' : 'LinkedIn excluded'}
                </div>
              </div>
            )}

            {/* Web + Google X-Ray (LinkedIn via Google CSE) */}
            {primaryMode === 'web' && searchMode === 'basic' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-nowrap">
                  <Label className="text-sm font-bold shrink-0">Job:</Label>
                  <Select
                    value={linkedInJobId}
                    onValueChange={handleQueryBuilderJobSelect}
                    disabled={jobsLoading}
                  >
                    <SelectTrigger className="h-9 text-sm flex-[2] min-w-0">
                      <SelectValue placeholder={jobsLoading ? "Loading..." : "Choose job to build query"} />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs && jobs.length > 0 ? (
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
                  {linkedInJobId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setQueryBuilderOpen(true)}
                      className="h-9 px-3 text-xs shrink-0"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={copyQueryToClipboard}
                    disabled={!generatedQuery}
                    className="h-9 px-3 text-xs shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleLinkedInSearch}
                    className="h-9 px-4 text-xs shrink-0"
                    disabled={!generatedQuery || linkedInSearchMutation.isPending}
                  >
                    {linkedInSearchMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <SearchIcon className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Search
                  </Button>
                </div>
                {generatedQuery && (
                  <div className="rounded bg-muted/50 p-2 text-[11px] font-mono break-words">
                    {generatedQuery}
                  </div>
                )}
              </div>
            )}

            {/* Web + Serp Search (LinkedIn via SerpAPI) */}
            {primaryMode === 'web' && searchMode === 'deep' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-nowrap">
                  <Label className="text-sm font-bold shrink-0">Job:</Label>
                  <Select
                    value={linkedInJobId}
                    onValueChange={handleQueryBuilderJobSelect}
                    disabled={jobsLoading}
                  >
                    <SelectTrigger className="h-9 text-sm flex-[2] min-w-0">
                      <SelectValue placeholder={jobsLoading ? "Loading..." : "Choose job to build query"} />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs && jobs.length > 0 ? (
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
                  {linkedInJobId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setQueryBuilderOpen(true)}
                      className="h-9 px-3 text-xs shrink-0"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={copyQueryToClipboard}
                    disabled={!generatedQuery}
                    className="h-9 px-3 text-xs shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleLinkedInSearch}
                    className="h-9 px-4 text-xs shrink-0"
                    disabled={!generatedQuery || linkedInSearchMutation.isPending}
                  >
                    {linkedInSearchMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <SearchIcon className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Search
                  </Button>
                </div>
                {generatedQuery && (
                  <div className="rounded bg-muted/50 p-2 text-[11px] font-mono break-words">
                    {generatedQuery}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* RESULTS - Gets 90%+ of vertical space */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 pt-3 pb-6">

            {/* Pool + Free Text Results */}
            {primaryMode === 'pool' && poolMode === 'freeText' && freeTextResults.length > 0 && (
              <UnifiedResultsDisplay
                results={adaptedFreeTextResults}
                config={{
                  viewMode: 'table',
                  enableSorting: true,
                  enableFiltering: true,
                  showThresholdSelector: true,
                  defaultThreshold: freeTextThreshold,
                  enableBulkActions: true,
                }}
                availableFilters={{
                  locations: availableLocations,
                  skills: availableSkills,
                }}
                onAddToShortlist={(ids) => {
                  // TODO: Implement add to shortlist
                  toast.success(`Added ${ids.length} candidate(s) to shortlist`);
                }}
                onExport={(ids) => {
                  // TODO: Implement export
                  toast.success(`Exporting ${ids.length} candidate(s)`);
                }}
                onRowClick={(id, result) => {
                  // Open talent detail drawer for internal candidates
                  if (result.type === 'internal' && result.internalData?.candidateId) {
                    openTalent(result.internalData.candidateId);
                  }
                }}
              />
            )}

            {/* Free Text empty state */}
            {primaryMode === 'pool' && poolMode === 'freeText' && freeTextResults.length === 0 && !freeTextSearchMutation.isPending && (
              <div className="bg-background rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center min-h-[600px]">
                <SearchIcon className="h-12 w-12 text-muted-foreground mb-4" strokeWidth={1.5} />
                <h3 className="text-lg font-semibold mb-2">Search your talent pool</h3>
                <p className="text-sm text-muted-foreground">
                  Describe a role, skills, or location above and hit Search. Results will appear here.
                </p>
              </div>
            )}

            {/* Pool + By Job Results - Split View */}
            {primaryMode === 'pool' && poolMode === 'byJob' && searchJobs && searchJobs.length > 0 && (
              <div className="grid gap-6 lg:grid-cols-[30%_70%]">
                {/* Left: Past Searches (30%) */}
                <div className="bg-background rounded-lg border border-border overflow-hidden">
                  <div className="border-b border-recruiter/10 bg-recruiter/5 px-6 py-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Clock className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
                      Past Searches
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {searchJobs.length} {searchJobs.length === 1 ? 'search' : 'searches'}
                    </p>
                  </div>
                  <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
                    {searchJobs.map((job: any) => {
                      const isSelected = selectedSearchJobId === job.id;
                      const statusColor =
                        job.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                        job.status === 'processing' ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20' :
                        job.status === 'cancelled' ? 'text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/20' :
                        job.status === 'failed' ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20' :
                        'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20';

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
                              <p className="font-semibold truncate">
                                {job.search_type === 'by_job' ? (job.jobs?.title || job.search_query) : job.search_query}
                              </p>
                              {job.search_type !== 'by_job' && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {job.search_type === 'free_text' ? 'Free Text Search' : 'Web Search'}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1 truncate">
                                {new Date(job.created_at).toLocaleString()}
                              </p>
                              {job.status === 'completed' && job.total_candidates_searched !== null && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {filteredCount} matches (≥{jobThreshold}%) · {job.total_candidates_searched} searched
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="secondary" className={cn("text-xs", statusColor)}>
                                {job.status}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('Delete this search? This cannot be undone.')) {
                                    deleteSearchMutation.mutate(job.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Selected Search Results (70%) */}
                <div className="bg-background rounded-lg border border-border overflow-hidden">
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

                    return (
                      <>
                        <div className="border-b border-recruiter/10 bg-recruiter/5 px-6 py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h2 className="text-lg font-bold">
                                {selectedJob.jobs?.title || 'Search Results'}
                              </h2>
                              <div className="flex items-center gap-3">
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  {selectedJob.status === 'pending' && 'Waiting to start...'}
                                  {selectedJob.status === 'processing' && `Processing... (${selectedJob.total_candidates_searched || 0} candidates)`}
                                  {selectedJob.status === 'completed' && `${filteredJobResults.length} matches (≥ ${currentThreshold}%)`}
                                  {selectedJob.status === 'cancelled' && `Stopped - ${filteredJobResults.length} matches found (≥ ${currentThreshold}%)`}
                                  {selectedJob.status === 'failed' && 'Search failed'}
                                </p>
                                {selectedJob.status === 'completed' && jobResults.length > 0 && (
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
                            <div className="flex items-center gap-3">
                              {selectedJob.status === 'processing' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (confirm('Stop this search? Results found so far will be saved.')) {
                                      cancelSearchMutation.mutate(selectedSearchJobId);
                                    }
                                  }}
                                  disabled={cancelSearchMutation.isPending}
                                  className="gap-2"
                                >
                                  <StopCircle className="h-4 w-4" />
                                  Stop Search
                                </Button>
                              )}
                              {(selectedJob.status === 'pending' || selectedJob.status === 'processing') && (
                                <Loader2 className="h-5 w-5 text-recruiter animate-spin" />
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="p-6 max-h-[600px] overflow-y-auto">
                          {selectedJob.status === 'pending' && (
                            <EmptyState
                              icon={Clock}
                              title="Search queued"
                              description="Your search is waiting to start. This may take some time - feel free to continue your work and we'll notify you when results are ready!"
                            />
                          )}

                          {selectedJob.status === 'processing' && adaptedByJobResults.length === 0 && (
                            <EmptyState
                              icon={Loader2}
                              title="Processing search"
                              description={`Analyzing candidates... (${selectedJob.total_candidates_searched || 0} processed)\n\nThis may take some time. Feel free to continue your work - we'll notify you when results are ready!`}
                            />
                          )}

                          {selectedJob.status === 'processing' && adaptedByJobResults.length > 0 && (
                            <>
                              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
                                <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                                <span className="text-sm text-blue-900 dark:text-blue-100">
                                  Still processing... {selectedJob.total_candidates_searched || 0} of 2098 candidates analyzed. Results below are partial and will update automatically.
                                </span>
                              </div>
                              <UnifiedResultsDisplay
                                results={adaptedByJobResults}
                                config={{
                                  viewMode: 'cards',
                                  enableSorting: false,
                                  enableFiltering: false,
                                  showThresholdSelector: true,
                                  defaultThreshold: getThreshold(selectedSearchJobId!),
                                  enableBulkActions: false,
                                }}
                                onRowClick={(id, result) => {
                                  // Open talent detail drawer for internal candidates
                                }}
                              />
                            </>
                          )}

                          {selectedJob.status === 'failed' && (
                            <EmptyState
                              icon={X}
                              title="Search failed"
                              description={selectedJob.error_message || 'An error occurred while processing this search.'}
                            />
                          )}

                          {selectedJob.status === 'completed' && adaptedByJobResults.length === 0 && (
                            <EmptyState
                              icon={Users}
                              title="No matches found"
                              description="No candidates matched this job. Try broadening your search criteria."
                            />
                          )}

                          {selectedJob.status === 'cancelled' && adaptedByJobResults.length > 0 && (
                            <>
                              <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-lg">
                                <span className="text-sm text-slate-900 dark:text-slate-100">
                                  Search was stopped. Showing {adaptedByJobResults.length} matches found before stopping (searched {selectedJob.total_candidates_searched || 0} of 2098 candidates).
                                </span>
                              </div>
                              <UnifiedResultsDisplay
                                results={adaptedByJobResults}
                                config={{
                                  viewMode: 'cards',
                                  enableSorting: false,
                                  enableFiltering: false,
                                  showThresholdSelector: true,
                                  defaultThreshold: getThreshold(selectedSearchJobId!),
                                  enableBulkActions: false,
                                }}
                                onRowClick={(id, result) => {
                                  // Open talent detail drawer for internal candidates
                                  if (result.type === 'internal' && result.internalData?.candidateId) {
                                    openTalent(result.internalData.candidateId);
                                  }
                                }}
                              />
                            </>
                          )}

                          {selectedJob.status === 'completed' && adaptedByJobResults.length > 0 && (
                            <UnifiedResultsDisplay
                              results={adaptedByJobResults}
                              config={{
                                viewMode: 'cards',
                                enableSorting: false,
                                enableFiltering: false,
                                showThresholdSelector: true,
                                defaultThreshold: getThreshold(selectedSearchJobId!),
                                enableBulkActions: false,
                              }}
                              onRowClick={(id, result) => {
                                // Open talent detail drawer for internal candidates
                                if (result.type === 'internal' && result.internalData?.candidateId) {
                                  openTalent(result.internalData.candidateId);
                                }
                              }}
                            />
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

            {/* By Job empty state */}
            {primaryMode === 'pool' && poolMode === 'byJob' && (!searchJobs || searchJobs.length === 0) && !byJobSearchMutation.isPending && (
              <div className="bg-background rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center min-h-[600px]">
                <SearchIcon className="h-12 w-12 text-muted-foreground mb-4" strokeWidth={1.5} />
                <h3 className="text-lg font-semibold mb-2">No searches yet</h3>
                <p className="text-sm text-muted-foreground">
                  Select a job above and click Search to start an AI-powered talent search. Your searches will appear here.
                </p>
              </div>
            )}

            {/* Web + Web Search Results */}
            {primaryMode === 'web' && searchMode === 'web' && webPages.length > 0 && (
              <div className="space-y-4">
                {/* Page buttons and Load more */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    {webPages.length > 0 && (
                      <div className="text-xs mr-1 font-medium">Pages</div>
                    )}
                    {webPages.map((p, idx) => (
                      <Button
                        key={p.id}
                        type="button"
                        size="sm"
                        variant={idx === activeWebPage ? 'default' : 'outline'}
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setActiveWebPage(idx);
                          setWebSearchResults(p.results || []);
                          const first = (p.results || [])[0];
                          setActiveResultKey(first ? rowKey('web', first, 0) : '');
                        }}
                      >
                        {idx + 1}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadMoreWeb}
                      disabled={webSearchMore.isPending || webSearchInitial.isPending}
                    >
                      {webSearchMore.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Load more
                    </Button>
                  </div>
                </div>

                {/* Results */}
                <UnifiedResultsDisplay
                  results={adaptedWebSearchResults}
                  config={{
                    viewMode: 'compact-cards',
                    enableSorting: false,
                    enableFiltering: false,
                    showThresholdSelector: false,
                    enableBulkActions: false,
                  }}
                  onRowClick={(id, result) => {
                    // Open external URL in new tab
                    const url = result.externalData?.linkedInUrl || result.externalData?.websiteUrl || result.externalData?.sourceUrl;
                    if (url) {
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                />
              </div>
            )}

            {/* Web Search empty state */}
            {primaryMode === 'web' && searchMode === 'web' && webPages.length === 0 && !webSearchInitial.isPending && (
              <div className="bg-background rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center min-h-[600px]">
                <Globe className="h-12 w-12 text-muted-foreground mb-4" strokeWidth={1.5} />
                <h3 className="text-lg font-semibold mb-2">Search the web</h3>
                <p className="text-sm text-muted-foreground">
                  Enter a search query above to find profiles across the web. Results will appear here.
                </p>
              </div>
            )}

            {/* Google X-Ray & Serp Search Results */}
            {primaryMode === 'web' && searchMode !== 'web' && leadResults.length > 0 && (
              <div className="space-y-4">
                {/* Pagination Controls */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="text-xs font-medium">
                    {isLinkedInMode && (
                      <>
                        Showing{' '}
                        <span className="text-foreground">
                          {googleFilteredCount === 0 ? 0 : (googlePageStartIndex + 1)}
                          {googleFilteredCount === 0 ? '' : `–${Math.min(googleFilteredCount, googlePageEndIndex)}`}
                        </span>
                        {' '}of{' '}
                        <span className="text-foreground">{googleFilteredCount}</span> leads
                      </>
                    )}
                  </div>
                  {isLinkedInMode && (googlePagingEnabled || googleHasMore) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {googlePagingEnabled && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setLeadPage((p) => Math.max(1, p - 1))}
                            disabled={safeLeadPage <= 1}
                          >
                            Prev
                          </Button>
                          <span className="text-xs px-1.5">
                            Page <span className="text-foreground font-medium">{safeLeadPage}</span> of {googlePageCount}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setLeadPage((p) => Math.min(googlePageCount, p + 1))}
                            disabled={safeLeadPage >= googlePageCount}
                          >
                            Next
                          </Button>
                        </>
                      )}
                      {googleHasMore && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={handleLoadMoreLinkedIn}
                          disabled={linkedInSearchMutation.isPending}
                        >
                          {linkedInSearchMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          {effectiveLinkedInProvider === 'serpapi' ? 'Load next page' : 'Load more'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Results */}
                <UnifiedResultsDisplay
                  results={paginatedLeadResults.map(result => adaptExternalResult(result))}
                  config={{
                    viewMode: 'compact-cards',
                    enableSorting: false,
                    enableFiltering: false,
                    showThresholdSelector: false,
                    enableBulkActions: false,
                  }}
                  onRowClick={(id, result) => {
                    // Open external URL in new tab
                    const url = result.externalData?.linkedInUrl || result.externalData?.websiteUrl || result.externalData?.sourceUrl;
                    if (url) {
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }
                  }}
                />
              </div>
            )}

            {/* Empty state for X-Ray/Serp */}
            {primaryMode === 'web' && searchMode !== 'web' && leadResults.length === 0 && !linkedInSearchMutation.isPending && (
              <div className="bg-background rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center min-h-[600px]">
                <Globe className="h-12 w-12 text-muted-foreground mb-4" strokeWidth={1.5} />
                <h3 className="text-lg font-semibold mb-2">LinkedIn X-ray Search</h3>
                <p className="text-sm text-muted-foreground">
                  Select a job, generate a query, and click Search to find LinkedIn profiles.
                </p>
              </div>
            )}

          </div>
        </div>

      {/* Query Builder Dialog */}
      <Dialog open={queryBuilderOpen} onOpenChange={setQueryBuilderOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">AI Query Builder</DialogTitle>
            <DialogDescription>
              {linkedInJobId && jobs?.find(j => j.id === linkedInJobId)?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Loading State */}
            {isParsingJD && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-recruiter mb-4" />
                <p className="text-sm text-muted-foreground">Analyzing job description...</p>
              </div>
            )}

            {/* Parsed Skills Display */}
            {!isParsingJD && parsedJD && (
              <>
                {/* Job Info */}
                <div className="grid gap-4 md:grid-cols-2">
                  {parsedJD.title && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">Job Title</Label>
                      <div className="text-sm font-medium">{parsedJD.title}</div>
                    </div>
                  )}
                  {parsedJD.experience_level && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">Experience Level</Label>
                      <div className="text-sm font-medium">{parsedJD.experience_level}</div>
                    </div>
                  )}
                  {parsedJD.location?.site && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">Location</Label>
                      <div className="text-sm font-medium flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {parsedJD.location.site}
                      </div>
                    </div>
                  )}
                  {parsedJD.job_type && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-muted-foreground">Work Mode</Label>
                      <div className="text-sm font-medium">{parsedJD.job_type}</div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Must-Have Skills (Core) */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    Must-Have Skills (Core)
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {selectedSkills.core.map((skill) => (
                      <Badge
                        key={skill}
                        variant="default"
                        className="h-8 px-3 text-sm bg-recruiter hover:bg-recruiter/90 flex items-center gap-1.5"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => {
                            console.log('[Query Builder] Removing skill:', skill);
                            setSelectedSkills(prev => {
                              const updated = {
                                ...prev,
                                core: prev.core.filter(s => s !== skill)
                              };
                              console.log('[Query Builder] Updated skills after remove:', updated);
                              return updated;
                            });
                          }}
                          className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add must-have skill..."
                      value={customSkillInput}
                      onChange={(e) => setCustomSkillInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customSkillInput.trim()) {
                          const skill = customSkillInput.trim();
                          console.log('[Query Builder] Adding custom skill (Enter):', skill);
                          if (!selectedSkills.core.includes(skill)) {
                            setSelectedSkills(prev => {
                              const updated = {
                                ...prev,
                                core: [...prev.core, skill]
                              };
                              console.log('[Query Builder] Updated skills after custom add:', updated);
                              return updated;
                            });
                          }
                          setCustomSkillInput('');
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (customSkillInput.trim()) {
                          const skill = customSkillInput.trim();
                          console.log('[Query Builder] Adding custom skill (Button):', skill);
                          if (!selectedSkills.core.includes(skill)) {
                            setSelectedSkills(prev => {
                              const updated = {
                                ...prev,
                                core: [...prev.core, skill]
                              };
                              console.log('[Query Builder] Updated skills after custom add:', updated);
                              return updated;
                            });
                          }
                          setCustomSkillInput('');
                        }
                      }}
                      disabled={!customSkillInput.trim()}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                  {parsedJD.skills.core.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Suggested from JD:</span>{' '}
                      {parsedJD.skills.core.filter((s: string) => !selectedSkills.core.includes(s)).map((skill: string, idx: number, arr: string[]) => (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => {
                            console.log('[Query Builder] Adding skill from suggestions:', skill);
                            setSelectedSkills(prev => {
                              const updated = {
                                ...prev,
                                core: [...prev.core, skill]
                              };
                              console.log('[Query Builder] Updated skills after add:', updated);
                              return updated;
                            });
                          }}
                          className="text-recruiter hover:underline"
                        >
                          {skill}{idx < arr.length - 1 ? ', ' : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Generated Query */}
                {generatedQuery && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Generated LinkedIn X-ray Query</Label>
                    <div className="rounded bg-muted p-3 text-sm font-mono break-words">
                      {generatedQuery}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQueryBuilderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={buildQueryFromSelections}
              disabled={!parsedJD || isBuildingQuery}
            >
              {isBuildingQuery ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Query
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Talent Detail Sheet */}
      <TalentDetailSheet
        talentId={selectedTalentId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

    </DashboardLayout>
  );
}
