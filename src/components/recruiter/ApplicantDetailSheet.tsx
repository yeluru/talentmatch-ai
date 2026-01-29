import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScoreBadge } from '@/components/ui/score-badge';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { openResumeInNewTab } from '@/lib/resumeLinks';
import { APPLICATION_STAGE_OPTIONS } from '@/lib/statusOptions';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Building2,
  Calendar,
  FileText,
  Download,
  Loader2,
  Star,
  Clock,
  GraduationCap,
} from 'lucide-react';

interface ApplicantDetailSheetProps {
  applicationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ApplicationWithExtras {
  id: string;
  status: string | null;
  applied_at: string;
  cover_letter: string | null;
  recruiter_notes: string | null;
  recruiter_rating: number | null;
  ai_match_score: number | null;
  candidate_profiles: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    current_title: string | null;
    current_company: string | null;
    headline: string | null;
    summary: string | null;
    years_of_experience: number | null;
    linkedin_url: string | null;
  } | null;
  jobs: { id: string; title: string } | null;
  resumes: { id: string; file_name: string; file_url: string } | null;
  skills?: Array<{ id: string; skill_name: string; proficiency_level: string | null }>;
  experience?: Array<{ id: string; job_title: string; company_name: string; start_date: string; end_date: string | null; is_current: boolean | null }>;
  education?: Array<{ id: string; degree: string; institution: string; field_of_study: string | null }>;
}

const statusOptions = APPLICATION_STAGE_OPTIONS.filter((o) => o.value !== 'reviewed').map((o) => o.value);

