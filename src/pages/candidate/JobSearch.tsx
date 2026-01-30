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
        <div className="space-y-4 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs, skills, companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 bg-background/50 border-white/10 focus:ring-accent"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="h-10 bg-background/50 border-white/10"
            />
            <Select value={experienceLevel} onValueChange={setExperienceLevel}>
              <SelectTrigger className="h-10 bg-background/50 border-white/10">
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
              <SelectTrigger className="w-[180px] h-10 bg-background/50 border-white/10">
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

            <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded-lg border border-white/5">
              <Checkbox
                id="remote"
                checked={remoteOnly}
                onCheckedChange={(checked) => setRemoteOnly(checked as boolean)}
                className="data-[state=checked]:bg-accent data-[state=checked]:border-accent"
              />
              <label htmlFor="remote" className="text-sm cursor-pointer font-medium">
                Remote only
              </label>
            </div>
          </div>
        </div>
      </MobileListHeader>

      <div className="space-y-4 mt-4">
        {/* Results count */}
        <p className="text-sm">
          {filteredJobs.length} {filteredJobs.length === 1 ? 'job' : 'jobs'} found
        </p>

        {filteredJobs.length === 0 ? (
          <div className="glass-panel border-dashed border-2 py-12 flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold mb-2">No jobs found</h3>
            <p className="max-w-md text-muted-foreground">
              If you’re expecting jobs from a specific recruiting company, ask them for an invite code. Otherwise, adjust your filters to see more results.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredJobs.map((job) => (
              <div key={job.id} className="glass-panel p-6 hover-card-premium">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-start gap-5">
                      <div className="h-14 w-14 rounded-xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center flex-shrink-0 border border-white/10 group-hover:scale-105 transition-transform duration-300">
                        {job.organization?.logo_url ? (
                          <img src={job.organization.logo_url} alt="" className="h-9 w-9 object-contain" />
                        ) : (
                          <Building2 className="h-7 w-7 text-muted-foreground/60" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link to={`/candidate/jobs/${job.id}`} className="block group-hover:text-accent transition-colors">
                          <h3 className="font-display font-bold text-xl truncate pr-4">{job.title}</h3>
                        </Link>
                        <p className="text-muted-foreground font-medium text-sm mt-1">{job.organization?.name || 'Company'}</p>

                        <div className="flex flex-wrap gap-2 mt-3">
                          {job.location && (
                            <Badge variant="secondary" className="bg-muted/50 font-normal">
                              <MapPin className="mr-1 h-3 w-3" />
                              {job.location}
                            </Badge>
                          )}
                          {job.is_remote && (
                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Remote</Badge>
                          )}
                          {job.job_type && (
                            <Badge variant="outline" className="font-normal capitalize border-white/10">
                              {job.job_type.replace('_', ' ')}
                            </Badge>
                          )}
                          {job.experience_level && (
                            <Badge variant="outline" className="font-normal capitalize border-white/10">
                              {job.experience_level}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-muted-foreground mt-4 line-clamp-2 leading-relaxed text-sm">
                      {job.description}
                    </p>

                    {job.required_skills && job.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        {job.required_skills.slice(0, 5).map((skill, i) => (
                          <Badge key={i} variant="secondary" className="text-xs px-2 py-0.5 bg-primary/5 text-primary border-primary/10">
                            {skill}
                          </Badge>
                        ))}
                        {job.required_skills.length > 5 && (
                          <Badge variant="secondary" className="text-xs px-2 py-0.5">
                            +{job.required_skills.length - 5} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end justify-between gap-4 lg:min-w-[140px]">
                    <div className="text-right">
                      {job.posted_at && (
                        <div className="inline-flex items-center text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded-full">
                          <Clock className="mr-1.5 h-3 w-3" />
                          {format(new Date(job.posted_at), 'MMM d')}
                        </div>
                      )}
                    </div>
                    <Button asChild className="w-full lg:w-auto btn-primary-glow font-semibold shadow-lg">
                      <Link to={`/candidate/jobs/${job.id}`}>
                        View Details
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ScrollToTop />
    </DashboardLayout>
  );
}
