import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { ChevronDown, ChevronRight, MapPin, Briefcase, Users, MessageSquare, Trash2, Send, ListPlus } from 'lucide-react';
import { ScoreBadge } from '@/components/ui/score-badge';
import { TalentPoolRow } from './TalentPoolRow';
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
  skills: {
    skill_name: string;
  }[];
  companies: string[];
}

interface TalentPoolGroupedRowProps {
  profiles: TalentProfile[];
  selectedIds: Set<string>;
  zebra?: boolean;
  onToggleSelection: (id: string, e: React.MouseEvent) => void;
  onViewProfile: (id: string) => void;
  onRequestRemove?: (candidateId: string) => void;
  onStartEngagement?: (candidateId: string) => void;
  onAddToShortlist?: (candidateId: string) => void;
  onOpenShortlist?: (shortlistId: string) => void;
  shortlistButtonByCandidateId?: Record<string, { shortlistId: string; label: string; count: number }>;
}

export function TalentPoolGroupedRow({
  profiles,
  selectedIds,
  zebra = false,
  onToggleSelection,
  onViewProfile,
  onRequestRemove,
  onStartEngagement,
  onAddToShortlist,
  onOpenShortlist,
  shortlistButtonByCandidateId,
}: TalentPoolGroupedRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const queryClient = useQueryClient();
  
  // If only one profile, render the regular row
  if (profiles.length === 1) {
    return (
      <TalentPoolRow
        talent={profiles[0]}
        isSelected={selectedIds.has(profiles[0].id)}
        zebra={zebra}
        onToggleSelection={onToggleSelection}
        onViewProfile={onViewProfile}
        onRequestRemove={onRequestRemove}
        onAddToShortlist={onAddToShortlist}
        onOpenShortlist={onOpenShortlist}
        shortlistButton={shortlistButtonByCandidateId?.[profiles[0].id] || null}
        onStartEngagement={onStartEngagement}
      />
    );
  }

  // Use the most recent profile as the "primary" display
  const primaryProfile = profiles.reduce((latest, p) => 
    new Date(p.created_at) > new Date(latest.created_at) ? p : latest
  , profiles[0]);
  
  // Check if all profiles in the group are selected
  const allSelected = profiles.every(p => selectedIds.has(p.id));
  const someSelected = profiles.some(p => selectedIds.has(p.id));
  
  const handleGroupSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Toggle all profiles in the group
    profiles.forEach(p => {
      if (allSelected) {
        // Deselect all
        onToggleSelection(p.id, e);
      } else if (!selectedIds.has(p.id)) {
        // Select all unselected
        onToggleSelection(p.id, e);
      }
    });
  };
  
  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Get best ATS score from the group
  const bestScore = Math.max(...profiles.map(p => p.ats_score || 0));
  
  // Combine all unique skills
  const allSkills = [...new Set(profiles.flatMap(p => p.skills.map(s => s.skill_name)))];

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={`border rounded-lg transition-colors ${zebra ? 'bg-secondary/60 hover:bg-secondary/80' : 'bg-card hover:bg-muted/30'}`}>
        {/* Group Header */}
        <div className="p-4">
          {/* Top Section: Expand, Checkbox, Avatar, Name */}
          <div className="flex items-center gap-3 mb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            
            <Checkbox
              checked={allSelected}
              className={`shrink-0 ${someSelected && !allSelected ? 'data-[state=checked]:bg-muted' : ''}`}
              onClick={handleGroupSelect}
              aria-label="Select all profiles in group"
            />
            
            <div className="relative shrink-0">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {getInitials(primaryProfile.full_name)}
                </AvatarFallback>
              </Avatar>
              <Badge 
                variant="secondary" 
                className="absolute top-0 right-0 h-5 min-w-5 flex items-center justify-center p-0 text-xs font-bold bg-primary text-primary-foreground"
              >
                {profiles.length}
              </Badge>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="font-semibold truncate hover:text-primary hover:underline transition-colors cursor-pointer"
                  onClick={() => onViewProfile(primaryProfile.id)}
                >
                  {primaryProfile.full_name || 'Unknown'}
                </button>
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {profiles.length} profiles
                </Badge>
                {bestScore > 0 && (
                  <div
                    className="hidden sm:flex flex-col items-start leading-tight"
                    title="Generic resume-quality score (not JD-based)"
                  >
                    <ScoreBadge score={bestScore} size="sm" showLabel={false} />
                    <span className="text-[10px]">generic score</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Middle Section: Title, Location */}
          <div className="ml-[84px] space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
              {primaryProfile.current_title && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {primaryProfile.current_title}
                    {primaryProfile.current_company && <span className="text-foreground/70"> at {primaryProfile.current_company}</span>}
                  </span>
                </span>
              )}
              {primaryProfile.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{primaryProfile.location}</span>
                </span>
              )}
            </div>

            {/* Skills Row */}
            {allSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allSkills.slice(0, 4).map((skill) => (
                  <Badge key={skill} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
                {allSkills.length > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{allSkills.length - 4}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 ml-[84px]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewProfile(primaryProfile.id)}
              className="text-xs"
            >
              View Latest Profile
            </Button>
          </div>
        </div>
        
        {/* Expanded Profiles */}
        <CollapsibleContent>
          <div className="border-t bg-muted/20 p-4">
            <div className="text-xs font-mediummb-3 min-w-0">
              All profiles for{' '}
              <span className="break-all">
                {primaryProfile.email || primaryProfile.full_name}
              </span>
              :
            </div>
            <div className="space-y-2">
              {profiles
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((profile, idx) => (
                  <GroupedProfileRow
                    key={profile.id}
                    profile={profile}
                    isLatest={idx === 0}
                    isSelected={selectedIds.has(profile.id)}
                    onToggleSelection={onToggleSelection}
                    onViewProfile={onViewProfile}
                    onRequestRemove={onRequestRemove}
                    onStartEngagement={onStartEngagement}
                    onAddToShortlist={onAddToShortlist}
                    onOpenShortlist={onOpenShortlist}
                    shortlistButton={shortlistButtonByCandidateId?.[profile.id] || null}
                    queryClient={queryClient}
                  />
                ))}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface GroupedProfileRowProps {
  profile: TalentProfile;
  isLatest: boolean;
  isSelected: boolean;
  onToggleSelection: (id: string, e: React.MouseEvent) => void;
  onViewProfile: (id: string) => void;
  onRequestRemove?: (candidateId: string) => void;
  onStartEngagement?: (candidateId: string) => void;
  onAddToShortlist?: (candidateId: string) => void;
  onOpenShortlist?: (shortlistId: string) => void;
  shortlistButton?: { shortlistId: string; label: string; count?: number } | null;
  queryClient: ReturnType<typeof useQueryClient>;
}

function GroupedProfileRow({
  profile,
  isLatest,
  isSelected,
  onToggleSelection,
  onViewProfile,
  onRequestRemove,
  onStartEngagement,
  onAddToShortlist,
  onOpenShortlist,
  shortlistButton,
  queryClient,
}: GroupedProfileRowProps) {
  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error: profileError } = await supabase
        .from('candidate_profiles')
        .update({ recruiter_status: newStatus })
        .eq('id', profile.id);
      if (profileError) throw profileError;

      await supabase
        .from('shortlist_candidates')
        .update({ status: newStatus })
        .eq('candidate_id', profile.id);

      return newStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      queryClient.invalidateQueries({ queryKey: ['shortlist-candidates'] });
      toast.success('Status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  return (
    <div 
      className={`rounded-lg border bg-card p-3 cursor-pointer transition-colors ${
        isSelected ? 'ring-2 ring-primary/20 bg-primary/5' : 'hover:bg-muted/30'
      }`}
      onClick={() => onViewProfile(profile.id)}
    >
      {/* Top Row: Checkbox, Title, Latest Badge */}
      <div className="flex items-center gap-3 mb-2">
        <Checkbox
          checked={isSelected}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection(profile.id, e as unknown as React.MouseEvent);
          }}
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">
              {profile.current_title || 'No title'}
            </span>
            {isLatest && (
              <Badge variant="default" className="text-xs">Latest</Badge>
            )}
            {profile.ats_score && profile.ats_score > 0 && (
              <div
                className="hidden sm:flex flex-col items-start leading-tight"
                title="Generic resume-quality score (not JD-based)"
              >
                <ScoreBadge score={profile.ats_score} size="sm" showLabel={false} />
                <span className="text-[10px]">generic score</span>
              </div>
            )}
            {onRequestRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7hover:text-destructive"
                title="Remove from Talent Pool"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestRemove(profile.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Company, Date, Status, Notes */}
      <div className="ml-7 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="text-xsflex-1 min-w-0">
          {profile.current_company && <span className="truncate">{profile.current_company} · </span>}
          Added {format(new Date(profile.created_at), 'MMM d, yyyy')}
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {shortlistButton?.shortlistId && onOpenShortlist ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onOpenShortlist(shortlistButton.shortlistId);
              }}
              title="Open shortlist"
            >
              <ListPlus className="h-3.5 w-3.5 mr-2" />
              {shortlistButton.label}
            </Button>
          ) : onAddToShortlist ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onAddToShortlist(profile.id);
              }}
              title="Add to shortlist"
            >
              <ListPlus className="h-3.5 w-3.5 mr-2" />
              Shortlist
            </Button>
          ) : null}

          {onStartEngagement ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onStartEngagement(profile.id);
              }}
              title="Start engagement workflow"
            >
              <Send className="h-3.5 w-3.5 mr-2" />
              Engage
            </Button>
          ) : null}

          <Select
            value={profile.recruiter_status || 'new'}
            onValueChange={(value) => updateStatus.mutate(value)}
            disabled={updateStatus.isPending}
          >
            <SelectTrigger 
              className="w-[100px] h-7 text-xs" 
              onClick={(e) => e.stopPropagation()}
            >
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
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewProfile(profile.id);
                }}
              >
                <MessageSquare className={`h-3.5 w-3.5 ${profile.recruiter_notes ? 'text-primary' : ''}`} />
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-72" align="end">
              {profile.recruiter_notes ? (
                <p className="text-smwhitespace-pre-wrap line-clamp-6">
                  {profile.recruiter_notes}
                </p>
              ) : (
                <p className="text-smitalic">No notes added</p>
              )}
            </HoverCardContent>
          </HoverCard>

          {profile.ats_score && profile.ats_score > 0 && (
            <div
              className="sm:hidden flex flex-col items-start leading-tight"
              title="Generic resume-quality score (not JD-based)"
            >
              <ScoreBadge score={profile.ats_score} size="sm" showLabel={false} />
              <span className="text-[10px]">generic score</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
