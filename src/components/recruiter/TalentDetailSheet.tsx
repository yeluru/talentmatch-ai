import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScoreBadge } from '@/components/ui/score-badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Briefcase,
  MapPin,
  Mail,
  Phone,
  Linkedin,
  Github,
  Calendar,
  GraduationCap,
  Loader2,
  FileText,
  Download,
  ExternalLink,
  MessageSquare,
  Check,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { normalizeStatusForDisplay, STAGE_READONLY_MESSAGE, TALENT_POOL_STAGE_OPTIONS } from '@/lib/statusOptions';
import { openResumeInNewTab } from '@/lib/resumeLinks';

const STATUS_OPTIONS = TALENT_POOL_STAGE_OPTIONS;

interface TalentDetailSheetProps {
  talentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TalentData {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website: string | null;
  headline: string | null;
  summary: string | null;
  current_title: string | null;
  current_company: string | null;
  years_of_experience: number | null;
  ats_score: number | null;
  recruiter_status: string | null;
  recruiter_notes: string | null;
  created_at: string;
  skills: { skill_name: string; proficiency_level?: string; years_of_experience?: number }[];
  experience: {
    id: string;
    job_title: string;
    company_name: string;
    location?: string;
    start_date: string;
    end_date?: string;
    is_current?: boolean;
    description?: string;
  }[];
  education: {
    id: string;
    degree: string;
    institution: string;
    field_of_study?: string;
    end_date?: string;
  }[];
  resumes: {
    id: string;
    file_name: string;
    file_url: string;
    is_primary?: boolean;
    ats_score?: number;
    created_at: string;
  }[];
}

interface TalentDetailContentProps {
  talent: TalentData | null;
  isLoading: boolean;
  isDownloading: boolean;
  isEditingNotes: boolean;
  editedNotes: string;
  isEnriching: boolean;
  linkedinPasteOpen: boolean;
  linkedinPasteText: string;
  onLinkedinPasteOpenChange: (open: boolean) => void;
  onLinkedinPasteTextChange: (text: string) => void;
  onEnrichFromLinkedIn: () => void;
  onEnrichFromPastedText: () => void;
  onEditedNotesChange: (notes: string) => void;
  onStartEditNotes: () => void;
  onSaveNotes: () => void;
  onCancelEditNotes: () => void;
  onStatusChange: (status: string) => void;
  onViewResume: (fileUrl: string, fileName: string) => void;
  onDownloadResume: (fileUrl: string, fileName: string) => void;
  isStatusPending: boolean;
  isNotesPending: boolean;
  isMobile?: boolean;
}

function TalentDetailContent({
  talent,
  isLoading,
  isDownloading,
  isEditingNotes,
  editedNotes,
  isEnriching,
  linkedinPasteOpen,
  linkedinPasteText,
  onLinkedinPasteOpenChange,
  onLinkedinPasteTextChange,
  onEnrichFromLinkedIn,
  onEnrichFromPastedText,
  onEditedNotesChange,
  onStartEditNotes,
  onSaveNotes,
  onCancelEditNotes,
  onStatusChange,
  onViewResume,
  onDownloadResume,
  isStatusPending,
  isNotesPending,
  isMobile = false,
}: TalentDetailContentProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!talent) {
    return (
      <div className="text-center py-12">
        Profile not found
      </div>
    );
  }

  const normUrl = (u?: string | null) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  const websiteIsLinkedIn =
    (() => {
      try {
        const u = new URL(String(talent.website || '').trim());
        return u.hostname.toLowerCase().endsWith('linkedin.com');
      } catch {
        return false;
      }
    })();
  const sourceIsRedundant =
    Boolean(talent.website) &&
    (websiteIsLinkedIn || normUrl(talent.website) === normUrl(talent.linkedin_url));

