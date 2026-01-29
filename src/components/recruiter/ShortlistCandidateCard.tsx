import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { SwipeableRow } from '@/components/ui/swipeable-row';
import { useIsMobile } from '@/hooks/use-mobile';
import { 
  Briefcase, 
  MoreVertical, 
  Copy, 
  MoveRight, 
  Trash2,
  ChevronDown,
  MessageSquare,
  Save,
  Loader2,
  User,
  FileText,
  Mail,
  XCircle,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TALENT_POOL_STATUS_OPTIONS } from '@/lib/statusOptions';

const CANDIDATE_STATUSES = TALENT_POOL_STATUS_OPTIONS.map((s) => ({
  ...s,
  variant:
    s.value === 'rejected'
      ? ('destructive' as const)
      : s.value === 'contacted'
        ? ('secondary' as const)
        : s.value === 'new' || s.value === 'withdrawn'
          ? ('outline' as const)
          : ('default' as const),
}));

interface ShortlistCandidate {
  id: string;
  candidate_id: string;
  notes: string | null;
  status: string;
  added_at: string;
  candidate_profiles?: {
    id: string;
    full_name: string | null;
    current_title: string | null;
    email: string | null;
    recruiter_notes: string | null;
    recruiter_status: string | null;
  };
}

interface Shortlist {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  candidates_count?: number;
}

interface ShortlistCandidateCardProps {
  candidate: ShortlistCandidate;
  shortlists: Shortlist[] | undefined;
  selectedShortlistId: string;
  onCopy: (candidateId: string, targetShortlistId: string) => void;
  onMove: (shortlistCandidateId: string, candidateId: string, targetShortlistId: string) => void;
  onRemove: (id: string) => void;
  onViewProfile?: (candidateId: string) => void;
}

