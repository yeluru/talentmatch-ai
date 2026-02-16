import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  onViewProfile: (id: string) => void;
  onRequestRemove?: (candidateId: string) => void;
  onAddToShortlist?: (id: string) => void;
  onOpenShortlist?: (shortlistId: string) => void;
  shortlistButton?: { shortlistId: string; label: string } | null;
  onStartEngagement?: (id: string) => void;
}

export function CompactTalentPoolRow({
  talent,
  onViewProfile,
  onRequestRemove,
  onAddToShortlist,
  onOpenShortlist,
  shortlistButton,
  onStartEngagement,
}: CompactTalentPoolRowProps) {
  const queryClient = useQueryClient();

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
      className="glass-panel p-3 sm:p-4 hover-card-premium flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 cursor-pointer group transition-all duration-300 relative z-0 hover:z-10"
      onClick={() => onViewProfile(talent.id)}
    >
      <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
        <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm">
            {(name || 'U').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-xs text-foreground truncate">{name}</div>
          {company && company !== '—' && (
            <div className="text-[11px] text-muted-foreground truncate">{company}</div>
          )}
        </div>
      </div>

      <div className="w-full sm:w-auto sm:min-w-[120px] sm:max-w-[140px] hidden xl:block" title={rawTitle}>
        <span className="text-xs text-foreground/80 truncate block">{title}</span>
      </div>

      <div className="w-full sm:w-auto sm:min-w-[80px] sm:max-w-[100px] hidden 2xl:block truncate text-xs text-muted-foreground" title={location}>
        {location}
      </div>

      <div className="w-12 sm:w-16 hidden 2xl:block text-xs text-muted-foreground shrink-0">
        {experience}
      </div>

      <div className="w-full sm:w-auto sm:min-w-[120px] sm:max-w-[140px] hidden lg:block min-w-0" onClick={(e) => e.stopPropagation()}>
        {(talent.recruiter_notes != null && talent.recruiter_notes !== '') ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate cursor-default">
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  {talent.recruiter_notes.length <= COMMENTS_PREVIEW_LEN
                    ? talent.recruiter_notes
                    : `${talent.recruiter_notes.slice(0, COMMENTS_PREVIEW_LEN)}…`}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap text-left text-xs">
                {talent.recruiter_notes}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-xs text-muted-foreground/70 italic">—</span>
        )}
      </div>

      <div className="w-full sm:w-auto sm:min-w-[120px] sm:max-w-[140px] hidden lg:block" onClick={(e) => e.stopPropagation()}>
        <Select
          value={(normalizeStatusForDisplay(talent.recruiter_status) || 'new') as string}
          onValueChange={() => toast.info(STAGE_READONLY_MESSAGE)}
          disabled={updateStatus.isPending}
        >
          <SelectTrigger className="h-8 text-xs w-full bg-white/5 border-white/10" onClick={(e) => e.stopPropagation()}>
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

      <div className="w-12 sm:w-16 hidden lg:flex justify-center text-center shrink-0">
        {talent.ats_score != null ? (
          <ScoreBadge score={talent.ats_score} size="sm" showLabel={false} />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </div>

      <div className="w-10 sm:w-12 flex justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
        {talent.email && (
          <Button variant="ghost" size="icon" asChild className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-white/10">
            <a href={`mailto:${talent.email}`} title={talent.email}>
              <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground hover:text-primary transition-colors" />
            </a>
          </Button>
        )}
      </div>

      <div className="w-20 sm:w-24 hidden 2xl:block text-xs text-muted-foreground whitespace-nowrap text-left shrink-0">
        {talent.created_at ? format(new Date(talent.created_at), 'MMM d') : '—'}
      </div>

      <div className="w-[100px] sm:w-[120px] hidden 2xl:block text-xs text-muted-foreground truncate text-left shrink-0" title={talent.uploaded_by_user?.full_name || talent.uploaded_by_user?.email || ''}>
        {talent.uploaded_by_user?.full_name || talent.uploaded_by_user?.email?.split('@')[0] || '—'}
      </div>

      <div className="w-auto hidden lg:flex justify-start shrink-0" onClick={(e) => e.stopPropagation()}>
        {shortlistButton?.shortlistId && onOpenShortlist ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 sm:h-8 gap-1 text-xs hover:bg-white/10 px-2 sm:px-3"
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
            className="h-7 sm:h-8 gap-1 text-xs hover:bg-white/10 px-2 sm:px-3"
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

      <div className="w-8 sm:w-10 flex justify-end shrink-0" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-white/10">
              <MoreHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
