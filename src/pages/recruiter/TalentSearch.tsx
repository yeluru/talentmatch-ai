import { useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation } from '@tanstack/react-query';
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

interface SearchResult {
  candidate_index: number;
  match_score: number;
  match_reason: string;
  matched_criteria?: string[];
  missing_criteria?: string[];
}

interface ParsedQuery {
  role?: string;
  location?: string;
  experience_level?: string;
  skills?: string[];
  industry?: string;
}

export default function TalentSearch() {
  const { roles } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);
  
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

  // Fetch all candidates in the org
  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ['org-candidates', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      // Get candidate profiles linked to org
      const { data: profiles, error } = await supabase
        .from('candidate_profiles')
        .select(`
          id,
          current_title,
          years_of_experience,
          summary,
          user_id,
          desired_locations
        `)
        .eq('organization_id', organizationId);
      
      if (error) throw error;

      // Get user profiles for names
      const userIds = profiles?.map(p => p.user_id) || [];
      const { data: userProfiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, location')
        .in('user_id', userIds);

      // Get skills for each candidate
      const candidateIds = profiles?.map(p => p.id) || [];
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('candidate_id, skill_name')
        .in('candidate_id', candidateIds);

      return profiles?.map(p => ({
        id: p.id,
        name: userProfiles?.find(up => up.user_id === p.user_id)?.full_name || 'Unknown',
        title: p.current_title,
        years_experience: p.years_of_experience,
        summary: p.summary,
        location: userProfiles?.find(up => up.user_id === p.user_id)?.location || p.desired_locations?.[0],
        skills: skills?.filter(s => s.candidate_id === p.id).map(s => s.skill_name) || []
      })) || [];
    },
    enabled: !!organizationId,
  });

  const searchMutation = useMutation({
    mutationFn: async (query: string) => {
      if (!candidates?.length) throw new Error('No candidates to search');
      
      const { data, error } = await supabase.functions.invoke('talent-search', {
        body: { searchQuery: query, candidates }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setResults(data.matches || []);
      setParsedQuery(data.parsed_query || null);
      toast.success(`Found ${data.matches?.length || 0} matching candidates`);
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

  const getCandidateByIndex = (index: number) => {
    return candidates?.[index - 1];
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-3">
            <Search className="h-8 w-8 text-accent" />
            AI Talent Search
          </h1>
          <p className="text-muted-foreground mt-1">
            Search for candidates using natural language - like having your own PeopleGPT
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Who are you looking for?</CardTitle>
            <CardDescription>
              Describe your ideal candidate in plain English. Example: "Senior React developer with 5+ years experience in fintech"
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Senior software engineer in San Francisco with startup experience..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={searchMutation.isPending || candidatesLoading}
              >
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
                <p className="text-sm text-muted-foreground mb-2">AI understood your query as:</p>
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

        {/* Results */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Search Results ({results.length} candidates)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {results
                  .sort((a, b) => b.match_score - a.match_score)
                  .map((result, idx) => {
                    const candidate = getCandidateByIndex(result.candidate_index);
                    if (!candidate) return null;
                    
                    return (
                      <div 
                        key={idx}
                        className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/10 text-accent text-sm font-medium">
                          #{idx + 1}
                        </div>
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-accent text-accent-foreground">
                            {candidate.name?.charAt(0) || 'C'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{candidate.name}</h4>
                            <ScoreBadge score={result.match_score} />
                          </div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                            <span className="flex items-center gap-1">
                              <Briefcase className="h-3.5 w-3.5" />
                              {candidate.title || 'No title'}
                            </span>
                            {candidate.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {candidate.location}
                              </span>
                            )}
                            <span>{candidate.years_experience || 0} years exp.</span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            {result.match_reason}
                          </p>
                          
                          {result.matched_criteria && result.matched_criteria.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {result.matched_criteria.map((c, i) => (
                                <Badge key={i} variant="secondary" className="text-xs bg-success/10 text-success">
                                  ✓ {c}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          {candidate.skills?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {candidate.skills.slice(0, 6).map((skill, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {skill}
                                </Badge>
                              ))}
                              {candidate.skills.length > 6 && (
                                <Badge variant="outline" className="text-xs">
                                  +{candidate.skills.length - 6} more
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <Button variant="outline" size="sm">
                          <UserPlus className="h-4 w-4 mr-1" />
                          Add to Shortlist
                        </Button>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {!candidatesLoading && (!candidates || candidates.length === 0) && (
          <EmptyState
            icon={Users}
            title="No candidates in your organization"
            description="Invite candidates to join your organization first"
          />
        )}
      </div>
    </DashboardLayout>
  );
}
