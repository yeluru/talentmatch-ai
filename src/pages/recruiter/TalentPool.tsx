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
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Search, Loader2, Users, Briefcase, MapPin, ArrowUpDown, Filter, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ScoreBadge } from '@/components/ui/score-badge';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';
import { format } from 'date-fns';

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

export default function TalentPool() {
  const { roles } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [companyFilter, setCompanyFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [experienceFilter, setExperienceFilter] = useState<string>('');
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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
      // Text search
      const name = t.full_name || '';
      const title = t.current_title || '';
      const skillsText = t.skills.map((s) => s.skill_name).join(' ');
      const companiesText = t.companies.join(' ');
      const searchLower = searchQuery.toLowerCase();

      const matchesSearch =
        !searchQuery ||
        name.toLowerCase().includes(searchLower) ||
        title.toLowerCase().includes(searchLower) ||
        skillsText.toLowerCase().includes(searchLower) ||
        companiesText.toLowerCase().includes(searchLower);

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
                  placeholder="Search by name, title, skills, or company..."
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
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Companies</SelectItem>
                  {uniqueCompanies.map((company) => (
                    <SelectItem key={company} value={company}>
                      {company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Locations</SelectItem>
                  {uniqueLocations.map((location) => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={experienceFilter} onValueChange={setExperienceFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Experience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Levels</SelectItem>
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
              <div className="divide-y">
                {filteredTalents.map((talent) => (
                  <div
                    key={talent.id}
                    className="py-4 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/50 -mx-4 px-4 transition-colors"
                    onClick={() => handleTalentClick(talent.id)}
                  >
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-accent text-accent-foreground">
                          {(talent.full_name || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
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
            )}
          </CardContent>
        </Card>
      </div>

      <TalentDetailSheet
        talentId={selectedTalentId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </DashboardLayout>
  );
}
