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
import { TALENT_POOL_STATUS_OPTIONS } from '@/lib/statusOptions';
import { openResumeInNewTab } from '@/lib/resumeLinks';

interface TalentDetailSheetProps {
  talentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS = TALENT_POOL_STATUS_OPTIONS.map((s) => ({
  ...s,
  variant:
    s.value === 'rejected'
      ? ('destructive' as const)
      : s.value === 'contacted'
        ? ('info' as const)
        : s.value === 'interviewing' || s.value === 'screening'
          ? ('warning' as const)
          : s.value === 'offered' || s.value === 'hired'
            ? ('success' as const)
            : ('default' as const),
}));

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
      <div className="flex items-start gap-4">
        <Avatar className="h-14 w-14 sm:h-16 sm:w-16 flex-shrink-0">
          <AvatarFallback className="bg-accent text-accent-foreground text-lg sm:text-xl">
            {(talent.full_name || 'U').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg sm:text-xl font-semibold truncate">{talent.full_name || 'Unknown'}</h2>
            {talent.ats_score !== null && talent.ats_score !== undefined && (
              <div className="flex flex-col items-start leading-tight" title="Generic resume-quality score (not JD-based)">
                <ScoreBadge score={talent.ats_score} showLabel={false} />
                <span className="text-[10px]">generic score</span>
              </div>
            )}
          </div>
          {talent.headline && (
            <p className="text-smline-clamp-2">{talent.headline}</p>
          )}
          {talent.current_title && (
            <p className="text-smflex items-center gap-1 mt-1">
              <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">
                {talent.current_title}
                {talent.current_company && ` at ${talent.current_company}`}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Enrichment */}
      {talent.linkedin_url ? (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Enrich profile</div>
              <div className="text-xs">
                Pull richer experience/skills from LinkedIn to improve this profile.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onEnrichFromLinkedIn}
              disabled={isEnriching}
              className="shrink-0"
            >
              {isEnriching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enrich
            </Button>
          </div>

          {linkedinPasteOpen ? (
            <div className="space-y-2">
              <div className="text-xs">
                LinkedIn may block automated fetch. Paste the profile text (copy/paste from LinkedIn) and we’ll extract structured details.
              </div>
              <Textarea
                value={linkedinPasteText}
                onChange={(e) => onLinkedinPasteTextChange(e.target.value)}
                placeholder="Paste LinkedIn profile text here…"
                className="min-h-[140px]"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onLinkedinPasteOpenChange(false)}
                  disabled={isEnriching}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onEnrichFromPastedText}
                  disabled={isEnriching || !linkedinPasteText.trim()}
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
      <div className="space-y-2">
        {talent.email && (
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Mail className="h-4 w-4flex-shrink-0" />
            <a href={`mailto:${talent.email}`} className="hover:underline min-w-0 truncate">
              {talent.email}
            </a>
          </div>
        )}
        {talent.phone && (
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Phone className="h-4 w-4flex-shrink-0" />
            <a href={`tel:${talent.phone}`} className="hover:underline">
              {talent.phone}
            </a>
          </div>
        )}
        {talent.location && (
          <div className="flex items-center gap-2 text-sm min-w-0">
            <MapPin className="h-4 w-4flex-shrink-0" />
            <span className="min-w-0 truncate">{talent.location}</span>
          </div>
        )}
        {talent.linkedin_url && (
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Linkedin className="h-4 w-4flex-shrink-0" />
            <a
              href={talent.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-primary min-w-0 truncate"
            >
              LinkedIn
            </a>
          </div>
        )}
        {talent.github_url && (
          <div className="flex items-center gap-2 text-sm min-w-0">
            <Github className="h-4 w-4flex-shrink-0" />
            <a
              href={talent.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-primary min-w-0 truncate"
            >
              GitHub
            </a>
          </div>
        )}
        {talent.website && !sourceIsRedundant && (
          <div className="flex items-center gap-2 text-sm min-w-0">
            <ExternalLink className="h-4 w-4flex-shrink-0" />
            <a
              href={talent.website}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-primary min-w-0 truncate"
            >
              Source
            </a>
          </div>
        )}
      </div>

      {/* Recruiter Status & Notes */}
      <Separator />
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2 text-sm sm:text-base">Status</h3>
          <Select
            value={talent.recruiter_status || 'new'}
            onValueChange={onStatusChange}
            disabled={isStatusPending}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue>
                <StatusBadge 
                  status={STATUS_OPTIONS.find(s => s.value === (talent.recruiter_status || 'new'))?.label || 'New'} 
                  variant={STATUS_OPTIONS.find(s => s.value === (talent.recruiter_status || 'new'))?.variant || 'default'} 
                />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  <StatusBadge status={status.label} variant={status.variant} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm sm:text-base">Recruiter Notes</h3>
            {!isEditingNotes && (
              <Button variant="ghost" size="sm" onClick={onStartEditNotes}>
                <MessageSquare className="h-4 w-4 mr-1" />
                {talent.recruiter_notes ? 'Edit' : 'Add'}
              </Button>
            )}
          </div>
          {isEditingNotes ? (
            <div className="space-y-2">
              <Textarea
                value={editedNotes}
                onChange={(e) => onEditedNotesChange(e.target.value)}
                placeholder="Add notes about this candidate..."
                className="min-h-[100px]"
              />
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={onSaveNotes}
                  disabled={isNotesPending}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={onCancelEditNotes}
                  disabled={isNotesPending}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : talent.recruiter_notes ? (
            <p className="text-smwhitespace-pre-wrap">{talent.recruiter_notes}</p>
          ) : (
            <p className="text-smitalic">No notes yet</p>
          )}
        </div>
      </div>

      {/* Summary */}
      {talent.summary && (
        <>
          <Separator />
          <div>
            <h3 className="font-semibold mb-2 text-sm sm:text-base">Summary</h3>
            <p className="text-sm">{talent.summary}</p>
          </div>
        </>
      )}

      {/* Skills */}
      {talent.skills && talent.skills.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="font-semibold mb-2 text-sm sm:text-base">Skills</h3>
            <div className="flex flex-wrap gap-1.5">
              {talent.skills.map((skill, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
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
          <Separator />
          <div>
            <h3 className="font-semibold mb-3 text-sm sm:text-base">Experience</h3>
            <div className="space-y-4">
              {talent.experience.map((exp) => (
                <div key={exp.id} className="space-y-1">
                  <div className="font-medium text-sm sm:text-base">{exp.job_title}</div>
                  <div className="text-smflex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">
                      {exp.company_name}
                      {exp.location && ` • ${exp.location}`}
                    </span>
                  </div>
                  <div className="text-xsflex items-center gap-1">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    {format(new Date(exp.start_date), 'MMM yyyy')} -{' '}
                    {exp.is_current ? 'Present' : exp.end_date ? format(new Date(exp.end_date), 'MMM yyyy') : 'N/A'}
                  </div>
                  {exp.description && (
                    <p className="text-smmt-1">{exp.description}</p>
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
          <Separator />
          <div>
            <h3 className="font-semibold mb-3 text-sm sm:text-base">Education</h3>
            <div className="space-y-3">
              {talent.education.map((edu) => (
                <div key={edu.id} className="space-y-1">
                  <div className="font-medium text-sm sm:text-base">{edu.degree}</div>
                  <div className="text-smflex items-center gap-1">
                    <GraduationCap className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">
                      {edu.institution}
                      {edu.field_of_study && ` • ${edu.field_of_study}`}
                    </span>
                  </div>
                  {edu.end_date && (
                    <div className="text-xs">
                      {format(new Date(edu.end_date), 'yyyy')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Resumes */}
      <Separator />
      <div>
        <h3 className="font-semibold mb-3 text-sm sm:text-base">Resumes</h3>

        {talent.resumes && talent.resumes.length > 0 ? (
          <div className="space-y-2">
            {talent.resumes.map((resume) => (
              <div
                key={resume.id}
                className="p-3 rounded-md bg-muted/50 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium break-words">
                        {resume.file_name}
                      </span>
                      {resume.is_primary && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <div className="text-xsmt-1">
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
                    className="h-8 flex-1 sm:flex-none"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDownloadResume(resume.file_url, resume.file_name)}
                    disabled={isDownloading}
                    className="h-8 flex-1 sm:flex-none"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            No resumes found for this candidate.
          </div>
        )}
      </div>

      {/* Meta info */}
      <Separator />
      <div className="text-xspb-4">
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
      } as TalentData;
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-detail', talentId] });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      toast.success('Status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_notes: notes })
        .eq('id', talentId!);
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
        <DrawerContent className="max-h-[92vh] w-full overflow-hidden flex flex-col">
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
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Candidate Profile</SheetTitle>
          <SheetDescription>Full profile details</SheetDescription>
        </SheetHeader>
        <TalentDetailContent {...contentProps} />
      </SheetContent>
    </Sheet>
  );
}
