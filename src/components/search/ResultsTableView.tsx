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
}: ResultsTableViewProps) {
  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="w-12 text-center">
              <Checkbox
                checked={selectedIds.size === results.length && results.length > 0}
                onCheckedChange={onToggleSelectAll}
              />
            </TableHead>
            <TableHead className="w-12 text-center text-[11px] text-muted-foreground font-medium">#</TableHead>
            <TableHead className="w-[100px] py-2 text-[11px] font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('name')}>
              <div className="flex items-center gap-1">
                Name
                <SortIcon column="name" />
              </div>
            </TableHead>
            <TableHead className="w-[100px] hidden xl:table-cell py-2 text-[11px] font-semibold">Email</TableHead>
            <TableHead className="w-[85px] hidden 2xl:table-cell py-2 text-[11px] font-semibold">Phone</TableHead>
            <TableHead className="w-[110px] py-2 text-[11px] font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('title')}>
              <div className="flex items-center gap-1">
                Title
                <SortIcon column="title" />
              </div>
            </TableHead>
            <TableHead className="w-[90px] hidden xl:table-cell py-2 text-[11px] font-semibold">Company</TableHead>
            <TableHead className="w-12 hidden sm:table-cell py-2 text-[11px] font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('experience')}>
              <div className="flex items-center gap-1">
                Exp
                <SortIcon column="experience" />
              </div>
            </TableHead>
            <TableHead className="w-[85px] hidden lg:table-cell py-2 text-[11px] font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('location')}>
              <div className="flex items-center gap-1">
                Location
                <SortIcon column="location" />
              </div>
            </TableHead>
            <TableHead className="w-[60px] py-2 text-[11px] font-semibold">Status</TableHead>
            <TableHead className="w-14 py-2 text-[11px] font-semibold cursor-pointer hover:text-recruiter text-center" onClick={() => onSort('match_score')} title="Fit score for this search">
              <div className="flex items-center justify-center gap-1">
                Match
                <SortIcon column="match_score" />
              </div>
            </TableHead>
            <TableHead className="w-12 hidden xl:table-cell py-2 text-[11px] font-semibold" title="Resume quality">ATS</TableHead>
            <TableHead className="w-[100px] py-2 text-[11px] font-semibold">Notes</TableHead>
            <TableHead className="w-[80px] py-2 text-[11px] font-semibold">Shortlist</TableHead>
            <TableHead className="w-10 py-2"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result, idx) => {
            const isSelected = selectedIds.has(result.id);
            const candidate = isInternalResult(result) ? result.internalData : null;

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
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(result.id)}
                  />
                </TableCell>

                {/* Index */}
                <TableCell className="text-[11px] py-2 text-center text-muted-foreground tabular-nums">{idx + 1}</TableCell>

                {/* Name */}
                <TableCell className="py-2">
                  <span className="text-[11px] font-semibold group-hover:text-recruiter transition-colors truncate block" title={result.displayName}>
                    {result.displayName}
                  </span>
                </TableCell>

                {/* Email */}
                <TableCell className="hidden xl:table-cell py-2">
                  <span className="text-[11px] text-muted-foreground truncate block" title={candidate?.email || undefined}>
                    {candidate?.email || '—'}
                  </span>
                </TableCell>

                {/* Phone */}
                <TableCell className="hidden 2xl:table-cell py-2">
                  <span className="text-[11px] text-muted-foreground truncate block" title={candidate?.phone || undefined}>
                    {candidate?.phone || '—'}
                  </span>
                </TableCell>

                {/* Title */}
                <TableCell className="py-2">
                  <span className="text-[11px] text-muted-foreground truncate block" title={result.title || undefined}>
                    {result.title || '—'}
                  </span>
                </TableCell>

                {/* Company */}
                <TableCell className="hidden xl:table-cell py-2">
                  <span className="text-[11px] text-muted-foreground truncate block" title={candidate?.currentCompany || undefined}>
                    {candidate?.currentCompany || '—'}
                  </span>
                </TableCell>

                {/* Experience */}
                <TableCell className="hidden sm:table-cell py-2">
                  <span className="text-[11px] text-muted-foreground">
                    {candidate?.yearsExperience ? `${candidate.yearsExperience}y` : '—'}
                  </span>
                </TableCell>

                {/* Location */}
                <TableCell className="hidden lg:table-cell py-2">
                  <span className="text-[11px] text-muted-foreground truncate block" title={result.location || undefined}>
                    {result.location || '—'}
                  </span>
                </TableCell>

                {/* Status */}
                <TableCell className="py-2">
                  <span className="text-[11px] text-foreground/80 truncate block" title={TALENT_POOL_STAGE_OPTIONS.find(s => s.value === normalizeStatusForDisplay(candidate?.recruiterStatus))?.label || 'New'}>
                    {TALENT_POOL_STAGE_OPTIONS.find(s => s.value === normalizeStatusForDisplay(candidate?.recruiterStatus))?.label || 'New'}
                  </span>
                </TableCell>

                {/* Match Score */}
                <TableCell className="text-center py-2">
                  {result.matchScore !== undefined && (
                    <ScoreBadge score={result.matchScore} size="sm" showLabel={false} />
                  )}
                </TableCell>

                {/* ATS Score */}
                <TableCell className="hidden xl:table-cell py-2">
                  {candidate?.atsScore != null ? (
                    <ScoreBadge score={candidate.atsScore} size="sm" showLabel={false} />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  )}
                </TableCell>

                {/* Notes */}
                <TableCell className="py-2">
                  <div className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3 text-blue-400 shrink-0" />
                    {candidate?.recruiterNotes && candidate.recruiterNotes.trim() !== '' ? (
                      <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0" title={candidate.recruiterNotes}>
                        {candidate.recruiterNotes.length <= 18
                          ? candidate.recruiterNotes
                          : `${candidate.recruiterNotes.slice(0, 18)}…`}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/50 italic truncate flex-1">—</span>
                    )}
                  </div>
                </TableCell>

                {/* Shortlist */}
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  {onAddToShortlist && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAddToShortlist(result.id)}
                      className="h-7 text-[11px] px-2"
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  )}
                </TableCell>

                {/* Actions Menu */}
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-white/10">
                        <MoreHorizontal className="h-3.5 w-3.5" />
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
                      <DropdownMenuItem>
                        <Send className="h-4 w-4 mr-2" />
                        Start Engagement
                      </DropdownMenuItem>
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