  const content = (
    <div className={isMobile ? "space-y-5" : "space-y-6"}>
      {/* Header */}
      <div className="flex items-start gap-4 mb-2">
        <div className="flex flex-col items-center gap-2">
          <Avatar className="h-16 w-16 flex-shrink-0 border-2 border-primary/20 shadow-lg">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
              {(talent.full_name || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {talent.ats_score !== null && talent.ats_score !== undefined && (
            <div className="flex flex-col items-center leading-tight mt-1" title="Generic resume-quality score (not JD-based)">
              <ScoreBadge score={talent.ats_score} showLabel={false} className="scale-90" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold font-display tracking-tight text-foreground truncate leading-tight mb-1">
            {talent.full_name || 'Unknown'}
          </h2>

          {talent.headline && (
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              {talent.headline}
            </p>
          )}

          {talent.current_title && (
            <p className="text-sm text-foreground/80 flex items-center gap-1.5 mt-2 font-medium">
              <Briefcase className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <span className="truncate">
                {talent.current_title}
                {talent.current_company && <span className="text-muted-foreground font-normal"> at {talent.current_company}</span>}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Enrichment */}
      {talent.linkedin_url ? (
        <div className="rounded-xl border border-primary/10 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -z-10"></div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-primary">Enrich profile</div>
              <div className="text-xs text-muted-foreground">
                Pull richer experience/skills from LinkedIn to improve this profile.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onEnrichFromLinkedIn}
              disabled={isEnriching}
              className="shrink-0 bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
            >
              {isEnriching ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Linkedin className="h-3 w-3 mr-2" />}
              Enrich
            </Button>
          </div>

          {linkedinPasteOpen ? (
            <div className="space-y-3 pt-2 border-t border-white/5">
              <div className="text-xs text-muted-foreground">
                LinkedIn may block automated fetch. Paste the profile text (copy/paste from LinkedIn) and we’ll extract structured details.
              </div>
              <Textarea
                value={linkedinPasteText}
                onChange={(e) => onLinkedinPasteTextChange(e.target.value)}
                placeholder="Paste LinkedIn profile text here…"
                className="min-h-[140px] bg-black/20 border-white/10 focus:border-primary/50 text-sm"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onLinkedinPasteOpenChange(false)}
                  disabled={isEnriching}
                  className="hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onEnrichFromPastedText}
                  disabled={isEnriching || !linkedinPasteText.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isEnriching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Enrich from pasted text
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Contact Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {talent.email && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
            <Mail className="h-4 w-4 flex-shrink-0 text-primary" />
            <a href={`mailto:${talent.email}`} className="hover:text-primary min-w-0 truncate text-foreground/80 transition-colors">
              {talent.email}
            </a>
          </div>
        )}
        {talent.phone && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
            <Phone className="h-4 w-4 flex-shrink-0 text-primary" />
            <a href={`tel:${talent.phone}`} className="hover:text-primary text-foreground/80 transition-colors">
              {talent.phone}
            </a>
          </div>
        )}
        {talent.location && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5">
            <MapPin className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="min-w-0 truncate text-foreground/80">{talent.location}</span>
          </div>
        )}
        {talent.linkedin_url && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
            <Linkedin className="h-4 w-4 flex-shrink-0 text-primary" />
            <a
              href={talent.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary min-w-0 truncate text-foreground/80 transition-colors"
            >
              LinkedIn Profile
            </a>
          </div>
        )}
        {talent.github_url && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
            <Github className="h-4 w-4 flex-shrink-0 text-primary" />
            <a
              href={talent.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary min-w-0 truncate text-foreground/80 transition-colors"
            >
              GitHub Profile
            </a>
          </div>
        )}
        {talent.website && !sourceIsRedundant && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
            <ExternalLink className="h-4 w-4 flex-shrink-0 text-primary" />
            <a
              href={talent.website}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary min-w-0 truncate text-foreground/80 transition-colors"
            >
              Source
            </a>
          </div>
        )}
      </div>

      {/* Recruiter Status & Notes */}
      <Separator className="bg-white/10" />
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2 text-xs uppercase tracking-wider text-muted-foreground">Status</h3>
          <Select
            value={(normalizeStatusForDisplay(talent.recruiter_status) || 'new') as string}
            onValueChange={() => toast.info(STAGE_READONLY_MESSAGE)}
            disabled={isStatusPending}
          >
            <SelectTrigger className="w-full sm:w-[200px] bg-white/5 border-white/10 text-foreground">
              <SelectValue>
                <StatusBadge status={normalizeStatusForDisplay(talent.recruiter_status) || 'new'} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  <StatusBadge status={status.value} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Recruiter Notes</h3>
            {!isEditingNotes && (
              <Button variant="ghost" size="sm" onClick={onStartEditNotes} className="h-6 text-xs hover:bg-white/10">
                <MessageSquare className="h-3 w-3 mr-1" />
                {talent.recruiter_notes ? 'Edit' : 'Add Note'}
              </Button>
            )}
          </div>
          {isEditingNotes ? (
            <div className="space-y-2">
              <Textarea
                value={editedNotes}
                onChange={(e) => onEditedNotesChange(e.target.value)}
                placeholder="Add notes about this candidate..."
                className="min-h-[100px] bg-black/20 border-white/10 focus:border-primary/50 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={onSaveNotes}
                  disabled={isNotesPending}
                  className="btn-premium"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancelEditNotes}
                  disabled={isNotesPending}
                  className="bg-transparent border-white/10 hover:bg-white/5"
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : talent.recruiter_notes ? (
            <div className="bg-white/5 border border-white/5 rounded-xl p-4 text-sm whitespace-pre-wrap text-foreground/90">
              {talent.recruiter_notes}
            </div>
          ) : (
            <div className="text-sm italic text-muted-foreground bg-white/5 border border-white/5 rounded-xl p-4">No notes yet</div>
          )}
        </div>
      </div>

      {/* Summary */}
      {talent.summary && (
        <>
          <Separator className="bg-white/10" />
          <div>
            <h3 className="font-semibold mb-2 text-xs uppercase tracking-wider text-muted-foreground">Summary</h3>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{talent.summary}</p>
          </div>
        </>
      )}

      {/* Skills */}
      {talent.skills && talent.skills.length > 0 && (
        <>
          <Separator className="bg-white/10" />
          <div>
            <h3 className="font-semibold mb-2 text-xs uppercase tracking-wider text-muted-foreground">Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {talent.skills.map((skill, i) => (
                <Badge key={i} variant="secondary" className="bg-white/5 hover:bg-white/10 border-white/5 text-foreground/80 px-2 py-1 text-xs">
                  {skill.skill_name}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Experience */}
      {talent.experience && talent.experience.length > 0 && (
        <>
          <Separator className="bg-white/10" />
          <div>
            <h3 className="font-semibold mb-3 text-xs uppercase tracking-wider text-muted-foreground">Experience</h3>
            <div className="space-y-3">
              {talent.experience.map((exp) => (
                <div key={exp.id} className="bg-white/5 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                  <div className="font-medium text-base text-foreground">{exp.job_title}</div>
                  <div className="text-sm flex items-center gap-1 text-primary/80 mt-0.5">
                    <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">
                      {exp.company_name}
                      {exp.location && ` • ${exp.location}`}
                    </span>
                  </div>
                  <div className="text-xs flex items-center gap-1 text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    {format(new Date(exp.start_date), 'MMM yyyy')} -{' '}
                    {exp.is_current ? 'Present' : exp.end_date ? format(new Date(exp.end_date), 'MMM yyyy') : 'N/A'}
                  </div>
                  {exp.description && (
                    <p className="text-sm mt-2 text-foreground/70 leading-relaxed">{exp.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Education */}
      {talent.education && talent.education.length > 0 && (
        <>
          <Separator className="bg-white/10" />
          <div>
            <h3 className="font-semibold mb-3 text-xs uppercase tracking-wider text-muted-foreground">Education</h3>
            <div className="space-y-3">
              {talent.education.map((edu) => (
                <div key={edu.id} className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium text-base text-foreground">{edu.degree}</div>
                    <div className="text-sm text-foreground/80 mt-0.5">
                      {edu.institution}
                      {edu.field_of_study && ` • ${edu.field_of_study}`}
                    </div>
                    {edu.end_date && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {format(new Date(edu.end_date), 'yyyy')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Resumes */}
      <Separator className="bg-white/10" />
      <div>
        <h3 className="font-semibold mb-3 text-xs uppercase tracking-wider text-muted-foreground">Resumes</h3>

        {talent.resumes && talent.resumes.length > 0 ? (
          <div className="space-y-3">
            {talent.resumes.map((resume) => (
              <div
                key={resume.id}
                className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors space-y-3"
              >
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground break-words">
                        {resume.file_name}
                      </span>
                      {resume.is_primary && (
                        <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20 flex-shrink-0">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(new Date(resume.created_at), 'MMM d, yyyy')}
                      {resume.ats_score && ` • ATS: ${resume.ats_score}%`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewResume(resume.file_url, resume.file_name)}
                    disabled={isDownloading}
                    className="h-8 flex-1 sm:flex-none border-white/10 hover:bg-white/10 hover:text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownloadResume(resume.file_url, resume.file_name)}
                    disabled={isDownloading}
                    className="h-8 flex-1 sm:flex-none border-white/10 hover:bg-white/10 hover:text-primary"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-center text-muted-foreground">
            No resumes found for this candidate.
          </div>
        )}
      </div>

      {/* Meta info */}
      <Separator className="bg-white/10" />
      <div className="text-xs text-muted-foreground pb-4">
        Added {format(new Date(talent.created_at), 'MMMM d, yyyy')}
        {talent.years_of_experience !== null && talent.years_of_experience !== undefined && (
          <> • {talent.years_of_experience} years experience</>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4 pb-8 scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {content}
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-8rem)] pr-4 mt-4">
      {content}
    </ScrollArea>
  );
}

export function TalentDetailSheet({ talentId, open, onOpenChange }: TalentDetailSheetProps) {
  const isMobile = useIsMobile();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState('');
  const [linkedinPasteOpen, setLinkedinPasteOpen] = useState(false);
  const [linkedinPasteText, setLinkedinPasteText] = useState('');
  const queryClient = useQueryClient();

  const { data: talent, isLoading } = useQuery({
    queryKey: ['talent-detail', talentId],
    queryFn: async () => {
      if (!talentId) return null;

      const { data: profile, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('id', talentId)
        .single();

      if (error) throw error;

      // Fetch skills
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('skill_name, proficiency_level, years_of_experience')
        .eq('candidate_id', talentId);

      // Fetch experience
      const { data: experience } = await supabase
        .from('candidate_experience')
        .select('*')
        .eq('candidate_id', talentId)
        .order('start_date', { ascending: false });

      // Fetch education
      const { data: education } = await supabase
        .from('candidate_education')
        .select('*')
        .eq('candidate_id', talentId)
        .order('end_date', { ascending: false });

      // Fetch resumes
      const { data: resumes } = await supabase
        .from('resumes')
        .select('*')
        .eq('candidate_id', talentId)
        .order('is_primary', { ascending: false });

      return {
        ...profile,
        skills: skills || [],
        experience: experience || [],
        education: education || [],
        resumes: resumes || [],
      } as unknown as TalentData;
    },
    enabled: !!talentId && open,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_status: newStatus })
        .eq('id', talentId!);
      if (error) throw error;
      await supabase.from('applications').update({ status: newStatus }).eq('candidate_id', talentId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-detail', talentId] });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['job-applicants'], exact: false });
      toast.success('Status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase.rpc('update_candidate_recruiter_notes', {
        _candidate_id: talentId!,
        _notes: notes ?? '',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-detail', talentId] });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      setIsEditingNotes(false);
      toast.success('Notes updated');
    },
    onError: () => {
      toast.error('Failed to update notes');
    },
  });

  const enrichLinkedinMutation = useMutation({
    mutationFn: async (args: { candidateId: string; linkedinUrl?: string | null; pastedText?: string | null }) => {
      const { data, error } = await supabase.functions.invoke('enrich-linkedin-profile', {
        body: {
          candidateId: args.candidateId,
          linkedinUrl: args.linkedinUrl,
          pastedText: args.pastedText,
        }
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-detail', talentId] });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      toast.success('Profile enriched');
      setLinkedinPasteOpen(false);
      setLinkedinPasteText('');
    },
    onError: (error: any) => {
      const msg = error?.message || 'LinkedIn enrich failed';
      if (String(msg).toLowerCase().includes('paste')) {
        setLinkedinPasteOpen(true);
      }
      toast.error(msg);
    }
  });

  const handleStartEditNotes = () => {
    setEditedNotes(talent?.recruiter_notes || '');
    setIsEditingNotes(true);
  };

  const handleSaveNotes = () => {
    updateNotesMutation.mutate(editedNotes);
  };

  const handleCancelEditNotes = () => {
    setIsEditingNotes(false);
    setEditedNotes('');
  };

  const handleEnrichFromLinkedIn = () => {
    if (!talentId) return;
    const url = String(talent?.linkedin_url || '').trim();
    if (!url) {
      toast.error('Missing LinkedIn URL');
      return;
    }
    enrichLinkedinMutation.mutate({ candidateId: talentId, linkedinUrl: url });
  };

  const handleEnrichFromPastedText = () => {
    if (!talentId) return;
    const text = linkedinPasteText.trim();
    if (!text) return;
    enrichLinkedinMutation.mutate({ candidateId: talentId, pastedText: text });
  };

  const handleViewResume = async (fileUrl: string, fileName: string) => {
    setIsDownloading(true);
    try {
      await openResumeInNewTab(fileUrl, { expiresInSeconds: 3600 });
    } catch (error) {
      console.error('Error viewing resume:', error);
      toast.error(`Failed to open resume: ${fileName}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadResume = async (fileUrl: string, fileName: string) => {
    setIsDownloading(true);
    try {
      await openResumeInNewTab(fileUrl, { expiresInSeconds: 3600, download: true });
      toast.success('Resume download started');
    } catch (error) {
      console.error('Error downloading resume:', error);
      toast.error('Failed to download resume');
    } finally {
      setIsDownloading(false);
    }
  };

  const contentProps: TalentDetailContentProps = {
    talent: talent || null,
    isLoading,
    isDownloading,
    isEditingNotes,
    editedNotes,
    isEnriching: enrichLinkedinMutation.isPending,
    linkedinPasteOpen,
    linkedinPasteText,
    onLinkedinPasteOpenChange: setLinkedinPasteOpen,
    onLinkedinPasteTextChange: setLinkedinPasteText,
    onEnrichFromLinkedIn: handleEnrichFromLinkedIn,
    onEnrichFromPastedText: handleEnrichFromPastedText,
    onEditedNotesChange: setEditedNotes,
    onStartEditNotes: handleStartEditNotes,
    onSaveNotes: handleSaveNotes,
    onCancelEditNotes: handleCancelEditNotes,
    onStatusChange: (status) => updateStatusMutation.mutate(status),
    onViewResume: handleViewResume,
    onDownloadResume: handleDownloadResume,
    isStatusPending: updateStatusMutation.isPending,
    isNotesPending: updateNotesMutation.isPending,
    isMobile,
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh] w-full overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl border-white/10">
          <DrawerHeader className="text-left flex-shrink-0 pb-2">
            <DrawerTitle className="text-base">Candidate Profile</DrawerTitle>
            <DrawerDescription className="text-xs">View and manage candidate details</DrawerDescription>
          </DrawerHeader>
          <TalentDetailContent {...contentProps} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl bg-background/95 backdrop-blur-xl border-l border-white/10 shadow-2xl">
        <SheetHeader>
          <SheetTitle>Candidate Profile</SheetTitle>
          <SheetDescription>Full profile details</SheetDescription>
        </SheetHeader>
        <TalentDetailContent {...contentProps} />
      </SheetContent>
    </Sheet>
  );
}