export function ShortlistCandidateCard({
  candidate,
  shortlists,
  selectedShortlistId,
  onCopy,
  onMove,
  onRemove,
  onViewProfile,
}: ShortlistCandidateCardProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);

  // Notes/status are candidate-level and MUST match everywhere.
  // We also support legacy shortlist-only notes by falling back to candidate.notes.
  const [profileNotes, setProfileNotes] = useState(
    candidate.candidate_profiles?.recruiter_notes ?? candidate.notes ?? ''
  );
  const [hasUnsavedProfileNotes, setHasUnsavedProfileNotes] = useState(false);

  useEffect(() => {
    setProfileNotes(candidate.candidate_profiles?.recruiter_notes ?? candidate.notes ?? '');
    setHasUnsavedProfileNotes(false);
  }, [candidate.id, candidate.candidate_profiles?.recruiter_notes, candidate.notes]);

  // One-time migration: older data may exist only in shortlist_candidates.notes.
  // If so, sync it into candidate_profiles so Talent Pool shows it too.
  const syncLegacyNotesToProfile = useMutation({
    mutationFn: async (legacyNotes: string) => {
      const { error } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_notes: legacyNotes })
        .eq('id', candidate.candidate_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
    },
  });

  useEffect(() => {
    if (!candidate.notes) return;
    if (candidate.candidate_profiles?.recruiter_notes) return;
    if (syncLegacyNotesToProfile.isPending) return;

    syncLegacyNotesToProfile.mutate(candidate.notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.id, candidate.notes, candidate.candidate_profiles?.recruiter_notes]);

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      // Candidate-level status: keep candidate_profiles as source of truth...
      const { error: profileError } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_status: newStatus })
        .eq('id', candidate.candidate_id);
      if (profileError) throw profileError;

      // ...and mirror to shortlist rows so status sort + other screens stay consistent.
      const { error: shortlistError, count: shortlistCount } = await supabase
        .from('shortlist_candidates')
        .update({ status: newStatus }, { count: 'exact' })
        .eq('candidate_id', candidate.candidate_id);
      if (shortlistError) throw shortlistError;

      return { newStatus, shortlistCount: shortlistCount ?? 0 };
    },
    onSuccess: ({ newStatus }) => {
      // Update cached shortlist candidates immediately (avoid "stale UI" in other shortlists)
      queryClient.setQueriesData(
        { queryKey: ['shortlist-candidates'] },
        (old: unknown) => {
          if (!Array.isArray(old)) return old;
          return old.map((row: any) => {
            if (row?.candidate_id !== candidate.candidate_id) return row;
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

      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      toast.success('Status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const updateProfileNotes = useMutation({
    mutationFn: async (newNotes: string) => {
      // Keep notes in candidate_profiles as the single source of truth.
      const { error: profileError } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_notes: newNotes })
        .eq('id', candidate.candidate_id);
      if (profileError) throw profileError;

      // Also mirror into shortlist_candidates.notes so older UI/queries stay consistent.
      const { error: shortlistError, count: shortlistCount } = await supabase
        .from('shortlist_candidates')
        .update({ notes: newNotes }, { count: 'exact' })
        .eq('candidate_id', candidate.candidate_id);
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
            if (row?.candidate_id !== candidate.candidate_id) return row;
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

      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      setHasUnsavedProfileNotes(false);
      toast.success('Notes saved');
    },
    onError: () => {
      toast.error('Failed to save notes');
    },
  });

  const handleNotesChange = (value: string) => {
    setProfileNotes(value);
    const existing = candidate.candidate_profiles?.recruiter_notes ?? candidate.notes ?? '';
    setHasUnsavedProfileNotes(value !== existing);
  };

  const statusValues = new Set(CANDIDATE_STATUSES.map((s) => s.value));
  const rawStatus = candidate.candidate_profiles?.recruiter_status ?? candidate.status ?? 'new';
  const currentStatus = statusValues.has(rawStatus) ? rawStatus : 'new';
  const otherShortlists = shortlists?.filter(s => s.id !== selectedShortlistId) || [];

  const handleSwipeEmail = () => {
    const email = candidate.candidate_profiles?.email;
    if (email) {
      window.location.href = `mailto:${email}`;
    } else {
      toast.error('No email available');
    }
  };

  const handleSwipeReject = () => {
    updateStatus.mutate('rejected');
  };

  const handleSwipeRemove = () => {
    onRemove(candidate.id);
  };

  const cardContent = (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={`rounded-lg bg-background w-full min-w-0 ${isMobile ? '' : 'border'}`}>
        <div
          className={`flex p-3 gap-2 min-w-0 ${isMobile ? 'flex-col items-stretch' : 'items-center justify-between'}`}
        >
          <div className={`flex items-center gap-3 min-w-0 ${isMobile ? 'w-full' : 'flex-1'}`}>
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-accent text-accent-foreground">
                {candidate.candidate_profiles?.full_name?.charAt(0) || 'C'}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              {onViewProfile ? (
                <button
                  onClick={() => onViewProfile(candidate.candidate_id)}
                  className="font-medium block max-w-full text-left whitespace-normal break-words leading-snug hover:text-primary hover:underline transition-colors cursor-pointer"
                >
                  {candidate.candidate_profiles?.full_name || 'Unknown'}
                </button>
              ) : (
                <p className="font-medium max-w-full whitespace-normal break-words leading-snug">
                  {candidate.candidate_profiles?.full_name || 'Unknown'}
                </p>
              )}

              <div className="flex items-start gap-2 text-smmin-w-0">
                <Briefcase className="h-3 w-3 shrink-0 mt-1" />
                <span className="block min-w-0 flex-1 whitespace-normal break-words leading-snug">
                  {candidate.candidate_profiles?.current_title || 'No title'}
                </span>
              </div>
            </div>
          </div>

          <div className={`flex items-center gap-2 shrink-0 ${isMobile ? 'w-full justify-between' : ''}`}>
            <Select
              value={currentStatus}
              onValueChange={(value) => updateStatus.mutate(value)}
              disabled={updateStatus.isPending}
            >
              <SelectTrigger className="w-[130px] h-8">
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsExpanded((v) => !v)}
                  aria-label="Toggle notes"
                >
                  <MessageSquare
                    className={`h-4 w-4 ${(candidate.candidate_profiles?.recruiter_notes || candidate.notes) ? 'text-primary' : ''}`}
                  />
                </Button>
              </HoverCardTrigger>
              <HoverCardContent className="w-72" align="end">
                {candidate.candidate_profiles?.recruiter_notes || candidate.notes ? (
                  <p className="text-smwhitespace-pre-wrap line-clamp-6">
                    {candidate.candidate_profiles?.recruiter_notes || candidate.notes}
                  </p>
                ) : (
                  <p className="text-smitalic">No notes added</p>
                )}
              </HoverCardContent>
            </HoverCard>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to...
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {otherShortlists.map((s) => (
                      <DropdownMenuItem
                        key={s.id}
                        onClick={() => onCopy(candidate.candidate_id, s.id)}
                      >
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                    {otherShortlists.length === 0 && (
                      <DropdownMenuItem disabled>No other shortlists</DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <MoveRight className="h-4 w-4 mr-2" />
                    Move to...
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {otherShortlists.map((s) => (
                      <DropdownMenuItem
                        key={s.id}
                        onClick={() => onMove(candidate.id, candidate.candidate_id, s.id)}
                      >
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                    {otherShortlists.length === 0 && (
                      <DropdownMenuItem disabled>No other shortlists</DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />
                {onViewProfile && (
                  <DropdownMenuItem onClick={() => onViewProfile(candidate.candidate_id)}>
                    <FileText className="h-4 w-4 mr-2" />
                    View Profile & Resume
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onRemove(candidate.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0 border-t bg-muted/30">
            <div className="pt-3 space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Notes about this candidate (shows in Talent Pool and Shortlists)..."
                value={profileNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                className="min-h-[120px] resize-none"
              />
              {hasUnsavedProfileNotes && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => updateProfileNotes.mutate(profileNotes)}
                    disabled={updateProfileNotes.isPending}
                  >
                    {updateProfileNotes.isPending ? (
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

  if (isMobile) {
    return (
      <div className="w-full">
        <SwipeableRow
          className="w-full"
          leftActions={[
            {
              icon: <Mail className="h-5 w-5" />,
              label: 'Email',
              className: 'bg-primary text-primary-foreground',
              onAction: handleSwipeEmail,
            },
          ]}
          rightActions={[
            {
              icon: <XCircle className="h-5 w-5" />,
              label: 'Reject',
              className: 'bg-orange-500 text-white',
              onAction: handleSwipeReject,
            },
            {
              icon: <Trash2 className="h-5 w-5" />,
              label: 'Remove',
              className: 'bg-destructive text-destructive-foreground',
              onAction: handleSwipeRemove,
            },
          ]}
        >
          <div className="border rounded-lg w-full">
            {cardContent}
          </div>
        </SwipeableRow>
      </div>
    );
  }

  return cardContent;
}
