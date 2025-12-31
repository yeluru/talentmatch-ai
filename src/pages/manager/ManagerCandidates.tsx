import { useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Search, 
  MapPin, 
  Briefcase,
  Loader2,
  Users,
  Mail,
  Phone,
  Linkedin,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { PullToRefreshIndicator } from '@/components/ui/pull-to-refresh-indicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { MobileListHeader } from '@/components/ui/mobile-list-header';
import { TalentDetailSheet } from '@/components/recruiter/TalentDetailSheet';

interface CandidateProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  current_title: string | null;
  current_company: string | null;
  location: string | null;
  years_of_experience: number | null;
  recruiter_status: string | null;
  created_at: string;
  is_actively_looking: boolean | null;
}

export default function ManagerCandidates() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateProfile | null>(null);
  
  const organizationId = roles.find(r => r.role === 'account_manager')?.organization_id;

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['manager-candidates', organizationId] });
  }, [queryClient, organizationId]);

  const { pullDistance, refreshing: isRefreshing } = usePullToRefresh({
    enabled: isMobile,
    onRefresh: handleRefresh,
  });

  // Fetch all candidates in the organization
  const { data: candidates, isLoading } = useQuery<CandidateProfile[]>({
    queryKey: ['manager-candidates', organizationId],
    queryFn: async (): Promise<CandidateProfile[]> => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const filteredCandidates = candidates?.filter((candidate) => {
    const name = candidate.full_name || '';
    const title = candidate.current_title || '';
    const email = candidate.email || '';
    const matchesSearch =
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || candidate.recruiter_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string | null) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      new: { label: 'New', variant: 'default' },
      contacted: { label: 'Contacted', variant: 'secondary' },
      screening: { label: 'Screening', variant: 'outline' },
      qualified: { label: 'Qualified', variant: 'default' },
      not_qualified: { label: 'Not Qualified', variant: 'destructive' },
    };
    const config = statusConfig[status || 'new'] || statusConfig.new;
    return <Badge variant={config.variant}>{config.label}</Badge>;
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
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <MobileListHeader
        title="Organization Candidates"
        subtitle="View all candidates in your organization's talent pool"
        filterCount={statusFilter !== 'all' ? 1 : 0}
      >
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, title, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="screening">Screening</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
              <SelectItem value="not_qualified">Not Qualified</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </MobileListHeader>

      <Card className="mt-4">
        <CardContent className="pt-6">
          {!filteredCandidates?.length ? (
            <EmptyState
              icon={Users}
              title="No candidates found"
              description={candidates?.length ? "Try adjusting your filters" : "Candidates will appear here when added to your organization"}
            />
          ) : isMobile ? (
            <div className="divide-y">
              {filteredCandidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="py-4 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/50 -mx-4 px-4 transition-colors"
                  onClick={() => setSelectedCandidate(candidate)}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="bg-accent text-accent-foreground">
                        {(candidate.full_name || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {candidate.full_name || 'Unknown'}
                        </span>
                        {getStatusBadge(candidate.recruiter_status)}
                      </div>
                      {candidate.current_title && (
                        <div className="text-sm text-muted-foreground truncate">
                          {candidate.current_title}
                          {candidate.current_company && ` at ${candidate.current_company}`}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {candidate.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {candidate.location}
                          </span>
                        )}
                        {candidate.years_of_experience !== null && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {candidate.years_of_experience} yrs
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCandidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-accent text-accent-foreground text-sm">
                            {(candidate.full_name || 'U').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{candidate.full_name || 'Unknown'}</div>
                          {candidate.current_company && (
                            <div className="text-xs text-muted-foreground">{candidate.current_company}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {candidate.current_title || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {candidate.location || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {candidate.years_of_experience !== null ? `${candidate.years_of_experience} years` : '-'}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(candidate.recruiter_status)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {candidate.email && (
                          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                            <a href={`mailto:${candidate.email}`}>
                              <Mail className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {candidate.phone && (
                          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                            <a href={`tel:${candidate.phone}`}>
                              <Phone className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {candidate.linkedin_url && (
                          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                            <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer">
                              <Linkedin className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(candidate.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedCandidate(candidate)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Candidate Detail Sheet */}
      <TalentDetailSheet
        open={!!selectedCandidate}
        onOpenChange={(open) => !open && setSelectedCandidate(null)}
        talentId={selectedCandidate?.id || null}
      />

      <ScrollToTop />
    </DashboardLayout>
  );
}
