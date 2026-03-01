import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScoreBadge } from '@/components/ui/score-badge';
import { ArrowUpDown, ArrowUp, ArrowDown, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UnifiedSearchResult, isInternalResult } from '@/types/search-results';

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
            <TableHead className="w-12 text-center text-muted-foreground font-medium">#</TableHead>
            <TableHead className="font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('name')}>
              <div className="flex items-center gap-1">
                Name
                <SortIcon column="name" />
              </div>
            </TableHead>
            <TableHead className="max-w-[180px] font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('title')}>
              <div className="flex items-center gap-1">
                Title
                <SortIcon column="title" />
              </div>
            </TableHead>
            <TableHead className="w-24 hidden sm:table-cell font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('experience')}>
              <div className="flex items-center gap-1">
                Exp
                <SortIcon column="experience" />
              </div>
            </TableHead>
            <TableHead className="max-w-[120px] hidden lg:table-cell font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('location')}>
              <div className="flex items-center gap-1">
                Location
                <SortIcon column="location" />
              </div>
            </TableHead>
            <TableHead className="w-20 text-center font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('match_score')} title="Fit score for this search">
              <div className="flex items-center justify-center gap-1">
                Match
                <SortIcon column="match_score" />
              </div>
            </TableHead>
            <TableHead className="w-[140px] font-semibold">Shortlist</TableHead>
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
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(result.id)}
                  />
                </TableCell>
                <TableCell className="text-xs text-center text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                <TableCell>
                  <span className="text-sm font-semibold group-hover:text-recruiter transition-colors truncate block max-w-[160px]">
                    {result.displayName}
                  </span>
                </TableCell>
                <TableCell className="max-w-[180px]">
                  <span className="text-xs text-muted-foreground truncate block" title={result.title || undefined}>
                    {result.title || '—'}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="text-xs text-muted-foreground">
                    {candidate?.yearsExperience ? `${candidate.yearsExperience}y` : '—'}
                  </span>
                </TableCell>
                <TableCell className="hidden lg:table-cell max-w-[120px]">
                  <span className="text-xs text-muted-foreground truncate block" title={result.location || undefined}>
                    {result.location || '—'}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {result.matchScore !== undefined && (
                    <ScoreBadge score={result.matchScore} size="sm" />
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {onAddToShortlist && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAddToShortlist(result.id)}
                      className="h-6 text-xs px-2"
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
