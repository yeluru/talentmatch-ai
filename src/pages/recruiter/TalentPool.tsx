import { useEffect, useState, useMemo, useRef } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Users, Briefcase, MapPin, Filter, X, ListPlus, Plus, Send, MessageSquare, Save, Trash2, Upload, CheckCircle, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { CompactTalentPoolRow } from '@/components/recruiter/CompactTalentPoolRow';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/hooks/useTableSort';
import { sortBy as sortByUtil } from '@/lib/sort';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { PullToRefreshIndicator } from '@/components/ui/pull-to-refresh-indicator';
import { MobileListHeader } from '@/components/ui/mobile-list-header';
import { LoadingProgressBar } from '@/components/ui/loading-progress-bar';
import { normalizeStatusForDisplay, TALENT_POOL_STAGE_OPTIONS } from '@/lib/statusOptions';
import { orgIdForRecruiterSuite, orgIdForRole } from '@/lib/org';
import { retryWithBackoff } from '@/lib/retryWithBackoff';
import { useBulkResumeUpload } from '@/hooks/useBulkResumeUpload';
import { useNavigate, Link } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface TalentProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  location: string | null;
  current_title: string | null;
  current_company: string | null;
  years_of_experience: number | null;
  headline: string | null;
  ats_score: number | null;
  created_at: string;
  recruiter_notes: string | null;
  recruiter_status: string | null;
  uploaded_by_user_id: string | null;
  uploaded_by_user: {
    full_name: string | null;
    email: string | null;
  } | null;
  skills: {
    skill_name: string;
  }[];
  companies: string[];
}

type TalentPoolSortKey = 'full_name' | 'current_title' | 'location' | 'years_of_experience' | 'recruiter_status' | 'ats_score' | 'created_at' | 'uploaded_by_user';

/** Same status options as pipeline so status is consistent everywhere. */
const STATUS_OPTIONS = TALENT_POOL_STAGE_OPTIONS;

/**
 * Boolean query parser:
 * - OR groups: comma (,) or keyword "or"
 * - AND terms inside a group: keyword "and"
 *
 * Examples:
 * - "fannie, freddie" => [["fannie"], ["freddie"]]
 * - "fannie or freddie" => [["fannie"], ["freddie"]]
 * - "fannie and freddie" => [["fannie","freddie"]]
 *
 * Note: plain whitespace without explicit "and" stays within a single term group as-is;
 * users should type "and" when they want strict AND behavior.
 */
function parseBooleanQueryGroups(input: string): string[][] {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return [];

  const normalizeTerm = (t: string) =>
    t
      .trim()
      // Strip punctuation at edges so "fannie," still matches
      .replace(/^[^a-z0-9]+/gi, '')
      .replace(/[^a-z0-9]+$/gi, '')
      .trim();

  // Split into OR groups by comma or " or "
  const orGroups = raw
    .split(/,|\s+or\s+/i)
    .map((g) => g.trim())
    .filter(Boolean);

  const groups: string[][] = [];
  for (const g of orGroups) {
    // Split into AND terms only when user explicitly types "and"
    const andTerms = g
      .split(/\s+and\s+/i)
      .map(normalizeTerm)
      .filter((t) => t.length > 0);

    // If user didn't type "and" but typed multiple words, treat as a single phrase term.
    // This keeps search forgiving while still allowing strict AND when requested.
    if (andTerms.length === 0) continue;
    if (andTerms.length === 1) {
      const phrase = normalizeTerm(g);
      if (phrase) groups.push([phrase]);
      continue;
    }
    groups.push(andTerms);
  }

  return groups;
}

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry (0-2 years)', min: 0, max: 2 },
  { value: 'mid', label: 'Mid-Level (3-5 years)', min: 3, max: 5 },
  { value: 'senior', label: 'Senior (6-10 years)', min: 6, max: 10 },
  { value: 'lead', label: 'Lead (10+ years)', min: 10, max: 100 },
];

const DEFAULT_ITEMS_PER_PAGE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const PAGE_SIZE_KEY_PREFIX = 'talentpool_page_size_v1';
function getPageSizeKey(orgId: string) {
  return `${PAGE_SIZE_KEY_PREFIX}:${orgId}`;
}

function loadPageSize(orgId: string): number {
  try {
    if (!orgId) return DEFAULT_ITEMS_PER_PAGE;
    const raw = localStorage.getItem(getPageSizeKey(orgId));
    const n = Number(raw);
    if (PAGE_SIZE_OPTIONS.includes(n as any)) return n;
    return DEFAULT_ITEMS_PER_PAGE;
  } catch {
    return DEFAULT_ITEMS_PER_PAGE;
  }
}

function savePageSize(orgId: string, n: number) {
  try {
    if (!orgId) return;
    localStorage.setItem(getPageSizeKey(orgId), String(n));
  } catch {
    // ignore
  }
}

type TalentPoolView = 'all' | 'new' | 'high_score' | 'recent';

const RECENT_VIEWS_KEY_PREFIX = 'talentpool_recent_views_v1';
function getRecentViewsKey(orgId: string) {
  return `${RECENT_VIEWS_KEY_PREFIX}:${orgId}`;
}

