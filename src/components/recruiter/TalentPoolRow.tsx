import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Briefcase, MapPin, MessageSquare, Save, Loader2 } from 'lucide-react';
import { ScoreBadge } from '@/components/ui/score-badge';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CANDIDATE_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'screening', label: 'Screening' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offered', label: 'Offered' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

interface TalentProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  location: string | null;
  current_title: string | null;
  current_company: string | null;
  years_of_experience: number | null;
  headline: string | null;
  ats_score: number | null;
  created_at: string;
  recruiter_notes: string | null;
  recruiter_status: string | null;
  skills: {
    skill_name: string;
  }[];
  companies: string[];
}

interface TalentPoolRowProps {
  talent: TalentProfile;
  isSelected: boolean;
  onToggleSelection: (id: string, e: React.MouseEvent) => void;
  onViewProfile: (id: string) => void;
}

export function TalentPoolRow({
  talent,
  isSelected,
  onToggleSelection,
  onViewProfile,
}: TalentPoolRowProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(talent.recruiter_notes || '');
  const [hasUnsavedNotes, setHasUnsavedNotes] = useState(false);

  useEffect(() => {
    // Keep local textarea in sync when notes are updated elsewhere (e.g. Shortlists / Profile sheet)
    setNotes(talent.recruiter_notes || '');
    setHasUnsavedNotes(false);
  }, [talent.id, talent.recruiter_notes]);

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      // Candidate-level status: keep candidate_profiles as source of truth...
      const { error: profileError } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_status: newStatus })
        .eq('id', talent.id);
      if (profileError) throw profileError;

      // ...and mirror to any shortlist rows so Shortlists shows the same value.
      const { error: shortlistError, count: shortlistCount } = await supabase
        .from('shortlist_candidates')
        .update({ status: newStatus }, { count: 'exact' })
        .eq('candidate_id', talent.id);
      if (shortlistError) throw shortlistError;

      return { newStatus, shortlistCount: shortlistCount ?? 0 };
    },
    onSuccess: ({ newStatus, shortlistCount }) => {
      // Update any cached shortlist candidates immediately (avoid "stale UI" across pages)
      queryClient.setQueriesData(
        { queryKey: ['shortlist-candidates'] },
        (old: unknown) => {
          if (!Array.isArray(old)) return old;
          return old.map((row: any) => {
            if (row?.candidate_id !== talent.id) return row;
            return {
              ...row,
              status: newStatus,
              candidate_profiles: {
                ...row.candidate_profiles,
                recruiter_status: newStatus,
              },
            };
          });
        }
      );

      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'], exact: false });

      toast.success('Status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const updateNotes = useMutation({
    mutationFn: async (newNotes: string) => {
      // Candidate-level notes: keep candidate_profiles as source of truth...
      const { error: profileError } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_notes: newNotes })
        .eq('id', talent.id);
      if (profileError) throw profileError;

      // ...and mirror to any shortlist rows so Shortlists shows the same value.
      const { error: shortlistError, count: shortlistCount } = await supabase
        .from('shortlist_candidates')
        .update({ notes: newNotes }, { count: 'exact' })
        .eq('candidate_id', talent.id);
      if (shortlistError) throw shortlistError;

      return { newNotes, shortlistCount: shortlistCount ?? 0 };
    },
    onSuccess: ({ newNotes, shortlistCount }) => {
      // Update cached shortlist candidates immediately
      queryClient.setQueriesData(
        { queryKey: ['shortlist-candidates'] },
        (old: unknown) => {
          if (!Array.isArray(old)) return old;
          return old.map((row: any) => {
            if (row?.candidate_id !== talent.id) return row;
            return {
              ...row,
              notes: newNotes,
              candidate_profiles: {
                ...row.candidate_profiles,
                recruiter_notes: newNotes,
              },
            };
          });
        }
      );

      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'], exact: false });
      setHasUnsavedNotes(false);

      toast.success('Notes saved');
    },
    onError: () => {
      toast.error('Failed to save notes');
    },
  });

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setHasUnsavedNotes(value !== (talent.recruiter_notes || ''));
  };

  const handleSaveNotes = () => {
    updateNotes.mutate(notes);
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div
        className={`py-4 first:pt-0 last:pb-0 hover:bg-muted/50 -mx-4 px-4 transition-colors ${
          isSelected ? 'bg-muted/30' : ''
        }`}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex items-center justify-center w-10 h-12 shrink-0 cursor-pointer"
            onClick={(e) => onToggleSelection(talent.id, e)}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => {}}
              aria-label={`Select ${talent.full_name || 'talent'}`}
              className="pointer-events-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-accent text-accent-foreground">
                {(talent.full_name || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewProfile(talent.id);
                }}
                className="font-semibold text-left hover:text-primary hover:underline transition-colors cursor-pointer"
              >
                {talent.full_name || 'Unknown'}
              </button>
              {talent.ats_score && <ScoreBadge score={talent.ats_score} size="sm" />}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              {talent.current_title && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" />
                  {talent.current_title}
                  {talent.current_company && ` at ${talent.current_company}`}
                </span>
              )}
              {talent.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {talent.location}
                </span>
              )}
              {talent.years_of_experience !== null && (
                <span>{talent.years_of_experience} yrs exp</span>
              )}
            </div>
            {talent.skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {talent.skills.slice(0, 5).map((skill, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {skill.skill_name}
                  </Badge>
                ))}
                {talent.skills.length > 5 && (
                  <Badge variant="outline" className="text-xs">
                    +{talent.skills.length - 5} more
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select
              value={talent.recruiter_status || 'new'}
              onValueChange={(value) => updateStatus.mutate(value)}
              disabled={updateStatus.isPending}
            >
              <SelectTrigger className="w-[130px] h-8" onClick={(e) => e.stopPropagation()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANDIDATE_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <HoverCard openDelay={300} closeDelay={100}>
              <HoverCardTrigger asChild>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MessageSquare className={`h-4 w-4 ${talent.recruiter_notes ? 'text-primary' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
              </HoverCardTrigger>
              <HoverCardContent className="w-72" align="end">
                {talent.recruiter_notes ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">
                    {talent.recruiter_notes}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No notes added</p>
                )}
              </HoverCardContent>
            </HoverCard>

            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {format(new Date(talent.created_at), 'MMM d')}
            </div>
          </div>
        </div>

        <CollapsibleContent>
          <div className="ml-14 mt-3 pt-3 border-t bg-muted/30 rounded-md p-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Recruiter Notes</label>
              <Textarea
                placeholder="Add notes about this candidate..."
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="min-h-[80px] resize-none"
              />
              {hasUnsavedNotes && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveNotes();
                    }}
                    disabled={updateNotes.isPending}
                  >
                    {updateNotes.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Notes
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
