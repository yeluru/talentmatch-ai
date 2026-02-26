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
    <div className="border-b border-recruiter/10 bg-recruiter/5 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
            {resultCount} {resultCount === 1 ? 'match' : 'matches'}
            {selectedCount > 0 && (
              <span className="text-muted-foreground font-normal">· {selectedCount} selected</span>
            )}
          </h2>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-sm text-recruiter font-medium">
              Click row to view profile · Select for bulk actions
              {showThresholdSelector && threshold && ` · Showing ≥ ${threshold}%`}
            </p>
            {showThresholdSelector && threshold && onThresholdChange && (
              <Select value={String(threshold)} onValueChange={(v) => onThresholdChange(Number(v))}>
                <SelectTrigger className="h-7 w-[140px] text-xs border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="75">Show ≥ 75%</SelectItem>
                  <SelectItem value="60">Show ≥ 60%</SelectItem>
                  <SelectItem value="50">Show ≥ 50%</SelectItem>
                  <SelectItem value="25">Show ≥ 25%</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Bulk Actions */}
        <div className="flex gap-2">
          {onToggleFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleFilters}
              disabled={!filterButtonEnabled}
              className="h-9 rounded-lg border-border"
            >
              <Filter className="h-4 w-4 mr-2" />
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
                  className="h-9 rounded-lg border-recruiter/20 bg-recruiter/5 hover:bg-recruiter/10 text-recruiter"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add to Shortlist
                </Button>
              )}
              {onBulkExport && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBulkExport}
                  className="h-9 rounded-lg border-border"
                >
                  <Download className="h-4 w-4 mr-2" />
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
                className="h-9 rounded-lg border-border"
              >
                <Download className="h-4 w-4 mr-2" />
                Export All
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
