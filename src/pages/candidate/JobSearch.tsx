import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Search, MapPin, Briefcase, Clock, Building2, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { PullToRefreshIndicator } from '@/components/ui/pull-to-refresh-indicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListHeader } from '@/components/ui/mobile-list-header';

interface Job {
  id: string;
  title: string;
  description: string;
  location: string | null;
  is_remote: boolean | null;
  job_type: string | null;
  experience_level: string | null;
  required_skills: string[] | null;
  posted_at: string | null;
  organization_id: string;
  organization?: { name: string; logo_url: string | null };
}

export default function JobSearch() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [experienceLevel, setExperienceLevel] = useState<string>('');
  const [jobType, setJobType] = useState<string>('');
  const isMobile = useIsMobile();

  const fetchJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from('jobs')
        .select(`
          *,
          organization:organizations(name, logo_url)
        `)
        .eq('status', 'published')
        .order('posted_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const { pullDistance, refreshing: isRefreshing } = usePullToRefresh({
    enabled: isMobile,
    onRefresh: fetchJobs,
  });

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = searchQuery === '' || 
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.required_skills?.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesLocation = locationFilter === '' ||
      job.location?.toLowerCase().includes(locationFilter.toLowerCase());

    const matchesRemote = !remoteOnly || job.is_remote;

    const matchesExperience = experienceLevel === '' || experienceLevel === 'all' ||
      job.experience_level === experienceLevel;

    const matchesJobType = jobType === '' || jobType === 'all' ||
      job.job_type === jobType;

    return matchesSearch && matchesLocation && matchesRemote && matchesExperience && matchesJobType;
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <MobileListHeader
        title="Find Jobs"
        subtitle="Discover opportunities that match your skills"
        filterCount={
          (locationFilter ? 1 : 0) + 
          (remoteOnly ? 1 : 0) + 
          (experienceLevel && experienceLevel !== 'all' ? 1 : 0) + 
          (jobType && jobType !== 'all' ? 1 : 0)
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs, skills, companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Input
            placeholder="Location"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          />
          <Select value={experienceLevel} onValueChange={setExperienceLevel}>
            <SelectTrigger>
              <SelectValue placeholder="Experience Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="entry">Entry Level</SelectItem>
              <SelectItem value="mid">Mid Level</SelectItem>
              <SelectItem value="senior">Senior Level</SelectItem>
              <SelectItem value="lead">Lead / Manager</SelectItem>
            </SelectContent>
          </Select>
          <Select value={jobType} onValueChange={setJobType}>
            <SelectTrigger>
              <SelectValue placeholder="Job Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="full_time">Full-time</SelectItem>
              <SelectItem value="part_time">Part-time</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="internship">Internship</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox
              id="remote"
              checked={remoteOnly}
              onCheckedChange={(checked) => setRemoteOnly(checked as boolean)}
            />
            <label htmlFor="remote" className="text-sm cursor-pointer">
              Remote only
            </label>
          </div>
        </div>
      </MobileListHeader>

      <div className="space-y-4 mt-4">
        {/* Results count */}
        <p className="text-muted-foreground text-sm">
          {filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'} found
        </p>

        {filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No jobs found</h3>
              <p className="text-muted-foreground text-center">
                If you’re expecting jobs from a specific recruiting company, ask them for an invite code (to unlock tenant-private jobs). Otherwise, browse marketplace jobs (public jobs) posted by employers.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredJobs.map((job) => (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                          {job.organization?.logo_url ? (
                            <img src={job.organization.logo_url} alt="" className="h-8 w-8 object-contain" />
                          ) : (
                            <Building2 className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1">
                          <Link to={`/candidate/jobs/${job.id}`} className="hover:underline">
                            <h3 className="font-semibold text-lg">{job.title}</h3>
                          </Link>
                          <p className="text-muted-foreground">{job.organization?.name || 'Company'}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {job.location && (
                              <Badge variant="outline" className="font-normal">
                                <MapPin className="mr-1 h-3 w-3" />
                                {job.location}
                              </Badge>
                            )}
                            {job.is_remote && (
                              <Badge variant="secondary">Remote</Badge>
                            )}
                            {job.job_type && (
                              <Badge variant="outline" className="font-normal">
                                <Briefcase className="mr-1 h-3 w-3" />
                                {job.job_type}
                              </Badge>
                            )}
                            {job.experience_level && (
                              <Badge variant="outline" className="font-normal capitalize">
                                {job.experience_level}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                        {job.description}
                      </p>
                      {job.required_skills && job.required_skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {job.required_skills.slice(0, 5).map((skill, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                          {job.required_skills.length > 5 && (
                            <Badge variant="secondary" className="text-xs">
                              +{job.required_skills.length - 5} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 lg:min-w-48">
                      <div className="text-right">
                        {job.posted_at && (
                          <p className="text-sm text-muted-foreground">
                            <Clock className="inline mr-1 h-3 w-3" />
                            {format(new Date(job.posted_at), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                      <Button asChild className="w-full lg:w-auto">
                        <Link to={`/candidate/jobs/${job.id}`}>
                          View Job
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <ScrollToTop />
    </DashboardLayout>
  );
}
