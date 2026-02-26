import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Database, Globe, Search as SearchIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Unified Talent Search Interface
 *
 * Hierarchical structure:
 * Level 1: Talent Pool vs Web Search
 * Level 2:
 *   - Talent Pool → Free Text vs Search by Job
 *   - Web Search → Basic vs Deep
 *
 * Design principles:
 * - Progressive disclosure
 * - Smooth transitions
 * - Contextual controls
 * - Real estate optimization
 */

type PrimaryMode = 'pool' | 'web';
type PoolMode = 'freeText' | 'byJob';
type WebMode = 'basic' | 'deep';

export default function Search() {
  // Primary mode selection
  const [primaryMode, setPrimaryMode] = useState<PrimaryMode>('pool');

  // Secondary mode selections (contextual)
  const [poolMode, setPoolMode] = useState<PoolMode>('freeText');
  const [webMode, setWebMode] = useState<WebMode>('basic');

  // Reset secondary mode when primary changes
  useEffect(() => {
    if (primaryMode === 'pool') {
      // Optionally reset or keep pool mode
    } else {
      // Optionally reset or keep web mode
    }
  }, [primaryMode]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        {/* Page Header */}
        <div className="shrink-0 px-6 py-4 border-b border-border">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                <SearchIcon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground">
                Talent Search
              </h1>
            </div>
            <p className="text-sm text-muted-foreground font-sans ml-12">
              Search your talent pool or find candidates across the web
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

            {/* Primary Mode Selector - Prominent */}
            <Card className="p-6">
              <div className="space-y-4">
                <Label className="text-sm font-medium text-muted-foreground">
                  Search Source
                </Label>

                <RadioGroup
                  value={primaryMode}
                  onValueChange={(v) => setPrimaryMode(v as PrimaryMode)}
                  className="grid grid-cols-2 gap-4"
                >
                  {/* Talent Pool Option */}
                  <div
                    className={cn(
                      "relative flex items-center space-x-3 rounded-xl border-2 p-4 cursor-pointer transition-all",
                      primaryMode === 'pool'
                        ? "border-recruiter bg-recruiter/5 shadow-sm"
                        : "border-border hover:border-recruiter/50 hover:bg-muted/50"
                    )}
                    onClick={() => setPrimaryMode('pool')}
                  >
                    <RadioGroupItem value="pool" id="mode-pool" className="shrink-0" />
                    <div className="flex items-center gap-3 flex-1">
                      <div className={cn(
                        "p-2 rounded-lg transition-colors",
                        primaryMode === 'pool' ? "bg-recruiter/20 text-recruiter" : "bg-muted text-muted-foreground"
                      )}>
                        <Database className="h-5 w-5" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="mode-pool" className="font-semibold text-foreground cursor-pointer">
                          Talent Pool
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Search uploaded candidates
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Web Search Option */}
                  <div
                    className={cn(
                      "relative flex items-center space-x-3 rounded-xl border-2 p-4 cursor-pointer transition-all",
                      primaryMode === 'web'
                        ? "border-recruiter bg-recruiter/5 shadow-sm"
                        : "border-border hover:border-recruiter/50 hover:bg-muted/50"
                    )}
                    onClick={() => setPrimaryMode('web')}
                  >
                    <RadioGroupItem value="web" id="mode-web" className="shrink-0" />
                    <div className="flex items-center gap-3 flex-1">
                      <div className={cn(
                        "p-2 rounded-lg transition-colors",
                        primaryMode === 'web' ? "bg-recruiter/20 text-recruiter" : "bg-muted text-muted-foreground"
                      )}>
                        <Globe className="h-5 w-5" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="mode-web" className="font-semibold text-foreground cursor-pointer">
                          Web Search
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          LinkedIn, Google X-ray, SERP
                        </p>
                      </div>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {/* Secondary Mode Selector - Contextual, appears with smooth transition */}
              <div className={cn(
                "transition-all duration-300 ease-in-out overflow-hidden",
                "mt-6 pt-6 border-t border-border"
              )}>
                {primaryMode === 'pool' ? (
                  // Talent Pool Sub-modes
                  <div className="space-y-3 animate-in fade-in-50 duration-300">
                    <Label className="text-sm font-medium text-muted-foreground">
                      Search Mode
                    </Label>
                    <RadioGroup
                      value={poolMode}
                      onValueChange={(v) => setPoolMode(v as PoolMode)}
                      className="flex items-center gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="freeText" id="pool-freetext" />
                        <Label htmlFor="pool-freetext" className="font-normal cursor-pointer">
                          Free Text Search
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="byJob" id="pool-byjob" />
                        <Label htmlFor="pool-byjob" className="font-normal cursor-pointer">
                          Search by Job
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                ) : (
                  // Web Search Sub-modes
                  <div className="space-y-3 animate-in fade-in-50 duration-300">
                    <Label className="text-sm font-medium text-muted-foreground">
                      Search Depth
                    </Label>
                    <RadioGroup
                      value={webMode}
                      onValueChange={(v) => setWebMode(v as WebMode)}
                      className="flex items-center gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="basic" id="web-basic" />
                        <Label htmlFor="web-basic" className="font-normal cursor-pointer">
                          Basic Search
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="deep" id="web-deep" />
                        <Label htmlFor="web-deep" className="font-normal cursor-pointer">
                          Deep Search (X-ray)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </div>
            </Card>

            {/* Search Controls - Adapt based on mode */}
            <Card className="p-6">
              <div className="space-y-4">
                <Label className="text-sm font-medium text-muted-foreground">
                  Search Controls
                </Label>
                <div className="text-sm text-muted-foreground">
                  {/* TODO: Render appropriate search controls based on:
                      - primaryMode: pool | web
                      - poolMode: freeText | byJob (if pool)
                      - webMode: basic | deep (if web)
                  */}
                  {primaryMode === 'pool' && poolMode === 'freeText' && (
                    <p>Free Text Search controls will render here</p>
                  )}
                  {primaryMode === 'pool' && poolMode === 'byJob' && (
                    <p>Search by Job controls will render here</p>
                  )}
                  {primaryMode === 'web' && webMode === 'basic' && (
                    <p>Basic Web Search controls will render here</p>
                  )}
                  {primaryMode === 'web' && webMode === 'deep' && (
                    <p>Deep Search (X-ray) controls will render here</p>
                  )}
                </div>
              </div>
            </Card>

            {/* Results Area */}
            <Card className="p-6">
              <div className="space-y-4">
                <Label className="text-sm font-medium text-muted-foreground">
                  Results
                </Label>
                <div className="text-sm text-muted-foreground text-center py-12">
                  Unified results will appear here
                </div>
              </div>
            </Card>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
