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
          <Loader2 className="h-8 w-8 animate-spin text-primary" strokeWidth={1.5} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="shrink-0">
      <MobileListHeader
        title={<>Find <span className="text-gradient-candidate">Jobs</span></>}
        subtitle="Discover opportunities that match your skills"
        filterCount={
          (locationFilter ? 1 : 0) +
          (remoteOnly ? 1 : 0) +
          (experienceLevel && experienceLevel !== 'all' ? 1 : 0) +
          (jobType && jobType !== 'all' ? 1 : 0)
        }
      >
        <div className="space-y-4 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search jobs, skills, companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-blue-500/20 font-sans"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-blue-500/20 font-sans"
            />
            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
              <SelectTrigger className="h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-blue-500/20 font-sans">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="entry">Entry Level</SelectItem>
                <SelectItem value="mid">Mid Level</SelectItem>
                <SelectItem value="senior">Senior Level</SelectItem>
                <SelectItem value="lead">Lead / Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Select value={jobType} onValueChange={setJobType}>
              <SelectTrigger className="w-[180px] h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-blue-500/20 font-sans">
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

            <div className="flex items-center gap-2 bg-blue-500/5 px-3 py-2 rounded-lg border border-blue-500/10">
              <Checkbox
                id="remote"
                checked={remoteOnly}
                onCheckedChange={(checked) => setRemoteOnly(checked as boolean)}
                className="data-[state=checked]:bg-blue-500/20 data-[state=checked]:border-blue-500/30"
              />
              <label htmlFor="remote" className="text-sm font-sans cursor-pointer font-medium">
                Remote only
              </label>
            </div>
          </div>
        </div>
      </MobileListHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-4 mt-4 pb-6">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              <h2 className="text-lg font-display font-bold text-foreground">Results</h2>
            </div>
            <p className="text-sm font-sans text-muted-foreground mb-4">
              {filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'} found matching your filters.
            </p>

            {filteredJobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-blue-500/20 bg-blue-500/5 py-12 flex flex-col items-center justify-center text-center">
                <div className="h-16 w-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                  <Search className="h-8 w-8 text-blue-500" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-display font-bold text-foreground mb-2">No jobs found</h3>
                <p className="max-w-md text-muted-foreground font-sans text-base">
              If you’re expecting jobs from a specific recruiting company, ask them for an invite code. Otherwise, adjust your filters to see more results.
            </p>
          </div>
            ) : (
              <div className="space-y-4">
                {filteredJobs.map((job) => (
                  <Link
                    key={job.id}
                    to={`/candidate/jobs/${job.id}`}
                    className="group block rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:border-blue-500/30 hover:bg-blue-500/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2"
                  >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-start gap-5">
                      <div className="h-14 w-14 rounded-xl bg-card border border-border flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-105">
                        {job.organization?.logo_url ? (
                          <img src={job.organization.logo_url} alt="" className="h-9 w-9 object-contain" />
                        ) : (
                          <Building2 className="h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-bold text-xl truncate pr-4 text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{job.title}</h3>
                        <p className="text-muted-foreground font-sans font-medium text-sm mt-1">{job.organization?.name || 'Company'}</p>

                        <div className="flex flex-wrap gap-2 mt-3">
                          {job.location && (
                            <Badge variant="secondary" className="bg-muted/50 font-sans font-normal border-border">
                              <MapPin className="mr-1 h-3 w-3" strokeWidth={1.5} />
                              {job.location}
                            </Badge>
                          )}
                          {job.is_remote && (
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-sans">Remote</Badge>
                          )}
                          {job.job_type && (
                            <Badge variant="outline" className="font-sans font-normal capitalize border-border">
                              {job.job_type.replace('_', ' ')}
                            </Badge>
                          )}
                          {job.experience_level && (
                            <Badge variant="outline" className="font-sans font-normal capitalize border-border">
                              {job.experience_level}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-muted-foreground font-sans mt-4 line-clamp-2 leading-relaxed text-sm">
                      {job.description}
                    </p>

                    {job.required_skills && job.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        {job.required_skills.slice(0, 5).map((skill, i) => (
                          <Badge key={i} variant="secondary" className="text-xs font-sans px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                            {skill}
                          </Badge>
                        ))}
                        {job.required_skills.length > 5 && (
                          <Badge variant="secondary" className="text-xs font-sans px-2 py-0.5 border-border">
                            +{job.required_skills.length - 5} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end justify-between gap-4 lg:min-w-[140px]">
                    <div className="text-right">
                      {job.posted_at && (
                        <div className="inline-flex items-center text-xs font-sans text-muted-foreground bg-blue-500/5 border border-blue-500/10 px-2 py-1 rounded-lg">
                          <Clock className="mr-1.5 h-3 w-3" strokeWidth={1.5} />
                          {format(new Date(job.posted_at), 'MMM d')}
                        </div>
                      )}
                    </div>
                    <span className="inline-flex w-full lg:w-auto items-center justify-center rounded-lg font-sans font-semibold shadow-lg border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-700 dark:text-blue-300 group-hover:bg-blue-500/20 transition-colors">
                      View Details
                    </span>
                  </div>
                </div>
              </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <ScrollToTop />
    </DashboardLayout>
  );
}
