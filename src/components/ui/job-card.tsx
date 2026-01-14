import { Link } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScoreBadge } from '@/components/ui/score-badge';
import { MapPin, Clock, Briefcase, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface JobCardProps {
  job: {
    id: string;
    title: string;
    organization?: { name: string; logo_url?: string };
    location?: string;
    job_type?: string;
    work_mode?: string;
    experience_level?: string;
    required_skills?: string[];
    posted_at?: string;
    created_at: string;
    status?: string;
  };
  matchScore?: number;
  showApplyButton?: boolean;
  onApply?: () => void;
  variant?: 'default' | 'compact';
  className?: string;
}

const jobTypeLabels: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
  remote: 'Remote',
};

const experienceLevelLabels: Record<string, string> = {
  entry: 'Entry Level',
  mid: 'Mid Level',
  senior: 'Senior',
  lead: 'Lead',
  principal_architect: 'Principal / Architect',
  manager: 'Manager',
  director: 'Director',
  executive: 'Executive',
  unknown: 'Unknown',
};

const workModeLabels: Record<string, string> = {
  onsite: 'Onsite',
  hybrid: 'Hybrid',
  remote: 'Remote',
  unknown: 'Unknown',
};

export function JobCard({
  job,
  matchScore,
  showApplyButton = true,
  onApply,
  variant = 'default',
  className,
}: JobCardProps) {
  const postedDate = job.posted_at || job.created_at;

  return (
    <Card className={cn(
      "card-interactive border transition-all",
      variant === 'compact' && 'p-4',
      className
    )}>
      <CardHeader className={cn("pb-3", variant === 'compact' && 'p-0 pb-3')}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
              {job.organization?.logo_url ? (
                <img 
                  src={job.organization.logo_url} 
                  alt={job.organization.name}
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <Link 
                to={`/candidate/jobs/${job.id}`}
                className="font-semibold text-lg hover:text-accent transition-colors line-clamp-1"
              >
                {job.title}
              </Link>
              <p className="text-sm text-muted-foreground">
                {job.organization?.name || 'Company'}
              </p>
            </div>
          </div>
          
          {matchScore !== undefined && (
            <ScoreBadge score={matchScore} showLabel={false} />
          )}
        </div>
      </CardHeader>
      
      <CardContent className={cn("pb-3", variant === 'compact' && 'p-0 pb-3')}>
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
          {job.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {job.location}
            </span>
          )}
          {job.work_mode && job.work_mode !== 'unknown' && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {workModeLabels[job.work_mode] || job.work_mode}
            </span>
          )}
          {job.job_type && (
            <span className="flex items-center gap-1">
              <Briefcase className="h-4 w-4" />
              {jobTypeLabels[job.job_type] || job.job_type}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatDistanceToNow(new Date(postedDate), { addSuffix: true })}
          </span>
        </div>
        
        {job.required_skills && job.required_skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.required_skills.slice(0, 5).map((skill, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {skill}
              </Badge>
            ))}
            {job.required_skills.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{job.required_skills.length - 5} more
              </Badge>
            )}
          </div>
        )}
      </CardContent>
      
      {showApplyButton && variant === 'default' && (
        <CardFooter className="pt-0">
          <Button onClick={onApply} className="w-full">
            Apply Now
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}