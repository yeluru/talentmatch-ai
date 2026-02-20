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

export function CompactTalentPoolRow({
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
  const [editingField, setEditingField] = React.useState<'name' | 'title' | null>(null);
  const [editedName, setEditedName] = React.useState(talent.full_name || '');
  const [editedTitle, setEditedTitle] = React.useState(talent.current_title || '');
  const [isSaving, setIsSaving] = React.useState(false);

  const saveField = async (field: 'name' | 'title') => {
    if (isSaving) return;

    const newValue = field === 'name' ? editedName.trim() : editedTitle.trim();
    const oldValue = field === 'name' ? talent.full_name : talent.current_title;

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
        : { current_title: newValue };

      const { error } = await supabase
        .from('candidate_profiles')
        .update(updateData)
        .eq('id', talent.id);

      if (error) throw error;

      // Update local state
      if (field === 'name') {
        talent.full_name = newValue;
      } else {
        talent.current_title = newValue;
      }

      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['talent-detail'] });
      toast.success(`${field === 'name' ? 'Name' : 'Title'} updated`);
      setEditingField(null);
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      toast.error(`Failed to update ${field}`);
      // Revert to original value
      if (field === 'name') {
        setEditedName(talent.full_name || '');
      } else {
        setEditedTitle(talent.current_title || '');
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
        <div className="w-12 hidden lg:flex items-center justify-center shrink-0 text-xs text-muted-foreground font-mono">
          {displayId}
        </div>
      )}
      <div className="w-[180px] min-w-0">
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
              className="font-semibold text-sm text-foreground bg-background border border-primary/50 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <div
              className="font-semibold text-sm text-foreground truncate cursor-text hover:bg-accent/30 rounded px-1 py-0.5"
              onClick={(e) => {
                e.stopPropagation();
                setEditingField('name');
              }}
              title="Click to edit name"
            >
              {name}
            </div>
          )}
          {talent.recruiter_notes && talent.recruiter_notes.trim() !== '' && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-[11px] text-blue-400/80 truncate cursor-default mt-0.5">
                    <MessageSquare className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {talent.recruiter_notes.length <= 40
                        ? talent.recruiter_notes
                        : `${talent.recruiter_notes.slice(0, 40)}…`}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap text-left text-xs">
                  {talent.recruiter_notes}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className="w-[200px] hidden xl:block" title={rawTitle}>
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
            title="Click to edit title"
          >
            {title}
          </span>
        )}
      </div>

      <div className="w-[100px] hidden 2xl:block truncate text-xs text-muted-foreground text-left" title={location}>
        {location}
      </div>

      <div className="w-16 hidden 2xl:block text-xs text-muted-foreground shrink-0 text-left">
        {experience}
      </div>

      <div className="w-[140px] text-left" onClick={(e) => e.stopPropagation()}>
        <Select
          value={(normalizeStatusForDisplay(talent.recruiter_status) || 'new') as string}
          onValueChange={() => toast.info(STAGE_READONLY_MESSAGE)}
          disabled={updateStatus.isPending}
        >
          <SelectTrigger className="h-8 text-xs w-full bg-white/5 border-white/10 px-2" onClick={(e) => e.stopPropagation()}>
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

      <div className="w-16 text-left shrink-0">
        {talent.ats_score != null ? (
          <ScoreBadge score={talent.ats_score} size="sm" showLabel={false} />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </div>

      <div className="w-20 hidden xl:block text-xs text-muted-foreground whitespace-nowrap text-left shrink-0">
        {talent.created_at ? format(new Date(talent.created_at), 'MMM d') : '—'}
      </div>

      <div className="w-[120px] hidden lg:block text-xs text-muted-foreground truncate text-left shrink-0" title={talent.uploaded_by_user?.full_name || talent.uploaded_by_user?.email || ''}>
        {talent.uploaded_by_user?.full_name || talent.uploaded_by_user?.email?.split('@')[0] || '—'}
      </div>

      <div className="w-[100px] text-left shrink-0" onClick={(e) => e.stopPropagation()}>
        {shortlistButton?.shortlistId && onOpenShortlist ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs hover:bg-white/10 px-3"
            onClick={(e) => {
              e.stopPropagation();
              onOpenShortlist(shortlistButton.shortlistId);
            }}
          >
            <ListPlus className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">{shortlistButton.label}</span>
          </Button>
        ) : onAddToShortlist ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs hover:bg-white/10 px-3"
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

      <div className="w-10 flex justify-end shrink-0" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10">
              <MoreHorizontal className="h-4 w-4" />
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
