import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScoreBadge } from '@/components/ui/score-badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ArrowUpDown, ArrowUp, ArrowDown, UserPlus, MoreHorizontal, Users, Send, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UnifiedSearchResult, isInternalResult } from '@/types/search-results';
import { normalizeStatusForDisplay, TALENT_POOL_STAGE_OPTIONS } from '@/lib/statusOptions';

type SortColumn = 'name' | 'title' | 'experience' | 'location' | 'match_score';
type SortDirection = 'asc' | 'desc';

interface ResultsTableViewProps {
  results: UnifiedSearchResult[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  onRowClick?: (id: string) => void;
  onAddToShortlist?: (id: string) => void;
  onStartEngagement?: (id: string) => void;
  onUpdateField?: (candidateId: string, field: string, value: string) => Promise<void>;
  shortlistsByCandidateId?: Record<string, string>;
}

export function ResultsTableView({
  results,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  sortColumn,
  sortDirection,
  onSort,
  onRowClick,
  onAddToShortlist,
  onStartEngagement,
  onUpdateField,
  shortlistsByCandidateId,
}: ResultsTableViewProps) {
  const [editingCell, setEditingCell] = useState<{ candidateId: string; field: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const saveField = async (candidateId: string, field: string, newValue: string, oldValue: string | null | undefined) => {
    if (isSaving || !onUpdateField) return;

    const trimmedValue = newValue.trim();
    if (trimmedValue === oldValue) {
      setEditingCell(null);
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateField(candidateId, field, trimmedValue);
      setEditingCell(null);
    } catch (error) {
      console.error('Failed to save field:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed w-full">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="w-8 text-center px-1">
              <Checkbox
                checked={selectedIds.size === results.length && results.length > 0}
                onCheckedChange={onToggleSelectAll}
              />
            </TableHead>
            <TableHead className="w-8 text-center text-[10px] text-muted-foreground font-medium px-1">#</TableHead>
            <TableHead className="w-[20ch] py-1.5 px-2 text-[10px] font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('name')}>
              <div className="flex items-center gap-0.5">
                Name
                <SortIcon column="name" />
              </div>
            </TableHead>
            <TableHead className="w-[90px] hidden xl:table-cell py-1.5 px-2 text-[10px] font-semibold">Email</TableHead>
            <TableHead className="w-[85px] hidden 2xl:table-cell py-1.5 px-2 text-[10px] font-semibold">Phone</TableHead>
            <TableHead className="w-[30ch] py-1.5 px-0 text-[10px] font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('title')}>
              <div className="flex items-center gap-0.5">
                Title
                <SortIcon column="title" />
              </div>
            </TableHead>
            <TableHead className="w-[25ch] hidden xl:table-cell py-1.5 px-0 text-[10px] font-semibold">Company</TableHead>
            <TableHead className="w-9 hidden sm:table-cell py-1.5 px-1 text-[10px] font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('experience')}>
              <div className="flex items-center gap-0.5">
                Exp
                <SortIcon column="experience" />
              </div>
            </TableHead>
            <TableHead className="w-[70px] hidden lg:table-cell py-1.5 px-2 text-[10px] font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('location')}>
              <div className="flex items-center gap-0.5">
                Location
                <SortIcon column="location" />
              </div>
            </TableHead>
            <TableHead className="w-[50px] py-1.5 px-1 text-[10px] font-semibold">Status</TableHead>
            <TableHead className="w-11 py-1.5 px-1 text-[10px] font-semibold cursor-pointer hover:text-recruiter text-center" onClick={() => onSort('match_score')} title="Fit score for this search">
              <div className="flex items-center justify-center gap-0.5">
                Match
                <SortIcon column="match_score" />
              </div>
            </TableHead>
            <TableHead className="w-9 hidden xl:table-cell py-1.5 px-1 text-[10px] font-semibold" title="Resume quality">ATS</TableHead>
            <TableHead className="w-[75px] py-1.5 px-2 text-[10px] font-semibold">Notes</TableHead>
            <TableHead className="w-[60px] py-1.5 px-1 text-[10px] font-semibold">Shortlist</TableHead>
            <TableHead className="w-10 py-1.5 px-1"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result, idx) => {
            const isSelected = selectedIds.has(result.id);
            const candidate = isInternalResult(result) ? result.internalData : null;
            const isEditingNotes = editingCell?.candidateId === result.id && editingCell?.field === 'notes';

            return (
              <TableRow
                key={result.id}
                className={cn(
                  "group border-border transition-colors hover:bg-recruiter/5 hover:border-recruiter/20 cursor-pointer",
                  isSelected && "bg-recruiter/10"
                )}
                onClick={() => onRowClick?.(result.id)}
              >
                {/* Checkbox */}
                <TableCell className="text-center px-1 py-1" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(result.id)}
                  />
                </TableCell>

                {/* Index */}
                <TableCell className="text-[10px] py-1 px-1 text-center text-muted-foreground tabular-nums">{idx + 1}</TableCell>

                {/* Name */}
                <TableCell className="py-1 px-2">
                  <span className="text-[10px] font-semibold group-hover:text-recruiter transition-colors block whitespace-nowrap overflow-hidden" title={result.displayName}>
                    {result.displayName}
                  </span>
                </TableCell>

                {/* Email */}
                <TableCell className="hidden xl:table-cell py-1 px-2">
                  <span className="text-[10px] text-muted-foreground truncate block" title={candidate?.email || undefined}>
                    {candidate?.email || '—'}
                  </span>
                </TableCell>

                {/* Phone */}
                <TableCell className="hidden 2xl:table-cell py-1 px-2">
                  <span className="text-[10px] text-muted-foreground truncate block" title={candidate?.phone || undefined}>
                    {candidate?.phone || '—'}
                  </span>
                </TableCell>

                {/* Title */}
                <TableCell className="py-1 px-0">
                  <span className="text-[10px] text-muted-foreground truncate block" title={result.title || undefined}>
                    {result.title || '—'}
                  </span>
                </TableCell>

                {/* Company */}
                <TableCell className="hidden xl:table-cell py-1 px-0">
                  <span className="text-[10px] text-muted-foreground truncate block" title={candidate?.currentCompany || undefined}>
                    {candidate?.currentCompany || '—'}
                  </span>
                </TableCell>

                {/* Experience */}
                <TableCell className="hidden sm:table-cell py-1 px-1">
                  <span className="text-[10px] text-muted-foreground">
                    {candidate?.yearsExperience ? `${candidate.yearsExperience}y` : '—'}
                  </span>
                </TableCell>

                {/* Location */}
                <TableCell className="hidden lg:table-cell py-1 px-2">
                  <span className="text-[10px] text-muted-foreground truncate block" title={result.location || undefined}>
                    {result.location || '—'}
                  </span>
                </TableCell>

                {/* Status */}
                <TableCell className="py-1 px-1">
                  <span className="text-[10px] text-foreground/80 truncate block" title={TALENT_POOL_STAGE_OPTIONS.find(s => s.value === normalizeStatusForDisplay(candidate?.recruiterStatus))?.label || 'New'}>
                    {TALENT_POOL_STAGE_OPTIONS.find(s => s.value === normalizeStatusForDisplay(candidate?.recruiterStatus))?.label || 'New'}
                  </span>
                </TableCell>

                {/* Match Score */}
                <TableCell className="text-center py-1 px-1">
                  {result.matchScore !== undefined && (
                    <ScoreBadge score={result.matchScore} size="sm" showLabel={false} />
                  )}
                </TableCell>

                {/* ATS Score */}
                <TableCell className="hidden xl:table-cell py-1 px-1">
                  {candidate?.atsScore != null ? (
                    <ScoreBadge score={candidate.atsScore} size="sm" showLabel={false} />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Notes */}
                <TableCell className="py-1 px-2" onClick={(e) => e.stopPropagation()}>
                  {isEditingNotes ? (
                    <input
                      type="text"
                      defaultValue={candidate?.recruiterNotes || ''}
                      onBlur={(e) => saveField(result.id, 'recruiter_notes', e.target.value, candidate?.recruiterNotes)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveField(result.id, 'recruiter_notes', e.currentTarget.value, candidate?.recruiterNotes);
                        if (e.key === 'Escape') setEditingCell(null);
                      }}
                      autoFocus
                      disabled={isSaving}
                      placeholder="Add notes..."
                      className="text-[10px] text-foreground bg-background border border-primary/50 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  ) : (
                    <div className="flex items-center gap-0.5 cursor-pointer hover:bg-accent/30 rounded px-1 py-0.5" onClick={() => onUpdateField && setEditingCell({ candidateId: result.id, field: 'notes' })}>
                      <MessageSquare className="h-3 w-3 text-blue-400 shrink-0" />
                      {candidate?.recruiterNotes && candidate.recruiterNotes.trim() !== '' ? (
                        <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0" title={candidate.recruiterNotes}>
                          {candidate.recruiterNotes.length <= 12
                            ? candidate.recruiterNotes
                            : `${candidate.recruiterNotes.slice(0, 12)}…`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50 italic truncate flex-1">Click to add</span>
                      )}
                    </div>
                  )}
                </TableCell>

                {/* Shortlist */}
                <TableCell className="py-1 px-1" onClick={(e) => e.stopPropagation()}>
                  {shortlistsByCandidateId?.[result.id] ? (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate block" title={shortlistsByCandidateId[result.id]}>
                      {shortlistsByCandidateId[result.id]}
                    </span>
                  ) : (
                    onAddToShortlist && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAddToShortlist(result.id)}
                        className="h-5 text-[9px] px-1"
                      >
                        <UserPlus className="h-2.5 w-2.5 mr-0.5" />
                        Add
                      </Button>
                    )
                  )}
                </TableCell>

                {/* Actions Menu */}
                <TableCell className="py-1 px-1" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-white/10">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onRowClick?.(result.id)}>
                        <Users className="h-4 w-4 mr-2" />
                        View Profile
                      </DropdownMenuItem>
                      {onAddToShortlist && (
                        <DropdownMenuItem onClick={() => onAddToShortlist(result.id)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add to Shortlist
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      {onStartEngagement && (
                        <DropdownMenuItem onClick={() => onStartEngagement(result.id)}>
                          <Send className="h-4 w-4 mr-2" />
                          Start Engagement
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
