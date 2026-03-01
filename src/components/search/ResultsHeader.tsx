import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, UserPlus, Download, Filter } from 'lucide-react';

interface ResultsHeaderProps {
  resultCount: number;
  selectedCount: number;
  threshold?: number;
  onThresholdChange?: (value: number) => void;
  onBulkAddToShortlist?: () => void;
  onBulkExport?: () => void;
  onToggleFilters?: () => void;
  showThresholdSelector?: boolean;
  filterButtonEnabled?: boolean;
}

export function ResultsHeader({
  resultCount,
  selectedCount,
  threshold,
  onThresholdChange,
  onBulkAddToShortlist,
  onBulkExport,
  onToggleFilters,
  showThresholdSelector = false,
  filterButtonEnabled = true,
}: ResultsHeaderProps) {
  return (
    <div className="border-b border-recruiter/10 bg-recruiter/5 px-4 py-2">
      <div className="flex items-center justify-between gap-4">
        {/* Left side: Count + Threshold inline */}
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold flex items-center gap-1.5 whitespace-nowrap">
            <Users className="h-4 w-4 text-recruiter" strokeWidth={1.5} />
            {resultCount} {resultCount === 1 ? 'match' : 'matches'}
            {selectedCount > 0 && (
              <span className="text-muted-foreground font-normal text-xs">({selectedCount})</span>
            )}
          </h2>
          {showThresholdSelector && threshold && onThresholdChange && (
            <Select value={String(threshold)} onValueChange={(v) => onThresholdChange(Number(v))}>
              <SelectTrigger className="h-6 w-[110px] text-xs border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="75">≥ 75%</SelectItem>
                <SelectItem value="60">≥ 60%</SelectItem>
                <SelectItem value="50">≥ 50%</SelectItem>
                <SelectItem value="25">≥ 25%</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Right side: Actions */}
        <div className="flex gap-1.5">
          {onToggleFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleFilters}
              disabled={!filterButtonEnabled}
              className="h-7 rounded-lg border-border text-xs px-2"
            >
              <Filter className="h-3.5 w-3.5 mr-1" />
              Filters
            </Button>
          )}

          {selectedCount > 0 ? (
            <>
              {onBulkAddToShortlist && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBulkAddToShortlist}
                  className="h-7 rounded-lg border-recruiter/20 bg-recruiter/5 hover:bg-recruiter/10 text-recruiter text-xs px-2"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Shortlist
                </Button>
              )}
              {onBulkExport && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBulkExport}
                  className="h-7 rounded-lg border-border text-xs px-2"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export
                </Button>
              )}
            </>
          ) : (
            resultCount > 0 && onBulkExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBulkExport}
                className="h-7 rounded-lg border-border text-xs px-2"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Export All
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
