import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';

interface MobileListHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  filterCount?: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function MobileListHeader({ 
  title, 
  subtitle, 
  filterCount = 0, 
  children,
  action
}: MobileListHeaderProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isMobile = useIsMobile();

  // On desktop, render title/subtitle and filters inline (no collapsible)
  if (!isMobile) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="mt-2 text-lg text-muted-foreground font-sans">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    );
  }

  // Mobile: compact header with collapsible filters
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground truncate">{title}</h1>
          {subtitle && (
            <p className="text-sm font-sans text-muted-foreground truncate mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {action}
        </div>
      </div>
      
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {filterCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                  {filterCount}
                </span>
              )}
            </span>
            {filtersOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
