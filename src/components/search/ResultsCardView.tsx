import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScoreBadge } from '@/components/ui/score-badge';
import { MapPin, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UnifiedSearchResult, isInternalResult } from '@/types/search-results';

interface ResultsCardViewProps {
  results: UnifiedSearchResult[];
  limit?: number;
  onLoadMore?: () => void;
  onCardClick?: (id: string) => void;
}

export function ResultsCardView({
  results,
  limit,
  onLoadMore,
  onCardClick,
}: ResultsCardViewProps) {
  const displayedResults = limit ? results.slice(0, limit) : results;
  const hasMore = limit && results.length > limit;

  return (
    <div className="space-y-3">
      {displayedResults.map((result) => {
        const candidate = isInternalResult(result) ? result.internalData : null;

        return (
          <div
            key={result.id}
            onClick={() => onCardClick?.(result.id)}
            className={cn(
              "group rounded-lg border border-border bg-card p-4 transition-all cursor-pointer",
              "hover:border-recruiter/30 hover:shadow-sm hover:bg-recruiter/5"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-foreground group-hover:text-recruiter transition-colors truncate">
                    {result.displayName}
                  </h4>
                  {result.matchScore !== undefined && (
                    <ScoreBadge score={result.matchScore} size="sm" />
                  )}
                </div>

                {result.title && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                    <Briefcase className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{result.title}</span>
                  </div>
                )}

                {result.location && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{result.location}</span>
                  </div>
                )}

                {candidate?.skills && candidate.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {candidate.skills.slice(0, 5).map(skill => (
                      <Badge key={skill} variant="secondary" className="text-xs">
                        {skill}
                      </Badge>
                    ))}
                    {candidate.skills.length > 5 && (
                      <Badge variant="secondary" className="text-xs">
                        +{candidate.skills.length - 5}
                      </Badge>
                    )}
                  </div>
                )}

                {result.matchReason && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {result.matchReason}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {hasMore && onLoadMore && (
        <Button
          variant="outline"
          onClick={onLoadMore}
          className="w-full"
        >
          Load More ({results.length - displayedResults.length} remaining)
        </Button>
      )}
    </div>
  );
}