function loadRecentViews(orgId: string): { id: string; ts: number }[] {
  try {
    if (!orgId) return [];
    const raw = localStorage.getItem(getRecentViewsKey(orgId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.ts === 'number')
      .slice(0, 50);
  } catch {
    return [];
  }
}

function saveRecentViews(orgId: string, items: { id: string; ts: number }[]) {
  try {
    if (!orgId) return;
    localStorage.setItem(getRecentViewsKey(orgId), JSON.stringify(items.slice(0, 50)));
  } catch {
    // ignore
  }
}

export default function TalentPool() {
  const { roles, user, currentRole } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const organizationId = orgIdForRecruiterSuite(roles) ?? orgIdForRole(roles as any, currentRole);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    handleFileUpload,
    uploadResults,
    clearResults: clearUploadResults,
    cancelUpload,
    isUploading,
    completedCount,
    errorCount,
    cancelledCount,
    processingCount,
  } = useBulkResumeUpload(organizationId ?? undefined);

  const [searchQuery, setSearchQuery] = useState('');
  const tableSort = useTableSort<TalentPoolSortKey>({ key: 'created_at', dir: 'desc' });
  const [companyFilter, setCompanyFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [activeView, setActiveView] = useState<TalentPoolView>('all');
  const [itemsPerPage, setItemsPerPage] = useState<number>(() => loadPageSize(organizationId || ''));
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeCandidateIds, setRemoveCandidateIds] = useState<string[]>([]);
  const [rowShortlistDialogOpen, setRowShortlistDialogOpen] = useState(false);
  const [rowShortlistCandidateId, setRowShortlistCandidateId] = useState<string | null>(null);
  const [rowSelectedShortlistId, setRowSelectedShortlistId] = useState<string>('');
  const [rowNewShortlistName, setRowNewShortlistName] = useState('');

  // Start engagement dialog state
  const [engageOpen, setEngageOpen] = useState(false);
  const [engageCandidateId, setEngageCandidateId] = useState<string | null>(null);
  const [engageJobId, setEngageJobId] = useState<string>('');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recentViews, setRecentViews] = useState<{ id: string; ts: number }[]>(() =>
    loadRecentViews(organizationId || '')
  );

  // Progressive loading state
  const [loadingProgress, setLoadingProgress] = useState<{
    loaded: number;
    total: number;
    isComplete: boolean;
  }>({ loaded: 0, total: 0, isComplete: true });
  const [allCandidateIds, setAllCandidateIds] = useState<string[]>([]);

  useEffect(() => {
    if (!organizationId) return;
    setRecentViews(loadRecentViews(organizationId));
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    setItemsPerPage(loadPageSize(organizationId));
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    savePageSize(organizationId, itemsPerPage);
  }, [organizationId, itemsPerPage]);

  const { pullDistance, refreshing: isRefreshing } = usePullToRefresh({
    enabled: isMobile,
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
    },
  });

  const { data: talents, isLoading, error: talentsError, dataUpdatedAt } = useQuery({
    queryKey: ['talent-pool', organizationId],
    queryFn: async (): Promise<TalentProfile[]> => {
      if (!organizationId) {
        console.warn('[TalentPool] No organizationId available');
        return [];
      }

      console.log('[TalentPool] Fetching talent pool for org:', organizationId);
      console.log('[TalentPool] User roles:', roles?.map(r => `${r.role} @ ${r.organization_id}`));

      let candidateIds: string[] = [];
      // IMPORTANT: PostgREST defaults to 1000 row limit - must explicitly set higher limit
      // Using .range(0, 49999) instead of .limit(50000) for RPC calls (more reliable)
      const { data: poolIds, error: rpcError } = await supabase
        .rpc('get_talent_pool_candidate_ids')
        .range(0, 49999); // Support up to 50k candidates (well above realistic org size)

      if (rpcError) {
        console.error('[TalentPool] RPC error:', rpcError);
      }

      if (!rpcError && poolIds?.length) {
        candidateIds = Array.from(new Set((poolIds as { candidate_id: string }[]).map((r) => r.candidate_id).filter(Boolean)));
      }

      if (candidateIds.length === 0) {
        console.log('[TalentPool] RPC returned no results, falling back to direct query...');
        const { data: sourcedLinks, error: sourcedLinksError } = await supabase
          .from('candidate_org_links')
          .select('candidate_id')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .in('link_type', [
            'resume_upload', 'web_search', 'google_xray', 'linkedin_search',
            'sourced_resume', 'sourced_web', 'sourced', 'unknown',
          ])
          .range(0, 49999); // PostgREST default is 1000 - set explicit high range
        if (sourcedLinksError) {
          console.error('[TalentPool] Error fetching sourced links:', sourcedLinksError);
          throw sourcedLinksError;
        }
        const sourcedIds = Array.from(new Set((sourcedLinks || []).map((l: { candidate_id: string }) => l.candidate_id).filter(Boolean)));
        console.log('[TalentPool] Found', sourcedIds.length, 'sourced candidates');

        const { data: applicantLinks, error: applicantLinksError } = await supabase
          .from('applications')
          .select('candidate_id, jobs!inner(organization_id)')
          .eq('jobs.organization_id', organizationId)
          .range(0, 49999); // PostgREST default is 1000 - set explicit high range
        if (applicantLinksError) {
          console.error('[TalentPool] Error fetching applicant links:', applicantLinksError);
          throw applicantLinksError;
        }
        const applicantIds = Array.from(new Set((applicantLinks || []).map((a: { candidate_id: string }) => a.candidate_id).filter(Boolean)));
        console.log('[TalentPool] Found', applicantIds.length, 'applicants');

        candidateIds = Array.from(new Set([...sourcedIds, ...applicantIds]));
        console.log('[TalentPool] Total unique candidate IDs:', candidateIds.length);
      }

      if (candidateIds.length === 0) {
        console.warn('[TalentPool] No candidate IDs found - returning empty array');
        setLoadingProgress({ loaded: 0, total: 0, isComplete: true });
        return [];
      }

      // Store all IDs for background loading
      setAllCandidateIds(candidateIds);

      // Initial load: first 200 profiles only
      const INITIAL_LOAD_SIZE = 200;
      const initialIds = candidateIds.slice(0, INITIAL_LOAD_SIZE);
      console.log(`[TalentPool] Initial load: ${initialIds.length} of ${candidateIds.length} profiles`);

      // Set initial progress
      setLoadingProgress({
        loaded: 0,
        total: candidateIds.length,
        isComplete: candidateIds.length <= INITIAL_LOAD_SIZE
      });

      // Batch fetch profiles to avoid URL length limits (max ~100 IDs per request)
      const BATCH_SIZE = 100;
      const batches: string[][] = [];
      for (let i = 0; i < initialIds.length; i += BATCH_SIZE) {
        batches.push(initialIds.slice(i, i + BATCH_SIZE));
      }

      console.log(`[TalentPool] Fetching initial ${initialIds.length} profiles in ${batches.length} batches`);

      // Fetch all batches in parallel for better performance
      const batchPromises = batches.map(batch =>
        retryWithBackoff(
          () => supabase
            .from('candidate_profiles')
            .select(
              `id, full_name, email, location, current_title, current_company, years_of_experience,
               headline, ats_score, created_at, recruiter_notes, recruiter_status`
            )
            .in('id', batch),
          {
            maxRetries: 3,
            timeoutMs: 30000, // 30s timeout for profile queries
          }
        )
      );

      const batchResults = await Promise.all(batchPromises);

      const allProfiles: TalentProfile[] = [];
      for (const { data: profiles, error: profilesError } of batchResults) {
        if (profilesError) {
          console.error('[TalentPool] Error fetching batch:', profilesError);
          throw profilesError;
        }
        allProfiles.push(...(profiles || []));
      }

      const candidates = allProfiles as TalentProfile[];
      console.log('[TalentPool] Fetched initial', candidates.length, 'profiles');

      // Update progress after initial load
      setLoadingProgress(prev => ({
        ...prev,
        loaded: candidates.length
      }));

      if (!candidates.length) {
        console.warn('[TalentPool] No profiles found for candidate IDs');
        setLoadingProgress({ loaded: 0, total: 0, isComplete: true });
        return [];
      }

      // De-dupe by stable identity (LinkedIn/email) to avoid duplicates from repeated imports.
      const norm = (v: any) => String(v || '').trim().toLowerCase().replace(/\/+$/, '');
      const identityKey = (c: any) => {
        const li = norm((c as any).linkedin_url);
        if (li) return `li:${li}`;
        const em = norm((c as any).email);
        if (em) return `em:${em}`;
        return `id:${String((c as any).id || '')}`;
      };
      const sorted = candidates
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const byIdentity = new Map<string, any>();
      for (const c of sorted) {
        const k = identityKey(c);
        if (!byIdentity.has(k)) byIdentity.set(k, c);
      }
      const deduped = Array.from(byIdentity.values());

      // Batch fetch skills and experience to avoid URL length limits
      const dedupedIds = deduped.map((c) => c.id);
      const skillBatches: string[][] = [];
      for (let i = 0; i < dedupedIds.length; i += BATCH_SIZE) {
        skillBatches.push(dedupedIds.slice(i, i + BATCH_SIZE));
      }

      const allSkills: any[] = [];
      for (const batch of skillBatches) {
        const { data: skills } = await retryWithBackoff(
          () => supabase
            .from('candidate_skills')
            .select('candidate_id, skill_name')
            .in('candidate_id', batch),
          {
            maxRetries: 3,
            timeoutMs: 20000, // 20s timeout for skills queries
          }
        );
        if (skills) allSkills.push(...skills);
      }

      const allExperience: any[] = [];
      for (const batch of skillBatches) {
        const { data: experience } = await retryWithBackoff(
          () => supabase
            .from('candidate_experience')
            .select('candidate_id, company_name')
            .in('candidate_id', batch),
          {
            maxRetries: 3,
            timeoutMs: 20000, // 20s timeout for experience queries
          }
        );
        if (experience) allExperience.push(...experience);
      }

      // Fetch uploader information via RPC function
      // Note: Requires migration 20260216030000 to be applied
      let uploaderMap = new Map();
      try {
        console.log('[TalentPool] Fetching uploader info for', dedupedIds.length, 'candidates');
        const { data: uploaderData, error: uploaderError } = await supabase
          .rpc('get_uploaders_for_candidates', { candidate_ids: dedupedIds });

        if (uploaderError) {
          console.error('[TalentPool] RPC error fetching uploaders:', uploaderError);
        } else {
          console.log('[TalentPool] Received uploader data for', uploaderData?.length || 0, 'candidates');
          uploaderMap = new Map(
            (uploaderData || []).map((u: any) => [
              u.candidate_id,
              { email: u.uploader_email, full_name: u.uploader_name }
            ])
          );
          console.log('[TalentPool] Uploader map size:', uploaderMap.size);
        }
      } catch (error) {
        console.error('[TalentPool] Exception fetching uploader info:', error);
      }

      const result = deduped
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((c) => ({
          ...c,
          uploaded_by_user: uploaderMap.get(c.id) || null,
          skills: allSkills?.filter((s) => s.candidate_id === c.id) || [],
          companies: [
            ...new Set(
              allExperience
                ?.filter((e) => e.candidate_id === c.id)
                .map((e) => e.company_name)
                .filter(Boolean) || []
            ),
            c.current_company,
          ].filter(Boolean) as string[],
        }));

      console.debug('[TalentPool] first candidate recruiter_status/notes:', result[0]?.recruiter_status, !!result[0]?.recruiter_notes);
      return result;
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 60 * 1000, // 2 hours - data stays fresh for 2 hours (aggressive caching)
    cacheTime: 3 * 60 * 60 * 1000, // 3 hours - keep in cache for 3 hours
    refetchOnWindowFocus: false, // Don't refetch when user tabs back
    refetchOnMount: false, // Don't refetch when component remounts
  });

  // Manual refresh handler
  const handleManualRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
    toast.success('Talent pool refreshed');
  };

  // Format time ago for last updated indicator
  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Background loading effect - loads remaining profiles after initial load
  useEffect(() => {
    if (!allCandidateIds.length || loadingProgress.isComplete || !talents || !organizationId) return;

    const INITIAL_LOAD_SIZE = 200;
    const remainingIds = allCandidateIds.slice(INITIAL_LOAD_SIZE);

    if (remainingIds.length === 0) {
      setLoadingProgress(prev => ({ ...prev, isComplete: true }));
      return;
    }

    console.log(`[TalentPool] Background loading ${remainingIds.length} remaining profiles`);

    // Load remaining profiles in background
    const loadRemaining = async () => {
      const BATCH_SIZE = 100;
      const batches: string[][] = [];
      for (let i = 0; i < remainingIds.length; i += BATCH_SIZE) {
        batches.push(remainingIds.slice(i, i + BATCH_SIZE));
      }

      const allProfiles: any[] = [];
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        try {
          const { data: profiles } = await supabase
            .from('candidate_profiles')
            .select(
              `id, full_name, email, location, current_title, current_company, years_of_experience,
               headline, ats_score, created_at, recruiter_notes, recruiter_status`
            )
            .in('id', batch);

          if (profiles) {
            allProfiles.push(...profiles);
            // Update progress after each batch
            setLoadingProgress(prev => ({
              ...prev,
              loaded: INITIAL_LOAD_SIZE + allProfiles.length
            }));
          }
        } catch (error) {
          console.error('[TalentPool] Error loading background batch:', error);
        }
      }

      if (allProfiles.length > 0) {
        // Process and merge background profiles
        console.log(`[TalentPool] Processing ${allProfiles.length} background profiles`);

        // Dedupe
        const norm = (v: any) => String(v || '').trim().toLowerCase().replace(/\/+$/, '');
        const identityKey = (c: any) => {
          const li = norm(c.linkedin_url);
          if (li) return `li:${li}`;
          const em = norm(c.email);
          if (em) return `em:${em}`;
          return `id:${String(c.id || '')}`;
        };

        const sorted = allProfiles.slice().sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const byIdentity = new Map<string, any>();
        for (const c of sorted) {
          const k = identityKey(c);
          if (!byIdentity.has(k)) byIdentity.set(k, c);
        }
        const deduped = Array.from(byIdentity.values());
        const dedupedIds = deduped.map(c => c.id);

        // Fetch skills, experience, and uploader data for background profiles
        const BATCH_SIZE = 100;
        const skillsMap = new Map<string, any[]>();
        const experienceMap = new Map<string, any[]>();

        try {
          // Fetch skills
          for (let i = 0; i < dedupedIds.length; i += BATCH_SIZE) {
            const batch = dedupedIds.slice(i, i + BATCH_SIZE);
            const { data: skills } = await supabase
              .from('candidate_skills')
              .select('candidate_id, skill_name')
              .in('candidate_id', batch);
            if (skills) {
              skills.forEach(s => {
                if (!skillsMap.has(s.candidate_id)) skillsMap.set(s.candidate_id, []);
                skillsMap.get(s.candidate_id)!.push(s);
              });
            }
          }

          // Fetch experience
          for (let i = 0; i < dedupedIds.length; i += BATCH_SIZE) {
            const batch = dedupedIds.slice(i, i + BATCH_SIZE);
            const { data: experience } = await supabase
              .from('candidate_experience')
              .select('candidate_id, company_name')
              .in('candidate_id', batch);
            if (experience) {
              experience.forEach(e => {
                if (!experienceMap.has(e.candidate_id)) experienceMap.set(e.candidate_id, []);
                experienceMap.get(e.candidate_id)!.push(e);
              });
            }
          }

          // Fetch uploader data
          const uploaderMap = new Map();
          const { data: uploaderData } = await supabase
            .rpc('get_uploaders_for_candidates', { candidate_ids: dedupedIds });
          if (uploaderData) {
            uploaderData.forEach((u: any) => {
              uploaderMap.set(u.candidate_id, {
                email: u.uploader_email,
                full_name: u.uploader_name
              });
            });
          }

          // Build complete profile objects
          const processedProfiles = deduped.map(c => ({
            ...c,
            uploaded_by_user: uploaderMap.get(c.id) || null,
            skills: skillsMap.get(c.id) || [],
            companies: Array.from(new Set([
              ...(experienceMap.get(c.id) || []).map((e: any) => e.company_name).filter(Boolean),
              c.current_company
            ].filter(Boolean))) as string[],
          }));

          // Merge with existing talents using queryClient
          queryClient.setQueryData(['talent-pool', organizationId], (oldData: any) => {
            if (!oldData) return processedProfiles;
            // Dedupe combined list
            const combined = [...oldData, ...processedProfiles];
            const combinedMap = new Map();
            for (const profile of combined) {
              const k = identityKey(profile);
              if (!combinedMap.has(k)) combinedMap.set(k, profile);
            }
            return Array.from(combinedMap.values()).sort((a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
          });

          console.log(`[TalentPool] Merged ${processedProfiles.length} background profiles into cache`);
        } catch (error) {
          console.error('[TalentPool] Error processing background profiles:', error);
        }
      }

      setLoadingProgress(prev => ({ ...prev, isComplete: true }));
    };

    loadRemaining();
  }, [allCandidateIds, talents, loadingProgress.isComplete, organizationId]);

  const { data: jobs } = useQuery({
    queryKey: ['recruiter-jobs', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error} = await supabase.from('jobs').select('id, title').eq('organization_id', organizationId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const startEngagementMutation = useMutation({
    mutationFn: async ({ candidateId, jobId }: { candidateId: string; jobId: string }) => {
      if (!organizationId || !user) throw new Error('Not authorized');
      if (!jobId) throw new Error('Select a job');

      console.log('[TalentPool] Calling start_engagement RPC:', { candidateId, jobId });
      const { data, error } = await supabase.rpc('start_engagement', {
        _candidate_id: candidateId,
        _job_id: jobId,
      });
      console.log('[TalentPool] RPC result:', { data, error });
      if (error) {
        console.error('[TalentPool] RPC error:', error);
        throw error;
      }

      // Verify the update happened by checking candidate_profiles
      const { data: profile, error: profileError } = await supabase
        .from('candidate_profiles')
        .select('recruiter_status')
        .eq('id', candidateId)
        .single();
      console.log('[TalentPool] Profile status after RPC:', profile?.recruiter_status, 'Error:', profileError);

      return { candidateId, jobId };
    },
    onSuccess: async () => {
      toast.success('Engagement started');
      setEngageOpen(false);
      setEngageCandidateId(null);
      setEngageJobId('');
      await queryClient.invalidateQueries({ queryKey: ['recruiter-engagements'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['recruiter-applications'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
      await queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      navigate('/recruiter/pipeline');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to start engagement'),
  });

  const startBulkEngagementMutation = useMutation({
    mutationFn: async ({ candidateIds, jobId }: { candidateIds: string[]; jobId: string }) => {
      if (!organizationId || !user) throw new Error('Not authorized');
      if (!jobId) throw new Error('Select a job');

      // Start engagement for each candidate
      const results = await Promise.allSettled(
        candidateIds.map(candidateId =>
          supabase.rpc('start_engagement', {
            _candidate_id: candidateId,
            _job_id: jobId,
          })
        )
      );

      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
      const succeeded = results.length - failed.length;

      return { succeeded, failed: failed.length, total: results.length };
    },
    onSuccess: async ({ succeeded, failed, total }) => {
      if (failed === 0) {
        toast.success(`Started engagement for ${succeeded} candidate${succeeded === 1 ? '' : 's'}`);
      } else if (succeeded > 0) {
        toast.success(`Started engagement for ${succeeded} of ${total} candidates (${failed} failed)`);
      } else {
        toast.error('Failed to start engagements');
      }
      setEngageOpen(false);
      setEngageCandidateId(null);
      setEngageJobId('');
      clearSelection();
      await queryClient.invalidateQueries({ queryKey: ['recruiter-engagements'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['recruiter-applications'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
      await queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      navigate('/recruiter/pipeline');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to start engagements'),
  });

  // Fetch shortlists for this organization
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

  const shortlistsById = useMemo(() => {
    const m = new Map<string, string>();
    (shortlists || []).forEach((s: any) => {
      if (s?.id) m.set(String(s.id), String(s.name || 'Shortlist'));
    });
    return m;
  }, [shortlists]);

  const openShortlistPage = (shortlistId: string) => {
    if (!shortlistId) return;
    navigate(`/recruiter/shortlists?shortlist=${encodeURIComponent(shortlistId)}`);
  };

  const addSingleToShortlistMutation = useMutation({
    mutationFn: async ({ shortlistId, candidateId }: { shortlistId: string; candidateId: string }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('shortlist_candidates')
        .insert({ shortlist_id: shortlistId, candidate_id: candidateId, added_by: user.id } as any);
      if (error) {
        if ((error as any)?.code === '23505') throw new Error('Candidate already in that shortlist');
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Added to shortlist');
      setRowShortlistDialogOpen(false);
      setRowShortlistCandidateId(null);
      setRowSelectedShortlistId('');
      setRowNewShortlistName('');
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['shortlist-membership'], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to add to shortlist'),
  });

  const addBulkToShortlistMutation = useMutation({
    mutationFn: async ({ shortlistId, candidateIds }: { shortlistId: string; candidateIds: string[] }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const records = candidateIds.map(id => ({
        shortlist_id: shortlistId,
        candidate_id: id,
        added_by: user.id
      }));
      const { error } = await supabase
        .from('shortlist_candidates')
        .insert(records as any);
      if (error) throw error;
      return candidateIds.length;
    },
    onSuccess: (count) => {
      toast.success(`Added ${count} candidate${count === 1 ? '' : 's'} to shortlist`);
      setRowShortlistDialogOpen(false);
      setRowShortlistCandidateId(null);
      setRowSelectedShortlistId('');
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['shortlist-membership'], exact: false });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to add to shortlist'),
  });

  const createShortlistMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (!organizationId) throw new Error('Missing organization');
      if (!user?.id) throw new Error('Not authenticated');
      const clean = String(name || '').trim();
      if (!clean) throw new Error('Enter a shortlist name');
      const { data, error } = await supabase
        .from('candidate_shortlists')
        .insert({ organization_id: organizationId, name: clean, created_by: user.id } as any)
        .select('id, name')
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['shortlists', organizationId] });
      if (created?.id) setRowSelectedShortlistId(String(created.id));
      setRowNewShortlistName('');
      toast.success('Shortlist created');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create shortlist'),
  });

  const openRowAddToShortlist = (candidateId: string) => {
    setRowShortlistCandidateId(candidateId);
    setRowSelectedShortlistId(shortlists?.[0]?.id ? String((shortlists as any[])[0].id) : '');
    setRowShortlistDialogOpen(true);
  };

  // Fetch campaigns for this organization
  const { data: campaigns } = useQuery({
    queryKey: ['campaigns', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('outreach_campaigns')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const deleteFromTalentPoolMutation = useMutation({
    mutationFn: async (candidateIds: string[]) => {
      if (!organizationId) throw new Error('Missing organization');
      const uniq = Array.from(new Set(candidateIds.map(String))).map((s) => s.trim()).filter(Boolean);
      if (uniq.length === 0) return { removed: 0 };
      const { data, error } = await supabase.functions.invoke('delete-sourced-candidate', {
        body: { organizationId, candidateIds: uniq },
      });
      if (error) throw error;
      return { data, candidateIds: uniq };
    },
    onMutate: async (candidateIds: string[]) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['talent-pool', organizationId] });

      // Snapshot previous value
      const previousTalents = queryClient.getQueryData(['talent-pool', organizationId]);

      // Optimistically remove candidates from cache
      queryClient.setQueryData(['talent-pool', organizationId], (old: any) => {
        if (!old) return old;
        return old.filter((t: any) => !candidateIds.includes(t.id));
      });

      // Close dialog immediately
      setRemoveDialogOpen(false);
      setRemoveCandidateIds([]);

      return { previousTalents };
    },
    onSuccess: ({ data }) => {
      const deleted = Number((data as any)?.results?.deleted ?? 0);
      const skipped = Number((data as any)?.results?.skipped ?? 0);
      const skipReasons = (data as any)?.results?.skipped_reasons || [];

      if (deleted > 0 && skipped === 0) {
        toast.success(`Deleted ${deleted} profile${deleted === 1 ? '' : 's'}`);
      } else if (deleted > 0) {
        toast.success(`Deleted ${deleted}, skipped ${skipped}`);
      } else {
        // Show specific reason why nothing was deleted
        const reasons = skipReasons.map((r: any) => r.reason).filter(Boolean);
        const uniqueReasons = Array.from(new Set(reasons));

        if (uniqueReasons.includes('has_applications')) {
          toast.error('Cannot delete: Candidate has applications. Remove applications first.');
        } else if (uniqueReasons.includes('linked_to_other_orgs')) {
          toast.error('Cannot delete: Candidate is shared with other organizations.');
        } else if (uniqueReasons.includes('not_sourced_candidate')) {
          toast.error('Cannot delete: Only sourced candidates can be deleted.');
        } else if (uniqueReasons.includes('not_linked_to_org')) {
          toast.error('Cannot delete: Candidate not linked to your organization.');
        } else if (uniqueReasons.includes('candidate_not_found')) {
          toast.error('Cannot delete: Candidate not found.');
        } else {
          toast.error('Nothing was deleted. Check candidate status.');
        }
      }

      // Refetch to ensure accuracy
      queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
    },
    onError: (err: any, _variables, context: any) => {
      // Rollback on error
      if (context?.previousTalents) {
        queryClient.setQueryData(['talent-pool', organizationId], context.previousTalents);
      }
      toast.error(err?.message || 'Failed to delete');
      setRemoveDialogOpen(false);
    },
  });

  const requestRemove = (candidateIds: string[]) => {
    const uniq = Array.from(new Set(candidateIds.map(String))).map((s) => s.trim()).filter(Boolean);
    if (uniq.length === 0) return;
    setRemoveCandidateIds(uniq);
    setRemoveDialogOpen(true);
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (pageIds: string[]) => {
    const allSelected = pageIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pageIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Bulk actions
  const handleBulkRemove = () => {
    requestRemove(Array.from(selectedIds));
    clearSelection();
  };

  const handleBulkAddToShortlist = () => {
    if (selectedIds.size === 0) return;
    // Use a special marker to indicate bulk operation
    setRowShortlistCandidateId('__BULK__');
    setRowShortlistDialogOpen(true);
  };

  const handleBulkStartEngagement = () => {
    if (selectedIds.size === 0) return;
    // Use a special marker to indicate bulk operation
    setEngageCandidateId('__BULK__');
    setEngageOpen(true);
  };

  // Extract unique companies and locations for filter dropdowns
  const uniqueCompanies = useMemo(() => {
    if (!talents) return [];
    const companies = new Set<string>();
    talents.forEach((t) => (t.companies || []).forEach((c) => c && companies.add(c)));
    return Array.from(companies).sort();
  }, [talents]);

  const uniqueLocations = useMemo(() => {
    if (!talents) return [];
    const locations = new Set<string>();
    talents.forEach((t) => {
      if (t.location) locations.add(t.location);
    });
    return Array.from(locations).sort();
  }, [talents]);

  const uniqueStatuses = useMemo(() => {
    if (!talents) return [];
    const statuses = new Set<string>();
    talents.forEach((t) => {
      const s = (t.recruiter_status || '').trim();
      if (s) statuses.add(s);
    });
    return Array.from(statuses).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [talents]);

  const statusFilterOptions = useMemo(() => {
    const canonical = STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }));
    const canonicalValueSet = new Set(canonical.map((s) => s.value.toLowerCase().trim()));

    const custom = uniqueStatuses
      .map((s) => {
        const norm = s.toLowerCase().trim();
        return { value: norm, label: s };
      })
      .filter((s) => s.value && !canonicalValueSet.has(s.value));

    return [...canonical, ...custom];
  }, [uniqueStatuses]);

  // Filter and sort talents
  const filteredTalents = useMemo(() => {
    if (!talents) return [];

    const now = Date.now();
    const recentIdSet = new Set(recentViews.map((x) => x.id));

    let base = talents;
    if (activeView === 'new') {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000; // 7 days
      base = base.filter((t) => new Date(t.created_at).getTime() >= cutoff);
    } else if (activeView === 'high_score') {
      base = base.filter((t) => (t.ats_score || 0) >= 80);
    } else if (activeView === 'recent') {
      base = base.filter((t) => recentIdSet.has(t.id));
    }

    let result = base.filter((t) => {
      // Text search with boolean OR support (comma-separated terms)
      const name = (t.full_name || '').toLowerCase();
      const title = (t.current_title || '').toLowerCase();
      const headline = (t.headline || '').toLowerCase();
      const email = (t.email || '').toLowerCase();
      const notes = (t.recruiter_notes || '').toLowerCase();
      const skillsText = (t.skills || []).map((s) => ((s && s.skill_name) ? String(s.skill_name) : '').toLowerCase()).join(' ');
      const companiesText = (t.companies || []).map((c) => (c ? String(c).toLowerCase() : '')).join(' ');
      const location = (t.location || '').toLowerCase();
      const searchableText = `${name} ${title} ${headline} ${email} ${notes} ${skillsText} ${companiesText} ${location}`;

      const queryGroups = parseBooleanQueryGroups(searchQuery);
      // Boolean semantics:
      // - OR across groups
      // - AND within a group
      const matchesSearch =
        queryGroups.length === 0 ||
        queryGroups.some((andTerms) => andTerms.every((term) => searchableText.includes(term)));

      // Company filter
      const matchesCompany =
        !companyFilter || (t.companies || []).some((c) => (c ? String(c).toLowerCase().includes(companyFilter.toLowerCase()) : false));

      // Location filter
      const matchesLocation =
        !locationFilter ||
        (t.location && t.location.toLowerCase().includes(locationFilter.toLowerCase()));

      // Status filter (compare normalized stage; New and Engaged are distinct)
      const matchesStatus =
        !statusFilter ||
        ((normalizeStatusForDisplay(t.recruiter_status) || 'new') as string) === statusFilter.toLowerCase().trim();

      // Experience filter
      let matchesExperience = true;
      if (experienceFilter) {
        const level = EXPERIENCE_LEVELS.find((l) => l.value === experienceFilter);
        if (level && t.years_of_experience !== null) {
          matchesExperience = t.years_of_experience >= level.min && t.years_of_experience <= level.max;
        } else if (level && t.years_of_experience === null) {
          matchesExperience = false;
        }
      }

      return matchesSearch && matchesCompany && matchesLocation && matchesStatus && matchesExperience;
    });

    // Sort by column
    if (!Array.isArray(result) || result.length === 0) return result;
    const sortState = tableSort?.sort;
    if (!sortState?.key) return result;
    const getValue = (t: TalentProfile, key: TalentPoolSortKey): unknown => {
      if (key === 'uploaded_by_user') {
        return t.uploaded_by_user?.full_name || t.uploaded_by_user?.email || '';
      }
      const v = t[key as keyof TalentProfile];
      return v ?? '';
    };
    return sortByUtil(result, sortState, getValue);
  }, [
    talents,
    searchQuery,
    tableSort.sort,
    companyFilter,
    locationFilter,
    statusFilter,
    experienceFilter,
    activeView,
    recentViews,
  ]);

  // (ATS Match Search lives on its dedicated page: /recruiter/talent-search)

  // Group filtered talents by email for visual grouping
  const groupedTalents = useMemo(() => {
    // IMPORTANT:
    // `filteredTalents` is already sorted by `sortBy`.
    // So grouping MUST preserve that order (otherwise sorting appears "broken").
    const groups: TalentProfile[][] = [];
    const indexByKey = new Map<string, number>();

    for (const talent of filteredTalents) {
      // When searching, do NOT group by email — users expect "records" to match visible rows.
      const isSearching = searchQuery.trim().length > 0;
      const key = isSearching
        ? `id-${talent.id}`
        : (talent.email?.toLowerCase().trim() || `no-email-${talent.id}`);

      const existingIndex = indexByKey.get(key);
      if (existingIndex === undefined) {
        indexByKey.set(key, groups.length);
        groups.push([talent]);
      } else {
        groups[existingIndex].push(talent);
      }
    }

    return groups;
  }, [filteredTalents, searchQuery]);

  // Reset page when filters/search/view/page-size change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, companyFilter, locationFilter, statusFilter, experienceFilter, tableSort.sort, activeView, itemsPerPage]);

  // Pagination calculations - now based on groups, not individual profiles
  const totalPages = Math.ceil(groupedTalents.length / itemsPerPage);
  const paginatedGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return groupedTalents.slice(startIndex, startIndex + itemsPerPage);
  }, [groupedTalents, currentPage, itemsPerPage]);

  // Flatten paginated groups for selection logic
  const paginatedTalents = useMemo(() => {
    return paginatedGroups.flat();
  }, [paginatedGroups]);

  const paginatedCandidateIds = useMemo(() => {
    return (paginatedTalents || []).map((t) => String(t.id)).filter(Boolean);
  }, [paginatedTalents]);

  const { data: shortlistMembership } = useQuery({
    queryKey: ['shortlist-membership', organizationId, paginatedCandidateIds.join(','), (shortlists || []).length],
    queryFn: async () => {
      const shortlistIds = (shortlists || []).map((s: any) => String(s.id)).filter(Boolean);
      if (!shortlistIds.length) return [];
      if (!paginatedCandidateIds.length) return [];

      const { data, error } = await supabase
        .from('shortlist_candidates')
        .select('shortlist_id, candidate_id')
        .in('shortlist_id', shortlistIds)
        .in('candidate_id', paginatedCandidateIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && (shortlists || []).length > 0 && paginatedCandidateIds.length > 0,
  });

  const shortlistButtonByCandidateId = useMemo(() => {
    const grouped = new Map<string, { shortlistId: string; name: string }[]>();
    for (const row of shortlistMembership || []) {
      const candidateId = String((row as any)?.candidate_id || '');
      const shortlistId = String((row as any)?.shortlist_id || '');
      if (!candidateId || !shortlistId) continue;
      const name = shortlistsById.get(shortlistId) || 'Shortlist';
      const arr = grouped.get(candidateId) || [];
      if (!arr.some((x) => x.shortlistId === shortlistId)) arr.push({ shortlistId, name });
      grouped.set(candidateId, arr);
    }
    const out: Record<string, { shortlistId: string; label: string; count: number }> = {};
    for (const [candidateId, arr] of grouped.entries()) {
      const sorted = [...arr].sort((a, b) => a.name.localeCompare(b.name));
      const primary = sorted[0];
      const count = sorted.length;
      out[candidateId] = {
        shortlistId: primary.shortlistId,
        label: count > 1 ? `${primary.name} +${count - 1}` : primary.name,
        count,
      };
    }
    return out;
  }, [shortlistMembership, shortlistsById]);

  // If the result set shrinks (e.g. after search), ensure we don't strand the user on an empty page.
  useEffect(() => {
    if (totalPages === 0) return;
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, totalPages]);

  const hasActiveFilters = companyFilter || locationFilter || statusFilter || experienceFilter;

  const clearFilters = () => {
    setCompanyFilter('');
    setLocationFilter('');
    setStatusFilter('');
    setExperienceFilter('');
  };

  const handleTalentClick = (id: string) => {
    if (organizationId) {
      const now = Date.now();
      const next = [{ id, ts: now }, ...recentViews.filter((x) => x.id !== id)].slice(0, 20);
      setRecentViews(next);
      saveRecentViews(organizationId, next);
    }
    setSelectedTalentId(id);
    setSheetOpen(true);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const filterCount =
    (companyFilter ? 1 : 0) +
    (locationFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (experienceFilter ? 1 : 0);

  const filtersContent = (
    <div className="space-y-2">
      {/* Search row (hero) */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center glass-panel p-1 rounded-xl border border-white/10">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder='Search (boolean): "fannie and freddie", react or angular'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-9 border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 pr-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 hover:bg-white/10">
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {filterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5 h-5 min-w-5 justify-center">
                    {filterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px] glass-panel border-white/20">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Filters</div>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-2 text-xs hover:bg-white/10">
                      Clear all
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Company</Label>
                    <Select value={companyFilter || "all"} onValueChange={(v) => setCompanyFilter(v === "all" ? "" : v)}>
                      <SelectTrigger className="glass-input">
                        <SelectValue placeholder="All Companies" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Companies</SelectItem>
                        {uniqueCompanies.map((company) => (
                          <SelectItem key={company} value={company}>
                            {company}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Location</Label>
                    <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
                      <SelectTrigger className="glass-input">
                        <SelectValue placeholder="All Locations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Locations</SelectItem>
                        {uniqueLocations.map((location) => (
                          <SelectItem key={location} value={location}>
                            {location}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
                      <SelectTrigger className="glass-input">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {statusFilterOptions.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Experience</Label>
                    <Select value={experienceFilter || "all"} onValueChange={(v) => setExperienceFilter(v === "all" ? "" : v)}>
                      <SelectTrigger className="glass-input">
                        <SelectValue placeholder="All Levels" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Levels</SelectItem>
                        {EXPERIENCE_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Views row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 overflow-x-auto no-scrollbar">
          <ToggleGroup
            type="single"
            value={activeView}
            onValueChange={(v) => setActiveView((v as TalentPoolView) || 'all')}
            className="justify-start gap-1 bg-muted/20 p-1 rounded-lg border border-white/5"
          >
            <ToggleGroupItem value="all" aria-label="All" className="data-[state=on]:bg-background/80 data-[state=on]:shadow-sm rounded-md text-xs h-8 px-3">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="new" aria-label="New" className="data-[state=on]:bg-background/80 data-[state=on]:shadow-sm rounded-md text-xs h-8 px-3">
              New
            </ToggleGroupItem>
            <ToggleGroupItem value="high_score" aria-label="High score" className="data-[state=on]:bg-background/80 data-[state=on]:shadow-sm rounded-md text-xs h-8 px-3">
              High score
            </ToggleGroupItem>
            <ToggleGroupItem value="recent" aria-label="Recently viewed" className="data-[state=on]:bg-background/80 data-[state=on]:shadow-sm rounded-md text-xs h-8 px-3">
              Recently viewed
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {(searchQuery.trim() || hasActiveFilters) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              clearFilters();
            }}
            className="whitespace-nowrap h-8 text-xs hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      {/* Pull-to-refresh indicator (mobile) */}
      {isMobile && (
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      )}

      {/* Scroll to top button */}
      <ScrollToTop />

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden w-full max-w-[1344px] mx-auto px-2 sm:px-4 lg:px-6">
        <div className="shrink-0 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="p-1.5 rounded-lg bg-recruiter/10 text-recruiter border border-recruiter/20">
                  <Users className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground">
                  Talent <span className="text-gradient-recruiter">Pool</span>
                </h1>
              </div>
              <p className="text-sm text-muted-foreground font-sans">
                Sourced profiles from bulk uploads and searches
              </p>
              {dataUpdatedAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Updated {getTimeAgo(dataUpdatedAt)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg h-9 w-9 border border-border/50 hover:bg-accent"
                onClick={handleManualRefresh}
                disabled={isLoading}
                title="Refresh talent pool"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                className="rounded-lg h-9 px-4 border border-recruiter/20 bg-recruiter/5 hover:bg-recruiter/10 text-recruiter font-sans font-semibold text-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={!organizationId || !loadingProgress.isComplete}
                title={!loadingProgress.isComplete ? 'Wait for talent pool to finish loading' : ''}
              >
                <Upload className="h-4 w-4 mr-2" strokeWidth={1.5} />
                Upload
              </Button>
              <Button asChild className="rounded-lg h-9 px-4 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold text-sm">
                <Link to="/recruiter/talent-search/search">
                  <Search className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  Find Talent
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Upload status bar – shown while uploads are in progress or when there are recent results */}
        {uploadResults.length > 0 && (
          <div className="rounded-xl border border-amber-200/60 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    <span>
                      Uploading {uploadResults.length} file{uploadResults.length !== 1 ? 's' : ''}… {completedCount} done
                      {errorCount > 0 ? `, ${errorCount} failed` : ''}
                      {cancelledCount > 0 ? `, ${cancelledCount} cancelled` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    <span>
                      Import complete: {completedCount} added to Talent Pool
                      {errorCount > 0 ? `, ${errorCount} failed` : ''}
                      {cancelledCount > 0 ? `, ${cancelledCount} cancelled` : ''}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isUploading && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-200/50 dark:hover:bg-amber-800/50"
                    onClick={cancelUpload}
                  >
                    Cancel
                  </Button>
                )}
                {!isUploading && errorCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-200/50 dark:hover:bg-amber-800/50"
                    onClick={() => {
                      clearUploadResults();
                      fileInputRef.current?.click();
                      toast.info('Re-upload your files', {
                        description: 'The system will automatically skip files that uploaded successfully.',
                        duration: 5000,
                      });
                    }}
                  >
                    Retry Failed
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-amber-700 dark:text-amber-300 hover:bg-amber-200/50 dark:hover:bg-amber-800/50"
                  onClick={clearUploadResults}
                >
                  Dismiss
                </Button>
              </div>
            </div>
            <Progress
              value={uploadResults.length ? ((completedCount + errorCount + cancelledCount) / uploadResults.length) * 100 : 0}
              className="h-1.5"
            />
            <details className="text-xs text-amber-700 dark:text-amber-300">
              <summary className="cursor-pointer hover:underline">View file status</summary>
              <ul className="mt-2 space-y-1 pl-4">
                {uploadResults.map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {r.status === 'done' && <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                    {r.status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                    {r.status === 'cancelled' && <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    {(r.status === 'pending' || r.status === 'parsing' || r.status === 'importing') && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    )}
                    <span className="truncate">{r.fileName}</span>
                    {r.status === 'done' && r.note && <span className="text-muted-foreground">({r.note})</span>}
                    {r.status === 'error' && r.error && <span className="text-destructive truncate">{r.error}</span>}
                    {r.status === 'cancelled' && <span className="text-muted-foreground">Cancelled</span>}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-2 pt-2 pb-3">
        {filtersContent}

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Progress bar for background loading */}
          {!loadingProgress.isComplete && loadingProgress.total > 0 && (
            <LoadingProgressBar
              loaded={loadingProgress.loaded}
              total={loadingProgress.total}
              message="Loading talent pool"
            />
          )}

          <div className="p-0">
            {talentsError ? (
              <EmptyState
                icon={AlertCircle}
                title="Error loading talent pool"
                description={`Failed to load profiles: ${talentsError instanceof Error ? talentsError.message : 'Unknown error'}. Check browser console for details.`}
              />
            ) : !filteredTalents?.length ? (
              <EmptyState
                icon={Users}
                title={hasActiveFilters || searchQuery.trim() ? 'No matches found' : 'No profiles in talent pool'}
                description={
                  hasActiveFilters || searchQuery.trim()
                    ? 'Try adjusting your search or filters'
                    : 'Import candidates via Talent Sourcing to build your pool'
                }
              />
            ) : isMobile ? (
              <>
                <div className="divide-y divide-white/10">
                  {paginatedTalents.map((talent) => (
                    <div
                      key={talent.id}
                      className="p-4 cursor-pointer hover:bg-white/5 transition-colors active:bg-white/10"
                      onClick={() => handleTalentClick(talent.id)}
                    >
                      <div className="flex items-start gap-4">
                        <Avatar className="h-12 w-12 shrink-0 border border-white/10">
                          <AvatarFallback className="bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-300 font-bold">
                            {(talent.full_name || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-lg text-foreground truncate">{talent.full_name || 'Unknown'}</span>
                            <StatusBadge status={normalizeStatusForDisplay(talent.recruiter_status) || 'new'} />
                          </div>
                          {(talent.current_title || talent.current_company) && (() => {
                            const sub = talent.current_title
                              ? (talent.current_company ? `${talent.current_title} at ${talent.current_company}` : talent.current_title)
                              : (talent.current_company || '');
                            const max = 60;
                            const display = sub.length > max ? `${sub.slice(0, max)}…` : sub;
                            return (
                              <div className="text-sm text-muted-foreground line-clamp-2 break-words leading-snug" title={sub}>
                                {display}
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground/80">
                            {talent.location && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5" />
                                {talent.location}
                              </span>
                            )}
                            {talent.years_of_experience !== null && (
                              <span className="flex items-center gap-1.5">
                                <Briefcase className="h-3.5 w-3.5" />
                                {talent.years_of_experience} yrs
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="p-4 border-t border-white/10 bg-black/20">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                            className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-white/10'}
                          />
                        </PaginationItem>
                        {getPageNumbers().map((page, idx) => (
                          <PaginationItem key={idx}>
                            {page === 'ellipsis' ? (
                              <PaginationEllipsis />
                            ) : (
                              <PaginationLink
                                onClick={() => handlePageChange(page as number)}
                                isActive={currentPage === page}
                                className="cursor-pointer hover:bg-white/10"
                              >
                                {page}
                              </PaginationLink>
                            )}
                          </PaginationItem>
                        ))}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                            className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-white/10'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10 bg-white/5 backdrop-blur-sm">
                  <span className="text-sm font-medium text-muted-foreground">
                    {groupedTalents.length > 0
                      ? `Showing ${((currentPage - 1) * itemsPerPage) + 1}-${Math.min(currentPage * itemsPerPage, groupedTalents.length)} of ${groupedTalents.length}${talents && groupedTalents.length !== talents.length ? ` (${talents.length} total profiles)` : ''}`
                      : ''}
                  </span>
                  <div className="flex items-center gap-3">
                    <Select
                      value={String(itemsPerPage)}
                      onValueChange={(v) => {
                        const n = Number(v);
                        if (!Number.isFinite(n)) return;
                        setItemsPerPage(n);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[120px] bg-transparent border-white/10 text-xs">
                        <SelectValue placeholder="Per page" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} / page
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Bulk actions toolbar */}
                {selectedIds.size > 0 && (
                  <div className="bg-muted/50 px-6 py-3 mb-2 rounded-lg flex items-center gap-4">
                    <span className="text-sm font-medium">{selectedIds.size} selected</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleBulkRemove} className="h-8">
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleBulkAddToShortlist} className="h-8">
                        <ListPlus className="h-3.5 w-3.5 mr-1.5" />
                        Add to Shortlist
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleBulkStartEngagement} className="h-8">
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Start Engagement
                      </Button>
                    </div>
                    <Button size="sm" variant="ghost" onClick={clearSelection} className="h-8 ml-auto">
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Clear
                    </Button>
                  </div>
                )}

                {/* Header Row */}
                <div className="hidden lg:flex items-center px-4 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-widest gap-3">
                  <div className="w-10 flex items-center justify-center">
                    <Checkbox
                      checked={paginatedTalents.length > 0 && paginatedTalents.every(t => selectedIds.has(t.id))}
                      onCheckedChange={() => toggleSelectAll(paginatedTalents.map(t => t.id))}
                    />
                  </div>
                  <div className="w-12 text-center shrink-0">#</div>
                  <div className="w-[180px] text-left cursor-pointer hover:text-foreground truncate" onClick={() => tableSort.toggle('full_name')}>
                    Candidate {tableSort.sort.key === 'full_name' && (tableSort.sort.dir === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="w-[200px] hidden xl:block text-left cursor-pointer hover:text-foreground truncate" onClick={() => tableSort.toggle('current_title')}>
                    Title {tableSort.sort.key === 'current_title' && (tableSort.sort.dir === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="w-[100px] hidden 2xl:block text-left cursor-pointer hover:text-foreground" onClick={() => tableSort.toggle('location')}>
                    Location {tableSort.sort.key === 'location' && (tableSort.sort.dir === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="w-16 hidden 2xl:block text-left cursor-pointer hover:text-foreground" onClick={() => tableSort.toggle('years_of_experience')}>
                    Exp {tableSort.sort.key === 'years_of_experience' && (tableSort.sort.dir === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="w-[140px] text-left cursor-pointer hover:text-foreground" onClick={() => tableSort.toggle('recruiter_status')}>
                    Status {tableSort.sort.key === 'recruiter_status' && (tableSort.sort.dir === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="w-16 text-left cursor-pointer hover:text-foreground" title="Resume quality (ATS-friendly)" onClick={() => tableSort.toggle('ats_score')}>
                    ATS {tableSort.sort.key === 'ats_score' && (tableSort.sort.dir === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="w-20 hidden xl:block text-left cursor-pointer hover:text-foreground whitespace-nowrap" onClick={() => tableSort.toggle('created_at')}>
                    Date {tableSort.sort.key === 'created_at' && (tableSort.sort.dir === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="w-[120px] hidden lg:block text-left cursor-pointer hover:text-foreground" onClick={() => tableSort.toggle('uploaded_by_user')}>
                    Uploaded By {tableSort.sort.key === 'uploaded_by_user' && (tableSort.sort.dir === 'asc' ? '↑' : '↓')}
                  </div>
                  <div className="w-[100px] text-left">Shortlist</div>
                  <div className="w-10"></div>
                </div>

                <div className="space-y-0.5 px-2">
                  {paginatedTalents.map((talent, idx) => (
                    <CompactTalentPoolRow
                      key={talent.id}
                      talent={talent}
                      displayId={groupedTalents.length - ((currentPage - 1) * itemsPerPage + idx)}
                      isEvenRow={idx % 2 === 0}
                      onViewProfile={handleTalentClick}
                      onRequestRemove={(candidateId) => requestRemove([candidateId])}
                      onAddToShortlist={openRowAddToShortlist}
                      onOpenShortlist={openShortlistPage}
                      shortlistButton={shortlistButtonByCandidateId?.[talent.id] ? { shortlistId: shortlistButtonByCandidateId[talent.id].shortlistId, label: shortlistButtonByCandidateId[talent.id].label } : null}
                      onStartEngagement={(candidateId) => {
                        setEngageCandidateId(candidateId);
                        setEngageOpen(true);
                      }}
                      isSelected={selectedIds.has(talent.id)}
                      onToggleSelect={() => toggleSelect(talent.id)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="p-4 border-t border-white/10 bg-black/20">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                            className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-white/10'}
                          />
                        </PaginationItem>
                        {getPageNumbers().map((page, idx) => (
                          <PaginationItem key={idx}>
                            {page === 'ellipsis' ? (
                              <PaginationEllipsis />
                            ) : (
                              <PaginationLink
                                onClick={() => handlePageChange(page as number)}
                                isActive={currentPage === page}
                                className="cursor-pointer hover:bg-white/10"
                              >
                                {page}
                              </PaginationLink>
                            )}
                          </PaginationItem>
                        ))}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                            className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:bg-white/10'}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

          </div>
        </div>
      </div>

      <TalentDetailSheet
        talentId={selectedTalentId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      <Dialog
        open={engageOpen}
        onOpenChange={(open) => {
          setEngageOpen(open);
          if (!open) {
            setEngageCandidateId(null);
            setEngageJobId('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-w-full glass-panel border-white/20">
          <DialogHeader>
            <DialogTitle>Start engagement</DialogTitle>
            {engageCandidateId === '__BULK__' && (
              <DialogDescription>
                Starting engagement for {selectedIds.size} candidate{selectedIds.size === 1 ? '' : 's'}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Job to submit for</Label>
              <Select value={engageJobId} onValueChange={setEngageJobId}>
                <SelectTrigger className="glass-input">
                  <SelectValue placeholder="Select a job" />
                </SelectTrigger>
                <SelectContent>
                  {(jobs || []).map((j: any) => (
                    <SelectItem key={j.id} value={String(j.id)} className="max-w-[320px]">
                      <span className="block max-w-[300px] truncate">{j.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Engagements are job-scoped so RTR/rate/offer can be tracked per submission.
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEngageOpen(false)} disabled={startEngagementMutation.isPending || startBulkEngagementMutation.isPending} className="hover:bg-white/5">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!engageCandidateId) return;
                  if (engageCandidateId === '__BULK__') {
                    startBulkEngagementMutation.mutate({
                      candidateIds: Array.from(selectedIds),
                      jobId: engageJobId,
                    });
                  } else {
                    startEngagementMutation.mutate({ candidateId: engageCandidateId, jobId: engageJobId });
                  }
                }}
                disabled={startEngagementMutation.isPending || startBulkEngagementMutation.isPending || !engageCandidateId || !engageJobId}
              >
                {(startEngagementMutation.isPending || startBulkEngagementMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Start
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rowShortlistDialogOpen}
        onOpenChange={(open) => {
          setRowShortlistDialogOpen(open);
          if (!open) {
            setRowShortlistCandidateId(null);
            setRowSelectedShortlistId('');
            setRowNewShortlistName('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-w-full glass-panel border-white/20">
          <DialogHeader>
            <DialogTitle>Add to shortlist</DialogTitle>
            <DialogDescription>
              {rowShortlistCandidateId === '__BULK__'
                ? `Select a shortlist (or create one) to add ${selectedIds.size} candidate${selectedIds.size === 1 ? '' : 's'}.`
                : 'Select a shortlist (or create one) to add this candidate.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Select value={rowSelectedShortlistId} onValueChange={(v) => setRowSelectedShortlistId(v)}>
              <SelectTrigger className="glass-input">
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
                value={rowNewShortlistName}
                onChange={(e) => setRowNewShortlistName(e.target.value)}
                placeholder="Create new shortlist…"
                className="glass-input"
              />
              <Button
                variant="secondary"
                onClick={() => createShortlistMutation.mutate({ name: rowNewShortlistName })}
                disabled={createShortlistMutation.isPending || !rowNewShortlistName.trim()}
              >
                {createShortlistMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRowShortlistDialogOpen(false);
              }}
              className="hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!rowShortlistCandidateId) return;
                if (!rowSelectedShortlistId) return toast.error('Select a shortlist');

                // Check if this is a bulk operation
                if (rowShortlistCandidateId === '__BULK__') {
                  addBulkToShortlistMutation.mutate({
                    shortlistId: rowSelectedShortlistId,
                    candidateIds: Array.from(selectedIds),
                  });
                } else {
                  addSingleToShortlistMutation.mutate({
                    shortlistId: rowSelectedShortlistId,
                    candidateId: rowShortlistCandidateId,
                  });
                }
              }}
              disabled={addSingleToShortlistMutation.isPending || addBulkToShortlistMutation.isPending}
            >
              {(addSingleToShortlistMutation.isPending || addBulkToShortlistMutation.isPending) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent className="glass-panel border-white/20">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete candidate profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected profile{removeCandidateIds.length === 1 ? '' : 's'} and all related records.
              This is only allowed for sourced profiles that aren’t shared with other orgs and have no applications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFromTalentPoolMutation.isPending} className="hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-none border-0"
              disabled={deleteFromTalentPoolMutation.isPending}
              onClick={() => {
                deleteFromTalentPoolMutation.mutate(removeCandidateIds);
              }}
            >
              {deleteFromTalentPoolMutation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
