import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Globe } from 'lucide-react';
import TalentSearch from './TalentSearch';
import TalentSourcing from './TalentSourcing';

/**
 * Unified Talent Search Interface
 *
 * Combines internal pool search (TalentSearch) and external web search (TalentSourcing)
 * into a single, elegant interface with URL-based mode switching.
 *
 * Modes:
 * - Internal Pool (?mode=internal): Searches uploaded candidates in talent pool
 * - External Web (?mode=external): Sources candidates from LinkedIn, Google X-ray, SERP
 */
export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'internal';

  // Mode switcher component - renders at top of page
  const ModeSwitcher = () => (
    <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <Tabs
          value={mode}
          onValueChange={(v) => setSearchParams({ mode: v })}
          className="w-full"
        >
          <TabsList className="grid w-full max-w-md grid-cols-2 h-11">
            <TabsTrigger
              value="internal"
              className="flex items-center gap-2 font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Database className="h-4 w-4" />
              Internal Pool
            </TabsTrigger>
            <TabsTrigger
              value="external"
              className="flex items-center gap-2 font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Globe className="h-4 w-4" />
              External Web
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );

  return (
    <>
      <ModeSwitcher />
      <div className="relative">
        {mode === 'internal' ? (
          // Internal Pool Search
          // Features: Free Text search, Search by Job (async), AI matching, threshold filtering
          <TalentSearch />
        ) : (
          // External Web Search
          // Features: LinkedIn search, Google X-ray, SERP APIs, profile enrichment
          <TalentSourcing />
        )}
      </div>
    </>
  );
}
