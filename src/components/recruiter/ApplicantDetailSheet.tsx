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
    recruiter_notes: string | null;
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
            linkedin_url,
            recruiter_notes
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

  // Set notes from candidate profile (shared comments) and rating when application loads / changes
  useEffect(() => {
    if (!application) return;
    setNotes(application.candidate_profiles?.recruiter_notes ?? application.recruiter_notes ?? '');
    setRating(application.recruiter_rating || 0);
  }, [application]);

  const updateApplication = useMutation({
    mutationFn: async (updates: { status?: string; recruiter_notes?: string; recruiter_rating?: number; candidate_id?: string }) => {
      if (!applicationId) return;
      const appUpdates: Record<string, unknown> = {};
      if (updates.status !== undefined) appUpdates.status = updates.status;
      if (updates.recruiter_rating !== undefined) appUpdates.recruiter_rating = updates.recruiter_rating;
      if (Object.keys(appUpdates).length > 0) {
        const { error } = await supabase.from('applications').update(appUpdates).eq('id', applicationId);
        if (error) throw error;
      }
      if (updates.recruiter_notes !== undefined && updates.candidate_id) {
        const { error } = await supabase.rpc('update_candidate_recruiter_notes', {
          _candidate_id: updates.candidate_id,
          _notes: updates.recruiter_notes ?? '',
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application-detail', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['job-applicants'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
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
    updateApplication.mutate({
      recruiter_notes: notes,
      recruiter_rating: rating,
      candidate_id: application?.candidate_id,
    });
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
          <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-lg">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
              {application.candidate_profiles?.full_name?.charAt(0) || 'C'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold font-display tracking-tight text-foreground">
              {application.candidate_profiles?.full_name || 'Unknown'}
            </h2>
            {application.candidate_profiles?.headline && (
              <p className="text-sm text-muted-foreground mt-1">
                {application.candidate_profiles.headline}
              </p>
            )}
            <div className="flex items-center gap-2 mt-3">
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
            <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
              <Mail className="h-4 w-4 shrink-0 text-primary" />
              <a href={`mailto:${application.candidate_profiles.email}`} className="text-foreground/80 hover:text-primary truncate transition-colors">
                {application.candidate_profiles.email}
              </a>
            </div>
          )}
          {application.candidate_profiles?.phone && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5">
              <Phone className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-foreground/80">{application.candidate_profiles.phone}</span>
            </div>
          )}
          {application.candidate_profiles?.location && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5">
              <MapPin className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-foreground/80">{application.candidate_profiles.location}</span>
            </div>
          )}
          {application.candidate_profiles?.current_company && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5">
              <Building2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-foreground/80">{application.candidate_profiles.current_company}</span>
            </div>
          )}
          {application.candidate_profiles?.current_title && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5">
              <Briefcase className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-foreground/80">{application.candidate_profiles.current_title}</span>
            </div>
          )}
          {application.candidate_profiles?.years_of_experience && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-foreground/80">{application.candidate_profiles.years_of_experience} years</span>
            </div>
          )}
        </div>

        {/* Applied For */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/10">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Applied for Job</p>
          <p className="font-semibold text-lg text-primary">{application.jobs?.title}</p>
          <p className="text-xs mt-1 text-muted-foreground">
            {formatDistanceToNow(new Date(application.applied_at), { addSuffix: true })}
          </p>
        </div>

        <Separator className="bg-white/10" />

        {/* Status Actions */}
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Update Status</Label>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((status) => (
              <Button
                key={status}
                variant={application.status === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusChange(status)}
                disabled={updateApplication.isPending}
                className={application.status === status
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-transparent border-white/10 hover:bg-white/5'}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Resume */}
        {application.resumes && (
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Resume</Label>
            <Button variant="outline" className="w-full bg-white/5 border-white/10 hover:bg-white/10 hover:border-primary/30 h-12 justify-between group" onClick={handleDownloadResume}>
              <div className="flex items-center">
                <div className="h-8 w-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform">
                  <FileText className="h-4 w-4" />
                </div>
                <span className="truncate max-w-[200px]">{application.resumes.file_name}</span>
              </div>
              <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Button>
          </div>
        )}

        {/* Cover Letter */}
        {application.cover_letter && (
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Cover Letter</Label>
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {application.cover_letter}
            </div>
          </div>
        )}

        {/* Summary */}
        {application.candidate_profiles?.summary && (
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Summary</Label>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {application.candidate_profiles.summary}
            </p>
          </div>
        )}

        {/* Skills */}
        {application.skills && application.skills.length > 0 && (
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Skills</Label>
            <div className="flex flex-wrap gap-2">
              {application.skills.map((skill: any) => (
                <Badge key={skill.id} variant="secondary" className="bg-white/5 hover:bg-white/10 border-white/5 text-foreground/80 px-2 py-1">
                  {skill.skill_name}
                  {skill.proficiency_level && (
                    <span className="ml-1.5 text-[10px] opacity-60 bg-black/20 px-1 py-0.5 rounded uppercase tracking-wide">{skill.proficiency_level}</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Experience */}
        {application.experience && application.experience.length > 0 && (
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Experience</Label>
            <div className="space-y-3">
              {application.experience.slice(0, 3).map((exp: any) => (
                <div key={exp.id} className="bg-white/5 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                  <p className="font-semibold text-foreground">{exp.job_title}</p>
                  <p className="text-sm text-muted-foreground mb-2">{exp.company_name}</p>
                  <p className="text-xs inline-flex items-center px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">
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
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Education</Label>
            <div className="space-y-4">
              {application.education.map((edu: any) => (
                <div key={edu.id} className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{edu.degree}</p>
                    <p className="text-sm text-muted-foreground">{edu.institution}</p>
                    {edu.field_of_study && (
                      <p className="text-xs text-muted-foreground/80 mt-1">{edu.field_of_study}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator className="bg-white/10" />

        {/* Rating */}
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Your Rating</Label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="p-1 hover:scale-110 transition-transform focus:outline-none"
              >
                <Star
                  className={`h-6 w-6 transition-colors ${star <= rating
                    ? 'fill-yellow-500 text-yellow-500'
                    : 'text-muted-foreground hover:text-yellow-500/50'
                    }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Comments (same as pipeline & Talent Pool) */}
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Comments</Label>
          <p className="text-xs text-muted-foreground mb-2">Shown on pipeline cards and in Talent Pool. Add or update notes anytime.</p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add or update notes about this candidate…"
            rows={4}
            className="bg-black/20 border-white/10 focus:border-primary/50 text-sm resize-none"
          />
          <Button
            className="mt-3 w-full btn-premium"
            size="sm"
            onClick={handleSaveNotes}
            disabled={updateApplication.isPending}
          >
            {updateApplication.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Save Comments
          </Button>
        </div>
      </div>
    </ScrollArea>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh] bg-background/95 backdrop-blur-xl border-white/10">
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
      <SheetContent className="w-full sm:max-w-xl bg-background/95 backdrop-blur-xl border-l border-white/10 shadow-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle>Applicant Details</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {content}
        </div>
      </SheetContent>
    </Sheet>
  );
}