export function ApplicantDetailSheet({ applicationId, open, onOpenChange }: ApplicantDetailSheetProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(0);

  const { data: application, isLoading } = useQuery<ApplicationWithExtras | null>({
    queryKey: ['application-detail', applicationId],
    queryFn: async () => {
      if (!applicationId) return null;
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          candidate_profiles (
            id,
            full_name,
            email,
            phone,
            location,
            current_title,
            current_company,
            headline,
            summary,
            years_of_experience,
            linkedin_url
          ),
          jobs (
            id,
            title
          ),
          resumes (
            id,
            file_name,
            file_url
          )
        `)
        .eq('id', applicationId)
        .single();

      if (error) throw error;
      
      // Also fetch skills and experience
      if (data?.candidate_profiles?.id) {
        const [skillsRes, experienceRes, educationRes] = await Promise.all([
          supabase.from('candidate_skills').select('*').eq('candidate_id', data.candidate_profiles.id),
          supabase.from('candidate_experience').select('*').eq('candidate_id', data.candidate_profiles.id).order('start_date', { ascending: false }),
          supabase.from('candidate_education').select('*').eq('candidate_id', data.candidate_profiles.id).order('end_date', { ascending: false }),
        ]);
        
        return {
          ...data,
          skills: skillsRes.data || [],
          experience: experienceRes.data || [],
          education: educationRes.data || [],
        };
      }
      
      return data;
    },
    enabled: !!applicationId && open,
  });

  // Set notes and rating when application loads / changes
  useEffect(() => {
    if (!application) return;
    setNotes(application.recruiter_notes || '');
    setRating(application.recruiter_rating || 0);
  }, [application]);

  const updateApplication = useMutation({
    mutationFn: async (updates: { status?: string; recruiter_notes?: string; recruiter_rating?: number }) => {
      if (!applicationId) return;
      const { error } = await supabase
        .from('applications')
        .update(updates)
        .eq('id', applicationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application-detail', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['job-applicants'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
      toast.success('Application updated');
    },
    onError: () => {
      toast.error('Failed to update application');
    },
  });

  const handleStatusChange = (status: string) => {
    updateApplication.mutate({ status });
  };

  const handleSaveNotes = () => {
    updateApplication.mutate({ recruiter_notes: notes, recruiter_rating: rating });
  };

  const handleDownloadResume = async () => {
    if (!application?.resumes?.file_url) return;
    
    try {
      await openResumeInNewTab(application.resumes.file_url, { expiresInSeconds: 600, download: true });
    } catch (error) {
      console.error('Error downloading resume:', error);
      toast.error('Failed to download resume');
    }
  };

  const content = isLoading ? (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ) : !application ? (
    <div className="flex items-center justify-center h-48">
      Application not found
    </div>
  ) : (
    <ScrollArea className="h-[calc(100vh-8rem)]">
      <div className="space-y-6 p-1">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-accent text-accent-foreground text-xl">
              {application.candidate_profiles?.full_name?.charAt(0) || 'C'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold">
              {application.candidate_profiles?.full_name || 'Unknown'}
            </h2>
            {application.candidate_profiles?.headline && (
              <p className="text-smmt-1">
                {application.candidate_profiles.headline}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <StatusBadge status={application.status || 'applied'} />
              {application.ai_match_score && (
                <ScoreBadge score={application.ai_match_score} />
              )}
            </div>
          </div>
        </div>

        {/* Quick Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {application.candidate_profiles?.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4shrink-0" />
              <a href={`mailto:${application.candidate_profiles.email}`} className="text-accent hover:underline truncate">
                {application.candidate_profiles.email}
              </a>
            </div>
          )}
          {application.candidate_profiles?.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4shrink-0" />
              <span>{application.candidate_profiles.phone}</span>
            </div>
          )}
          {application.candidate_profiles?.location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4shrink-0" />
              <span>{application.candidate_profiles.location}</span>
            </div>
          )}
          {application.candidate_profiles?.current_company && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4shrink-0" />
              <span>{application.candidate_profiles.current_company}</span>
            </div>
          )}
          {application.candidate_profiles?.current_title && (
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="h-4 w-4shrink-0" />
              <span>{application.candidate_profiles.current_title}</span>
            </div>
          )}
          {application.candidate_profiles?.years_of_experience && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4shrink-0" />
              <span>{application.candidate_profiles.years_of_experience} years experience</span>
            </div>
          )}
        </div>

        {/* Applied For */}
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-sm">Applied for</p>
          <p className="font-medium">{application.jobs?.title}</p>
          <p className="text-xsmt-1">
            {formatDistanceToNow(new Date(application.applied_at), { addSuffix: true })}
          </p>
        </div>

        <Separator />

        {/* Status Actions */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Update Status</Label>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <Button
                key={status}
                variant={application.status === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusChange(status)}
                disabled={updateApplication.isPending}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Resume */}
        {application.resumes && (
          <div>
            <Label className="text-sm font-medium mb-2 block">Resume</Label>
            <Button variant="outline" className="w-full" onClick={handleDownloadResume}>
              <FileText className="h-4 w-4 mr-2" />
              {application.resumes.file_name}
              <Download className="h-4 w-4 ml-auto" />
            </Button>
          </div>
        )}

        {/* Cover Letter */}
        {application.cover_letter && (
          <div>
            <Label className="text-sm font-medium mb-2 block">Cover Letter</Label>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{application.cover_letter}</p>
            </div>
          </div>
        )}

        {/* Summary */}
        {application.candidate_profiles?.summary && (
          <div>
            <Label className="text-sm font-medium mb-2 block">Summary</Label>
            <p className="text-smwhitespace-pre-wrap">
              {application.candidate_profiles.summary}
            </p>
          </div>
        )}

        {/* Skills */}
        {application.skills && application.skills.length > 0 && (
          <div>
            <Label className="text-sm font-medium mb-2 block">Skills</Label>
            <div className="flex flex-wrap gap-2">
              {application.skills.map((skill: any) => (
                <Badge key={skill.id} variant="secondary">
                  {skill.skill_name}
                  {skill.proficiency_level && (
                    <span className="ml-1 text-xs opacity-60">({skill.proficiency_level})</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Experience */}
        {application.experience && application.experience.length > 0 && (
          <div>
            <Label className="text-sm font-medium mb-2 block">Experience</Label>
            <div className="space-y-3">
              {application.experience.slice(0, 3).map((exp: any) => (
                <div key={exp.id} className="bg-muted/30 rounded-lg p-3">
                  <p className="font-medium">{exp.job_title}</p>
                  <p className="text-sm">{exp.company_name}</p>
                  <p className="text-xsmt-1">
                    {format(new Date(exp.start_date), 'MMM yyyy')} - 
                    {exp.is_current ? ' Present' : exp.end_date ? ` ${format(new Date(exp.end_date), 'MMM yyyy')}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {application.education && application.education.length > 0 && (
          <div>
            <Label className="text-sm font-medium mb-2 block">Education</Label>
            <div className="space-y-3">
              {application.education.map((edu: any) => (
                <div key={edu.id} className="flex items-start gap-3">
                  <GraduationCap className="h-4 w-4mt-1 shrink-0" />
                  <div>
                    <p className="font-medium">{edu.degree}</p>
                    <p className="text-sm">{edu.institution}</p>
                    {edu.field_of_study && (
                      <p className="text-xs">{edu.field_of_study}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Rating */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Your Rating</Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="p-1 hover:scale-110 transition-transform"
              >
                <Star
                  className={`h-6 w-6 ${
                    star <= rating
                      ? 'fill-yellow-400 text-yellow-400'
                      : ''
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add your notes about this candidate..."
            rows={3}
          />
          <Button 
            className="mt-2" 
            size="sm"
            onClick={handleSaveNotes}
            disabled={updateApplication.isPending}
          >
            {updateApplication.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Save Notes
          </Button>
        </div>
      </div>
    </ScrollArea>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>Applicant Details</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Applicant Details</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {content}
        </div>
      </SheetContent>
    </Sheet>
  );
}
