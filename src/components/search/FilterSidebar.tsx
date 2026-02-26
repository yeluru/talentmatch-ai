import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Collapsible } from '@/components/ui/collapsible';
import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ManualFilters {
  minExperience: number;
  maxExperience: number;
  locations: string[];
  skills: string[];
}

interface FilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  filters: ManualFilters;
  onFiltersChange: (filters: ManualFilters) => void;
  availableLocations: string[];
  availableSkills: string[];
}

export function FilterSidebar({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  availableLocations,
  availableSkills,
}: FilterSidebarProps) {
  const clearAllFilters = () => {
    onFiltersChange({
      minExperience: 0,
      maxExperience: 20,
      locations: [],
      skills: [],
    });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={onClose} className="flex-shrink-0">
      <div className={cn("flex flex-col gap-4 transition-all", isOpen ? "w-72" : "w-0 overflow-hidden")}>
        {isOpen && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </h3>
              <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Experience Range */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Years of Experience</Label>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <span>{filters.minExperience}</span>
                <span>-</span>
                <span>{filters.maxExperience}+ years</span>
              </div>
              <Slider
                min={0}
                max={20}
                step={1}
                value={[filters.minExperience, filters.maxExperience]}
                onValueChange={([min, max]) => onFiltersChange({ ...filters, minExperience: min, maxExperience: max })}
                className="py-2"
              />
            </div>

            {/* Location Filter */}
            {availableLocations.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Location</Label>
                <div className="space-y-1">
                  {availableLocations.map(loc => (
                    <div key={loc} className="flex items-center gap-2">
                      <Checkbox
                        id={`loc-${loc}`}
                        checked={filters.locations.includes(loc)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            onFiltersChange({ ...filters, locations: [...filters.locations, loc] });
                          } else {
                            onFiltersChange({ ...filters, locations: filters.locations.filter(l => l !== loc) });
                          }
                        }}
                      />
                      <label htmlFor={`loc-${loc}`} className="text-sm cursor-pointer">{loc}</label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills Filter */}
            {availableSkills.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Skills</Label>
                <div className="space-y-1">
                  {availableSkills.slice(0, 20).map(skill => (
                    <div key={skill} className="flex items-center gap-2">
                      <Checkbox
                        id={`skill-${skill}`}
                        checked={filters.skills.includes(skill)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            onFiltersChange({ ...filters, skills: [...filters.skills, skill] });
                          } else {
                            onFiltersChange({ ...filters, skills: filters.skills.filter(s => s !== skill) });
                          }
                        }}
                      />
                      <label htmlFor={`skill-${skill}`} className="text-sm cursor-pointer">{skill}</label>
                    </div>
                  ))}
                  {availableSkills.length > 20 && (
                    <p className="text-xs text-muted-foreground italic">+{availableSkills.length - 20} more skills</p>
                  )}
                </div>
              </div>
            )}

            <Button
              variant="outline"
              onClick={clearAllFilters}
              className="w-full h-9 text-sm"
            >
              Clear All Filters
            </Button>
          </div>
        )}
      </div>
    </Collapsible>
  );
}
