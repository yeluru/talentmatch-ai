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
import { Briefcase, MapPin, MessageSquare, Save, Loader2, ListPlus, Mail, Phone, Trash2, Send } from 'lucide-react';
import { ScoreBadge } from '@/components/ui/score-badge';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { TALENT_POOL_STATUS_OPTIONS } from '@/lib/statusOptions';

const CANDIDATE_STATUSES = TALENT_POOL_STATUS_OPTIONS;

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
  zebra?: boolean;
  onToggleSelection: (id: string, e: React.MouseEvent) => void;
  onViewProfile: (id: string) => void;
  onRequestRemove?: (candidateId: string) => void;
  onAddToShortlist?: (id: string) => void;
  onOpenShortlist?: (shortlistId: string) => void;
  shortlistButton?: { shortlistId: string; label: string } | null;
  onSendEmail?: (id: string) => void;
  onStartEngagement?: (id: string) => void;
}

export function TalentPoolRow({
  talent,
  isSelected,
  zebra = false,
  onToggleSelection,
  onViewProfile,
  onRequestRemove,
  onAddToShortlist,
  onOpenShortlist,
  shortlistButton,
  onSendEmail,
  onStartEngagement,
}: TalentPoolRowProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(talent.recruiter_notes || '');
  const [hasUnsavedNotes, setHasUnsavedNotes] = useState(false);

  useEffect(() => {
    setNotes(talent.recruiter_notes || '');
    setHasUnsavedNotes(false);
  }, [talent.id, talent.recruiter_notes]);

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error: profileError } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_status: newStatus })
        .eq('id', talent.id);
      if (profileError) throw profileError;

      const { error: shortlistError, count: shortlistCount } = await supabase
        .from('shortlist_candidates')
        .update({ status: newStatus }, { count: 'exact' })
        .eq('candidate_id', talent.id);
      if (shortlistError) throw shortlistError;

      return { newStatus, shortlistCount: shortlistCount ?? 0 };
    },
    onSuccess: ({ newStatus, shortlistCount }) => {
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
      const { error: profileError } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_notes: newNotes })
        .eq('id', talent.id);
      if (profileError) throw profileError;

      const { error: shortlistError, count: shortlistCount } = await supabase
        .from('shortlist_candidates')
        .update({ notes: newNotes }, { count: 'exact' })
        .eq('candidate_id', talent.id);
      if (shortlistError) throw shortlistError;

      return { newNotes, shortlistCount: shortlistCount ?? 0 };
    },
    onSuccess: ({ newNotes, shortlistCount }) => {
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

  const handleSwipeShortlist = () => {
    if (onAddToShortlist) {
      onAddToShortlist(talent.id);
    } else {
      toast.info('Select candidates to add to shortlist');
    }
  };

  const handleSwipeEmail = () => {
    if (talent.email) {
      window.location.href = `mailto:${talent.email}`;
    } else {
      toast.error('No email available');
    }
  };

  const handleSwipeCall = () => {
    toast.info('Call feature coming soon');
  };

  const rowContent = (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div
        className={`border rounded-lg transition-colors ${
          isSelected
            ? 'ring-2 ring-primary/20 bg-primary/5'
            : (zebra ? 'bg-secondary/60 hover:bg-secondary/80' : 'bg-card hover:bg-muted/30')
        }`}
      >
        {/* Main Row Content */}
        <div className="p-4">
          {/* Top Section: Checkbox, Avatar, Name, Score */}
          <div className="flex items-center gap-3 mb-3">
            <div
              className="shrink-0 cursor-pointer"
              onClick={(e) => onToggleSelection(talent.id, e)}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => {}}
                aria-label={`Select ${talent.full_name || 'talent'}`}
                className="pointer-events-none"
              />
            </div>
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {(talent.full_name || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewProfile(talent.id);
                  }}
                  className="font-semibold text-left hover:text-primary hover:underline transition-colors cursor-pointer truncate"
                >
                  {talent.full_name || 'Unknown'}
                </button>
                {talent.ats_score !== null && talent.ats_score !== undefined && (
                  <div
                    className="flex flex-col items-start leading-tight"
                    title="Generic resume-quality score (not JD-based)"
                  >
                    <ScoreBadge score={talent.ats_score} size="sm" showLabel={false} />
                    <span className="text-[10px]">generic score</span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-xswhitespace-nowrap hidden sm:block">
              {format(new Date(talent.created_at), 'MMM d')}
            </div>
            {onRequestRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8hover:text-destructive"
                title="Remove from Talent Pool"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestRemove(talent.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Middle Section: Title, Location, Experience */}
          <div className="ml-[52px] space-y-2">
            <div className="flex min-w-0 flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
              {talent.current_title && (
                <span className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">
                    {talent.current_title}
                    {talent.current_company && <span className="text-foreground/70"> at {talent.current_company}</span>}
                  </span>
                </span>
              )}
              {talent.location && (
                <span className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{talent.location}</span>
                </span>
              )}
              {talent.years_of_experience !== null && (
                <span className="whitespace-nowrap">{talent.years_of_experience} yrs exp</span>
              )}
            </div>

            {/* Skills Row */}
            {talent.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {talent.skills.slice(0, isMobile ? 3 : 4).map((skill, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {skill.skill_name}
                  </Badge>
                ))}
                {talent.skills.length > (isMobile ? 3 : 4) && (
                  <Badge variant="outline" className="text-xs">
                    +{talent.skills.length - (isMobile ? 3 : 4)}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Bottom Section: Actions */}
          <div className="mt-3 ml-[52px] flex flex-wrap items-center gap-2">
            {shortlistButton?.shortlistId && onOpenShortlist ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenShortlist(shortlistButton.shortlistId);
                }}
                title="Open shortlist"
              >
                <ListPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{shortlistButton.label}</span>
              </Button>
            ) : onAddToShortlist ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToShortlist(talent.id);
                }}
                title="Add to shortlist"
              >
                <ListPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add to Shortlist</span>
              </Button>
            ) : null}

            {onStartEngagement ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartEngagement(talent.id);
                }}
                title="Start engagement workflow"
              >
                <Send className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Engage</span>
              </Button>
            ) : null}

            <Select
              value={talent.recruiter_status || 'new'}
              onValueChange={(value) => updateStatus.mutate(value)}
              disabled={updateStatus.isPending}
            >
              <SelectTrigger className="w-[120px] h-8 text-xs" onClick={(e) => e.stopPropagation()}>
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
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MessageSquare className={`h-3.5 w-3.5 ${talent.recruiter_notes ? 'text-primary' : ''}`} />
                    <span className="hidden sm:inline">
                      {talent.recruiter_notes ? 'View Notes' : 'Add Note'}
                    </span>
                  </Button>
                </CollapsibleTrigger>
              </HoverCardTrigger>
              <HoverCardContent className="w-72" align="start">
                {talent.recruiter_notes ? (
                  <p className="text-smwhitespace-pre-wrap line-clamp-6">
                    {talent.recruiter_notes}
                  </p>
                ) : (
                  <p className="text-smitalic">No notes added</p>
                )}
              </HoverCardContent>
            </HoverCard>

            <span className="text-xssm:hidden">
              {format(new Date(talent.created_at), 'MMM d')}
            </span>
          </div>
        </div>

        {/* Collapsible Notes Section */}
        <CollapsibleContent>
          <div className="border-t bg-muted/30 p-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Recruiter Notes</label>
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

  // On mobile, wrap with swipeable actions
  if (isMobile) {
    return (
      <SwipeableRow
        leftActions={[
          {
            icon: <ListPlus className="h-5 w-5" />,
            label: 'Shortlist',
            className: 'bg-primary text-primary-foreground',
            onAction: handleSwipeShortlist,
          },
        ]}
        rightActions={[
          {
            icon: <Mail className="h-5 w-5" />,
            label: 'Email',
            className: 'bg-info text-info-foreground',
            onAction: handleSwipeEmail,
          },
          {
            icon: <Phone className="h-5 w-5" />,
            label: 'Call',
            className: 'bg-success text-success-foreground',
            onAction: handleSwipeCall,
          },
        ]}
      >
        {rowContent}
      </SwipeableRow>
    );
  }

  return rowContent;
}
