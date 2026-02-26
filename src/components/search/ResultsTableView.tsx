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
    if (sortColumn !== column) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
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
            <TableHead className="py-4 font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('name')}>
              <div className="flex items-center gap-1">
                Name
                <SortIcon column="name" />
              </div>
            </TableHead>
            <TableHead className="max-w-[180px] py-4 font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('title')}>
              <div className="flex items-center gap-1">
                Title
                <SortIcon column="title" />
              </div>
            </TableHead>
            <TableHead className="w-24 hidden sm:table-cell py-4 font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('experience')}>
              <div className="flex items-center gap-1">
                Exp
                <SortIcon column="experience" />
              </div>
            </TableHead>
            <TableHead className="max-w-[120px] hidden lg:table-cell py-4 font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('location')}>
              <div className="flex items-center gap-1">
                Location
                <SortIcon column="location" />
              </div>
            </TableHead>
            <TableHead className="hidden xl:table-cell py-4 font-semibold">Skills</TableHead>
            <TableHead className="w-20 text-center py-4 font-semibold cursor-pointer hover:text-recruiter" onClick={() => onSort('match_score')} title="Fit score for this search">
              <div className="flex items-center justify-center gap-1">
                Match
                <SortIcon column="match_score" />
              </div>
            </TableHead>
            <TableHead className="w-[140px] py-4 font-semibold">Shortlist</TableHead>
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
                <TableCell className="text-sm py-4 text-center text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                <TableCell className="py-4">
                  <span className="font-semibold group-hover:text-recruiter transition-colors truncate block max-w-[140px]">
                    {result.displayName}
                  </span>
                </TableCell>
                <TableCell className="py-4 max-w-[180px]">
                  <span className="text-sm text-muted-foreground truncate block" title={result.title || undefined}>
                    {result.title || '—'}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell py-4">
                  <span className="text-sm text-muted-foreground">
                    {candidate?.yearsExperience ? `${candidate.yearsExperience}y` : '—'}
                  </span>
                </TableCell>
                <TableCell className="hidden lg:table-cell py-4 max-w-[120px]">
                  <span className="text-sm text-muted-foreground truncate block" title={result.location || undefined}>
                    {result.location || '—'}
                  </span>
                </TableCell>
                <TableCell className="hidden xl:table-cell py-4">
                  <div className="flex flex-wrap gap-1">
                    {candidate?.skills?.slice(0, 3).map(skill => (
                      <Badge key={skill} variant="secondary" className="text-xs px-1.5 py-0">{skill}</Badge>
                    ))}
                    {candidate && candidate.skills.length > 3 && (
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        +{candidate.skills.length - 3}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center py-4">
                  {result.matchScore !== undefined && (
                    <ScoreBadge score={result.matchScore} size="sm" />
                  )}
                </TableCell>
                <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                  {onAddToShortlist && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onAddToShortlist(result.id)}
                      className="h-8 text-xs"
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1" />
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
