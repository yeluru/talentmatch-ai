import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UnifiedSearchResult, isExternalResult } from '@/types/search-results';

interface ResultsCompactCardViewProps {
  results: UnifiedSearchResult[];
  selectedKeys: Set<string>;
  onToggleSelect: (key: string) => void;
  activeResultKey?: string;
  onCardClick?: (id: string, url?: string) => void;
}

export function ResultsCompactCardView({
  results,
  selectedKeys,
  onToggleSelect,
  activeResultKey,
  onCardClick,
}: ResultsCompactCardViewProps) {
  return (
    <div className="space-y-2">
      {results.map((result) => {
        const isSelected = selectedKeys.has(result.id);
        const isActive = activeResultKey === result.id;
        const profile = isExternalResult(result) ? result.externalData : null;
        const primaryUrl = profile?.linkedInUrl || profile?.websiteUrl || profile?.sourceUrl;

        return (
          <div
            key={result.id}
            className={cn(
              "group flex items-center gap-3 rounded-lg border bg-card p-3 transition-all",
              "hover:border-recruiter/30 hover:shadow-sm",
              isActive && "border-recruiter bg-recruiter/5",
              isSelected && "bg-blue-50 dark:bg-blue-950/20"
            )}
          >
            {/* Selection Checkbox */}
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(result.id)}
              />
            </div>

            {/* Profile Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm truncate group-hover:text-recruiter transition-colors">
                    {result.displayName}
                  </h4>

                  {result.title && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {result.title}
                    </p>
                  )}

                  {result.location && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{result.location}</span>
                    </div>
                  )}

                  {profile?.summary && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {profile.summary}
                    </p>
                  )}

                  {profile?.skills && profile.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {profile.skills.slice(0, 3).map(skill => (
                        <Badge key={skill} variant="secondary" className="text-[10px] h-4 px-1">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCardClick?.(result.id, primaryUrl)}
                  className="shrink-0 h-7 text-xs"
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  View
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
