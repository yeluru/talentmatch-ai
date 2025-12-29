import { useState } from 'react';
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
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CANDIDATE_STATUSES = [
  { value: 'added', label: 'Added', variant: 'outline' as const },
  { value: 'contacted', label: 'Contacted', variant: 'secondary' as const },
  { value: 'screening', label: 'Screening', variant: 'default' as const },
  { value: 'interviewing', label: 'Interviewing', variant: 'default' as const },
  { value: 'offered', label: 'Offered', variant: 'default' as const },
  { value: 'hired', label: 'Hired', variant: 'default' as const },
  { value: 'rejected', label: 'Rejected', variant: 'destructive' as const },
  { value: 'withdrawn', label: 'Withdrawn', variant: 'outline' as const },
];

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
  const [isExpanded, setIsExpanded] = useState(false);

  // Profile-level notes/status (synced across Talent Pool, Shortlists, and Profile sheet)
  const [profileNotes, setProfileNotes] = useState(candidate.candidate_profiles?.recruiter_notes || '');
  const [hasUnsavedProfileNotes, setHasUnsavedProfileNotes] = useState(false);

  // Shortlist-level notes (unique per shortlist)
  const [shortlistNotes, setShortlistNotes] = useState(candidate.notes || '');
  const [hasUnsavedShortlistNotes, setHasUnsavedShortlistNotes] = useState(false);

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_status: newStatus })
        .eq('id', candidate.candidate_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
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
      const { error } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_notes: newNotes })
        .eq('id', candidate.candidate_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      setHasUnsavedProfileNotes(false);
      toast.success('Profile notes saved');
    },
    onError: () => {
      toast.error('Failed to save profile notes');
    },
  });

  const updateShortlistNotes = useMutation({
    mutationFn: async (newNotes: string) => {
      const { error } = await supabase
        .from('shortlist_candidates')
        .update({ notes: newNotes })
        .eq('id', candidate.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      setHasUnsavedShortlistNotes(false);
      toast.success('Shortlist notes saved');
    },
    onError: () => {
      toast.error('Failed to save shortlist notes');
    },
  });

  const handleProfileNotesChange = (value: string) => {
    setProfileNotes(value);
    setHasUnsavedProfileNotes(value !== (candidate.candidate_profiles?.recruiter_notes || ''));
  };

  const handleShortlistNotesChange = (value: string) => {
    setShortlistNotes(value);
    setHasUnsavedShortlistNotes(value !== (candidate.notes || ''));
  };

  const currentStatus = candidate.candidate_profiles?.recruiter_status || 'new';
  const otherShortlists = shortlists?.filter(s => s.id !== selectedShortlistId) || [];

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarFallback className="bg-accent text-accent-foreground">
                {candidate.candidate_profiles?.full_name?.charAt(0) || 'C'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              {onViewProfile ? (
                <button
                  onClick={() => onViewProfile(candidate.candidate_id)}
                  className="font-medium truncate text-left hover:text-primary hover:underline transition-colors cursor-pointer"
                >
                  {candidate.candidate_profiles?.full_name || 'Unknown'}
                </button>
              ) : (
                <p className="font-medium truncate">{candidate.candidate_profiles?.full_name || 'Unknown'}</p>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Briefcase className="h-3 w-3 shrink-0" />
                <span className="truncate">{candidate.candidate_profiles?.current_title || 'No title'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            
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
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MessageSquare
                      className={`h-4 w-4 ${(candidate.candidate_profiles?.recruiter_notes || candidate.notes) ? 'text-primary' : ''}`}
                    />
                  </Button>
                </CollapsibleTrigger>
              </HoverCardTrigger>
              <HoverCardContent className="w-72" align="end">
                {(candidate.candidate_profiles?.recruiter_notes || candidate.notes) ? (
                  <div className="space-y-3">
                    {candidate.candidate_profiles?.recruiter_notes && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Profile notes</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                          {candidate.candidate_profiles.recruiter_notes}
                        </p>
                      </div>
                    )}
                    {candidate.notes && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Shortlist notes</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                          {candidate.notes}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No notes added</p>
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
                    {otherShortlists.map(s => (
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
                    {otherShortlists.map(s => (
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
            <div className="pt-3 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Profile Notes (synced)</label>
                <Textarea
                  placeholder="Notes that follow the candidate everywhere..."
                  value={profileNotes}
                  onChange={(e) => handleProfileNotesChange(e.target.value)}
                  className="min-h-[80px] resize-none"
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
                      Save Profile Notes
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Shortlist Notes (this list only)</label>
                <Textarea
                  placeholder="Notes specific to this shortlist..."
                  value={shortlistNotes}
                  onChange={(e) => handleShortlistNotesChange(e.target.value)}
                  className="min-h-[80px] resize-none"
                />
                {hasUnsavedShortlistNotes && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => updateShortlistNotes.mutate(shortlistNotes)}
                      disabled={updateShortlistNotes.isPending}
                    >
                      {updateShortlistNotes.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Shortlist Notes
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
