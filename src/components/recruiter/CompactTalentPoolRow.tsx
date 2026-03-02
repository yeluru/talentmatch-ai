import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableCell, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScoreBadge } from '@/components/ui/score-badge';
import { ListPlus, Mail, MessageSquare, MoreHorizontal, Send, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { normalizeStatusForDisplay, STAGE_READONLY_MESSAGE, TALENT_POOL_STAGE_OPTIONS } from '@/lib/statusOptions';

const CANDIDATE_STATUSES = TALENT_POOL_STAGE_OPTIONS;
const COMMENTS_PREVIEW_LEN = 50;

interface TalentProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  current_title: string | null;
  current_company: string | null;
  years_of_experience: number | null;
  headline: string | null;
  ats_score: number | null;
  created_at: string;
  recruiter_notes: string | null;
  recruiter_status: string | null;
  uploaded_by_user_id: string | null;
  uploaded_by_user: {
    full_name: string | null;
    email: string | null;
  } | null;
  skills: { skill_name: string }[];
  companies: string[];
}

interface CompactTalentPoolRowProps {
  talent: TalentProfile;
  displayId?: number;
  isEvenRow?: boolean;
  onViewProfile: (id: string) => void;
  onRequestRemove?: (candidateId: string) => void;
  onAddToShortlist?: (id: string) => void;
  onOpenShortlist?: (shortlistId: string) => void;
  shortlistButton?: { shortlistId: string; label: string } | null;
  onStartEngagement?: (id: string) => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

function CompactTalentPoolRowComponent({
  talent,
  displayId,
  isEvenRow = false,
  onViewProfile,
  onRequestRemove,
  onAddToShortlist,
  onOpenShortlist,
  shortlistButton,
  onStartEngagement,
  isSelected = false,
  onToggleSelect,
}: CompactTalentPoolRowProps) {
  const queryClient = useQueryClient();
  const [editingField, setEditingField] = React.useState<'name' | 'title' | 'notes' | null>(null);
  const [editedName, setEditedName] = React.useState(talent.full_name || '');
  const [editedTitle, setEditedTitle] = React.useState(talent.current_title || '');
  const [editedNotes, setEditedNotes] = React.useState(talent.recruiter_notes || '');
  const [isSaving, setIsSaving] = React.useState(false);

  const saveField = async (field: 'name' | 'title' | 'notes') => {
    if (isSaving) return;

    const newValue = field === 'name' ? editedName.trim() : field === 'title' ? editedTitle.trim() : editedNotes.trim();
    const oldValue = field === 'name' ? talent.full_name : field === 'title' ? talent.current_title : talent.recruiter_notes;

    // No change, just exit edit mode
    if (newValue === oldValue) {
      setEditingField(null);
      return;
    }

    // Don't allow empty name
    if (field === 'name' && !newValue) {
      toast.error('Name cannot be empty');
      setEditedName(talent.full_name || '');
      setEditingField(null);
      return;
    }

    setIsSaving(true);
    try {
      const updateData = field === 'name'
        ? { full_name: newValue }
        : field === 'title'
        ? { current_title: newValue }
        : { recruiter_notes: newValue };

      const { error } = await supabase
        .from('candidate_profiles')
        .update(updateData)
        .eq('id', talent.id);

      if (error) throw error;

      // Update local state
      if (field === 'name') {
        talent.full_name = newValue;
      } else if (field === 'title') {
        talent.current_title = newValue;
      } else {
        talent.recruiter_notes = newValue;
      }

      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      toast.success(`${field === 'name' ? 'Name' : field === 'title' ? 'Title' : 'Notes'} updated`);
      setEditingField(null);
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      toast.error(`Failed to update ${field}`);
      // Revert to original value
      if (field === 'name') {
        setEditedName(talent.full_name || '');
      } else if (field === 'title') {
        setEditedTitle(talent.current_title || '');
      } else {
        setEditedNotes(talent.recruiter_notes || '');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error: profileError } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_status: newStatus })
        .eq('id', talent.id);
      if (profileError) throw profileError;
      await supabase.from('applications').update({ status: newStatus }).eq('candidate_id', talent.id);
      const { error: shortlistError } = await supabase
        .from('shortlist_candidates')
        .update({ status: newStatus })
        .eq('candidate_id', talent.id);
      if (shortlistError) throw shortlistError;
      return { newStatus };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['pipeline-applications'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['job-applicants'], exact: false });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to update status'),
  });

  const name = talent.full_name || 'Unknown';
  const rawTitle = talent.current_title || '—';
  const TITLE_MAX_CHARS = 60;
  const title = rawTitle.length > TITLE_MAX_CHARS ? `${rawTitle.slice(0, TITLE_MAX_CHARS)}…` : rawTitle;
  const company = talent.current_company || '—';
  const location = talent.location || '—';

  const experience = talent.years_of_experience != null ? `${talent.years_of_experience} years` : '—';

  return (
    <div
      className={`glass-panel py-0.5 px-2 hover-card-premium flex flex-nowrap items-center gap-3 cursor-pointer group transition-all duration-300 relative z-0 hover:z-10 ${isEvenRow ? 'bg-white/5' : 'bg-transparent'}`}
      onClick={() => onViewProfile(talent.id)}
    >
      {onToggleSelect && (
        <div className="w-10 flex items-center justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
          />
        </div>
      )}
      {displayId !== undefined && (
        <div className="w-12 hidden lg:flex items-center shrink-0 text-xs text-muted-foreground font-mono pl-1">
          {displayId}
        </div>
      )}
      <div className="w-[180px] min-w-0 shrink-0">
        <div className="min-w-0">
          {editingField === 'name' ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={() => saveField('name')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveField('name');
                if (e.key === 'Escape') {
                  setEditedName(talent.full_name || '');
                  setEditingField(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              disabled={isSaving}
              className="font-semibold text-xs text-foreground bg-background border border-primary/50 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <div
              className="font-semibold text-xs text-foreground truncate cursor-text hover:bg-accent/30 rounded px-1 py-0.5"
              onClick={(e) => {
                e.stopPropagation();
                setEditingField('name');
              }}
              title={name}
            >
              {name}
            </div>
          )}
        </div>
      </div>

      {/* Email Column */}
      <div className="w-[150px] hidden xl:block shrink-0">
        <div className="text-xs text-muted-foreground truncate px-1" title={talent.email || ''}>
          {talent.email || '—'}
        </div>
      </div>

      {/* Phone Column */}
      <div className="w-[110px] hidden 2xl:block shrink-0">
        <div className="text-xs text-muted-foreground truncate px-1" title={talent.phone || ''}>
          {talent.phone || '—'}
        </div>
      </div>

      <div className="w-[180px] hidden xl:block shrink-0">
        {editingField === 'title' ? (
          <input
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={() => saveField('title')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveField('title');
              if (e.key === 'Escape') {
                setEditedTitle(talent.current_title || '');
                setEditingField(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            disabled={isSaving}
            className="text-xs text-foreground bg-background border border-primary/50 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <span
            className="text-xs text-foreground/80 truncate block cursor-text hover:bg-accent/30 rounded px-1 py-0.5"
            onClick={(e) => {
              e.stopPropagation();
              setEditingField('title');
            }}
            title={rawTitle}
          >
            {title}
          </span>
        )}
      </div>

      <div className="w-[100px] hidden 2xl:block shrink-0">
        <div className="text-xs text-muted-foreground truncate px-1" title={location}>
          {location}
        </div>
      </div>

      <div className="w-16 hidden 2xl:block shrink-0">
        <div className="text-xs text-muted-foreground px-1">
          {experience}
        </div>
      </div>

      <div className="w-[130px] shrink-0" onClick={(e) => e.stopPropagation()}>
        <Select
          value={(normalizeStatusForDisplay(talent.recruiter_status) || 'new') as string}
          onValueChange={() => toast.info(STAGE_READONLY_MESSAGE)}
          disabled={updateStatus.isPending}
        >
          <SelectTrigger className="h-7 text-xs w-full bg-white/5 border-white/10" onClick={(e) => e.stopPropagation()}>
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
      </div>

      <div className="w-14 shrink-0 px-1">
        {talent.ats_score != null ? (
          <ScoreBadge score={talent.ats_score} size="sm" showLabel={false} />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </div>

      <div className="w-20 hidden xl:block shrink-0">
        <div className="text-xs text-muted-foreground whitespace-nowrap px-1">
          {talent.created_at ? format(new Date(talent.created_at), 'MMM d') : '—'}
        </div>
      </div>

      <div className="w-[100px] hidden lg:block shrink-0">
        <div className="text-xs text-muted-foreground truncate px-1" title={talent.uploaded_by_user?.full_name || talent.uploaded_by_user?.email || ''}>
          {talent.uploaded_by_user?.full_name || talent.uploaded_by_user?.email?.split('@')[0] || '—'}
        </div>
      </div>

      <div className="w-[100px] text-left shrink-0" onClick={(e) => e.stopPropagation()}>
        {shortlistButton?.shortlistId && onOpenShortlist ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs hover:bg-white/10 px-2.5"
            onClick={(e) => {
              e.stopPropagation();
              onOpenShortlist(shortlistButton.shortlistId);
            }}
            title={shortlistButton.label}
          >
            <ListPlus className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">
              {shortlistButton.label.length > 10
                ? `${shortlistButton.label.slice(0, 10)}…`
                : shortlistButton.label}
            </span>
          </Button>
        ) : onAddToShortlist ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs hover:bg-white/10 px-2.5"
            onClick={(e) => {
              e.stopPropagation();
              onAddToShortlist(talent.id);
            }}
          >
            <ListPlus className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Shortlist</span>
          </Button>
        ) : null}
      </div>

      {/* Notes Column - Last column before actions */}
      <div className="w-[180px] shrink-0 flex items-center gap-1 px-1" onClick={(e) => e.stopPropagation()}>
        {editingField === 'notes' ? (
          <input
            type="text"
            value={editedNotes}
            onChange={(e) => setEditedNotes(e.target.value)}
            onBlur={() => saveField('notes')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveField('notes');
              if (e.key === 'Escape') {
                setEditedNotes(talent.recruiter_notes || '');
                setEditingField(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            disabled={isSaving}
            placeholder="Add notes..."
            className="text-xs text-foreground bg-background border border-primary/50 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 hover:bg-white/10 p-0"
              onClick={(e) => {
                e.stopPropagation();
                setEditingField('notes');
              }}
              title="Edit notes"
            >
              <MessageSquare className="h-3 w-3 text-blue-400" />
            </Button>
            {talent.recruiter_notes && talent.recruiter_notes.trim() !== '' ? (
              <span className="text-xs text-muted-foreground truncate flex-1 min-w-0" title={talent.recruiter_notes}>
                {talent.recruiter_notes.length <= 25
                  ? talent.recruiter_notes
                  : `${talent.recruiter_notes.slice(0, 25)}…`}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/50 italic truncate flex-1">No notes</span>
            )}
          </>
        )}
      </div>

      <div className="w-10 flex justify-end shrink-0" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-white/10">
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-panel border-white/20 w-48">
            {onRequestRemove && (
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10"
                onClick={() => onRequestRemove(talent.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove from pool
              </DropdownMenuItem>
            )}
            {onStartEngagement && (
              <DropdownMenuItem onClick={() => onStartEngagement(talent.id)}>
                <Send className="h-4 w-4 mr-2" />
                Start engagement
              </DropdownMenuItem>
            )}
            {onAddToShortlist && !shortlistButton && (
              <DropdownMenuItem onClick={() => onAddToShortlist(talent.id)}>
                <ListPlus className="h-4 w-4 mr-2" />
                Add to shortlist
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Phase 1 optimization: Memoize row component to prevent unnecessary re-renders
export const CompactTalentPoolRow = React.memo(CompactTalentPoolRowComponent, (prev, next) => {
  // Only re-render if these props change
  return (
    prev.talent.id === next.talent.id &&
    prev.talent.recruiter_status === next.talent.recruiter_status &&
    prev.talent.recruiter_notes === next.talent.recruiter_notes &&
    prev.talent.full_name === next.talent.full_name &&
    prev.talent.current_title === next.talent.current_title &&
    prev.isSelected === next.isSelected &&
    prev.displayId === next.displayId
  );
});
