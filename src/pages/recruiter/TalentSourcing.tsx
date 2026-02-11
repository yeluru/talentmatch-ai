import { useState, useCallback, useEffect, useRef, type SetStateAction } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { orgIdForRecruiterSuite } from '@/lib/org';
import { getEdgeFunctionErrorMessage } from '@/lib/edgeFunctionError';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBulkUploadStore, type UploadResult } from '@/stores/bulkUploadStore';
import { useSearchParams, useLocation, useNavigate, Navigate, Link } from 'react-router-dom';
import {
  Upload,
  Search,
  Globe,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  Linkedin,
  Sparkles,
  Plus,
  MapPin,
  Briefcase,
  ChevronDown,
  SlidersHorizontal,
  X,
  Users,
  Download,
  Save,
  Star,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SearchedProfile {
  full_name: string;
  headline?: string;
  current_company?: string;
  location?: string;
  skills?: string[];
  experience_years?: number;
  summary?: string;
  linkedin_url?: string;
  github_url?: string;
  website?: string;
  source_url?: string;
  source_title?: string;
  source_excerpt?: string;
  email?: string;
  source: string;
}

type GoogleLeadResult = {
  linkedin_url: string;
  source_url?: string;
  title?: string;
  snippet?: string;
  match_score?: number;
  matched_terms?: string[];
  open_to_work_signal?: boolean;
  raw_result?: any;
};

type PostedJobLite = {
  id: string;
  title: string;
  description: string;
  location: string | null;
  status: string | null;
  created_at: string;
};

export default function TalentSourcing() {
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const organizationId = orgIdForRecruiterSuite(roles);

  // Determine active section from route pathname
  const pathname = location.pathname;
  // Legacy route: redirect to Talent Management landing
  if (pathname === '/recruiter/talent-sourcing') {
    return <Navigate to="/recruiter/talent-management" replace />;
  }
  const currentSection = pathname.includes('/uploads')
    ? 'uploads'
    : pathname.includes('/search')
      ? 'search'
      : pathname.includes('/api')
        ? 'api'
        : 'uploads'; // default

  // Keep activeTab for backward compatibility with localStorage/URL params, but sync with route
  const [activeTab, setActiveTab] = useState<'resumes' | 'search' | 'api'>(
    currentSection === 'uploads' ? 'resumes' : currentSection === 'search' ? 'search' : 'api'
  );

  // Sync activeTab with route when route changes
  useEffect(() => {
    if (currentSection === 'uploads' && activeTab !== 'resumes') setActiveTab('resumes');
    else if (currentSection === 'search' && activeTab !== 'search') setActiveTab('search');
    else if (currentSection === 'api' && activeTab !== 'api') setActiveTab('api');
  }, [currentSection, activeTab]);
  // NOTE: LinkedIn capture / extension flow was removed (too much friction).

  // Web search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedProfile[]>([]);
  // Search sub-tabs under the top-level Search tab.
  const [searchMode, setSearchMode] = useState<'web' | 'basic' | 'deep'>('web');

  // Keep LinkedIn results separately for Basic vs Deep tabs so switching tabs retains prior results.
  const [leadResultsBasic, setLeadResultsBasic] = useState<GoogleLeadResult[]>([]);
  const [leadResultsDeep, setLeadResultsDeep] = useState<GoogleLeadResult[]>([]);
  const leadCountRef = useRef<number>(0);
  useEffect(() => {
    leadCountRef.current = (searchMode === 'deep' ? leadResultsDeep : leadResultsBasic).length;
  }, [searchMode, leadResultsBasic.length, leadResultsDeep.length]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [linkedinSearchProvider, setLinkedinSearchProvider] = useState<'google_cse' | 'serpapi'>('google_cse');
  const [activeResultKey, setActiveResultKey] = useState<string>('');
  const [webStrategyIndex, setWebStrategyIndex] = useState<number>(0);
  const [webCountry, setWebCountry] = useState<'us' | 'any'>('us');
  const [webIncludeLinkedIn, setWebIncludeLinkedIn] = useState<boolean>(false);
  const [webFiltersOpen, setWebFiltersOpen] = useState<boolean>(false);
  const [webExamplesOpen, setWebExamplesOpen] = useState<boolean>(false);
  const [googleNextStartBasic, setGoogleNextStartBasic] = useState<number>(1);
  const [googleTotalFoundBasic, setGoogleTotalFoundBasic] = useState<number>(0);
  const [googleNextStartDeep, setGoogleNextStartDeep] = useState<number>(1);
  const [googleTotalFoundDeep, setGoogleTotalFoundDeep] = useState<number>(0);
  const [leadMinScore, setLeadMinScore] = useState<number>(Number.NEGATIVE_INFINITY);
  const [leadKeywordFilters, setLeadKeywordFilters] = useState<string>(''); // comma-separated keywords (skills, etc.)
  const [leadKeywordMatch, setLeadKeywordMatch] = useState<'any' | 'all'>('any');
  const [leadPage, setLeadPage] = useState<number>(1);
  const [leadPageSize, setLeadPageSize] = useState<number>(20);
  const [googleUseRawXray, setGoogleUseRawXray] = useState<boolean>(false);
  const [googleRawXray, setGoogleRawXray] = useState<string>('');
  const [googleTitles, setGoogleTitles] = useState<string>(''); // comma-separated
  const [googlePrompt, setGooglePrompt] = useState<string>(''); // freeform
  const [googleMustHaveSkills, setGoogleMustHaveSkills] = useState<string>(''); // comma-separated (AND)
  const [googleSkills, setGoogleSkills] = useState<string>(''); // nice-to-have comma-separated (OR by default)
  const [googleLocation, setGoogleLocation] = useState<string>(''); // free-form
  const [googleIndustries, setGoogleIndustries] = useState<string>(''); // comma-separated
  const [googleStrictness, setGoogleStrictness] = useState<'broad' | 'balanced' | 'strict'>('balanced');
  const [googleTitlesMatch, setGoogleTitlesMatch] = useState<'any' | 'all'>('any');
  const [googleSkillsMatch, setGoogleSkillsMatch] = useState<'any' | 'all'>('any');
  const [googleSeniority, setGoogleSeniority] = useState<'any' | 'junior' | 'mid' | 'senior' | 'staff'>('senior');
  const [googleUSOnly, setGoogleUSOnly] = useState<boolean>(true);
  const [googleExclude, setGoogleExclude] = useState<string>('recruiter, staffing, talent, sales, job, jobs, hiring, career');
  const [googleBoostOpenToWork, setGoogleBoostOpenToWork] = useState<boolean>(false);
  const [googleIsLoadingAll, setGoogleIsLoadingAll] = useState<boolean>(false);
  const [googleLastRunMode, setGoogleLastRunMode] = useState<'single' | 'exhaustive'>('single');
  const [googleExhaustiveEnabled, setGoogleExhaustiveEnabled] = useState<boolean>(false);
  const [googleExhaustiveTarget, setGoogleExhaustiveTarget] = useState<number>(500);
  const [googleExhaustiveMaxQueries, setGoogleExhaustiveMaxQueries] = useState<number>(20);
  const [googleExhaustiveStrategy, setGoogleExhaustiveStrategy] = useState<'auto' | 'location' | 'title' | 'industry' | 'skill'>('auto');
  const [googleExhaustiveBuckets, setGoogleExhaustiveBuckets] = useState<string[]>([]);
  const [googleExhaustiveBucketKind, setGoogleExhaustiveBucketKind] = useState<'location' | 'title' | 'industry' | 'skill' | null>(null);
  const [googleExhaustiveState, setGoogleExhaustiveState] = useState<{
    running: boolean;
    total: number;
    done: number;
    label: string;
  }>({ running: false, total: 0, done: 0, label: '' });
  const [jdSource, setJdSource] = useState<'paste' | 'job'>('paste');
  const [jdText, setJdText] = useState<string>('');
  const [jdJobId, setJdJobId] = useState<string>('');
  const [googleFiltersOpen, setGoogleFiltersOpen] = useState<boolean>(false);
  const [googleFiltersSection, setGoogleFiltersSection] = useState<'general' | 'skills' | 'jd' | 'advanced'>('general');
  const [postedJobs, setPostedJobs] = useState<PostedJobLite[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(false);
  const [jobsLoadAttempted, setJobsLoadAttempted] = useState<boolean>(false);
  const [jobsLoadError, setJobsLoadError] = useState<string | null>(null);
  const [jdOptions, setJdOptions] = useState<{
    must: string[];
    nice: string[];
    locations: string[];
  } | null>(null);
  const [jdSelected, setJdSelected] = useState<{
    must: string[];
    nice: string[];
    locations: string[];
  }>({ must: [], nice: [], locations: [] });
  const [lastSearchBasic, setLastSearchBasic] = useState<{
    mode: 'web' | 'linkedin' | 'google';
    query: string;
    found: number;
    totalFound?: number;
    debug?: any;
    error?: string;
    ts: number;
  } | null>(null);
  const [lastSearchDeep, setLastSearchDeep] = useState<{
    mode: 'web' | 'linkedin' | 'google';
    query: string;
    found: number;
    totalFound?: number;
    debug?: any;
    error?: string;
    ts: number;
  } | null>(null);

  // Web mode pagination (each "Load more" becomes a new page you can tab back to)
  const [webPages, setWebPages] = useState<Array<{ id: string; results: SearchedProfile[]; ts: number }>>([]);
  const [activeWebPage, setActiveWebPage] = useState<number>(0);

  // New UX enhancements state
  type SortColumn = 'name' | 'title' | 'score' | 'default';
  type SortDirection = 'asc' | 'desc';
  const [sortColumn, setSortColumn] = useState<SortColumn>('default');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveSearchDialogOpen, setSaveSearchDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [savedSearchMenuOpen, setSavedSearchMenuOpen] = useState(false);

  const searchStorageKey = organizationId ? `talent_sourcing_search_v1:${organizationId}` : null;
  // Skip the next persist run after we restore from localStorage so we don't overwrite with stale initial state.
  const skipNextPersistRef = useRef(false);
  // Allow URL sync only after we've applied URL/restore so we don't overwrite URL with initial state and cause tab flicker.
  const syncUrlAllowedRef = useRef(false);
  // Always hold latest tab/mode so we can persist on unmount (user leaves page) and not lose Deep Search.
  const latestTabModeRef = useRef({ activeTab, searchMode });
  latestTabModeRef.current = { activeTab, searchMode };

  // Allow deep-linking into a specific tab/mode (used by Dashboard stat cards)
  useEffect(() => {
    const tab = String(searchParams.get('tab') || '').trim().toLowerCase();
    // Back-compat:
    // - tab=serp => Search + Deep
    // - tab=basic/tab=deep => Search + that subtab
    if (tab === 'resumes' || tab === 'search' || tab === 'api') setActiveTab(tab as any);
    else if (tab === 'serp') {
      setActiveTab('search');
      setSearchMode('deep');
    } else if (tab === 'basic' || tab === 'deep') {
      setActiveTab('search');
      setSearchMode(tab as any);
    }

    const mode = String(searchParams.get('mode') || '').trim().toLowerCase();
    // mode deep-links land in Search.
    if (mode === 'web' || mode === 'basic' || mode === 'deep' || mode === 'google') {
      setActiveTab('search');
      setSearchMode(mode === 'google' ? 'basic' : (mode as any));
    }
  }, [searchParams]);

  // Keep URL in sync with current section (route-based, not query params)
  // Skip until after URL/restore have run so we don't overwrite with initial state and cause tab flicker.
  useEffect(() => {
    if (!syncUrlAllowedRef.current) return;

    const expectedPath = `/recruiter/talent-search/${currentSection}`;
    if (pathname !== expectedPath && !pathname.includes('/talent-sourcing')) {
      navigate(expectedPath, { replace: true });
    }
  }, [currentSection, pathname, navigate]);

  const rowKey = useCallback((mode: 'web' | 'linkedin' | 'google' | 'basic' | 'deep', row: any, fallbackIndex: number) => {
    if (mode === 'google' || mode === 'basic' || mode === 'deep') return String(row?.linkedin_url || `lead#${fallbackIndex}`);
    return String(row?.linkedin_url || row?.website || row?.source_url || `${row?.full_name || 'profile'}#${fallbackIndex}`);
  }, []);

  const buildGoogleXray = useCallback(() => {
    const wrap = (term: string, mode: 'broad' | 'balanced' | 'strict'): string => {
      const t = String(term || '').trim().replace(/"/g, '');
      if (!t) return '';
      const hasSpace = /\s/.test(t);
      if (mode === 'strict') return `"${t}"`;
      if (mode === 'balanced') return hasSpace ? `"${t}"` : t;
      // broad
      return hasSpace ? `"${t}"` : t;
    };

    const parts: string[] = ['site:linkedin.com/in'];

    const prompt = String(googlePrompt || '').trim();
    if (prompt) {
      // Keep prompt lightweight: treat as a phrase-ish anchor (still allows the structured filters to do the heavy lifting).
      // Avoid wrapping the whole prompt in quotes if user already used boolean operators.
      const hasOps = /\b(OR|AND)\b/i.test(prompt) || prompt.includes('(') || prompt.includes(')');
      parts.push(hasOps ? `(${prompt})` : `"${prompt.replace(/"/g, '')}"`);
    }

    const titles = googleTitles
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (titles.length === 1) parts.push(wrap(titles[0], googleStrictness));
    else if (titles.length > 1) {
      if (googleTitlesMatch === 'all') parts.push(`(${titles.map(t => wrap(t, googleStrictness)).join(' ')})`); // spaces = AND
      else parts.push(`(${titles.map(t => wrap(t, googleStrictness)).join(' OR ')})`);
    }

    const mustHave = googleMustHaveSkills
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    // Must-have skills are ALWAYS AND (space-separated).
    for (const s of mustHave) {
      if (!s) continue;
      parts.push(wrap(s, googleStrictness));
    }

    const skills = googleSkills
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    // Nice-to-have defaults to OR; user can switch to AND via skillsMatch (power users).
    if (skills.length === 1) parts.push(wrap(skills[0], googleStrictness));
    else if (skills.length > 1) {
      if (googleSkillsMatch === 'all') parts.push(`(${skills.map(s => wrap(s, googleStrictness)).join(' ')})`); // spaces = AND
      else parts.push(`(${skills.map(s => wrap(s, googleStrictness)).join(' OR ')})`);
    }

    const loc = String(googleLocation || '').trim();
    if (loc) {
      // If user already typed OR, keep it as-is but wrap to preserve grouping.
      const safe = loc.includes(' OR ') || loc.includes(' or ') ? `(${loc})` : wrap(loc, googleStrictness);
      parts.push(safe);
    }

    const industries = googleIndustries
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (industries.length === 1) parts.push(wrap(industries[0], googleStrictness));
    else if (industries.length > 1) parts.push(`(${industries.map(s => wrap(s, googleStrictness)).join(' OR ')})`);

    if (googleUSOnly) {
      // Avoid bare "US" which can match the common word "us" and leak non‑US results.
      parts.push(`("United States" OR "United States of America" OR USA OR "U.S.")`);
    }

    if (googleSeniority === 'junior') {
      parts.push(`("1 year" OR "2 years" OR junior OR "entry level")`);
    } else if (googleSeniority === 'mid') {
      parts.push(`("3 years" OR "4 years" OR mid OR "software engineer")`);
    } else if (googleSeniority === 'senior') {
      parts.push(`("5 years" OR "5+ years" OR "6 years" OR senior OR lead OR staff OR principal)`);
    } else if (googleSeniority === 'staff') {
      parts.push(`(staff OR principal OR "senior staff" OR "tech lead")`);
    }

    const excludes = googleExclude
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    for (const ex of excludes) {
      if (ex.includes(' ')) parts.push(`-"${ex}"`);
      else parts.push(`-${ex}`);
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }, [
    googlePrompt,
    googleMustHaveSkills,
    googleTitles,
    googleSkills,
    googleLocation,
    googleIndustries,
    googleStrictness,
    googleSeniority,
    googleUSOnly,
    googleExclude,
    googleTitlesMatch,
    googleSkillsMatch
  ]);

  const syncBuilderFromJdSelected = useCallback((sel: {
    must: string[];
    nice: string[];
    locations: string[];
  }) => {
    // Titles remain free-text (user-editable) — we only sync skills/locations from the checkbox list.
    setGoogleMustHaveSkills(sel.must.join(', '));
    setGoogleSkills(sel.nice.join(', '));
    setGoogleLocation(sel.locations.length ? sel.locations.map((l) => `"${String(l).replace(/"/g, '')}"`).join(' OR ') : '');
  }, []);

  useEffect(() => {
    if (!jdOptions) return;
    // Keep builder fields in sync with checkbox selections.
    syncBuilderFromJdSelected(jdSelected);
  }, [jdSelected, jdOptions, syncBuilderFromJdSelected]);

  const stripLeadForStorage = useCallback((l: GoogleLeadResult): GoogleLeadResult => {
    // Keep localStorage payload small; `raw_result` can be huge.
    return {
      linkedin_url: l.linkedin_url,
      source_url: l.source_url,
      title: l.title,
      snippet: l.snippet,
      match_score: l.match_score,
      matched_terms: l.matched_terms,
      open_to_work_signal: l.open_to_work_signal,
      raw_result: undefined,
    };
  }, []);

  // Restore search state when returning to this page
  // (So recruiters don't lose results when navigating away.)
  useEffect(() => {
    if (!searchStorageKey) {
      syncUrlAllowedRef.current = true;
      return;
    }
    try {
      // If the URL specifies a tab/mode, it should override any persisted state.
      const urlTab = String(searchParams.get('tab') || '').trim().toLowerCase();
      const urlMode = String(searchParams.get('mode') || '').trim().toLowerCase();
      const mappedUrlTab =
        urlTab === 'basic' || urlTab === 'deep' || urlTab === 'serp'
          ? 'search'
          : urlTab;
      const hasDeepLink =
        mappedUrlTab === 'resumes' || mappedUrlTab === 'search' || mappedUrlTab === 'api' || urlMode === 'web' || urlMode === 'basic' || urlMode === 'deep' || urlMode === 'google';

      const raw = localStorage.getItem(searchStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!hasDeepLink) {
        const persistedTabRaw = String(parsed?.activeTab || '').trim().toLowerCase();
        if (persistedTabRaw === 'resumes' || persistedTabRaw === 'search' || persistedTabRaw === 'api') {
          setActiveTab(persistedTabRaw as any);
        } else if (persistedTabRaw === 'basic' || persistedTabRaw === 'deep' || persistedTabRaw === 'serp') {
          setActiveTab('search');
        }
      }
      if (parsed?.query && typeof parsed.query === 'string') setSearchQuery(parsed.query);
      // Restore search sub-tab (Web / Basic / Deep) from persisted state whenever the URL does not
      // explicitly specify a mode, so returning to the page keeps e.g. Deep Search selected.
      if (!urlMode) {
        const persistedMode = String(parsed?.mode || '').trim().toLowerCase();
        if (persistedMode === 'web') setSearchMode('web');
        else if (persistedMode === 'basic' || persistedMode === 'google') setSearchMode('basic');
        else if (persistedMode === 'deep' || persistedMode === 'serp') setSearchMode('deep');
        else if (persistedMode === 'linkedin') setSearchMode('basic');
      }
      // Back-compat: older payload stored a single leadResults array (treat as Basic Search).
      if (Array.isArray(parsed?.leadResults)) setLeadResultsBasic(parsed.leadResults);
      if (Array.isArray(parsed?.leadResultsBasic)) setLeadResultsBasic(parsed.leadResultsBasic);
      if (Array.isArray(parsed?.leadResultsDeep)) setLeadResultsDeep(parsed.leadResultsDeep);
      if (Array.isArray(parsed?.webPages)) {
        const pages = parsed.webPages;
        const idx = Number.isInteger(parsed?.activeWebPage) ? Math.max(0, parsed.activeWebPage) : 0;
        setWebPages(pages);
        setActiveWebPage(idx);
        const page = pages?.[idx];
        if (page?.results) setSearchResults(page.results);
      } else if (Array.isArray(parsed?.searchResults)) {
        setSearchResults(parsed.searchResults);
      }
      // Back-compat: older payload stored a single lastSearch object (treat as Basic Search).
      if (parsed?.lastSearch && typeof parsed.lastSearch === 'object') setLastSearchBasic(parsed.lastSearch);
      if (parsed?.lastSearchBasic && typeof parsed.lastSearchBasic === 'object') setLastSearchBasic(parsed.lastSearchBasic);
      if (parsed?.lastSearchDeep && typeof parsed.lastSearchDeep === 'object') setLastSearchDeep(parsed.lastSearchDeep);
      if (Array.isArray(parsed?.selectedKeys)) setSelectedKeys(new Set(parsed.selectedKeys.map((k: any) => String(k))));
      if (typeof parsed?.activeKey === 'string') setActiveResultKey(parsed.activeKey);
      // Back-compat: older payload stored a single meta set (treat as Basic Search).
      if (Number.isInteger(parsed?.googleNextStart)) setGoogleNextStartBasic(Math.max(0, parsed.googleNextStart));
      if (Number.isInteger(parsed?.googleTotalFound)) setGoogleTotalFoundBasic(Math.max(0, parsed.googleTotalFound));
      if (Number.isInteger(parsed?.googleNextStartBasic)) setGoogleNextStartBasic(Math.max(0, parsed.googleNextStartBasic));
      if (Number.isInteger(parsed?.googleTotalFoundBasic)) setGoogleTotalFoundBasic(Math.max(0, parsed.googleTotalFoundBasic));
      if (Number.isInteger(parsed?.googleNextStartDeep)) setGoogleNextStartDeep(Math.max(0, parsed.googleNextStartDeep));
      if (Number.isInteger(parsed?.googleTotalFoundDeep)) setGoogleTotalFoundDeep(Math.max(0, parsed.googleTotalFoundDeep));
      if (Number.isInteger(parsed?.webStrategyIndex)) setWebStrategyIndex(Math.max(0, parsed.webStrategyIndex));
      if (parsed?.webCountry === 'us' || parsed?.webCountry === 'any') setWebCountry(parsed.webCountry);
      if (typeof parsed?.webIncludeLinkedIn === 'boolean') setWebIncludeLinkedIn(parsed.webIncludeLinkedIn);
      if (parsed?.linkedinSearchProvider === 'google_cse' || parsed?.linkedinSearchProvider === 'serpapi') {
        setLinkedinSearchProvider(parsed.linkedinSearchProvider);
      }
      if (typeof parsed?.leadMinScore === 'number') setLeadMinScore(parsed.leadMinScore);
      if (typeof parsed?.leadKeywordFilters === 'string') setLeadKeywordFilters(parsed.leadKeywordFilters);
      if (parsed?.leadKeywordMatch === 'any' || parsed?.leadKeywordMatch === 'all') setLeadKeywordMatch(parsed.leadKeywordMatch);
      if (typeof parsed?.leadPage === 'number') setLeadPage(Math.max(1, Math.trunc(parsed.leadPage)));
      if (typeof parsed?.leadPageSize === 'number') setLeadPageSize(Math.max(10, Math.min(100, Math.trunc(parsed.leadPageSize))));
      if (typeof parsed?.googleUseRawXray === 'boolean') setGoogleUseRawXray(parsed.googleUseRawXray);
      if (typeof parsed?.googleRawXray === 'string') setGoogleRawXray(parsed.googleRawXray);
      if (typeof parsed?.googlePrompt === 'string') setGooglePrompt(parsed.googlePrompt);
      if (typeof parsed?.googleMustHaveSkills === 'string') setGoogleMustHaveSkills(parsed.googleMustHaveSkills);
      if (parsed?.jdSource === 'paste' || parsed?.jdSource === 'job') setJdSource(parsed.jdSource);
      if (typeof parsed?.jdText === 'string') setJdText(parsed.jdText);
      if (typeof parsed?.jdJobId === 'string') setJdJobId(parsed.jdJobId);
      if (parsed?.jdOptions && typeof parsed.jdOptions === 'object') {
        const o = parsed.jdOptions as any;
        const must = Array.isArray(o?.must) ? o.must.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 12) : [];
        const nice = Array.isArray(o?.nice) ? o.nice.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
        const locations = Array.isArray(o?.locations) ? o.locations.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 6) : [];
        if (must.length || nice.length || locations.length) setJdOptions({ must, nice, locations });
      }
      if (parsed?.jdSelected && typeof parsed.jdSelected === 'object') {
        const s = parsed.jdSelected as any;
        const must = Array.isArray(s?.must) ? s.must.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 12) : [];
        const nice = Array.isArray(s?.nice) ? s.nice.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
        const locations = Array.isArray(s?.locations) ? s.locations.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 6) : [];
        setJdSelected({ must, nice, locations });
      }
      if (typeof parsed?.googleTitles === 'string') setGoogleTitles(parsed.googleTitles);
      if (typeof parsed?.googleSkills === 'string') setGoogleSkills(parsed.googleSkills);
      if (typeof parsed?.googleLocation === 'string') setGoogleLocation(parsed.googleLocation);
      if (typeof parsed?.googleIndustries === 'string') setGoogleIndustries(parsed.googleIndustries);
      if (parsed?.googleStrictness === 'broad' || parsed?.googleStrictness === 'balanced' || parsed?.googleStrictness === 'strict') {
        setGoogleStrictness(parsed.googleStrictness);
      }
      if (parsed?.googleTitlesMatch === 'any' || parsed?.googleTitlesMatch === 'all') setGoogleTitlesMatch(parsed.googleTitlesMatch);
      if (parsed?.googleSkillsMatch === 'any' || parsed?.googleSkillsMatch === 'all') setGoogleSkillsMatch(parsed.googleSkillsMatch);
      if (parsed?.googleSeniority === 'any' || parsed?.googleSeniority === 'junior' || parsed?.googleSeniority === 'mid' || parsed?.googleSeniority === 'senior' || parsed?.googleSeniority === 'staff') {
        setGoogleSeniority(parsed.googleSeniority);
      }
      if (typeof parsed?.googleUSOnly === 'boolean') setGoogleUSOnly(parsed.googleUSOnly);
      if (typeof parsed?.googleExclude === 'string') setGoogleExclude(parsed.googleExclude);
      if (typeof parsed?.googleBoostOpenToWork === 'boolean') setGoogleBoostOpenToWork(parsed.googleBoostOpenToWork);
      if (parsed?.googleLastRunMode === 'single' || parsed?.googleLastRunMode === 'exhaustive') setGoogleLastRunMode(parsed.googleLastRunMode);
      if (typeof parsed?.googleExhaustiveEnabled === 'boolean') setGoogleExhaustiveEnabled(parsed.googleExhaustiveEnabled);
      if (typeof parsed?.googleExhaustiveTarget === 'number') setGoogleExhaustiveTarget(Math.max(50, Math.min(5000, Math.trunc(parsed.googleExhaustiveTarget))));
      if (typeof parsed?.googleExhaustiveMaxQueries === 'number') setGoogleExhaustiveMaxQueries(Math.max(1, Math.min(100, Math.trunc(parsed.googleExhaustiveMaxQueries))));
      if (parsed?.googleExhaustiveStrategy === 'auto' || parsed?.googleExhaustiveStrategy === 'location' || parsed?.googleExhaustiveStrategy === 'title' || parsed?.googleExhaustiveStrategy === 'industry' || parsed?.googleExhaustiveStrategy === 'skill') {
        setGoogleExhaustiveStrategy(parsed.googleExhaustiveStrategy);
      }

      // Apply deep link last (wins over persisted state)
      if (mappedUrlTab === 'resumes' || mappedUrlTab === 'search' || mappedUrlTab === 'api') setActiveTab(mappedUrlTab as any);
      if (urlTab === 'serp') {
        setActiveTab('search');
        setSearchMode('deep');
      } else if (urlTab === 'basic' || urlTab === 'deep') {
        setActiveTab('search');
        setSearchMode(urlTab as any);
      }
      if (urlMode === 'web' || urlMode === 'basic' || urlMode === 'deep' || urlMode === 'google') {
        setActiveTab('search');
        setSearchMode(urlMode === 'google' ? 'basic' : (urlMode as any));
      }
      // So the next persist run does not overwrite restored state with initial state.
      skipNextPersistRef.current = true;
    } catch {
      // ignore
    } finally {
      // Allow URL sync now so we don't overwrite URL with initial state and cause tab flicker.
      syncUrlAllowedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchStorageKey]);

  // On unmount, persist current tab/mode from ref so we don't lose Deep Search when navigating away.
  useEffect(() => {
    const key = searchStorageKey;
    return () => {
      if (!key) return;
      const { activeTab: at, searchMode: sm } = latestTabModeRef.current;
      try {
        const raw = localStorage.getItem(key);
        const payload = raw ? JSON.parse(raw) : ({} as Record<string, unknown>);
        payload.activeTab = at;
        payload.mode = sm;
        payload.ts = Date.now();
        localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        // ignore
      }
    };
  }, [searchStorageKey]);

  // Persist search state
  useEffect(() => {
    if (!searchStorageKey) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    try {
      const safeSearchResults = searchResults.slice(0, 50);
      const safeLeadResultsBasic = leadResultsBasic.slice(0, 250).map(stripLeadForStorage);
      const safeLeadResultsDeep = leadResultsDeep.slice(0, 250).map(stripLeadForStorage);
      const payload = {
        activeTab,
        mode: searchMode,
        query: searchQuery,
        // Keep it small
        searchResults: safeSearchResults,
        leadResultsBasic: safeLeadResultsBasic,
        leadResultsDeep: safeLeadResultsDeep,
        webPages: webPages.slice(0, 10).map(p => ({ ...p, results: (p.results || []).slice(0, 20) })),
        activeWebPage,
        selectedKeys: Array.from(selectedKeys).slice(0, 500),
        activeKey: activeResultKey,
        lastSearchBasic,
        lastSearchDeep,
        googleNextStartBasic,
        googleTotalFoundBasic,
        googleNextStartDeep,
        googleTotalFoundDeep,
        webStrategyIndex,
        webCountry,
        webIncludeLinkedIn,
        linkedinSearchProvider,
        leadMinScore,
        leadKeywordFilters,
        leadKeywordMatch,
        leadPage,
        leadPageSize,
        googleUseRawXray,
        googleRawXray,
        jdSource,
        jdText,
        jdJobId,
        jdOptions,
        jdSelected,
        googlePrompt,
        googleMustHaveSkills,
        googleTitles,
        googleSkills,
        googleLocation,
        googleIndustries,
        googleStrictness,
        googleTitlesMatch,
        googleSkillsMatch,
        googleSeniority,
        googleUSOnly,
        googleExclude,
        googleBoostOpenToWork,
        googleLastRunMode,
        googleExhaustiveEnabled,
        googleExhaustiveTarget,
        googleExhaustiveMaxQueries,
        googleExhaustiveStrategy,
        ts: Date.now(),
      };
      localStorage.setItem(searchStorageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [
    searchStorageKey,
    activeTab,
    searchMode,
    searchQuery,
    searchResults,
    leadResultsBasic,
    leadResultsDeep,
    webPages,
    activeWebPage,
    selectedKeys,
    activeResultKey,
    lastSearchBasic,
    lastSearchDeep,
    googleNextStartBasic,
    googleTotalFoundBasic,
    googleNextStartDeep,
    googleTotalFoundDeep,
    webStrategyIndex,
    webCountry,
    webIncludeLinkedIn,
    linkedinSearchProvider,
    leadMinScore,
    leadKeywordFilters,
    leadKeywordMatch,
    leadPage,
    leadPageSize,
    googleUseRawXray,
    googleRawXray,
    jdSource,
    jdText,
    jdJobId,
    jdOptions,
    jdSelected,
    googlePrompt,
    googleMustHaveSkills,
    googleTitles,
    googleSkills,
    googleLocation,
    googleIndustries,
    googleStrictness,
    googleTitlesMatch,
    googleSkillsMatch,
    googleSeniority,
    googleUSOnly,
    googleExclude,
    googleBoostOpenToWork,
    googleLastRunMode,
    googleExhaustiveEnabled,
    googleExhaustiveTarget,
    googleExhaustiveMaxQueries,
    googleExhaustiveStrategy,
    stripLeadForStorage
  ]);

  // Resume upload state - persisted via zustand
  const { uploadResults, setUploadResults, clearResults, updateResult } = useBulkUploadStore();

  // Web search: Search is a fresh fetch (resets pages). Load more fetches another page and creates a new tab.
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
      return data;
    },
    onSuccess: (data) => {
      const results = Array.isArray(data?.profiles) ? (data.profiles as SearchedProfile[]) : [];
      setLeadResults([]);
      setSelectedKeys(new Set());
      setActiveResultKey(results[0] ? rowKey('web', results[0], 0) : '');

      const page = { id: crypto.randomUUID(), results, ts: Date.now() };
      setWebPages([page]);
      setActiveWebPage(0);
      setSearchResults(results);
      setWebStrategyIndex(0);

      setLastSearch({
        mode: 'web',
        query: searchQuery,
        found: results.length,
        totalFound: data?.total_found,
        debug: data?.debug,
        ts: Date.now(),
      });

      if (results.length) toast.success(`Found ${results.length} results`);
      else toast.info(data?.message || 'No profiles found. Try different search terms.');
    },
    onError: (error: any) => {
      setWebPages([]);
      setActiveWebPage(0);
      setSearchResults([]);
      setLeadResults([]);
      setSelectedKeys(new Set());
      setActiveResultKey('');
      setLastSearch({ mode: 'web', query: searchQuery, found: 0, error: error?.message || 'Search failed', ts: Date.now() });
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
    onSuccess: (data) => {
      const results = Array.isArray(data?.profiles) ? (data.profiles as SearchedProfile[]) : [];
      if (!results.length) {
        toast.info(data?.message || 'No more results');
        return;
      }

      setLeadResults([]);
      setSelectedKeys(new Set());
      setActiveResultKey(rowKey('web', results[0], 0));

      setWebPages(prev => {
        const next = [...prev, { id: crypto.randomUUID(), results, ts: Date.now() }];
        return next.slice(0, 20);
      });
      setActiveWebPage(prev => prev + 1);
      setSearchResults(results);
      setWebStrategyIndex((n) => (n + 1) % 3);

      toast.success(`Loaded ${results.length}`);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Load more failed');
    }
  });

  const googleSearch = useMutation({
    mutationFn: async (args: {
      query: string;
      xray?: string;
      limit?: number;
      start?: number;
      append?: boolean;
      openToWorkSignal?: boolean;
      suppressMeta?: boolean;
      country?: 'us' | 'any';
      provider?: 'google_cse' | 'serpapi';
    }) => {
      const fn =
        args.provider === 'serpapi'
          ? 'serpapi-search-linkedin'
          : 'google-search-linkedin';
      const { data, error } = await supabase.functions.invoke(fn, {
        body: {
          query: args.query,
          xray: args.xray,
          limit: args.limit ?? 20,
          start: args.start ?? 1,
          country: args.country ?? 'us'
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      const provider: 'google_cse' | 'serpapi' = variables?.provider === 'serpapi' ? 'serpapi' : 'google_cse';
      if (data?.success === false && data?.error) {
        setLastSearchForProvider(provider, {
          mode: 'google',
          query: (variables?.xray && String(variables.xray).trim()) ? String(variables.xray).trim() : (searchQuery || ''),
          found: 0,
          totalFound: 0,
          ts: Date.now(),
        });
        setLeadResultsForProvider(provider, []);
        setSearchResults([]);
        setSelectedKeys(new Set());
        setActiveResultKey('');
        const debugStr = data?.debug ? ` debug=${JSON.stringify(data.debug)}` : '';
        // eslint-disable-next-line no-console
        console.error('[google-search-linkedin] error:', data.error, data?.debug);
        toast.error(`${String(data.error)}${debugStr}`);
        return;
      }
      const results = Array.isArray(data?.results) ? (data.results as GoogleLeadResult[]) : [];
      const totalFound = typeof data?.total_found === 'number' ? data.total_found : Number(data?.total_found || 0) || 0;
      const nextStartRaw = typeof data?.next_start === 'number' ? data.next_start : Number(data?.next_start);
      const nextStart = Number.isFinite(nextStartRaw) ? Math.max(0, Math.trunc(nextStartRaw)) : 0;
      const maxAccessibleRaw = typeof data?.max_accessible === 'number' ? data.max_accessible : Number(data?.max_accessible);
      const maxAccessible = Number.isFinite(maxAccessibleRaw) ? Math.max(0, Math.trunc(maxAccessibleRaw)) : 100;
      const canonicalQuery = (variables?.xray && String(variables.xray).trim())
        ? String(variables.xray).trim()
        : String(variables?.query || searchQuery || '').trim();

      const OPEN_TO_WORK_PHRASES = [
        'open to work',
        'open-to-work',
        '#opentowork',
        'open to new opportunities',
        'seeking new opportunities',
      ];

      const textFor = (r: GoogleLeadResult) => `${r.title || ''} ${r.snippet || ''}`.toLowerCase();
      const hasAnyPhrase = (text: string, phrases: string[]) => phrases.some((p) => p && text.includes(p));

      const positiveTerms = (() => {
        // Use the current builder fields to score results (more useful than the edge function's generic scoring).
        // Note: this is heuristic scoring, intended for ordering + quick triage.
        const titles = splitList(googleTitles);
        const must = splitList(googleMustHaveSkills);
        const nice = splitList(googleSkills);
        const industries = splitList(googleIndustries);
        return {
          titles,
          must,
          nice,
          industries,
          excludes: googleExclude.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30),
        };
      })();

      const computeScore = (r: GoogleLeadResult) => {
        const text = textFor(r);
        const matched: string[] = [];
        let score = 10;

        const matchTerm = (t: string) => {
          const v = String(t || '').trim().toLowerCase();
          if (!v) return false;
          if (v.length <= 1) return false;
          return text.includes(v);
        };

        for (const t of positiveTerms.must) {
          if (matchTerm(t)) {
            matched.push(t);
            score += 20;
          }
        }
        for (const t of positiveTerms.titles) {
          if (matchTerm(t)) {
            matched.push(t);
            score += 15;
          }
        }
        for (const t of positiveTerms.nice) {
          if (matchTerm(t)) {
            matched.push(t);
            score += 8;
          }
        }
        for (const t of positiveTerms.industries) {
          if (matchTerm(t)) {
            matched.push(t);
            score += 5;
          }
        }

        if (/\b\d\+?\s*years\b/.test(text)) score += 5;

        const openToWork = hasAnyPhrase(text, OPEN_TO_WORK_PHRASES);
        if (openToWork) {
          matched.push('open_to_work');
          score += 5;
        }

        for (const ex of positiveTerms.excludes) {
          if (matchTerm(ex)) score -= 25;
        }

        score = Math.max(0, Math.min(100, Math.round(score)));
        return { score, matched, openToWork };
      };

      const suppressMeta = Boolean(variables?.suppressMeta);
      const normalizedResults: GoogleLeadResult[] = results.map((r) => {
        const { score, matched, openToWork } = computeScore(r);
        return {
          ...r,
          match_score: score,
          matched_terms: Array.from(new Set([...(Array.isArray(r.matched_terms) ? r.matched_terms : []), ...matched])),
          open_to_work_signal: openToWork,
        };
      });

      let loadedCount = 0;
      if (variables?.append) {
        setLeadResultsForProvider(provider, (prev) => {
          const map = new Map<string, GoogleLeadResult>();
          for (const r of prev) map.set(String(r.linkedin_url), r);
          for (const r of normalizedResults) {
            const k = String(r.linkedin_url);
            const existing = map.get(k);
            // Prefer the "open to work" version if present.
            if (existing && existing.open_to_work_signal && !r.open_to_work_signal) continue;
            map.set(k, existing && r.open_to_work_signal ? { ...existing, ...r } : r);
          }
          const next = Array.from(map.values()).sort((a, b) => {
            const as = typeof a.match_score === 'number' ? a.match_score : 0;
            const bs = typeof b.match_score === 'number' ? b.match_score : 0;
            if (bs !== as) return bs - as;
            const ao = a.open_to_work_signal ? 1 : 0;
            const bo = b.open_to_work_signal ? 1 : 0;
            return bo - ao;
          });
          loadedCount = next.length;
          return next;
        });
      } else {
        const sorted = normalizedResults.slice().sort((a, b) => {
          const as = typeof a.match_score === 'number' ? a.match_score : 0;
          const bs = typeof b.match_score === 'number' ? b.match_score : 0;
          if (bs !== as) return bs - as;
          const ao = a.open_to_work_signal ? 1 : 0;
          const bo = b.open_to_work_signal ? 1 : 0;
          return bo - ao;
        });
        setLeadResultsForProvider(provider, sorted);
        setSelectedKeys(new Set());
        setActiveResultKey(sorted[0]?.linkedin_url ? String(sorted[0].linkedin_url) : '');
        loadedCount = sorted.length;
      }

      if (!suppressMeta) {
        setGoogleNextStartForProvider(provider, nextStart);
        setGoogleTotalFoundForProvider(provider, totalFound);
      }

      // Deep Search (Serp API): keep all results, paginate in UI. After append, show the new page; on initial load, show page 1.
      if (provider === 'serpapi') {
        if (variables?.append) {
          setLeadPage((p) => p + 1);
        } else {
          setLeadPage(1);
        }
      }

      if (!suppressMeta) {
        const priorDebug = (provider === 'serpapi' ? lastSearchDeep : lastSearchBasic)?.debug || {};
        setLastSearchForProvider(provider, {
          mode: 'google',
          query: canonicalQuery,
          found: loadedCount,
          totalFound: totalFound,
          debug: { ...priorDebug, max_accessible: maxAccessible },
          ts: Date.now(),
        });
      }
      setSearchResults([]);
      if (!suppressMeta) {
        if (!variables?.append) {
          if (results.length > 0) toast.success(`Found ${results.length} LinkedIn profiles`);
          else toast.info('No profiles found. Try different search terms.');
        } else {
          if (results.length > 0) toast.success(`Loaded ${results.length} more`);
          else toast.info('No more results');
        }
      }
    },
    onError: (error: any) => {
      console.error('Search error:', error);
      toast.error(error.message || 'Search failed');
    }
  });

  const buildXrayFromJd = useMutation({
    mutationFn: async (args: { jd_text: string; target_location?: string | null }) => {
      const { data, error } = await supabase.functions.invoke('build-xray-from-jd', {
        body: { jd_text: args.jd_text, target_location: args.target_location || undefined }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (!data?.success) {
        toast.error(String(data?.error || 'Build query failed'));
        return;
      }
      const ex = data?.extracted || {};
      const titles = Array.isArray(ex?.titles) ? ex.titles : [];
      const skills = Array.isArray(ex?.skills) ? ex.skills : [];
      const locations = Array.isArray(ex?.locations) ? ex.locations : [];
      const seniority = String(ex?.seniority || 'any');

      setGoogleUseRawXray(false);
      setGoogleRawXray('');
      setGoogleTitles(titles.join(', '));
      // Heuristic: pick up to 2 must-haves and keep the rest as nice-to-have.
      // This prevents the default JD build from becoming a giant OR that matches everyone.
      const mustHave = skills.slice(0, 2);
      const nice = skills.slice(2);
      setGoogleMustHaveSkills(mustHave.join(', '));
      setGoogleSkills(nice.join(', '));

      // Filter out non-geographic “locations” commonly found in JDs.
      const geo = locations.filter((l: any) => {
        const s = String(l || '').trim().toLowerCase();
        if (!s) return false;
        if (s === 'remote' || s === 'hybrid' || s === 'on-site' || s === 'onsite') return false;
        return true;
      });
      setGoogleLocation(geo.length ? geo.map((l: any) => `"${String(l).replace(/"/g, '')}"`).join(' OR ') : '');

      // Store JD-suggested options + defaults for checkbox UX.
      const safeMust = mustHave.map((s: any) => String(s || '').trim()).filter(Boolean).slice(0, 6);
      const safeNice = nice.map((s: any) => String(s || '').trim()).filter(Boolean).slice(0, 12);
      const safeLoc = geo.map((l: any) => String(l || '').trim()).filter(Boolean).slice(0, 6);
      setJdOptions({ must: safeMust, nice: safeNice, locations: safeLoc });
      // Default selection: all must-haves, top 6 nice-to-haves, all locations.
      setJdSelected({
        must: safeMust,
        nice: safeNice.slice(0, 6),
        locations: safeLoc,
      });

      if (['any', 'junior', 'mid', 'senior', 'staff'].includes(seniority)) {
        setGoogleSeniority(seniority as any);
      }
      toast.success('Query built from JD');
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Build query failed');
    }
  });

  // Import profiles mutation
  const importProfiles = useMutation({
    mutationFn: async (profiles: SearchedProfile[]) => {
      const { data, error } = await supabase.functions.invoke('bulk-import-candidates', {
        body: { profiles, organizationId, source: 'web_search' }
      });
      if (error) {
        const msg = await getEdgeFunctionErrorMessage(error);
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      if (organizationId) queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
      toast.success(`Imported ${data.results.imported} candidates`);
      if (data.results.skipped > 0) {
        toast.info(`${data.results.skipped} duplicates skipped`);
      }
      setSelectedKeys(new Set());
      // Keep results + last search so recruiters can continue browsing without losing context.
    },
    onError: (error: any) => {
      toast.error(error.message || 'Import failed');
    }
  });

  const importGoogleLeads = useMutation({
    mutationFn: async (leads: GoogleLeadResult[]) => {
      const guessNameFromTitle = (title?: string) => {
        const cleaned = String(title || '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
        const head = cleaned.split(/\s+-\s+|\s+–\s+|\s+\|\s+/)[0]?.trim();
        return head || 'Unknown';
      };

      const profiles: SearchedProfile[] = leads.map((l) => ({
        full_name: guessNameFromTitle(l.title),
        headline: l.snippet ? String(l.snippet).slice(0, 200) : undefined,
        summary: l.snippet ? String(l.snippet) : undefined,
        linkedin_url: l.linkedin_url,
        source_url: l.source_url || l.linkedin_url,
        source_title: l.title,
        source_excerpt: l.snippet,
        source: 'google_xray',
      }));

      const { data, error } = await supabase.functions.invoke('bulk-import-candidates', {
        body: { profiles, organizationId, source: 'google_xray' }
      });
      if (error) {
        const msg = await getEdgeFunctionErrorMessage(error);
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      if (organizationId) queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
      toast.success(`Imported ${data.results.imported} candidates`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Import failed');
    }
  });

  // CSV export helper
  const exportToCSV = (filename: string) => {
    const rows = displayedRows.map((row: any) => {
      const isGoogleRow = displayModeForRow === 'google';
      return {
        Name: isGoogleRow
          ? (row?.title ? String(row.title).replace(/\s*\|\s*LinkedIn\s*$/i, '') : 'LinkedIn Profile')
          : (row?.full_name || 'Unknown'),
        Headline: isGoogleRow
          ? (row?.snippet || '')
          : (row?.headline || row?.summary || ''),
        Company: isGoogleRow ? '' : (row?.current_company || ''),
        Location: isGoogleRow ? '' : (row?.location || ''),
        Skills: isGoogleRow ? '' : (row?.skills || []).join('; '),
        Experience: isGoogleRow ? '' : (row?.experience_years || ''),
        'Match Score': row?.match_score ? Math.round(row.match_score) + '%' : '',
        URL: isGoogleRow ? row?.linkedin_url : (row?.linkedin_url || row?.website || row?.source_url || '')
      };
    });

    const headers = Object.keys(rows[0] || {});
    const csvContent = [
      headers.join(','),
      ...rows.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  // Saved searches queries
  const { data: savedSearches } = useQuery({
    queryKey: ['saved-sourcing-searches', organizationId],
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

  const saveSearchMutation = useMutation({
    mutationFn: async ({ name, query, filters }: { name: string; query: string; filters: any }) => {
      if (!user || !organizationId) throw new Error('Missing auth');
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
      queryClient.invalidateQueries({ queryKey: ['saved-sourcing-searches', organizationId] });
      toast.success('Search saved successfully');
      setSaveSearchDialogOpen(false);
      setSaveSearchName('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save search');
    }
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
      queryClient.invalidateQueries({ queryKey: ['saved-sourcing-searches', organizationId] });
      toast.success('Search deleted');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete search');
    }
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
      queryClient.invalidateQueries({ queryKey: ['saved-sourcing-searches', organizationId] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update favorite');
    }
  });

  const handleImportCandidateFromActive = async () => {
    if (!activeRow) return;
    await handleImportRow(activeRow);
  };

  const handleImportRow = async (row: any) => {
    if (isLinkedInMode) {
      const linkedinUrl = row?.linkedin_url ? String(row.linkedin_url) : '';
      if (!linkedinUrl) {
        toast.error('Missing LinkedIn URL for this lead');
        return;
      }
      await importGoogleLeads.mutateAsync([row]);
      toast.success('Imported to Talent Pool');
      return;
    }
    const profile = row as SearchedProfile;
    const linkedinUrl = profile.linkedin_url ? String(profile.linkedin_url) : '';
    const email = profile.email ? String(profile.email) : '';
    if (!linkedinUrl && !email) {
      toast.error('No LinkedIn URL or email found for this profile');
      return;
    }
    await importProfiles.mutateAsync([profile]);
    toast.success('Imported to Talent Pool');
  };

  // Handle file upload - parse, store file, and auto-import
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newResults: UploadResult[] = files.map(f => ({
      fileName: f.name,
      status: 'pending'
    }));

    // Append to existing results instead of replacing
    setUploadResults(prev => [...prev, ...newResults]);
    const startIndex = uploadResults.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const resultIndex = startIndex + i;

      // Update to parsing
      updateResult(resultIndex, { status: 'parsing' });

      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Compute SHA-256 hash of the raw file content for duplicate detection
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Check if this exact file already exists BEFORE parsing
        const { data: existingResume } = await supabase
          .from('resumes')
          .select('id, file_name')
          .eq('content_hash', fileHash)
          .maybeSingle();

        if (existingResume) {
          console.log('Duplicate resume detected:', file.name);
          // Instead of erroring, re-link the existing candidate to this org so it becomes visible again.
          try {
            const { data: relinkData, error: relinkErr } = await supabase.functions.invoke('resolve-duplicate-resume', {
              body: { organizationId, contentHash: fileHash, source: 'resume_upload' }
            });
            if (relinkErr) {
              const msg = await getEdgeFunctionErrorMessage(relinkErr);
              throw new Error(msg);
            }
            const score = (relinkData as any)?.resume?.ats_score;
            updateResult(resultIndex, {
              status: 'done',
              atsScore: typeof score === 'number' ? score : undefined,
              parsed: undefined,
              note: 'Duplicate detected: existing profile re-linked to Talent Pool',
              error: undefined,
            });
          } catch (e: any) {
            updateResult(resultIndex, {
              status: 'error',
              error: `Duplicate rejected: This exact resume already exists in the system`,
            });
          }
          continue; // Skip to next file
        }

        // Parse resume
        const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-resume', {
          body: {
            fileBase64: base64,
            fileName: file.name,
            // Some browsers may provide empty/unknown MIME types (esp. DOCX). Let the edge function infer via extension.
            fileType: file.type || 'application/octet-stream'
          }
        });

        if (parseError) {
          const msg = await getEdgeFunctionErrorMessage(parseError);
          throw new Error(msg);
        }

        const parsed = parseData.parsed;

        // Store the file hash for later use
        parsed._fileHash = fileHash;

        // Update to importing
        updateResult(resultIndex, { status: 'importing', parsed, atsScore: parsed.ats_score });

        // Upload file to storage
        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `sourced/${organizationId}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(uniqueFileName, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          throw new Error(`Failed to upload file: ${uploadError.message}`);
        }

        // Auto-import the candidate with resume file info
        const { data: importData, error: importError } = await supabase.functions.invoke('bulk-import-candidates', {
          body: {
            profiles: [{
              ...parsed,
              source: 'resume_upload',
              ats_score: parsed.ats_score,
              resume_file: {
                file_name: file.name,
                file_url: `resumes/${uniqueFileName}`,
                file_type: file.type || 'application/octet-stream',
                content_hash: parsed._fileHash // Pass the pre-computed file hash
              }
            }],
            organizationId,
            source: 'resume_upload'
          }
        });

        if (importError) {
          const msg = await getEdgeFunctionErrorMessage(importError);
          throw new Error(msg);
        }

        // If the backend reported duplicates, treat as a non-fatal outcome (we re-link existing profiles).
        const relinked = Number((importData as any)?.results?.relinked ?? 0);
        const hasDuplicateError = (importData as any)?.results?.errors?.some((e: string) =>
          String(e || '').toUpperCase().includes('DUPLICATE')
        );

        if (relinked > 0) {
          updateResult(resultIndex, {
            status: 'done',
            parsed,
            atsScore: parsed.ats_score,
            note: 'Duplicate detected: existing profile re-linked to Talent Pool',
            error: undefined,
          });
        } else if (hasDuplicateError) {
          updateResult(resultIndex, {
            status: 'error',
            error: 'Duplicate resume: identical content already exists in the system',
            parsed,
            atsScore: parsed.ats_score,
          });
        } else {
          updateResult(resultIndex, { status: 'done', parsed, atsScore: parsed.ats_score, error: undefined });
        }

      } catch (error: any) {
        console.error('Upload error for', file.name, error);
        const msg = await getEdgeFunctionErrorMessage(error);
        updateResult(resultIndex, { status: 'error', error: msg });
      }
    }

    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    if (organizationId) queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });

    // Reset input
    e.target.value = '';
  }, [organizationId, queryClient, uploadResults.length, setUploadResults, updateResult]);

  const handleSearch = async () => {
    if (searchMode === 'web' && !searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    if (searchMode === 'web') {
      // Fresh fetch wipes prior pages/results.
      setWebPages([]);
      setActiveWebPage(0);
      setSearchResults([]);
      setSelectedKeys(new Set());
      setActiveResultKey('');
      setWebStrategyIndex(0);
      webSearchInitial.mutate(searchQuery);
    }
    else {
      setGoogleLastRunMode('single');
      const xray =
        googleUseRawXray && googleRawXray.trim()
          ? googleRawXray.trim()
          : buildGoogleXray();
      if (!xray.trim()) {
        toast.error('Please enter a query');
        return;
      }
      setLeadKeywordFilters('');
      setLeadKeywordMatch('any');
      setLeadMinScore(Number.NEGATIVE_INFINITY);
      setLeadPage(1);
      setGoogleNextStart(1);
      setGoogleTotalFound(0);
      try {
        const country = googleUSOnly ? 'us' : 'any';
        const provider = effectiveLinkedInProvider;

        if (provider === 'google_cse') {
          // For Google CSE, auto-fetch everything accessible (no "Load more" UX).
          const d1: any = await googleSearch.mutateAsync({ query: '', xray, limit: 50, start: 1, append: false, country, provider });
          const n1 = Number(d1?.next_start ?? 0) || 0;
          if (n1 > 0) {
            await googleSearch.mutateAsync({ query: '', xray, limit: 50, start: n1, append: true, suppressMeta: true, country, provider });
          }
          // Google CSE is capped (~100). Treat as exhausted after our max fetch.
          setGoogleNextStart(0);
        } else {
          // For SerpAPI, do a single page fetch and allow manual pagination via "Load more".
          await googleSearch.mutateAsync({ query: '', xray, limit: 20, start: 1, append: false, country, provider });
        }
      } catch {
        return;
      }

      // Soft signal: run an extra query that prefers "open to work" language,
      // merge results, and mark/bump those leads. This does NOT exclude anyone.
      if (googleBoostOpenToWork) {
        const openToWorkClause =
          '("open to work" OR "open-to-work" OR "#opentowork" OR "open to new opportunities" OR "seeking new opportunities")';
        const boosted = `${xray} ${openToWorkClause}`.replace(/\s+/g, ' ').trim();
        try {
          const b1: any = await googleSearch.mutateAsync({
            query: '',
            xray: boosted,
            limit: effectiveLinkedInProvider === 'serpapi' ? 20 : 50,
            start: 1,
            append: true,
            openToWorkSignal: true,
            suppressMeta: true,
            country: googleUSOnly ? 'us' : 'any',
            provider: effectiveLinkedInProvider,
          });
          const bn = Number(b1?.next_start ?? 0) || 0;
          if (bn > 0 && effectiveLinkedInProvider === 'google_cse') {
            await googleSearch.mutateAsync({
              query: '',
              xray: boosted,
              limit: 50,
              start: bn,
              append: true,
              openToWorkSignal: true,
              suppressMeta: true,
              country: googleUSOnly ? 'us' : 'any',
              provider: effectiveLinkedInProvider,
            });
          }
        } catch {
          // non-fatal: keep base results
        }
      }
    }
  };

  const handleLoadMoreWeb = () => {
    if (searchMode !== 'web') return;
    const q = (lastSearch?.mode === 'web' && lastSearch?.query) ? String(lastSearch.query) : String(searchQuery || '');
    if (!q.trim()) return;
    webSearchMore.mutate(q);
  };

  const clearWebSearchSession = () => {
    setWebPages([]);
    setActiveWebPage(0);
    setSearchResults([]);
    // Clear only Basic Search results; keep Deep Search results intact.
    setLeadResultsBasic([]);
    setSelectedKeys(new Set());
    setActiveResultKey('');
    setWebStrategyIndex(0);
    if (lastSearchBasic?.mode === 'web') setLastSearchBasic(null);
  };

  const loadPostedJobs = useCallback(async () => {
    if (!organizationId) return;
    if (isLoadingJobs) return;
    try {
      setIsLoadingJobs(true);
      setJobsLoadAttempted(true);
      setJobsLoadError(null);
      const { data, error } = await supabase
        .from('jobs')
        .select('id,title,description,location,status,created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setPostedJobs((data as any[])?.map((j) => ({
        id: String(j.id),
        title: String(j.title || ''),
        description: String(j.description || ''),
        location: j.location ? String(j.location) : null,
        status: j.status ? String(j.status) : null,
        created_at: String(j.created_at),
      })) as PostedJobLite[]);
    } catch (e: any) {
      console.error('Failed to load jobs', e);
      setJobsLoadError(e?.message ? String(e.message) : 'Could not load posted jobs');
      toast.error('Could not load posted jobs');
    } finally {
      setIsLoadingJobs(false);
    }
  }, [organizationId, isLoadingJobs]);

  useEffect(() => {
    if (activeTab !== 'search') return;
    if (searchMode !== 'basic') return;
    if (jdSource !== 'job') return;
    if (jobsLoadAttempted) return;
    if (postedJobs.length > 0) return;
    void loadPostedJobs();
  }, [activeTab, searchMode, jdSource, postedJobs.length, jobsLoadAttempted, loadPostedJobs]);

  const toggleRowSelection = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = (visibleKeys: string[]) => {
    const allSelected = visibleKeys.length > 0 && visibleKeys.every(k => selectedKeys.has(k));
    if (allSelected) {
      setSelectedKeys(prev => {
        const next = new Set(prev);
        for (const k of visibleKeys) next.delete(k);
        return next;
      });
    } else {
      setSelectedKeys(prev => {
        const next = new Set(prev);
        for (const k of visibleKeys) next.add(k);
        return next;
      });
    }
  };

  const handleImportSelected = () => {
    if (isLinkedInMode) {
      const selected = new Set(selectedKeys);
      const leads = leadResults.filter((l, idx) => selected.has(rowKey('google', l, idx)));
      importGoogleLeads.mutate(leads);
      return;
    }
    const selected = new Set(selectedKeys);
    const profiles = searchResults.filter((p, idx) => selected.has(rowKey(searchMode, p, idx)));
    importProfiles.mutate(profiles);
  };

  const applyWebExample = (q: string) => {
    setSearchMode('web');
    setSearchQuery(q);
    setActiveTab('search');
  };

  const applyGoogleExample = (args: {
    titles?: string;
    titlesMatch?: 'any' | 'all';
    skills?: string;
    skillsMatch?: 'any' | 'all';
    location?: string;
    seniority?: 'any' | 'junior' | 'mid' | 'senior' | 'staff';
    usOnly?: boolean;
    exclude?: string;
  }) => {
    setSearchMode('basic');
    setActiveTab('search');
    setGoogleUseRawXray(false);
    setGoogleRawXray('');
    if (typeof args.titles === 'string') setGoogleTitles(args.titles);
    if (args.titlesMatch) setGoogleTitlesMatch(args.titlesMatch);
    if (typeof args.skills === 'string') setGoogleSkills(args.skills);
    if (args.skillsMatch) setGoogleSkillsMatch(args.skillsMatch);
    if (typeof args.location === 'string') setGoogleLocation(args.location);
    if (args.seniority) setGoogleSeniority(args.seniority);
    if (typeof args.usOnly === 'boolean') setGoogleUSOnly(args.usOnly);
    if (typeof args.exclude === 'string') setGoogleExclude(args.exclude);
  };

  const completedCount = uploadResults.filter(p => p.status === 'done').length;
  const errorCount = uploadResults.filter(p => p.status === 'error').length;
  const processingCount = uploadResults.filter(p => ['pending', 'parsing', 'importing'].includes(p.status)).length;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const isDeepTab = searchMode === 'deep';
  const leadResults = isDeepTab ? leadResultsDeep : leadResultsBasic;
  const setLeadResults = (action: SetStateAction<GoogleLeadResult[]>) => {
    if (isDeepTab) setLeadResultsDeep(action);
    else setLeadResultsBasic(action);
  };
  const setLeadResultsForProvider = (provider: 'google_cse' | 'serpapi', action: SetStateAction<GoogleLeadResult[]>) => {
    if (provider === 'serpapi') setLeadResultsDeep(action);
    else setLeadResultsBasic(action);
  };
  const googleNextStart = isDeepTab ? googleNextStartDeep : googleNextStartBasic;
  const setGoogleNextStart = (action: SetStateAction<number>) => {
    if (isDeepTab) setGoogleNextStartDeep(action);
    else setGoogleNextStartBasic(action);
  };
  const setGoogleNextStartForProvider = (provider: 'google_cse' | 'serpapi', action: SetStateAction<number>) => {
    if (provider === 'serpapi') setGoogleNextStartDeep(action);
    else setGoogleNextStartBasic(action);
  };
  const googleTotalFound = isDeepTab ? googleTotalFoundDeep : googleTotalFoundBasic;
  const setGoogleTotalFound = (action: SetStateAction<number>) => {
    if (isDeepTab) setGoogleTotalFoundDeep(action);
    else setGoogleTotalFoundBasic(action);
  };
  const setGoogleTotalFoundForProvider = (provider: 'google_cse' | 'serpapi', action: SetStateAction<number>) => {
    if (provider === 'serpapi') setGoogleTotalFoundDeep(action);
    else setGoogleTotalFoundBasic(action);
  };
  const lastSearch = isDeepTab ? lastSearchDeep : lastSearchBasic;
  const setLastSearch = (action: SetStateAction<typeof lastSearchBasic>) => {
    if (isDeepTab) setLastSearchDeep(action as any);
    else setLastSearchBasic(action as any);
  };
  const setLastSearchForProvider = (provider: 'google_cse' | 'serpapi', action: SetStateAction<typeof lastSearchBasic>) => {
    if (provider === 'serpapi') setLastSearchDeep(action as any);
    else setLastSearchBasic(action as any);
  };

  const isLinkedInMode = activeTab === 'search' && searchMode !== 'web';
  const effectiveLinkedInProvider: 'google_cse' | 'serpapi' =
    isLinkedInMode ? (searchMode === 'deep' ? 'serpapi' : 'google_cse') : linkedinSearchProvider;

  const totalSearchRows = isLinkedInMode ? leadResults.length : searchResults.length;
  const hasSearchRows = totalSearchRows > 0;
  const isSearching =
    searchMode === 'web'
      ? (webSearchInitial.isPending || webSearchMore.isPending)
      : googleSearch.isPending;

  const filteredLeadResults = !isLinkedInMode
    ? []
    : leadResults.filter((r) => {
      const t = `${r.title || ''} ${r.snippet || ''} ${r.linkedin_url || ''}`.toLowerCase();
      const keywords = leadKeywordFilters
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 30);
      const passKeywords = !keywords.length
        ? true
        : (leadKeywordMatch === 'all'
          ? keywords.every(k => t.includes(k))
          : keywords.some(k => t.includes(k)));
      const score = typeof r.match_score === 'number' ? r.match_score : 0;
      const passScore = !Number.isFinite(leadMinScore) || score >= leadMinScore;
      return passKeywords && passScore;
    });

  const googleFilteredCount = isLinkedInMode ? filteredLeadResults.length : 0;
  // Deep Search (Serp API): show one page at a time; Basic exhaustive: same. Page size for Serp API is 20.
  const effectiveLeadPageSize = isLinkedInMode && effectiveLinkedInProvider === 'serpapi' ? 20 : leadPageSize;
  const googlePagingEnabled = isLinkedInMode && (googleLastRunMode === 'exhaustive' || effectiveLinkedInProvider === 'serpapi');
  const googlePageCount =
    googlePagingEnabled
      ? Math.max(1, Math.ceil(googleFilteredCount / Math.max(1, effectiveLeadPageSize)))
      : 1;
  const safeLeadPage =
    googlePagingEnabled
      ? Math.min(Math.max(1, leadPage), googlePageCount)
      : 1;
  const googlePageStartIndex =
    googlePagingEnabled
      ? (safeLeadPage - 1) * Math.max(1, effectiveLeadPageSize)
      : 0;
  const googlePageEndIndex =
    googlePagingEnabled
      ? googlePageStartIndex + Math.max(1, effectiveLeadPageSize)
      : googleFilteredCount;
  const pagedLeadResults =
    isLinkedInMode
      ? (googlePagingEnabled ? filteredLeadResults.slice(googlePageStartIndex, googlePageEndIndex) : filteredLeadResults)
      : [];

  const displayedRows: any[] = isLinkedInMode ? pagedLeadResults : searchResults;
  const displayModeForRow: 'web' | 'linkedin' | 'google' = isLinkedInMode ? 'google' : 'web';
  const displayedKeys = displayedRows.map((row: any, i: number) => rowKey(displayModeForRow, row, i));
  const allVisibleSelected = displayedKeys.length > 0 && displayedKeys.every(k => selectedKeys.has(k));

  const activeRow = (() => {
    if (!displayedRows.length) return null;
    const idx = displayedKeys.findIndex(k => k === activeResultKey);
    if (idx >= 0) return displayedRows[idx];
    return displayedRows[0];
  })();

  useEffect(() => {
    if (!displayedRows.length) return;
    const idx = displayedKeys.findIndex(k => k === activeResultKey);
    if (idx === -1) setActiveResultKey(displayedKeys[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMode, leadResults, searchResults, leadKeywordFilters, leadKeywordMatch, leadMinScore, leadPage, leadPageSize]);

  const googleHasMore =
    isLinkedInMode &&
    googleNextStart > 0 &&
    leadResults.length > 0;

  const handleLoadMoreGoogle = () => {
    if (!isLinkedInMode) return;
    if (!googleNextStart || googleNextStart <= 0) return;
    const q = (lastSearch?.mode === 'google' && lastSearch?.query) ? String(lastSearch.query) : '';
    const xray = googleUseRawXray && googleRawXray.trim()
      ? googleRawXray.trim()
      : buildGoogleXray();
    const start = Math.max(1, Number(googleNextStart) || 1);
    // Append new page to results; UI pagination (Prev/Next) shows one page at a time.
    googleSearch.mutate({
      query: '',
      xray: (q && q.trim()) || xray,
      limit: effectiveLinkedInProvider === 'serpapi' ? 20 : 50,
      start,
      append: true,
      country: googleUSOnly ? 'us' : 'any',
      provider: effectiveLinkedInProvider,
    });
  };

  const handleLoadAllGoogle = async () => {
    if (!isLinkedInMode) return;
    if (googleIsLoadingAll) return;
    const q = (lastSearch?.mode === 'google' && lastSearch?.query) ? String(lastSearch.query) : '';
    const xray = q.trim() || (googleUseRawXray && googleRawXray.trim() ? googleRawXray.trim() : buildGoogleXray());
    if (!xray.trim()) return;

    // "Load all" means: load as many pages as allowed by the search API.
    setGoogleIsLoadingAll(true);
    try {
      let start = Math.max(1, Number(googleNextStart) || 1);
      let total = Math.max(0, Number(googleTotalFound) || 0);
      let safety = 0;

      while (safety < 10) {
        safety += 1;
        if (!start || start <= 0) break;
        const data = await googleSearch.mutateAsync({
          query: '',
          xray,
          limit: effectiveLinkedInProvider === 'serpapi' ? 20 : 50,
          start,
          append: true,
          suppressMeta: true,
          country: googleUSOnly ? 'us' : 'any',
          provider: effectiveLinkedInProvider,
        });

        const nextStart = Number((data as any)?.next_start ?? 0) || 0;
        const totalFound = Number((data as any)?.total_found || 0) || 0;
        if (totalFound > 0) total = totalFound;

        // Stop if we didn't advance, or we have no more pages.
        if (!nextStart || nextStart <= start) break;
        start = nextStart;

        // If we have a known total and we've loaded enough, stop.
        if (total > 0 && leadResults.length >= total) break;

        // Stop if we've reached the deep paging limit (edge returns next_start=0 when exhausted).
      }

      // Keep meta in sync after background loads
      setGoogleNextStart(start);
      if (total > 0) setGoogleTotalFound(total);
      toast.success('Loaded all available results');
    } catch (e: any) {
      toast.error(e?.message || 'Load all failed');
    } finally {
      setGoogleIsLoadingAll(false);
    }
  };

  const splitList = (raw: string): string[] => {
    const s = String(raw || '').trim();
    if (!s) return [];
    // Prefer explicit OR lists, else treat commas as separators.
    const pieces = /\bOR\b/i.test(s) ? s.split(/\s+\bOR\b\s+/i) : s.split(',');
    return pieces
      .map(p => String(p || '').trim())
      .map(p => p.replace(/^\(+|\)+$/g, '').trim())
      .map(p => p.replace(/^"+|"+$/g, '').trim())
      .filter(Boolean)
      .slice(0, 60);
  };

  const quotePhrase = (x: string): string => {
    const t = String(x || '').trim().replace(/"/g, '');
    if (!t) return '';
    return `"${t}"`;
  };

  const buildGoogleXrayOmitting = (omit: { location?: boolean; titles?: boolean; industries?: boolean; skills?: boolean }): string => {
    const parts: string[] = ['site:linkedin.com/in'];

    const prompt = String(googlePrompt || '').trim();
    if (prompt) {
      const hasOps = /\b(OR|AND)\b/i.test(prompt) || prompt.includes('(') || prompt.includes(')');
      parts.push(hasOps ? `(${prompt})` : `"${prompt.replace(/"/g, '')}"`);
    }

    if (!omit.titles) {
      const titles = splitList(googleTitles);
      if (titles.length === 1) parts.push(quotePhrase(titles[0]));
      else if (titles.length > 1) {
        if (googleTitlesMatch === 'all') parts.push(`(${titles.map(t => quotePhrase(t)).join(' ')})`);
        else parts.push(`(${titles.map(t => quotePhrase(t)).join(' OR ')})`);
      }
    }

    if (!omit.skills) {
      const mustHave = splitList(googleMustHaveSkills);
      for (const s of mustHave) parts.push(quotePhrase(s));

      const skills = splitList(googleSkills);
      if (skills.length === 1) parts.push(quotePhrase(skills[0]));
      else if (skills.length > 1) {
        if (googleSkillsMatch === 'all') parts.push(`(${skills.map(s => quotePhrase(s)).join(' ')})`);
        else parts.push(`(${skills.map(s => quotePhrase(s)).join(' OR ')})`);
      }
    }

    if (!omit.location) {
      const loc = String(googleLocation || '').trim();
      if (loc) {
        const safe = loc.includes(' OR ') || loc.includes(' or ') ? `(${loc})` : quotePhrase(loc);
        parts.push(safe);
      }
    }

    if (!omit.industries) {
      const industries = splitList(googleIndustries);
      if (industries.length === 1) parts.push(quotePhrase(industries[0]));
      else if (industries.length > 1) parts.push(`(${industries.map(s => quotePhrase(s)).join(' OR ')})`);
    }

    if (googleUSOnly) parts.push(`("United States" OR "United States of America" OR USA OR "U.S.")`);

    if (googleSeniority === 'junior') parts.push(`("1 year" OR "2 years" OR junior OR "entry level")`);
    else if (googleSeniority === 'mid') parts.push(`("3 years" OR "4 years" OR mid OR "software engineer")`);
    else if (googleSeniority === 'senior') parts.push(`("5 years" OR "5+ years" OR "6 years" OR senior OR lead OR staff OR principal)`);
    else if (googleSeniority === 'staff') parts.push(`(staff OR principal OR "senior staff" OR "tech lead")`);

    const excludes = googleExclude
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    for (const ex of excludes) {
      if (ex.includes(' ')) parts.push(`-"${ex.replace(/"/g, '')}"`);
      else parts.push(`-${ex.replace(/"/g, '')}`);
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };

  const handleExhaustiveGoogleSearch = async () => {
    if (googleExhaustiveState.running) return;
    setGoogleLastRunMode('exhaustive');

    const guessCategory = (): 'data' | 'frontend' | 'backend' | 'general' => {
      const blob = `${googlePrompt} ${googleTitles} ${googleMustHaveSkills} ${googleSkills}`.toLowerCase();
      if (/\b(data scientist|data science|ml engineer|machine learning|analytics|analyst)\b/.test(blob)) return 'data';
      if (/\b(frontend|front-end|react|next\.js|typescript|ui|ux)\b/.test(blob)) return 'frontend';
      if (/\b(backend|back-end|java|spring|golang|node|api|microservices)\b/.test(blob)) return 'backend';
      return 'general';
    };

    const getDefaultBuckets = (kind: 'location' | 'title' | 'industry' | 'skill'): string[] => {
      const category = guessCategory();
      if (kind === 'location') {
        // Metros are often missing from snippets. States are more robust in indexed text.
        if (googleUSOnly) {
          return [
            'California',
            'New York',
            'Texas',
            'Florida',
            'Washington',
            'Massachusetts',
            'Illinois',
            'New Jersey',
            'Pennsylvania',
            'Georgia',
            'North Carolina',
            'Virginia',
            'Colorado',
            'Arizona',
            'Michigan',
            'Ohio',
            'Minnesota',
            'Tennessee',
            'Oregon',
            'Maryland',
          ];
        }
        return ['London', 'Toronto', 'Vancouver', 'Dublin', 'Berlin', 'Amsterdam', 'Paris', 'Singapore', 'Sydney', 'Melbourne', 'Bangalore', 'Hyderabad'];
      }
      if (kind === 'title') {
        if (category === 'data') return ['Data Scientist', 'Data Analyst', 'Machine Learning Engineer', 'Applied Scientist', 'Research Scientist', 'Analytics Engineer'];
        if (category === 'frontend') return ['Frontend Engineer', 'Front End Engineer', 'React Developer', 'UI Engineer', 'Web Developer', 'Full Stack Engineer'];
        if (category === 'backend') return ['Backend Engineer', 'Back End Engineer', 'Software Engineer', 'Java Engineer', 'API Engineer', 'Platform Engineer'];
        return ['Software Engineer', 'Senior Software Engineer', 'Full Stack Engineer', 'Backend Engineer', 'Frontend Engineer', 'Platform Engineer'];
      }
      if (kind === 'industry') {
        return ['FinTech', 'Healthcare', 'SaaS', 'E-commerce', 'Cybersecurity', 'Robotics', 'EdTech', 'Biotech', 'Climate', 'AI'];
      }
      // skill
      if (category === 'data') return ['SQL', 'Pandas', 'NumPy', 'scikit-learn', 'TensorFlow', 'PyTorch', 'Spark', 'AWS'];
      if (category === 'frontend') return ['React', 'TypeScript', 'Next.js', 'JavaScript', 'CSS', 'Node.js', 'GraphQL', 'Tailwind'];
      if (category === 'backend') return ['Java', 'Spring', 'AWS', 'Kubernetes', 'PostgreSQL', 'Microservices', 'REST', 'Docker'];
      return ['Python', 'Java', 'JavaScript', 'SQL', 'AWS', 'Kubernetes', 'React', 'Node.js'];
    };

    const computeAutoPlan = (): { kind: 'location' | 'title' | 'industry' | 'skill'; buckets: string[]; source: 'user' | 'default' } => {
      const user = {
        location: splitList(googleLocation),
        title: splitList(googleTitles),
        industry: splitList(googleIndustries),
        // Prefer splitting by "nice-to-have" skills first (more variety); fall back to must-have.
        skill: (() => {
          const nice = splitList(googleSkills);
          if (nice.length >= 2) return nice;
          const must = splitList(googleMustHaveSkills);
          return must;
        })(),
      } as const;

      const kind =
        googleExhaustiveStrategy === 'auto'
          // Prefer splitting by content that appears in snippets: skills → titles → industries → locations.
          ? (user.skill.length >= 2 ? 'skill'
            : user.title.length >= 2 ? 'title'
              : user.industry.length >= 2 ? 'industry'
                : user.location.length >= 2 ? 'location'
                  : 'title')
          : (googleExhaustiveStrategy as any);

      const buckets = (user as any)[kind] as string[];
      if (Array.isArray(buckets) && buckets.length >= 2) return { kind, buckets, source: 'user' };
      return { kind, buckets: getDefaultBuckets(kind), source: 'default' };
    };

    const wizardBuckets = (googleExhaustiveBuckets || []).map(s => String(s || '').trim()).filter(Boolean);
    const wizardKind = googleExhaustiveBucketKind;
    const autoPlan = computeAutoPlan();
    const desiredKind =
      googleExhaustiveStrategy === 'auto'
        ? (wizardKind || autoPlan.kind)
        : (googleExhaustiveStrategy as any);

    const bucketValues =
      wizardBuckets.length && wizardKind === desiredKind
        ? wizardBuckets
        : (desiredKind === autoPlan.kind ? autoPlan.buckets : getDefaultBuckets(desiredKind));

    // Reset lead list and paging state
    setLeadKeywordFilters('');
    setLeadKeywordMatch('any');
    setLeadMinScore(Number.NEGATIVE_INFINITY);
    setLeadPage(1);
    setGoogleNextStart(1);
    setGoogleTotalFound(0);
    setSelectedKeys(new Set());
    setActiveResultKey('');
    setLeadResults([]);

    const maxQueries = Math.max(1, Math.min(100, Math.trunc(googleExhaustiveMaxQueries)));
    const target = Math.max(50, Math.min(5000, Math.trunc(googleExhaustiveTarget)));
    const buckets = bucketValues.slice(0, maxQueries);

    setGoogleExhaustiveState({ running: true, total: buckets.length, done: 0, label: `Splitting by ${desiredKind}` });

    try {
      const omit = {
        location: desiredKind === 'location',
        titles: desiredKind === 'title',
        industries: desiredKind === 'industry',
        skills: desiredKind === 'skill',
      };
      const base = buildGoogleXrayOmitting(omit);
      const openToWorkClause =
        googleBoostOpenToWork
          ? '("open to work" OR "open-to-work" OR "#opentowork" OR "open to new opportunities" OR "seeking new opportunities")'
          : '';

      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        const clause = quotePhrase(b);
        const xray = `${base} ${clause} ${openToWorkClause}`.replace(/\s+/g, ' ').trim();

        // Pull up to 100 accessible results per bucket (2x50 calls max).
        const d1 = await googleSearch.mutateAsync({
          query: '',
          xray,
          limit: effectiveLinkedInProvider === 'serpapi' ? 20 : 50,
          start: 1,
          append: true,
          suppressMeta: true,
          country: googleUSOnly ? 'us' : 'any',
          provider: effectiveLinkedInProvider,
        });
        const n1 = Number((d1 as any)?.next_start ?? 0) || 0;
        if (n1 > 0 && effectiveLinkedInProvider === 'google_cse') {
          await googleSearch.mutateAsync({
            query: '',
            xray,
            limit: 50,
            start: n1,
            append: true,
            suppressMeta: true,
            country: googleUSOnly ? 'us' : 'any',
            provider: effectiveLinkedInProvider,
          });
        }

        setGoogleExhaustiveState(prev => ({ ...prev, done: i + 1 }));

        // Stop early if we hit target (use ref to avoid stale state reads).
        if (leadCountRef.current >= target) break;
      }

      toast.success('Exhaustive search finished (deduped)');
    } catch (e: any) {
      toast.error(e?.message || 'Exhaustive search failed');
    } finally {
      setGoogleExhaustiveState(prev => ({ ...prev, running: false }));
    }
  };

  const googleQuality = (() => {
    const titles = splitList(googleTitles);
    const must = splitList(googleMustHaveSkills);
    const nice = splitList(googleSkills);
    const industries = splitList(googleIndustries);
    const loc = String(googleLocation || '').trim();
    const prompt = String(googlePrompt || '').trim();

    const hardTitleCount = titles.length === 0 ? 0 : (googleTitlesMatch === 'all' ? titles.length : 1);
    const hardNiceCount = nice.length === 0 ? 0 : (googleSkillsMatch === 'all' ? nice.length : 1);
    const hardCount =
      must.length +
      hardTitleCount +
      hardNiceCount +
      (industries.length ? 1 : 0) +
      (loc ? 1 : 0) +
      (prompt ? 1 : 0);

    const singleLetterMust = must.filter(s => /^[a-zA-Z]$/.test(s.trim()));
    const isOverStrict = hardCount >= 7 || must.length >= 4 || (googleSkillsMatch === 'all' && nice.length >= 5);

    const messages: string[] = [];
    if (singleLetterMust.length) {
      messages.push(`Single-letter skills (${singleLetterMust.join(', ')}) often reduce results. Consider moving them to Nice-to-have.`);
    }
    if (isOverStrict) {
      messages.push('This query is quite strict. For more results, move more items to Nice-to-have or switch Strictness to Broad.');
    }

    return {
      titles,
      must,
      nice,
      industries,
      hardCount,
      singleLetterMust,
      isOverStrict,
      messages,
      show: messages.length > 0 && !googleUseRawXray,
    };
  })();

  const loosenGoogleQuery = () => {
    // Aim: maximize recall without losing structure.
    setGoogleStrictness('broad');
    setGoogleTitlesMatch('any');
    setGoogleSkillsMatch('any');

    const must = splitList(googleMustHaveSkills);
    const nice = splitList(googleSkills);
    const moved: string[] = [];

    // Move single-letter must-haves to nice-to-have.
    const keptMust = must.filter((s) => {
      const single = /^[a-zA-Z]$/.test(s.trim());
      if (single) moved.push(s.trim());
      return !single;
    });

    // Keep at most 2 must-haves; move the rest to nice-to-have.
    const nextMust = keptMust.slice(0, 2);
    moved.push(...keptMust.slice(2));

    const nextNice = Array.from(new Set([...nice, ...moved].map(s => s.trim()).filter(Boolean)));
    setGoogleMustHaveSkills(nextMust.join(', '));
    setGoogleSkills(nextNice.join(', '));

    toast.success('Loosened query for better recall');
  };

  const toggleLeadFilterToken = (token: string) => {
    const t = String(token || '').trim();
    if (!t) return;
    const current = leadKeywordFilters
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const exists = current.some((x) => x.toLowerCase() === t.toLowerCase());
    const next = exists
      ? current.filter((x) => x.toLowerCase() !== t.toLowerCase())
      : [...current, t];
    setLeadKeywordFilters(next.join(', '));
    setLeadPage(1);
  };

  const leadSuggestedTokens = (() => {
    if (!isLinkedInMode) return [];
    const raw = [
      ...splitList(googleMustHaveSkills),
      ...splitList(googleSkills),
      ...splitList(googleTitles),
      ...splitList(googleIndustries),
    ];
    const dedup = Array.from(new Set(raw.map(s => s.trim()).filter(Boolean)));
    return dedup.slice(0, 12);
  })();

  // Sort results
  const sortedDisplayedRows = [...displayedRows].sort((a, b) => {
    if (sortColumn === 'default') return 0;

    const isGoogleRow = displayModeForRow === 'google';
    let aVal, bVal;

    if (sortColumn === 'name') {
      aVal = isGoogleRow
        ? (a?.title ? String(a.title).replace(/\s*\|\s*LinkedIn\s*$/i, '') : '')
        : (a?.full_name || '');
      bVal = isGoogleRow
        ? (b?.title ? String(b.title).replace(/\s*\|\s*LinkedIn\s*$/i, '') : '')
        : (b?.full_name || '');
    } else if (sortColumn === 'title') {
      aVal = isGoogleRow ? (a?.snippet || '') : (a?.headline || '');
      bVal = isGoogleRow ? (b?.snippet || '') : (b?.headline || '');
    } else if (sortColumn === 'score') {
      aVal = a?.match_score || 0;
      bVal = b?.match_score || 0;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return sortDirection === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  const searchResultsPane = (
    <div className="space-y-3">
      {/* Filter Chips */}
      {(leadKeywordFilters || Number.isFinite(leadMinScore) && leadMinScore > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Active Filters:</span>
          {leadKeywordFilters && leadKeywordFilters.split(',').map(k => k.trim()).filter(Boolean).map(keyword => (
            <Badge
              key={keyword}
              variant="secondary"
              className="bg-recruiter/10 text-recruiter border-recruiter/20 font-sans px-2.5 py-1 cursor-pointer hover:bg-recruiter/20"
              onClick={() => toggleLeadFilterToken(keyword)}
            >
              {keyword}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          ))}
          {Number.isFinite(leadMinScore) && leadMinScore > 0 && (
            <Badge
              variant="secondary"
              className="bg-recruiter/10 text-recruiter border-recruiter/20 font-sans px-2.5 py-1 cursor-pointer hover:bg-recruiter/20"
              onClick={() => setLeadMinScore(Number.NEGATIVE_INFINITY)}
            >
              Min Score: {leadMinScore}%
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Checkbox
          checked={allVisibleSelected}
          onCheckedChange={() => selectAllVisible(displayedKeys)}
          aria-label="Select all"
          className="shrink-0"
        />
        <div className="text-xs font-sans font-medium shrink-0">
          {isLinkedInMode
            ? (
              <>
                Showing{' '}
                <span className="text-foreground">
                  {googleFilteredCount === 0 ? 0 : (googlePageStartIndex + 1)}
                  {googleFilteredCount === 0 ? '' : `–${Math.min(googleFilteredCount, googlePageEndIndex)}`}
                </span>
                {' '}of{' '}
                <span className="text-foreground">{googleFilteredCount}</span> leads
              </>
            )
            : `${displayedRows.length} profiles shown`}
        </div>
        {isLinkedInMode && (googlePagingEnabled || googleHasMore) && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
                <span className="text-xs font-sans px-1.5">
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
                onClick={handleLoadMoreGoogle}
                disabled={googleSearch.isPending || googleIsLoadingAll}
              >
                {googleSearch.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                {effectiveLinkedInProvider === 'serpapi' ? 'Load next page' : 'Load more'}
              </Button>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0" />

        {/* Manual Filters Toggle */}
        {isLinkedInMode && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter className="h-3 w-3 mr-1" />
            Filters
          </Button>
        )}

        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <ArrowUpDown className="h-3 w-3 mr-1" />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setSortColumn('default'); setSortDirection('desc'); }}>
              Default Order
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setSortColumn('name'); setSortDirection('asc'); }}>
              <ArrowUp className="h-3 w-3 mr-2" />
              Name (A-Z)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setSortColumn('name'); setSortDirection('desc'); }}>
              <ArrowDown className="h-3 w-3 mr-2" />
              Name (Z-A)
            </DropdownMenuItem>
            {isLinkedInMode && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setSortColumn('score'); setSortDirection('desc'); }}>
                  <ArrowDown className="h-3 w-3 mr-2" />
                  Score (High to Low)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortColumn('score'); setSortDirection('asc'); }}>
                  <ArrowUp className="h-3 w-3 mr-2" />
                  Score (Low to High)
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export CSV */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            const timestamp = new Date().toISOString().split('T')[0];
            exportToCSV(`talent-search-${timestamp}.csv`);
            toast.success(`Exported ${displayedRows.length} results`);
          }}
          disabled={displayedRows.length === 0}
        >
          <Download className="h-3 w-3 mr-1" />
          Export
        </Button>

        {/* Saved Searches */}
        <DropdownMenu open={savedSearchMenuOpen} onOpenChange={setSavedSearchMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Saved
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Saved Searches</div>
            <DropdownMenuSeparator />
            {(!savedSearches || savedSearches.length === 0) ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">No saved searches yet</div>
            ) : (
              <>
                {savedSearches.filter((s: any) => s.is_favorite).map((search: any) => (
                  <DropdownMenuItem key={search.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="truncate text-xs">{search.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSavedSearchMutation.mutate(search.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </DropdownMenuItem>
                ))}
                {savedSearches.filter((s: any) => s.is_favorite).length > 0 && savedSearches.filter((s: any) => !s.is_favorite).length > 0 && (
                  <DropdownMenuSeparator />
                )}
                {savedSearches.filter((s: any) => !s.is_favorite).map((search: any) => (
                  <DropdownMenuItem key={search.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Star
                        className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-yellow-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavoriteMutation.mutate({ id: search.id, isFavorite: true });
                        }}
                      />
                      <span className="truncate text-xs">{search.name}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSavedSearchMutation.mutate(search.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSaveSearchDialogOpen(true)}>
              <Save className="h-3 w-3 mr-2" />
              Save Current Search
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          onClick={handleImportSelected}
          disabled={selectedKeys.size === 0 || importProfiles.isPending || importGoogleLeads.isPending}
          size="sm"
          className="shrink-0 h-7 text-xs"
        >
          {(isLinkedInMode ? importGoogleLeads.isPending : importProfiles.isPending) ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          {isLinkedInMode ? 'Import to Talent Pool' : 'Import'} {selectedKeys.size || ''}
        </Button>
      </div>

      {/* Manual Filters Sidebar */}
      {isLinkedInMode && filtersOpen && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold font-display">Refine Results</h4>
            <Button variant="ghost" size="sm" onClick={() => setFiltersOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Min Score Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-sans font-medium">Minimum Match Score</Label>
            <div className="flex items-center gap-2">
              <Slider
                min={0}
                max={100}
                step={5}
                value={[Number.isFinite(leadMinScore) ? leadMinScore : 0]}
                onValueChange={([val]) => setLeadMinScore(val)}
                className="flex-1"
              />
              <span className="text-xs font-medium w-10 text-right">
                {Number.isFinite(leadMinScore) ? leadMinScore : 0}%
              </span>
            </div>
          </div>

          {/* Keyword Match Filter */}
          <div className="space-y-2">
            <Label className="text-xs font-sans font-medium">Keyword Filters</Label>
            <Input
              placeholder="comma, separated, keywords"
              value={leadKeywordFilters}
              onChange={(e) => setLeadKeywordFilters(e.target.value)}
              className="text-xs"
            />
            <div className="flex items-center gap-2">
              <Label className="text-xs">Match:</Label>
              <ToggleGroup type="single" value={leadKeywordMatch} onValueChange={(v) => v && setLeadKeywordMatch(v as 'any' | 'all')}>
                <ToggleGroupItem value="any" className="text-xs h-7 px-2">Any</ToggleGroupItem>
                <ToggleGroupItem value="all" className="text-xs h-7 px-2">All</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {leadSuggestedTokens.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Suggested:</Label>
                <div className="flex flex-wrap gap-1">
                  {leadSuggestedTokens.map((token) => (
                    <Badge
                      key={token}
                      variant="outline"
                      className="cursor-pointer text-xs py-0"
                      onClick={() => toggleLeadFilterToken(token)}
                    >
                      {token}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              setLeadMinScore(Number.NEGATIVE_INFINITY);
              setLeadKeywordFilters('');
              setLeadKeywordMatch('any');
            }}
          >
            Clear All Filters
          </Button>
        </div>
      )}

      {searchMode === 'web' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {webPages.length > 0 && (
              <div className="text-xs mr-1">Pages</div>
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
                  setSearchResults(p.results || []);
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
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="min-h-0 overflow-y-auto p-1.5">
          <div className="space-y-1">
            {sortedDisplayedRows.map((row: any, i: number) => {
              const key = rowKey(displayModeForRow, row, i);
              const isSelected = selectedKeys.has(key);
              const isGoogleRow = displayModeForRow === 'google';
              const title =
                isGoogleRow
                  ? (row?.title ? String(row.title).replace(/\s*\|\s*LinkedIn\s*$/i, '') : 'LinkedIn Profile')
                  : (row?.full_name || 'Unknown');
              const subtitle =
                isGoogleRow
                  ? (row?.snippet ? String(row.snippet) : '')
                  : (row?.headline ? String(row.headline) : (row?.summary ? String(row.summary) : (row?.source_excerpt ? String(row.source_excerpt) : '')));
              const url =
                isGoogleRow
                  ? row?.linkedin_url
                  : (row?.linkedin_url || row?.website || row?.source_url);
              const isImportPending =
                (isLinkedInMode && importGoogleLeads.isPending) || (!isLinkedInMode && importProfiles.isPending);

              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveResultKey(key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveResultKey(key); } }}
                  className={`group flex items-center gap-2 py-2 px-3 rounded-xl border border-border bg-card text-xs font-sans transition-all cursor-pointer hover:border-recruiter/30 hover:bg-recruiter/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30 focus-visible:ring-offset-2 ${key === activeResultKey ? 'ring-2 ring-recruiter/30 border-recruiter/20 bg-recruiter/5' : ''}`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleRowSelection(key)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 h-3.5 w-3.5"
                  />
                  <span className="font-display font-semibold truncate text-xs min-w-[200px] max-w-[260px] shrink-0 basis-[220px] text-foreground group-hover:text-recruiter transition-colors" title={title}>
                    {title}
                  </span>
                  <span className="truncate flex-1 min-w-0 text-xs font-sans" title={subtitle || undefined}>
                    {subtitle ? String(subtitle).trim().slice(0, 180) + (String(subtitle).length > 180 ? '…' : '') : '—'}
                  </span>
                  {isLinkedInMode && row?.open_to_work_signal ? (
                    <Badge variant="outline" className="text-xs shrink-0 py-0">Open to work</Badge>
                  ) : null}
                  {typeof row?.match_score === 'number' && (
                    <Badge variant="secondary" className="shrink-0 text-xs py-0">
                      {Math.round(row.match_score)}%
                    </Badge>
                  )}
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 p-0.5 rounded-lg hover:bg-recruiter/10 text-muted-foreground hover:text-recruiter focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-recruiter/30"
                      onClick={(e) => e.stopPropagation()}
                      title={isGoogleRow ? 'Open LinkedIn' : 'Open link'}
                    >
                      {isGoogleRow ? <Linkedin className="h-4 w-4" strokeWidth={1.5} /> : <LinkIcon className="h-4 w-4" strokeWidth={1.5} />}
                    </a>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="shrink-0 h-8 rounded-lg text-xs px-3 border border-recruiter/20 bg-recruiter/5 hover:bg-recruiter/10 text-recruiter font-sans font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleImportRow(row);
                    }}
                    disabled={isImportPending}
                  >
                    {isImportPending ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> : <Plus className="h-3 w-3 mr-1" strokeWidth={1.5} />}
                    Import
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  // Determine page title based on section
  const pageTitle = currentSection === 'uploads' ? 'Bulk Upload Profiles' : currentSection === 'search' ? 'Talent Search' : 'API Integration';
  const pageDescription = currentSection === 'uploads'
    ? 'Upload resumes to parse, score, and import'
    : currentSection === 'search'
      ? 'Search and preview candidates'
      : 'API integration for candidate imports';

  return (
    <DashboardLayout>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        {/* Page header - fixed, does not scroll */}
        <header className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className={`p-2 rounded-xl border shrink-0 ${currentSection === 'search' ? 'bg-recruiter/10 text-recruiter border-recruiter/20' : 'bg-recruiter/10 text-recruiter border-recruiter/20'}`}>
                  {currentSection === 'search' ? <Search className="h-5 w-5" strokeWidth={1.5} /> : <Globe className="h-5 w-5" strokeWidth={1.5} />}
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  {currentSection === 'uploads' && <>Bulk Upload <span className="text-gradient-recruiter">Profiles</span></>}
                  {currentSection === 'search' && <>Talent <span className="text-gradient-recruiter">Search</span></>}
                  {currentSection === 'api' && <>API <span className="text-gradient-recruiter">Integration</span></>}
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                {currentSection === 'uploads' && 'Upload resumes to parse, score, and add to your Talent Pool.'}
                {currentSection === 'search' && 'Search the web and LinkedIn for candidates. Preview, then import the best matches into your Talent Pool.'}
                {currentSection === 'api' && 'Connect to job boards, ATS, and approved data providers.'}
              </p>
            </div>
          </div>
        </header>

        {/* Content area: for search section use flex column so Results card can scroll internally; otherwise single scroll region */}
        <div className={currentSection === 'search' ? 'flex flex-col flex-1 min-h-0 min-w-0' : 'flex-1 min-h-0 overflow-y-auto'}>
          <div className={currentSection === 'search' ? 'flex flex-col flex-1 min-h-0 gap-6 pt-6 pb-6' : 'space-y-6 pt-6 pb-6'}>
        {/* Search/Upload card - section header + content */}
        <div className={`rounded-xl border border-border bg-card overflow-hidden min-w-0 ${currentSection === 'search' ? 'shrink-0' : ''}`}>
          <div className="p-6">
            {/* Uploads Section */}
            {currentSection === 'uploads' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-recruiter shrink-0" strokeWidth={1.5} />
                  <h2 className="text-lg font-display font-bold text-foreground">Upload resumes</h2>
                </div>
                <p className="text-sm text-muted-foreground font-sans">Parse, score, and add to your Talent Pool.</p>

                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-recruiter/30 hover:bg-recruiter/5 transition-colors">
                  <input
                    type="file"
                    id="resume-upload"
                    multiple
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <label htmlFor="resume-upload" className="cursor-pointer block">
                    <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-base font-display font-semibold text-foreground mb-1">Drop resumes here or click to upload</p>
                    <p className="text-sm font-sans text-muted-foreground">
                      PDF, DOC, DOCX, TXT • Auto-imports with a generic resume-quality score
                    </p>
                  </label>
                </div>
              </div>
            )}

            {/* Search Section */}
            {currentSection === 'search' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-recruiter shrink-0" strokeWidth={1.5} />
                  <h2 className="text-lg font-display font-bold text-foreground">How to search</h2>
                </div>
                <p className="text-sm text-muted-foreground font-sans">
                  Choose general web search or targeted LinkedIn (Google X-Ray or Serp).
                </p>

                <div className="flex flex-col gap-4">
                  {/* Sub-tabs: Web Search, Google X-Ray, Serp Search - shrink-0 so content below can flex */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1 font-sans">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchMode('web')}
                        className={`h-9 px-4 rounded-lg font-sans ${searchMode === 'web'
                          ? 'bg-recruiter/10 text-recruiter border border-recruiter/20 font-semibold'
                          : 'hover:bg-recruiter/5 hover:text-recruiter'
                          }`}
                      >
                        <Globe className="h-4 w-4 mr-2" strokeWidth={1.5} />
                        Web Search
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchMode('basic')}
                        className={`h-9 px-4 rounded-lg font-sans ${searchMode === 'basic'
                          ? 'bg-recruiter/10 text-recruiter border border-recruiter/20 font-semibold'
                          : 'hover:bg-recruiter/5 hover:text-recruiter'
                          }`}
                      >
                        <Linkedin className="h-4 w-4 mr-2" strokeWidth={1.5} />
                        Google X-Ray
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchMode('deep')}
                        className={`h-9 px-4 rounded-lg font-sans ${searchMode === 'deep'
                          ? 'bg-recruiter/10 text-recruiter border border-recruiter/20 font-semibold'
                          : 'hover:bg-recruiter/5 hover:text-recruiter'
                          }`}
                      >
                        <Linkedin className="h-4 w-4 mr-2" strokeWidth={1.5} />
                        Serp Search
                      </Button>
                    </div>
                  </div>

                  {/* Web: search bar workspace */}
                  {searchMode === 'web' && (
                    <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm text-muted-foreground font-sans">
                            Search the web for candidate profiles and pages. Preview below, then import the best matches into your Talent Pool.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <Sheet open={webFiltersOpen} onOpenChange={setWebFiltersOpen}>
                            <Button type="button" variant="outline" size="sm" onClick={() => setWebFiltersOpen(true)} className="h-9 rounded-lg border-border font-sans hover:bg-recruiter/5 hover:border-recruiter/20">
                              <SlidersHorizontal className="h-4 w-4 mr-2" strokeWidth={1.5} />
                              Filters
                            </Button>
                            <SheetContent side="right" className="w-full sm:max-w-md rounded-xl border-border">
                              <SheetHeader>
                                <SheetTitle className="font-display font-bold">Web search filters</SheetTitle>
                                <SheetDescription className="font-sans">Keep it simple; refine only when needed.</SheetDescription>
                              </SheetHeader>
                              <div className="mt-5 space-y-5">
                                <div className="space-y-2">
                                  <div className="text-sm font-sans font-medium">Scope</div>
                                  <div className="grid gap-3">
                                    <div className="space-y-1">
                                      <label className="text-sm font-sans text-muted-foreground">Country</label>
                                      <Select value={webCountry} onValueChange={(v) => setWebCountry(v as any)}>
                                        <SelectTrigger className="h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans">
                                          <SelectValue placeholder="Country" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="us">United States</SelectItem>
                                          <SelectItem value="any">Any</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm font-sans select-none cursor-pointer">
                                      <Checkbox
                                        checked={webIncludeLinkedIn}
                                        onCheckedChange={(v) => setWebIncludeLinkedIn(Boolean(v))}
                                        className="rounded border-border focus:ring-2 focus:ring-recruiter/20"
                                      />
                                      Include LinkedIn results in web search
                                    </label>
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                      setWebCountry('us');
                                      setWebIncludeLinkedIn(false);
                                    }}
                                    className="rounded-lg h-11 border-border font-sans"
                                  >
                                    Reset
                                  </Button>
                                  <Button type="button" onClick={() => setWebFiltersOpen(false)} className="rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold">
                                    Done
                                  </Button>
                                </div>
                              </div>
                            </SheetContent>
                          </Sheet>
                          <Button size="sm" onClick={handleSearch} disabled={webSearchInitial.isPending} className="h-9 rounded-lg px-4 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold">
                            {webSearchInitial.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" strokeWidth={1.5} />
                            ) : (
                              <Search className="h-4 w-4 mr-2" strokeWidth={1.5} />
                            )}
                            Search
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={clearWebSearchSession}
                            disabled={webSearchInitial.isPending || webSearchMore.isPending}
                            className="h-9 rounded-lg border-border font-sans hover:bg-muted"
                          >
                            <X className="h-4 w-4 mr-2" strokeWidth={1.5} />
                            Clear
                          </Button>
                        </div>
                      </div>
                      <Input
                        placeholder="e.g. Senior Python developer, 5+ years, AWS, New York"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full h-11 rounded-lg border-border font-sans focus:ring-2 focus:ring-recruiter/20 placeholder:text-muted-foreground/70"
                      />
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs font-sans text-muted-foreground">
                        <span>
                          {webCountry === 'us' ? 'US' : 'Any'} · {webIncludeLinkedIn ? 'LinkedIn included' : 'LinkedIn excluded'} · 20 per page
                        </span>
                        {lastSearch?.mode === 'web' ? (
                          <div className="truncate">
                            Last: {format(new Date(lastSearch.ts), 'MMM d, h:mm a')} • {lastSearch.found} found
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* API Section */}
            {currentSection === 'api' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-recruiter shrink-0" strokeWidth={1.5} />
                  <h2 className="text-lg font-display font-bold text-foreground">API integration</h2>
                </div>
                <p className="text-sm text-muted-foreground font-sans">Connect to job boards, ATS, and approved data providers.</p>
                <div className="text-center py-6 rounded-xl border border-border bg-muted/20">
                  <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground" strokeWidth={1.5} />
                  <p className="font-display font-semibold text-foreground">Coming soon</p>
                  <p className="text-sm font-sans text-muted-foreground mt-1">Planned: LinkedIn (provider-based), job boards, ATS sync.</p>
                </div>
              </div>
            )}
          </div>
        </div>
        {currentSection === 'search' && searchMode !== 'web' && (
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground font-sans">
                  {searchMode === 'deep'
                    ? 'Build a LinkedIn query with filters, run via Serp API (deep pagination), then preview and import matches.'
                    : 'Build a LinkedIn query with filters, run via Google, then preview and import matches.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const x = (googleUseRawXray && googleRawXray.trim()) ? googleRawXray.trim() : buildGoogleXray();
                    try {
                      await navigator.clipboard.writeText(x);
                      toast.success('Copied');
                    } catch {
                      toast.error('Could not copy');
                    }
                  }}
                >
                  Copy query
                </Button>

                <Sheet open={googleFiltersOpen} onOpenChange={setGoogleFiltersOpen}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setGoogleFiltersOpen(true)}>
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Build Query
                  </Button>
                  <SheetContent side="right" className="w-full p-0 sm:max-w-4xl">
                    <div className="flex h-full">
                      <aside className="w-56 border-r bg-muted/20 p-3">
                        <div className="px-2 py-1 text-sm font-sans font-medium">Build query</div>

                        <div className="mt-2 space-y-1">
                          <Button
                            type="button"
                            variant={googleFiltersSection === 'general' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="w-full justify-start font-sans"
                            onClick={() => setGoogleFiltersSection('general')}
                          >
                            General
                          </Button>
                          <Button
                            type="button"
                            variant={googleFiltersSection === 'skills' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="w-full justify-start font-sans"
                            onClick={() => setGoogleFiltersSection('skills')}
                          >
                            Skills
                          </Button>
                          <Button
                            type="button"
                            variant={googleFiltersSection === 'jd' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="w-full justify-start font-sans"
                            onClick={() => setGoogleFiltersSection('jd')}
                          >
                            Build from JD
                          </Button>
                          <Button
                            type="button"
                            variant={googleFiltersSection === 'advanced' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="w-full justify-start font-sans"
                            onClick={() => setGoogleFiltersSection('advanced')}
                          >
                            Advanced
                          </Button>
                        </div>

                        <div className="mt-4 border-t pt-3">
                          <div className="px-2 text-xs font-sans">Presets</div>
                          <div className="mt-2 grid gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => applyGoogleExample({
                                titles: 'Java Backend Engineer, Spring Boot, Microservices',
                                titlesMatch: 'any',
                                skills: 'AWS, Cloud Native',
                                skillsMatch: 'any',
                                location: '"New York, NY" OR "Greater New York City Area" OR "New Jersey"',
                                seniority: 'mid',
                                usOnly: true,
                              })}
                            >
                              Java (NY/NJ)
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => applyGoogleExample({
                                titles: 'Senior Python Developer, Python Engineer',
                                titlesMatch: 'any',
                                skills: 'AWS, Lambda, FastAPI',
                                skillsMatch: 'any',
                                location: '"Boston" OR "Greater Boston"',
                                seniority: 'senior',
                                usOnly: true,
                              })}
                            >
                              Python (Boston)
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="justify-start"
                              onClick={() => applyGoogleExample({
                                titles: 'Frontend Engineer, React Developer',
                                titlesMatch: 'any',
                                skills: 'React, TypeScript, Next.js',
                                skillsMatch: 'all',
                                location: '"Washington, DC" OR "Washington DC-Baltimore Area"',
                                seniority: 'mid',
                                usOnly: true,
                              })}
                            >
                              React (DC)
                            </Button>
                          </div>
                        </div>
                      </aside>

                      <div className="flex-1 overflow-y-auto p-6">
                        <div className="flex items-start justify-between gap-3">
                          <SheetHeader className="space-y-1 text-left">
                            <SheetTitle className="font-display font-bold text-foreground">Build your query</SheetTitle>
                            <SheetDescription className="font-sans text-muted-foreground">
                              Simplicity first. Use Advanced only when you need it.
                            </SheetDescription>
                          </SheetHeader>

                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setGoogleUseRawXray(false);
                                setGoogleRawXray('');
                                setGooglePrompt('');
                                setGoogleTitles('');
                                setGoogleLocation('');
                                setGoogleIndustries('');
                                setGoogleStrictness('balanced');
                                setGoogleMustHaveSkills('');
                                setGoogleSkills('');
                                setGoogleTitlesMatch('any');
                                setGoogleSkillsMatch('any');
                                setGoogleSeniority('senior');
                                setGoogleUSOnly(true);
                                setGoogleExclude('recruiter, staffing, talent, sales, job, jobs, hiring, career');
                                setGoogleBoostOpenToWork(false);
                                setJdSource('paste');
                                setJdText('');
                                setJdJobId('');
                                setJdOptions(null);
                                setJdSelected({ must: [], nice: [], locations: [] });
                              }}
                            >
                              Reset
                            </Button>
                            <Button type="button" size="sm" onClick={() => setGoogleFiltersOpen(false)}>
                              Done
                            </Button>
                          </div>
                        </div>

                        <div className="mt-6">
                          {googleFiltersSection === 'general' && (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-2 md:col-span-2">
                                <div className="text-xs font-sans font-medium">Strictness</div>
                                <ToggleGroup
                                  type="single"
                                  value={googleStrictness}
                                  onValueChange={(v) => {
                                    if (!v) return;
                                    setGoogleStrictness(v as any);
                                  }}
                                  className="justify-start"
                                >
                                  <ToggleGroupItem value="broad" aria-label="Broad">
                                    Broad
                                  </ToggleGroupItem>
                                  <ToggleGroupItem value="balanced" aria-label="Balanced">
                                    Balanced
                                  </ToggleGroupItem>
                                  <ToggleGroupItem value="strict" aria-label="Strict">
                                    Strict
                                  </ToggleGroupItem>
                                </ToggleGroup>
                                <div className="text-[11px] font-sans text-muted-foreground">
                                  Broad finds more people; Strict requires more exact matches. Balanced is a good default.
                                </div>
                              </div>

                              {googleQuality.show ? (
                                <Alert className="md:col-span-2">
                                  <AlertCircle className="h-4 w-4" />
                                  <AlertTitle>Query might be too strict</AlertTitle>
                                  <AlertDescription>
                                    <div className="space-y-2">
                                      <div className="text-sm">
                                        {googleQuality.messages[0]}
                                      </div>
                                      {googleQuality.messages.length > 1 ? (
                                        <div className="text-sm">
                                          {googleQuality.messages[1]}
                                        </div>
                                      ) : null}
                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={loosenGoogleQuery}
                                        >
                                          Loosen automatically
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setGoogleStrictness('broad')}
                                        >
                                          Set Broad
                                        </Button>
                                      </div>
                                    </div>
                                  </AlertDescription>
                                </Alert>
                              ) : null}

                              <div className="space-y-1 md:col-span-2">
                                <div className="text-xs">Prompt (optional)</div>
                                <Input
                                  value={googlePrompt}
                                  onChange={(e) => setGooglePrompt(e.target.value)}
                                  placeholder='e.g., "cloud security engineer" with Python and AWS in healthcare'
                                  disabled={googleUseRawXray}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs font-sans font-medium">Titles</div>
                                <Input
                                  value={googleTitles}
                                  onChange={(e) => setGoogleTitles(e.target.value)}
                                  placeholder='e.g., "Java Backend Engineer", "Spring Boot"'
                                  disabled={googleUseRawXray}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs font-sans font-medium">Location</div>
                                <Input
                                  value={googleLocation}
                                  onChange={(e) => setGoogleLocation(e.target.value)}
                                  placeholder='e.g., "New York, NY" OR "Boston"'
                                  disabled={googleUseRawXray}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs">Industries</div>
                                <Input
                                  value={googleIndustries}
                                  onChange={(e) => setGoogleIndustries(e.target.value)}
                                  placeholder='e.g., FinTech, Healthcare, Robotics'
                                  disabled={googleUseRawXray}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs font-sans font-medium">Seniority</div>
                                <Select
                                  value={googleSeniority}
                                  onValueChange={(v) => setGoogleSeniority(v as any)}
                                  disabled={googleUseRawXray}
                                >
                                  <SelectTrigger disabled={googleUseRawXray}>
                                    <SelectValue placeholder="Seniority" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="any">Any</SelectItem>
                                    <SelectItem value="junior">Junior</SelectItem>
                                    <SelectItem value="mid">Mid</SelectItem>
                                    <SelectItem value="senior">Senior</SelectItem>
                                    <SelectItem value="staff">Staff+</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs font-sans font-medium">US-only</div>
                                <label className="flex items-center gap-2 text-sm font-sans select-none pt-2">
                                  <Checkbox
                                    checked={googleUSOnly}
                                    onCheckedChange={(v) => setGoogleUSOnly(Boolean(v))}
                                    disabled={googleUseRawXray}
                                  />
                                  Enable
                                </label>
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <div className="text-xs font-sans font-medium">Exhaustive search</div>
                                <label className="flex items-center gap-2 text-sm font-sans select-none pt-1">
                                  <Checkbox
                                    checked={googleExhaustiveEnabled}
                                    onCheckedChange={(v) => setGoogleExhaustiveEnabled(Boolean(v))}
                                    disabled={googleUseRawXray}
                                  />
                                  Run multiple queries (dedupe results)
                                </label>
                                {googleExhaustiveEnabled ? (
                                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                                    <div className="space-y-1">
                                      <div className="text-[11px] font-sans">Split by</div>
                                      <Select value={googleExhaustiveStrategy} onValueChange={(v) => setGoogleExhaustiveStrategy(v as any)}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Strategy" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="auto">Auto</SelectItem>
                                          <SelectItem value="location">Location</SelectItem>
                                          <SelectItem value="title">Title</SelectItem>
                                          <SelectItem value="industry">Industry</SelectItem>
                                          <SelectItem value="skill">Skill</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="text-[11px] font-sans">Target leads</div>
                                      <Input
                                        value={String(googleExhaustiveTarget)}
                                        onChange={(e) => setGoogleExhaustiveTarget(Math.max(50, Math.min(5000, Number(e.target.value) || 0)))}
                                        inputMode="numeric"
                                        placeholder="500"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <div className="text-[11px] font-sans">Max queries</div>
                                      <Select value={String(googleExhaustiveMaxQueries)} onValueChange={(v) => setGoogleExhaustiveMaxQueries(Math.max(1, Math.min(100, Number(v) || 20)))}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="20" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="5">5</SelectItem>
                                          <SelectItem value="10">10</SelectItem>
                                          <SelectItem value="20">20</SelectItem>
                                          <SelectItem value="50">50</SelectItem>
                                          <SelectItem value="100">100</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                ) : null}
                                {googleExhaustiveEnabled ? (
                                  <div className="mt-2 rounded-lg border bg-muted/20 p-3 space-y-2 md:col-span-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs font-sans font-medium">Auto split wizard</div>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => {
                                            setGoogleExhaustiveBucketKind(null);
                                            setGoogleExhaustiveBuckets([]); // let the runner pick best dimension + defaults
                                            toast.success('Auto split will choose buckets when you run');
                                          }}
                                        >
                                          Use automatic buckets
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => {
                                            const kind =
                                              googleExhaustiveStrategy === 'auto'
                                                ? 'auto'
                                                : googleExhaustiveStrategy;
                                            const defaults =
                                              kind === 'location'
                                                ? (googleUSOnly
                                                  ? ['California', 'New York', 'Texas', 'Florida', 'Washington', 'Massachusetts', 'Illinois', 'New Jersey', 'Pennsylvania', 'Georgia', 'North Carolina', 'Virginia', 'Colorado', 'Arizona', 'Michigan', 'Ohio', 'Minnesota', 'Tennessee', 'Oregon', 'Maryland']
                                                  : ['London', 'Toronto', 'Vancouver', 'Dublin', 'Berlin', 'Amsterdam', 'Paris', 'Singapore', 'Sydney', 'Melbourne', 'Bangalore', 'Hyderabad'])
                                                : kind === 'industry'
                                                  ? ['FinTech', 'Healthcare', 'SaaS', 'E-commerce', 'Cybersecurity', 'Robotics', 'EdTech', 'Biotech', 'Climate', 'AI']
                                                  : kind === 'skill'
                                                    ? ['SQL', 'Pandas', 'NumPy', 'scikit-learn', 'TensorFlow', 'PyTorch', 'Spark', 'AWS']
                                                    : ['Data Scientist', 'Data Analyst', 'Machine Learning Engineer', 'Applied Scientist', 'Analytics Engineer', 'Research Scientist'];

                                            setGoogleExhaustiveBucketKind(kind === 'auto' ? null : (kind as any));
                                            setGoogleExhaustiveBuckets(defaults);
                                            toast.success(`Generated ${defaults.length} buckets`);
                                          }}
                                        >
                                          Generate preview
                                        </Button>
                                        {googleExhaustiveBuckets.length ? (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => {
                                              setGoogleExhaustiveBuckets([]);
                                              setGoogleExhaustiveBucketKind(null);
                                            }}
                                          >
                                            Clear
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>

                                    {googleExhaustiveBuckets.length ? (
                                      <div className="text-[11px]">
                                        Using {googleExhaustiveBuckets.length} buckets ({googleExhaustiveBucketKind})
                                      </div>
                                    ) : (
                                      <div className="text-[11px]">
                                        If you don’t provide lists, we can automatically split into buckets (e.g., top locations or title variants).
                                      </div>
                                    )}

                                    {googleExhaustiveBuckets.length ? (
                                      <div className="flex flex-wrap gap-2">
                                        {googleExhaustiveBuckets.slice(0, 10).map((b) => (
                                          <Badge key={b} variant="secondary" className="text-xs">
                                            {b}
                                          </Badge>
                                        ))}
                                        {googleExhaustiveBuckets.length > 10 ? (
                                          <Badge variant="outline" className="text-xs">
                                            +{googleExhaustiveBuckets.length - 10} more
                                          </Badge>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                                <div className="text-[11px]">
                                  This runs multiple narrower queries across your lists and dedupes the results.
                                </div>
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <div className="text-xs font-sans font-medium">Open to work</div>
                                <label className="flex items-center gap-2 text-sm font-sans select-none pt-1">
                                  <Checkbox
                                    checked={googleBoostOpenToWork}
                                    onCheckedChange={(v) => setGoogleBoostOpenToWork(Boolean(v))}
                                  />
                                  Boost results (soft signal)
                                </label>
                                <div className="text-[11px]">
                                  Runs an extra search for “open to work” phrases and merges results (doesn’t exclude anyone).
                                </div>
                              </div>
                            </div>
                          )}

                          {googleFiltersSection === 'skills' && (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <div className="text-xs">Must-have skills (comma-separated)</div>
                                <Input
                                  value={googleMustHaveSkills}
                                  onChange={(e) => setGoogleMustHaveSkills(e.target.value)}
                                  placeholder="e.g., Python, AWS"
                                  disabled={googleUseRawXray}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs font-sans font-medium">Nice-to-have skills (comma-separated)</div>
                                <Input
                                  value={googleSkills}
                                  onChange={(e) => setGoogleSkills(e.target.value)}
                                  placeholder="e.g., Terraform, Kubernetes, GitLab"
                                  disabled={googleUseRawXray}
                                />
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs">Nice-to-have match</div>
                                <Select
                                  value={googleSkillsMatch}
                                  onValueChange={(v) => setGoogleSkillsMatch(v as any)}
                                  disabled={googleUseRawXray}
                                >
                                  <SelectTrigger disabled={googleUseRawXray}>
                                    <SelectValue placeholder="Match" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="any">Any (OR)</SelectItem>
                                    <SelectItem value="all">All (AND)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <div className="text-xs">Titles match</div>
                                <Select
                                  value={googleTitlesMatch}
                                  onValueChange={(v) => setGoogleTitlesMatch(v as any)}
                                  disabled={googleUseRawXray}
                                >
                                  <SelectTrigger disabled={googleUseRawXray}>
                                    <SelectValue placeholder="Match" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="any">Any (OR)</SelectItem>
                                    <SelectItem value="all">All (AND)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}

                          {googleFiltersSection === 'jd' && (
                            <div className="rounded-xl border bg-background p-4 space-y-4">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <div className="text-xs">JD source</div>
                                  <Select
                                    value={jdSource}
                                    onValueChange={(v) => {
                                      const next = v as any;
                                      setJdSource(next);
                                      if (next === 'job' && postedJobs.length === 0) void loadPostedJobs();
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="JD source" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="paste">Paste JD</SelectItem>
                                      <SelectItem value="job">From posted job</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                {jdSource === 'job' ? (
                                  <div className="space-y-1">
                                    <div className="text-xs">Posted job</div>
                                    <Select
                                      value={jdJobId}
                                      onValueChange={(id) => {
                                        setJdJobId(id);
                                        const job = postedJobs.find((j) => j.id === id);
                                        if (job) {
                                          setJdText(job.description || '');
                                          if (job.location && !googleLocation.trim()) {
                                            const loc = String(job.location || '').trim();
                                            const looksLikeWorkMode =
                                              /^(remote|hybrid|on[- ]?site)$/i.test(loc) ||
                                              /\b(remote|hybrid|on[- ]?site)\b/i.test(loc);
                                            if (!looksLikeWorkMode) setGoogleLocation(`"${loc.replace(/"/g, '')}"`);
                                          }
                                        }
                                      }}
                                    >
                                      <SelectTrigger disabled={isLoadingJobs || (postedJobs.length === 0 && jobsLoadAttempted && Boolean(jobsLoadError))}>
                                        <SelectValue
                                          placeholder={
                                            isLoadingJobs
                                              ? 'Loading…'
                                              : (postedJobs.length === 0 && jobsLoadAttempted && jobsLoadError)
                                                ? 'Could not load jobs'
                                                : 'Select a job'
                                          }
                                        />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {postedJobs.map((j) => (
                                          <SelectItem key={j.id} value={j.id}>
                                            {j.title}{j.status ? ` (${j.status})` : ''}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {(postedJobs.length === 0 && jobsLoadAttempted && jobsLoadError) ? (
                                      <div className="flex items-center justify-between gap-2 pt-1">
                                        <div className="text-[11px]truncate">
                                          {jobsLoadError}
                                        </div>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => {
                                            setJobsLoadAttempted(false);
                                            setJobsLoadError(null);
                                            void loadPostedJobs();
                                          }}
                                        >
                                          Retry
                                        </Button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>

                              <div className="space-y-1">
                                <div className="text-xs">Job description</div>
                                <Textarea
                                  value={jdText}
                                  onChange={(e) => setJdText(e.target.value)}
                                  placeholder="Paste job description here…"
                                  className="min-h-[140px]"
                                />
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setJdText('');
                                    setJdJobId('');
                                    setJdOptions(null);
                                    setJdSelected({ must: [], nice: [], locations: [] });
                                  }}
                                  disabled={buildXrayFromJd.isPending}
                                >
                                  Clear
                                </Button>
                                <Button
                                  type="button"
                                  onClick={() => {
                                    const job = jdSource === 'job' ? postedJobs.find((j) => j.id === jdJobId) : null;
                                    const locationHint = job?.location || null;
                                    buildXrayFromJd.mutate({ jd_text: jdText, target_location: locationHint });
                                  }}
                                  disabled={buildXrayFromJd.isPending || !jdText.trim()}
                                >
                                  {buildXrayFromJd.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                  Build
                                </Button>
                              </div>

                              {jdOptions ? (
                                <div className="rounded-xl border bg-muted/20 p-3">
                                  <div className="text-sm font-medium">Suggested skills</div>
                                  <div className="text-xs">
                                    Toggle to include/exclude. This updates the query immediately.
                                  </div>

                                  <div className="grid gap-3 mt-3 sm:grid-cols-2">
                                    {jdOptions.must.length ? (
                                      <div className="space-y-2">
                                        <div className="text-xs">Must-have (AND)</div>
                                        <div className="flex flex-wrap gap-2">
                                          {jdOptions.must.map((s) => {
                                            const on = jdSelected.must.includes(s);
                                            return (
                                              <Button
                                                key={s}
                                                type="button"
                                                size="sm"
                                                variant={on ? 'secondary' : 'outline'}
                                                className="h-7 px-2 text-xs"
                                                onClick={() => {
                                                  setJdSelected((prev) => ({
                                                    ...prev,
                                                    must: on ? prev.must.filter((x) => x !== s) : Array.from(new Set([...prev.must, s])),
                                                  }));
                                                }}
                                              >
                                                {s}
                                              </Button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : null}

                                    {jdOptions.nice.length ? (
                                      <div className="space-y-2">
                                        <div className="text-xs">Nice-to-have</div>
                                        <div className="flex flex-wrap gap-2">
                                          {jdOptions.nice.map((s) => {
                                            const on = jdSelected.nice.includes(s);
                                            return (
                                              <Button
                                                key={s}
                                                type="button"
                                                size="sm"
                                                variant={on ? 'secondary' : 'outline'}
                                                className="h-7 px-2 text-xs"
                                                onClick={() => {
                                                  setJdSelected((prev) => ({
                                                    ...prev,
                                                    nice: on ? prev.nice.filter((x) => x !== s) : Array.from(new Set([...prev.nice, s])),
                                                  }));
                                                }}
                                              >
                                                {s}
                                              </Button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}

                          {googleFiltersSection === 'advanced' && (
                            <div className="space-y-4">
                              <div className="space-y-1">
                                <div className="text-xs">Exclude</div>
                                <Input
                                  value={googleExclude}
                                  onChange={(e) => setGoogleExclude(e.target.value)}
                                  placeholder="e.g., recruiter, staffing, jobs"
                                  disabled={googleUseRawXray}
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-sans flex items-center gap-2">
                                    <span>Final query</span>
                                    {googleUseRawXray ? (
                                      <Badge variant="secondary" className="h-5 px-2 text-[10px]">Manual</Badge>
                                    ) : null}
                                  </div>
                                  <label className="flex items-center gap-2 text-sm font-sans select-none">
                                    <Checkbox
                                      checked={googleUseRawXray}
                                      onCheckedChange={(v) => {
                                        const next = Boolean(v);
                                        setGoogleUseRawXray(next);
                                        if (next && !googleRawXray.trim()) setGoogleRawXray(buildGoogleXray());
                                        if (!next) setGoogleRawXray('');
                                      }}
                                    />
                                    Manual
                                  </label>
                                </div>
                                <Textarea
                                  value={googleUseRawXray ? googleRawXray : buildGoogleXray()}
                                  onChange={(e) => setGoogleRawXray(e.target.value)}
                                  className="min-h-[120px]"
                                  readOnly={!googleUseRawXray}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>

                <Button
                  onClick={() => {
                    if (isLinkedInMode && googleExhaustiveEnabled) void handleExhaustiveGoogleSearch();
                    else void handleSearch();
                  }}
                  disabled={googleSearch.isPending || googleExhaustiveState.running}
                >
                  {(googleSearch.isPending || googleExhaustiveState.running) ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  {googleExhaustiveEnabled ? 'Exhaustive search' : 'Search'}
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-muted/30 p-2 text-[11px] break-words">
              {googleUseRawXray ? googleRawXray : buildGoogleXray()}
            </div>

            <div className="flex flex-wrap gap-2">
              {googleUseRawXray ? (
                <Badge variant="secondary" className="text-xs">Manual query</Badge>
              ) : null}
              {googleBoostOpenToWork ? (
                <Badge variant="secondary" className="text-xs">Boost: open to work</Badge>
              ) : null}
              {googleTitles.split(',').map(s => s.trim()).filter(Boolean).length ? (
                <Badge variant="secondary" className="text-xs">
                  Titles: {googleTitles.split(',').map(s => s.trim()).filter(Boolean).length}
                </Badge>
              ) : null}
              {googleMustHaveSkills.split(',').map(s => s.trim()).filter(Boolean).length ? (
                <Badge variant="secondary" className="text-xs">
                  Must-have: {googleMustHaveSkills.split(',').map(s => s.trim()).filter(Boolean).length}
                </Badge>
              ) : null}
              {googleSkills.split(',').map(s => s.trim()).filter(Boolean).length ? (
                <Badge variant="secondary" className="text-xs">
                  Nice-to-have: {googleSkills.split(',').map(s => s.trim()).filter(Boolean).length}
                </Badge>
              ) : null}
              {googleLocation.trim() ? (
                <Badge variant="secondary" className="text-xs">Location</Badge>
              ) : null}
              <Badge variant="secondary" className="text-xs">
                Seniority: {googleSeniority}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {googleUSOnly ? 'US-only' : 'Any country'}
              </Badge>
            </div>
          </div>
        )}

        {currentSection === 'search' && searchMode === 'web' && (
          <Collapsible open={webExamplesOpen} onOpenChange={setWebExamplesOpen} className="shrink-0">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="justify-start px-2 rounded-lg font-sans text-muted-foreground hover:text-recruiter hover:bg-recruiter/5">
                Example searches
                <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${webExamplesOpen ? 'rotate-180' : ''}`} strokeWidth={1.5} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 px-3 rounded-lg text-xs font-sans border-border hover:bg-recruiter/5 hover:border-recruiter/20"
                  onClick={() => applyWebExample('Senior Python developer AWS New York')}
                >
                  Python + AWS (NY)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 px-3 rounded-lg text-xs font-sans border-border hover:bg-recruiter/5 hover:border-recruiter/20"
                  onClick={() => applyWebExample('Java Spring Boot microservices New Jersey')}
                >
                  Java + Spring (NJ)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 px-3 rounded-lg text-xs font-sans border-border hover:bg-recruiter/5 hover:border-recruiter/20"
                  onClick={() => applyWebExample('Data Scientist healthcare Boston')}
                >
                  Data Science (Boston)
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Results */}
        {currentSection === 'uploads' && (
          <Card className="min-w-0">
            <CardHeader className="p-4 pb-3">
              <CardTitle className="flex items-center justify-between gap-3">
                <span>Results</span>
                {uploadResults.length > 0 && (
                  <Button variant="outline" size="sm" onClick={clearResults}>
                    Clear
                  </Button>
                )}
              </CardTitle>
              <CardDescription>
                {uploadResults.length === 0 ? 'No uploads yet.' : 'Upload parsing + import progress'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              {uploadResults.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="">
                      {uploadResults.length} file{uploadResults.length === 1 ? '' : 's'}
                    </span>
                    {processingCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing {processingCount}
                      </span>
                    )}
                    {completedCount > 0 && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        {completedCount} imported
                      </span>
                    )}
                    {errorCount > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {errorCount} failed
                      </span>
                    )}
                  </div>

                  {processingCount > 0 && (
                    <Progress value={(completedCount / Math.max(1, uploadResults.length)) * 100} />
                  )}
                </>
              )}

              {uploadResults.length === 0 ? (
                <div className="text-sm">
                  Upload resumes above to populate your Talent Pool.
                </div>
              ) : (
                <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                  {uploadResults.map((item, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${item.status === 'done'
                        ? 'bg-green-50 dark:bg-green-950/20 border-green-200'
                        : item.status === 'error'
                          ? 'bg-red-50 dark:bg-red-950/20 border-red-200'
                          : 'bg-muted/50'
                        }`}
                    >
                      {item.status === 'pending' && <div className="h-5 w-5 rounded-full bg-muted" />}
                      {item.status === 'parsing' && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                      {item.status === 'importing' && <Loader2 className="h-5 w-5 animate-spin text-green-500" />}
                      {item.status === 'done' && <CheckCircle className="h-5 w-5 text-green-600" />}
                      {item.status === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}

                      <div className="flex-1 min-w-0">
                        <div className="font-sans font-medium truncate">{item.parsed?.full_name || item.fileName}</div>
                        {item.parsed?.current_title && (
                          <div className="text-sm font-sans truncate">{item.parsed.current_title}</div>
                        )}
                        {item.status === 'error' && item.error && (
                          <div className="text-sm font-sans text-destructive">{item.error}</div>
                        )}
                        {item.status !== 'error' && item.note && (
                          <div className="text-sm font-sans">{item.note}</div>
                        )}
                      </div>

                      {item.atsScore !== undefined && (
                        <div className="flex flex-col items-end leading-tight">
                          <div className={`font-bold ${getScoreColor(item.atsScore)}`}>{item.atsScore}%</div>
                          <div className="text-[10px] font-sans text-muted-foreground">generic</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {currentSection === 'search' && (
          <div className="rounded-xl border border-border bg-card overflow-hidden min-w-0 flex flex-col flex-1 min-h-0">
            <div className="shrink-0 border-b border-recruiter/10 bg-recruiter/5 p-4 pb-3">
              <h2 className="text-lg font-display font-bold text-foreground flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
                  Results
                </span>
                <span className="text-sm font-sans font-medium text-muted-foreground">
                  {isSearching ? 'Searching…' : hasSearchRows ? `${totalSearchRows} match${totalSearchRows === 1 ? '' : 'es'}` : 'No results yet'}
                </span>
              </h2>
              <p className="text-sm text-muted-foreground font-sans mt-1">
                Click a row to preview. Select multiple to import or save in bulk to your Talent Pool.
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {isSearching ? (
                <div className="flex items-center gap-2 text-sm font-sans text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-recruiter" strokeWidth={1.5} />
                  Searching…
                </div>
              ) : hasSearchRows ? (
                searchResultsPane
              ) : (
                <p className="text-sm font-sans text-muted-foreground">
                  Enter a search above and click Search. Results will appear here.
                </p>
              )}
            </div>
          </div>
        )}

        {currentSection === 'api' && (
          <Card className="min-w-0">
            <CardHeader className="p-4 pb-3">
              <CardTitle>Results</CardTitle>
              <CardDescription>API activity will appear here once enabled.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-sm">
                Planned integrations: LinkedIn (provider-based), job boards, ATS sync.
              </div>
            </CardContent>
          </Card>
        )}
          </div>
        </div>
      </div>

      {/* Save Search Dialog */}
      <Dialog open={saveSearchDialogOpen} onOpenChange={setSaveSearchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Search</DialogTitle>
            <DialogDescription>
              Save your current search query and filters for easy access later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="search-name">Search Name</Label>
              <Input
                id="search-name"
                placeholder="e.g., Senior React Developers in SF"
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
              />
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div><strong>Query:</strong> {searchQuery || '(none)'}</div>
              {leadKeywordFilters && <div><strong>Keywords:</strong> {leadKeywordFilters}</div>}
              {Number.isFinite(leadMinScore) && leadMinScore > 0 && (
                <div><strong>Min Score:</strong> {leadMinScore}%</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveSearchDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!saveSearchName.trim()) {
                  toast.error('Please enter a search name');
                  return;
                }
                saveSearchMutation.mutate({
                  name: saveSearchName,
                  query: searchQuery,
                  filters: {
                    mode: searchMode,
                    keywords: leadKeywordFilters,
                    keywordMatch: leadKeywordMatch,
                    minScore: Number.isFinite(leadMinScore) ? leadMinScore : null,
                  }
                });
              }}
              disabled={saveSearchMutation.isPending}
            >
              {saveSearchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
