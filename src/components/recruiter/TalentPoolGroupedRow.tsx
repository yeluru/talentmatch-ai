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
import { ChevronDown, ChevronRight, MapPin, Briefcase, Users, MessageSquare } from 'lucide-react';
import { ScoreBadge } from '@/components/ui/score-badge';
import { TalentPoolRow } from './TalentPoolRow';
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

interface TalentPoolGroupedRowProps {
  profiles: TalentProfile[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string, e: React.MouseEvent) => void;
  onViewProfile: (id: string) => void;
}

export function TalentPoolGroupedRow({
  profiles,
  selectedIds,
  onToggleSelection,
  onViewProfile,
}: TalentPoolGroupedRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const queryClient = useQueryClient();
  
  // If only one profile, render the regular row
  if (profiles.length === 1) {
    return (
      <TalentPoolRow
        talent={profiles[0]}
        isSelected={selectedIds.has(profiles[0].id)}
        onToggleSelection={onToggleSelection}
        onViewProfile={onViewProfile}
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
      {/* Group Header Row */}
      <div className="border rounded-lg flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors group">
        {/* Expand Toggle */}
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        {/* Group Checkbox */}
        <Checkbox
          checked={allSelected}
          className={someSelected && !allSelected ? 'data-[state=checked]:bg-muted' : ''}
          onClick={handleGroupSelect}
          aria-label="Select all profiles in group"
        />
        
        {/* Avatar with count badge */}
        <div className="relative">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(primaryProfile.full_name)}
            </AvatarFallback>
          </Avatar>
          <Badge 
            variant="secondary" 
            className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs font-bold bg-primary text-primary-foreground"
          >
            {profiles.length}
          </Badge>
        </div>
        
        {/* Name & Title */}
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onViewProfile(primaryProfile.id)}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">
              {primaryProfile.full_name || 'Unknown'}
            </span>
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Users className="h-3 w-3" />
              {profiles.length} profiles
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {primaryProfile.current_title && (
              <span className="flex items-center gap-1 truncate">
                <Briefcase className="h-3 w-3 flex-shrink-0" />
                {primaryProfile.current_title}
                {primaryProfile.current_company && ` at ${primaryProfile.current_company}`}
              </span>
            )}
            {primaryProfile.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {primaryProfile.location}
              </span>
            )}
          </div>
        </div>
        
        {/* Skills preview */}
        <div className="hidden md:flex items-center gap-1.5 max-w-xs overflow-hidden">
          {allSkills.slice(0, 4).map((skill) => (
            <Badge key={skill} variant="secondary" className="text-xs whitespace-nowrap">
              {skill}
            </Badge>
          ))}
          {allSkills.length > 4 && (
            <span className="text-xs text-muted-foreground">+{allSkills.length - 4}</span>
          )}
        </div>
        
        {/* Best Score */}
        {bestScore > 0 && (
          <ScoreBadge score={bestScore} className="hidden sm:flex" />
        )}
        
        {/* View button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewProfile(primaryProfile.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          View Latest
        </Button>
      </div>
      
      {/* Expanded Profiles */}
      <CollapsibleContent>
        <div className="pl-14 border-l-2 border-primary/20 ml-4 space-y-1 py-2">
          <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
            All profiles for {primaryProfile.email || primaryProfile.full_name}:
          </div>
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
                queryClient={queryClient}
              />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface GroupedProfileRowProps {
  profile: TalentProfile;
  isLatest: boolean;
  isSelected: boolean;
  onToggleSelection: (id: string, e: React.MouseEvent) => void;
  onViewProfile: (id: string) => void;
  queryClient: ReturnType<typeof useQueryClient>;
}

function GroupedProfileRow({
  profile,
  isLatest,
  isSelected,
  onToggleSelection,
  onViewProfile,
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
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
      }`}
      onClick={() => onViewProfile(profile.id)}
    >
      <Checkbox
        checked={isSelected}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelection(profile.id, e as unknown as React.MouseEvent);
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {profile.current_title || 'No title'}
          </span>
          {isLatest && (
            <Badge variant="default" className="text-xs">Latest</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {profile.current_company && `${profile.current_company} · `}
          Added {format(new Date(profile.created_at), 'MMM d, yyyy')}
        </div>
      </div>
      
      {/* Status selector */}
      <Select
        value={profile.recruiter_status || 'new'}
        onValueChange={(value) => updateStatus.mutate(value)}
        disabled={updateStatus.isPending}
      >
        <SelectTrigger 
          className="w-[110px] h-7 text-xs" 
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
      
      {/* Notes indicator */}
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
            <MessageSquare className={`h-3.5 w-3.5 ${profile.recruiter_notes ? 'text-primary' : 'text-muted-foreground'}`} />
          </Button>
        </HoverCardTrigger>
        <HoverCardContent className="w-72" align="end">
          {profile.recruiter_notes ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">
              {profile.recruiter_notes}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No notes added</p>
          )}
        </HoverCardContent>
      </HoverCard>
      
      {profile.ats_score && profile.ats_score > 0 && (
        <ScoreBadge score={profile.ats_score} size="sm" />
      )}
    </div>
  );
}
