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
import { ScoreBadge } from '@/components/ui/score-badge';
import { ListPlus, Mail, MoreHorizontal, Send, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
      className="glass-panel p-4 hover-card-premium flex items-center gap-4 cursor-pointer group transition-all duration-300 relative z-0 hover:z-10"
      onClick={() => onViewProfile(talent.id)}
    >
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm">
            {(name || 'U').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="font-bold text-foreground truncate">{name}</div>
          {company && company !== '—' && (
            <div className="text-xs text-muted-foreground truncate">{company}</div>
          )}
        </div>
      </div>

      <div className="w-[180px] hidden xl:block" title={rawTitle}>
        <span className="text-sm text-foreground/80 truncate block">{title}</span>
      </div>

      <div className="w-[120px] hidden 2xl:block truncate text-sm text-muted-foreground" title={location}>
        {location}
      </div>

      <div className="w-20 hidden 2xl:block text-sm text-muted-foreground">
        {experience}
      </div>

      <div className="w-[140px] hidden lg:block" onClick={(e) => e.stopPropagation()}>
        <Select
          value={talent.recruiter_status || 'new'}
          onValueChange={(value) => updateStatus.mutate(value)}
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

      <div className="w-16 hidden lg:flex justify-center text-center">
        {talent.ats_score != null ? (
          <ScoreBadge score={talent.ats_score} size="sm" showLabel={false} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div className="w-12 flex justify-center" onClick={(e) => e.stopPropagation()}>
        {talent.email && (
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 hover:bg-white/10">
            <a href={`mailto:${talent.email}`} title={talent.email}>
              <Mail className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
            </a>
          </Button>
        )}
      </div>

      <div className="w-24 hidden 2xl:block text-sm text-muted-foreground whitespace-nowrap text-right">
        {talent.created_at ? format(new Date(talent.created_at), 'MMM d') : '—'}
      </div>

      <div className="w-[100px] hidden md:flex justify-end" onClick={(e) => e.stopPropagation()}>
        {shortlistButton?.shortlistId && onOpenShortlist ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              onOpenShortlist(shortlistButton.shortlistId);
            }}
          >
            <ListPlus className="h-3.5 w-3.5" />
            {shortlistButton.label}
          </Button>
        ) : onAddToShortlist ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              onAddToShortlist(talent.id);
            }}
          >
            <ListPlus className="h-3.5 w-3.5" />
            Shortlist
          </Button>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div className="w-10 flex justify-end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/10">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-panel border-white/20">
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
