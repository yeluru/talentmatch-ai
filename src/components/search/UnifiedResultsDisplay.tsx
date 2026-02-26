import { useState, useMemo } from 'react';
import { UnifiedSearchResult, ResultsDisplayConfig } from '@/types/search-results';
import { ResultsHeader } from './ResultsHeader';
import { FilterSidebar, ManualFilters } from './FilterSidebar';
import { ResultsTableView } from './ResultsTableView';
import { ResultsCardView } from './ResultsCardView';
import { ResultsCompactCardView } from './ResultsCompactCardView';

type SortColumn = 'name' | 'title' | 'experience' | 'location' | 'match_score';
type SortDirection = 'asc' | 'desc';

interface UnifiedResultsDisplayProps {
  results: UnifiedSearchResult[];
  config: ResultsDisplayConfig;
  onAddToShortlist?: (ids: string[]) => void;
  onExport?: (ids: string[]) => void;
  onRowClick?: (id: string, result: UnifiedSearchResult) => void;
  availableFilters?: {
    locations: string[];
    skills: string[];
  };
}

export function UnifiedResultsDisplay({
  results,
  config,
  onAddToShortlist,
  onExport,
  onRowClick,
  availableFilters,
}: UnifiedResultsDisplayProps) {
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>('match_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Filtering state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [manualFilters, setManualFilters] = useState<ManualFilters>({
    minExperience: 0,
    maxExperience: 20,
    locations: [],
    skills: [],
  });

  // Threshold state
  const [threshold, setThreshold] = useState(config.defaultThreshold || 75);

  // Apply filters
  const filteredResults = useMemo(() => {
    let filtered = [...results];

    // Threshold filter
    if (config.showThresholdSelector && threshold) {
      filtered = filtered.filter(r => (r.matchScore || 0) >= threshold);
    }

    // Experience filter
    if (config.enableFiltering) {
      filtered = filtered.filter(r => {
        const exp = r.internalData?.yearsExperience ?? 0;
        return exp >= manualFilters.minExperience && exp <= manualFilters.maxExperience;
      });

      // Location filter
      if (manualFilters.locations.length > 0) {
        filtered = filtered.filter(r =>
          r.location && manualFilters.locations.includes(r.location)
        );
      }

      // Skills filter
      if (manualFilters.skills.length > 0) {
        filtered = filtered.filter(r =>
          r.internalData?.skills?.some(s => manualFilters.skills.includes(s))
        );
      }
    }

    return filtered;
  }, [results, threshold, manualFilters, config.showThresholdSelector, config.enableFiltering]);

  // Apply sorting
  const sortedResults = useMemo(() => {
    if (!config.enableSorting) return filteredResults;

    const sorted = [...filteredResults];
    sorted.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case 'name':
          aVal = a.displayName || '';
          bVal = b.displayName || '';
          break;
        case 'title':
          aVal = a.title || '';
          bVal = b.title || '';
          break;
        case 'experience':
          aVal = a.internalData?.yearsExperience || 0;
          bVal = b.internalData?.yearsExperience || 0;
          break;
        case 'location':
          aVal = a.location || '';
          bVal = b.location || '';
          break;
        case 'match_score':
          aVal = a.matchScore || 0;
          bVal = b.matchScore || 0;
          break;
      }

      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return sorted;
  }, [filteredResults, sortColumn, sortDirection, config.enableSorting]);

  // Handlers
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedResults.length && sortedResults.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedResults.map(r => r.id)));
    }
  };

  const handleBulkAddToShortlist = () => {
    if (onAddToShortlist && selectedIds.size > 0) {
      onAddToShortlist(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleBulkExport = () => {
    if (onExport) {
      if (selectedIds.size > 0) {
        onExport(Array.from(selectedIds));
      } else {
        onExport(sortedResults.map(r => r.id));
      }
    }
  };

  const handleRowClick = (id: string) => {
    const result = sortedResults.find(r => r.id === id);
    if (result && onRowClick) {
      onRowClick(id, result);
    }
  };

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <ResultsHeader
        resultCount={sortedResults.length}
        selectedCount={selectedIds.size}
        threshold={config.showThresholdSelector ? threshold : undefined}
        onThresholdChange={config.showThresholdSelector ? setThreshold : undefined}
        onBulkAddToShortlist={config.enableBulkActions && onAddToShortlist ? handleBulkAddToShortlist : undefined}
        onBulkExport={config.enableBulkActions && onExport ? handleBulkExport : undefined}
        onToggleFilters={config.enableFiltering ? () => setFiltersOpen(!filtersOpen) : undefined}
        showThresholdSelector={config.showThresholdSelector}
        filterButtonEnabled={results.length > 0}
      />

      {/* Results with optional filter sidebar */}
      <div className="flex gap-4 min-h-0 p-6">
        {/* Filter Sidebar */}
        {config.enableFiltering && availableFilters && (
          <FilterSidebar
            isOpen={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            filters={manualFilters}
            onFiltersChange={setManualFilters}
            availableLocations={availableFilters.locations}
            availableSkills={availableFilters.skills}
          />
        )}

        {/* Main Results Area */}
        <div className="flex-1 min-h-0">
          {config.viewMode === 'table' && (
            <ResultsTableView
              results={sortedResults}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              onRowClick={onRowClick ? handleRowClick : undefined}
              onAddToShortlist={onAddToShortlist ? (id) => onAddToShortlist([id]) : undefined}
            />
          )}

          {config.viewMode === 'cards' && (
            <ResultsCardView
              results={sortedResults}
              onCardClick={onRowClick ? handleRowClick : undefined}
            />
          )}

          {config.viewMode === 'compact-cards' && (
            <ResultsCompactCardView
              results={sortedResults}
              selectedKeys={selectedIds}
              onToggleSelect={toggleSelect}
              onCardClick={(id, url) => {
                if (url) {
                  window.open(url, '_blank');
                } else {
                  handleRowClick(id);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
