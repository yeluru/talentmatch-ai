import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Users, Briefcase, MapPin, ArrowUpDown, Filter, X, ListPlus, Send, CheckSquare } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';
import { format } from 'date-fns';
import { toast } from 'sonner';


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
  skills: {
    skill_name: string;
  }[];
  companies: string[];
}

type SortOption = 'date_desc' | 'date_asc' | 'score_desc' | 'score_asc' | 'name_asc';

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry (0-2 years)', min: 0, max: 2 },
  { value: 'mid', label: 'Mid-Level (3-5 years)', min: 3, max: 5 },
  { value: 'senior', label: 'Senior (6-10 years)', min: 6, max: 10 },
  { value: 'lead', label: 'Lead (10+ years)', min: 10, max: 100 },
];

const ITEMS_PER_PAGE = 10;

export default function TalentPool() {
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [companyFilter, setCompanyFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState<string>('');
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const organizationId = roles.find((r) => r.role === 'recruiter')?.organization_id;

  const { data: talents, isLoading } = useQuery({
    queryKey: ['talent-pool', organizationId],
    queryFn: async (): Promise<TalentProfile[]> => {
      if (!organizationId) return [];

      // Get sourced candidate profiles (user_id is null) for this organization
      const { data: candidates, error } = await supabase
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
          created_at
        `
        )
        .eq('organization_id', organizationId)
        .is('user_id', null) // Only sourced profiles
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!candidates?.length) return [];

      // Get skills
      const candidateIds = candidates.map((c) => c.id);
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name')
        .in('candidate_id', candidateIds);

      // Get experience for company list
      const { data: experience } = await supabase
        .from('candidate_experience')
        .select('candidate_id, company_name')
        .in('candidate_id', candidateIds);

      return candidates.map((c) => ({
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

  // Filter and sort talents
  const filteredTalents = useMemo(() => {
    if (!talents) return [];

    let result = talents.filter((t) => {
      // Text search with boolean OR support (comma-separated terms)
      const name = (t.full_name || '').toLowerCase();
      const title = (t.current_title || '').toLowerCase();
      const headline = (t.headline || '').toLowerCase();
      const skillsText = t.skills.map((s) => s.skill_name.toLowerCase()).join(' ');
      const companiesText = t.companies.map((c) => c.toLowerCase()).join(' ');
      const location = (t.location || '').toLowerCase();
      const searchableText = `${name} ${title} ${headline} ${skillsText} ${companiesText} ${location}`;

      // Parse search terms: split by comma or " or ", trim whitespace, filter empty
      const searchTerms = searchQuery
        .split(/,|\s+or\s+/i)
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term.length > 0);

      // Match if ANY term is found (OR logic)
      const matchesSearch =
        searchTerms.length === 0 ||
        searchTerms.some((term) => searchableText.includes(term));

      // Company filter
      const matchesCompany =
        !companyFilter || t.companies.some((c) => c.toLowerCase().includes(companyFilter.toLowerCase()));

      // Location filter
      const matchesLocation =
        !locationFilter ||
        (t.location && t.location.toLowerCase().includes(locationFilter.toLowerCase()));

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

      return matchesSearch && matchesCompany && matchesLocation && matchesExperience;
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
  }, [talents, searchQuery, sortBy, companyFilter, locationFilter, experienceFilter]);

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchQuery, companyFilter, locationFilter, experienceFilter, sortBy]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredTalents.length / ITEMS_PER_PAGE);
  const paginatedTalents = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTalents.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTalents, currentPage]);

  const hasActiveFilters = companyFilter || locationFilter || experienceFilter;

  const clearFilters = () => {
    setCompanyFilter('');
    setLocationFilter('');
    setExperienceFilter('');
  };

  const handleTalentClick = (id: string) => {
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Talent Pool</h1>
          <p className="text-muted-foreground mt-1">
            Sourced profiles from bulk uploads and searches
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            {/* Search and Sort Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Boolean search: Fannie, Freddie or react (use comma or 'or')"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-full sm:w-48">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">Newest First</SelectItem>
                  <SelectItem value="date_asc">Oldest First</SelectItem>
                  <SelectItem value="score_desc">Highest Score</SelectItem>
                  <SelectItem value="score_asc">Lowest Score</SelectItem>
                  <SelectItem value="name_asc">Name A-Z</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filters Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                Filters:
              </div>
              <Select value={companyFilter || "all"} onValueChange={(v) => setCompanyFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-44">
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
                <SelectTrigger className="w-full sm:w-44">
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
              <Select value={experienceFilter || "all"} onValueChange={(v) => setExperienceFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-full sm:w-44">
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
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>

            {/* Results count */}
            {filteredTalents.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredTalents.length)} of {filteredTalents.length} profiles
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!filteredTalents?.length ? (
              <EmptyState
                icon={Users}
                title={hasActiveFilters ? 'No matches found' : 'No profiles in talent pool'}
                description={
                  hasActiveFilters
                    ? 'Try adjusting your filters'
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

                <div className="divide-y">
                  {paginatedTalents.map((talent) => (
                    <div
                      key={talent.id}
                      className={`py-4 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/50 -mx-4 px-4 transition-colors ${
                        selectedIds.has(talent.id) ? 'bg-muted/30' : ''
                      }`}
                      onClick={() => handleTalentClick(talent.id)}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedIds.has(talent.id)}
                            onClick={(e) => toggleSelection(talent.id, e)}
                            onCheckedChange={() => {}}
                            aria-label={`Select ${talent.full_name || 'talent'}`}
                          />
                          <Avatar className="h-12 w-12">
                            <AvatarFallback className="bg-accent text-accent-foreground">
                              {(talent.full_name || 'U').charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{talent.full_name || 'Unknown'}</h3>
                            {talent.ats_score && <ScoreBadge score={talent.ats_score} size="sm" />}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                            {talent.current_title && (
                              <span className="flex items-center gap-1">
                                <Briefcase className="h-3.5 w-3.5" />
                                {talent.current_title}
                                {talent.current_company && ` at ${talent.current_company}`}
                              </span>
                            )}
                            {talent.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {talent.location}
                              </span>
                            )}
                            {talent.years_of_experience !== null && (
                              <span>{talent.years_of_experience} yrs exp</span>
                            )}
                          </div>
                          {talent.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {talent.skills.slice(0, 5).map((skill, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {skill.skill_name}
                                </Badge>
                              ))}
                              {talent.skills.length > 5 && (
                                <Badge variant="outline" className="text-xs">
                                  +{talent.skills.length - 5} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Added {format(new Date(talent.created_at), 'MMM d')}
                        </div>
                      </div>
                    </div>
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
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground shadow-lg rounded-full px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-300">
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
    </DashboardLayout>
  );
}
