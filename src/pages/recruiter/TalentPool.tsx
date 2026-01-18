import { useEffect, useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Users, Briefcase, MapPin, ArrowUpDown, Filter, X, ListPlus, Send, CheckSquare, MessageSquare, Save, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { TalentPoolRow } from '@/components/recruiter/TalentPoolRow';
import { TalentPoolGroupedRow } from '@/components/recruiter/TalentPoolGroupedRow';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { PullToRefreshIndicator } from '@/components/ui/pull-to-refresh-indicator';
import { MobileListHeader } from '@/components/ui/mobile-list-header';

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
  skills: {
    skill_name: string;
  }[];
  companies: string[];
}

type SortOption = 'date_desc' | 'date_asc' | 'score_desc' | 'score_asc' | 'name_asc';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
];

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
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const organizationId = roles.find((r) => r.role === 'recruiter')?.organization_id;

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
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
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [recentViews, setRecentViews] = useState<{ id: string; ts: number }[]>(() =>
    loadRecentViews(organizationId || '')
  );

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

  const { data: talents, isLoading } = useQuery({
    queryKey: ['talent-pool', organizationId],
    queryFn: async (): Promise<TalentProfile[]> => {
      if (!organizationId) return [];


      // 1) Candidates sourced into this org (uploaded/imported)
      //
      // IMPORTANT:
      // Recruiter visibility is enforced via RLS using candidate_org_links (see recruiter_can_access_candidate()).
      // The legacy candidate_profiles.organization_id field is no longer authoritative for access decisions.
      //
      // So we derive sourced candidates from candidate_org_links, then fetch their profiles.
      const { data: sourcedLinks, error: sourcedLinksError } = await supabase
        .from('candidate_org_links')
        .select('candidate_id')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        // link_type is not an enum; bulk import currently writes the request `source` string.
        // Support both current values and legacy/backfill values.
        .in('link_type', [
          'resume_upload',
          'web_search',
          'sourced_resume',
          'sourced_web',
          'sourced',
          'unknown',
        ]);

      if (sourcedLinksError) throw sourcedLinksError;

      const sourcedIds = Array.from(
        new Set((sourcedLinks || []).map((l: any) => l.candidate_id).filter(Boolean))
      ) as string[];

      let sourced: TalentProfile[] = [];
      if (sourcedIds.length) {
        const { data: sourcedProfiles, error: sourcedProfilesError } = await supabase
          .from('candidate_profiles')
          .select(
            `
            id,
            full_name,
            email,
            location,
            current_title,
            current_company,
            years_of_experience,
            headline,
            ats_score,
            created_at,
            recruiter_notes,
            recruiter_status
          `
          )
          .in('id', sourcedIds)
          .is('user_id', null);

        if (sourcedProfilesError) throw sourcedProfilesError;
        sourced = (sourcedProfiles || []) as TalentProfile[];
      }

      // 2) Candidates who applied to this org's jobs
      const { data: applicantLinks, error: applicantLinksError } = await supabase
        .from('applications')
        .select('candidate_id, jobs!inner(organization_id)')
        .eq('jobs.organization_id', organizationId);

      if (applicantLinksError) throw applicantLinksError;

      const applicantIds = Array.from(
        new Set((applicantLinks || []).map((a) => a.candidate_id).filter(Boolean))
      ) as string[];

      let applicants: TalentProfile[] = [];
      if (applicantIds.length) {
        const { data: applicantProfiles, error: applicantProfilesError } = await supabase
          .from('candidate_profiles')
          .select(
            `
            id,
            full_name,
            email,
            location,
            current_title,
            current_company,
            years_of_experience,
            headline,
            ats_score,
            created_at,
            recruiter_notes,
            recruiter_status
          `
          )
          .in('id', applicantIds);

        if (applicantProfilesError) throw applicantProfilesError;
        applicants = (applicantProfiles || []) as TalentProfile[];
      }

      const candidates = [...(sourced || []), ...(applicants || [])];
      console.debug('[TalentPool] sourced:', sourced?.length || 0, 'applicants:', applicants?.length || 0);

      if (!candidates.length) return [];

      // De-dupe by id
      const byId = new Map<string, any>();
      for (const c of candidates) byId.set(c.id, c);
      const deduped = Array.from(byId.values());

      // Get skills
      const candidateIds = deduped.map((c) => c.id);
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name')
        .in('candidate_id', candidateIds);

      // Get experience for company list
      const { data: experience } = await supabase
        .from('candidate_experience')
        .select('candidate_id, company_name')
        .in('candidate_id', candidateIds);

      const result = deduped
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((c) => ({
          ...c,
          skills: skills?.filter((s) => s.candidate_id === c.id) || [],
          companies: [
            ...new Set(
              experience
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

  // Add to shortlist mutation
  const addToShortlistMutation = useMutation({
    mutationFn: async ({ shortlistId, candidateIds }: { shortlistId: string; candidateIds: string[] }) => {
      const inserts = candidateIds.map((candidateId) => ({
        shortlist_id: shortlistId,
        candidate_id: candidateId,
        added_by: user?.id || '',
      }));
      const { error } = await supabase.from('shortlist_candidates').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Added ${selectedIds.size} candidates to shortlist`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
    },
    onError: () => {
      toast.error('Failed to add candidates to shortlist');
    },
  });

  // Add to campaign mutation
  const addToCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, candidateIds }: { campaignId: string; candidateIds: string[] }) => {
      // Get emails for selected candidates
      const selectedTalents = talents?.filter((t) => candidateIds.includes(t.id)) || [];
      const inserts = selectedTalents
        .filter((t) => t.email)
        .map((t) => ({
          campaign_id: campaignId,
          candidate_id: t.id,
          email: t.email!,
        }));
      if (inserts.length === 0) throw new Error('No candidates with email addresses');
      const { error } = await supabase.from('campaign_recipients').insert(inserts);
      if (error) throw error;
      return inserts.length;
    },
    onSuccess: (count) => {
      toast.success(`Added ${count} candidates to campaign`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['campaign-recipients'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add candidates to campaign');
    },
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
      return data as any;
    },
    onSuccess: (data) => {
      const deleted = Number((data as any)?.results?.deleted ?? 0);
      const skipped = Number((data as any)?.results?.skipped ?? 0);
      if (deleted > 0 && skipped === 0) toast.success(`Deleted ${deleted} profile${deleted === 1 ? '' : 's'}`);
      else if (deleted > 0) toast.success(`Deleted ${deleted}, skipped ${skipped}`);
      else toast.error('Nothing was deleted');
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['talent-pool', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to delete');
    },
  });

  const requestRemove = (candidateIds: string[]) => {
    const uniq = Array.from(new Set(candidateIds.map(String))).map((s) => s.trim()).filter(Boolean);
    if (uniq.length === 0) return;
    setRemoveCandidateIds(uniq);
    setRemoveDialogOpen(true);
  };

  // Extract unique companies and locations for filter dropdowns
  const uniqueCompanies = useMemo(() => {
    if (!talents) return [];
    const companies = new Set<string>();
    talents.forEach((t) => t.companies.forEach((c) => companies.add(c)));
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
      const skillsText = t.skills.map((s) => s.skill_name.toLowerCase()).join(' ');
      const companiesText = t.companies.map((c) => c.toLowerCase()).join(' ');
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
        !companyFilter || t.companies.some((c) => c.toLowerCase().includes(companyFilter.toLowerCase()));

      // Location filter
      const matchesLocation =
        !locationFilter ||
        (t.location && t.location.toLowerCase().includes(locationFilter.toLowerCase()));

      // Status filter
      const matchesStatus =
        !statusFilter ||
        ((t.recruiter_status || '').toLowerCase().trim() === statusFilter.toLowerCase().trim());

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

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'score_desc':
          return (b.ats_score || 0) - (a.ats_score || 0);
        case 'score_asc':
          return (a.ats_score || 0) - (b.ats_score || 0);
        case 'name_asc':
          return (a.full_name || '').localeCompare(b.full_name || '');
        default:
          return 0;
      }
    });

    return result;
  }, [
    talents,
    searchQuery,
    sortBy,
    companyFilter,
    locationFilter,
    statusFilter,
    experienceFilter,
    activeView,
    recentViews,
  ]);

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
  }, [searchQuery, companyFilter, locationFilter, statusFilter, experienceFilter, sortBy, activeView, itemsPerPage]);

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

  // Bulk selection handlers
  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedTalents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedTalents.map((t) => t.id)));
    }
  };

  const handleAddToShortlist = (shortlistId: string) => {
    addToShortlistMutation.mutate({
      shortlistId,
      candidateIds: Array.from(selectedIds),
    });
  };

  const handleAddToCampaign = (campaignId: string) => {
    addToCampaignMutation.mutate({
      campaignId,
      candidateIds: Array.from(selectedIds),
    });
  };

  const handleRemoveSelected = () => {
    requestRemove(Array.from(selectedIds));
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
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
    <div className="space-y-3">
      {/* Search row (hero) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder='Search (boolean): "fannie and freddie", react or angular'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="h-11 w-full sm:w-[180px]">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest First</SelectItem>
              <SelectItem value="date_asc">Oldest First</SelectItem>
              <SelectItem value="score_desc">Highest Score</SelectItem>
              <SelectItem value="score_asc">Lowest Score</SelectItem>
              <SelectItem value="name_asc">Name A-Z</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-11 whitespace-nowrap">
                <Filter className="h-4 w-4 mr-2" />
                More filters
                {filterCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {filterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px]">
              <div className="space-y-3">
                <div className="text-sm font-medium">Filters</div>

                <Select value={companyFilter || "all"} onValueChange={(v) => setCompanyFilter(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Company" />
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

                <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Location" />
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

                <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
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

                <Select value={experienceFilter || "all"} onValueChange={(v) => setExperienceFilter(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Experience" />
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

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full justify-start">
                    <X className="h-4 w-4 mr-2" />
                    Clear filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Views row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 overflow-x-auto">
          <ToggleGroup
            type="single"
            value={activeView}
            onValueChange={(v) => setActiveView((v as TalentPoolView) || 'all')}
            className="justify-start"
          >
            <ToggleGroupItem value="all" aria-label="All">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="new" aria-label="New">
              New
            </ToggleGroupItem>
            <ToggleGroupItem value="high_score" aria-label="High score">
              High score
            </ToggleGroupItem>
            <ToggleGroupItem value="recent" aria-label="Recently viewed">
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
            className="whitespace-nowrap"
          >
            <X className="h-4 w-4 mr-1" />
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

      {/* Mobile: keep the existing top sheet header UX */}
      {isMobile && (
        <MobileListHeader
          title="Talent Pool"
          subtitle="Sourced profiles from bulk uploads and searches"
          filterCount={filterCount}
        >
          {filtersContent}
        </MobileListHeader>
      )}

      {/* Desktop: compact filter bar above results */}
      {!isMobile && (
        <Card className="mt-4">
          <CardContent className="p-4">
            {filtersContent}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0">
            <CardTitle>Talent Pool</CardTitle>
            <CardDescription>
              {groupedTalents.length > 0
                ? `Showing ${((currentPage - 1) * itemsPerPage) + 1}-${Math.min(currentPage * itemsPerPage, groupedTalents.length)} of ${groupedTalents.length} candidates (${filteredTalents.length} profiles)`
                : 'Sourced profiles from bulk uploads and searches'}
            </CardDescription>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <Select
              value={String(itemsPerPage)}
              onValueChange={(v) => {
                const n = Number(v);
                if (!Number.isFinite(n)) return;
                setItemsPerPage(n);
              }}
            >
              <SelectTrigger className="h-9 w-[140px]">
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

            <Badge variant="secondary">
              {filteredTalents.length} profile{filteredTalents.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!filteredTalents?.length ? (
            <EmptyState
              icon={Users}
              title={hasActiveFilters || searchQuery.trim() ? 'No matches found' : 'No profiles in talent pool'}
              description={
                hasActiveFilters || searchQuery.trim()
                  ? 'Try adjusting your search or filters'
                  : 'Import candidates via Talent Sourcing to build your pool'
              }
            />
          ) : (
            <>
              {/* Select All Row */}
              <div className="flex items-center gap-3 pb-3 mb-3 border-b">
                <Checkbox
                  checked={paginatedTalents.length > 0 && selectedIds.size === paginatedTalents.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all on this page"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} selected`
                    : 'Select all on this page'}
                </span>
              </div>

              <div className="space-y-3">
                {paginatedGroups.map((group, idx) => (
                  <TalentPoolGroupedRow
                    key={group[0]?.email || group[0]?.id || idx}
                    profiles={group}
                    selectedIds={selectedIds}
                    onToggleSelection={toggleSelection}
                    onViewProfile={handleTalentClick}
                    onRequestRemove={(candidateId) => requestRemove([candidateId])}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 pt-4 border-t">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {getPageNumbers().map((page, idx) => (
                        <PaginationItem key={idx}>
                          {page === 'ellipsis' ? (
                            <PaginationEllipsis />
                          ) : (
                            <PaginationLink
                              onClick={() => handlePageChange(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                          className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground shadow-lg rounded-2xl sm:rounded-full px-4 sm:px-6 py-3 flex flex-wrap items-center justify-center gap-2 sm:gap-4 animate-in slide-in-from-bottom-4 duration-300 w-[min(46rem,calc(100vw-1.5rem))] sm:w-auto">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            <span className="font-medium">{selectedIds.size} selected</span>
          </div>
          <div className="h-6 w-px bg-primary-foreground/30" />
          
          {/* Add to Shortlist Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/20"
                disabled={!shortlists?.length || addToShortlistMutation.isPending}
              >
                {addToShortlistMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ListPlus className="h-4 w-4 mr-2" />
                )}
                Add to Shortlist
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56">
              <DropdownMenuLabel>Select Shortlist</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {shortlists?.length ? (
                shortlists.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => handleAddToShortlist(s.id)}
                  >
                    {s.name}
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No shortlists available
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Add to Campaign Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/20"
                disabled={!campaigns?.length || addToCampaignMutation.isPending}
              >
                {addToCampaignMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Add to Campaign
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56">
              <DropdownMenuLabel>Select Campaign</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {campaigns?.length ? (
                campaigns.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => handleAddToCampaign(c.id)}
                  >
                    {c.name}
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No campaigns available
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/20"
            onClick={handleRemoveSelected}
            disabled={selectedIds.size === 0 || deleteFromTalentPoolMutation.isPending}
            title="Delete selected (hard delete)"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <TalentDetailSheet
        talentId={selectedTalentId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete candidate profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected profile{removeCandidateIds.length === 1 ? '' : 's'} and all related records.
              This is only allowed for sourced profiles that aren’t shared with other orgs and have no applications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFromTalentPoolMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteFromTalentPoolMutation.isPending}
              onClick={() => {
                deleteFromTalentPoolMutation.mutate(removeCandidateIds);
                setRemoveCandidateIds([]);
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
