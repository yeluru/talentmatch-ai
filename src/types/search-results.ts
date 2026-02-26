/**
 * Unified Search Results Type System
 *
 * Provides a common interface for displaying search results from different sources:
 * - Internal talent pool (candidate_profiles)
 * - External web search (LinkedIn, etc.)
 */

export type ResultSourceType = 'internal' | 'external';
export type ViewMode = 'table' | 'cards' | 'compact-cards';

/**
 * Unified search result interface that normalizes data from different sources
 */
export interface UnifiedSearchResult {
  id: string; // Unique identifier
  type: ResultSourceType; // Source type
  displayName: string;
  title?: string;
  location?: string;
  matchScore?: number;
  matchReason?: string;

  // Internal candidate specific
  internalData?: {
    candidateId: string;
    email?: string;
    phone?: string;
    yearsExperience?: number;
    skills: string[];
    currentCompany?: string;
    summary?: string;
  };

  // External profile specific
  externalData?: {
    profileUrl?: string;
    linkedInUrl?: string;
    websiteUrl?: string;
    sourceUrl?: string;
    headline?: string;
    summary?: string;
    currentCompany?: string;
    skills?: string[];
  };

  // Original raw data for backwards compatibility
  _raw: any;
}

/**
 * Configuration for results display behavior
 */
export interface ResultsDisplayConfig {
  viewMode: ViewMode;
  enableSelection: boolean;
  enableSorting: boolean;
  enableFiltering: boolean;
  enableBulkActions: boolean;
  defaultThreshold?: number;
  showThresholdSelector?: boolean;
}

/**
 * Adapter: Convert internal pool search results to unified format
 */
export function adaptInternalResult(result: any): UnifiedSearchResult {
  const candidate = result.candidate || {};

  return {
    id: candidate.id || result.candidate_id || `result-${Date.now()}`,
    type: 'internal',
    displayName: candidate.name || candidate.full_name || 'Unknown',
    title: candidate.title || candidate.current_title || undefined,
    location: candidate.location || undefined,
    matchScore: result.match_score || undefined,
    matchReason: result.match_reason || undefined,
    internalData: {
      candidateId: candidate.id || result.candidate_id,
      email: candidate.email || undefined,
      phone: candidate.phone || undefined,
      yearsExperience: candidate.years_experience || candidate.yearsExperience || undefined,
      skills: candidate.skills || [],
      currentCompany: candidate.current_company || candidate.currentCompany || undefined,
      summary: candidate.summary || undefined,
    },
    _raw: result,
  };
}

/**
 * Helper: Extract name from LinkedIn title field
 */
function extractNameFromLinkedInTitle(title?: string): string {
  if (!title) return 'Unknown';

  // LinkedIn titles are like "John Doe - Software Engineer at Company"
  // or "Jane Smith | Senior Developer"
  // Take everything before the first separator
  const separators = [' - ', ' – ', ' — ', ' | ', ' · '];

  for (const sep of separators) {
    if (title.includes(sep)) {
      const name = title.split(sep)[0].trim();
      if (name) return name;
    }
  }

  // If no separator found, return the whole title
  return title.trim();
}

/**
 * Adapter: Convert external web search results to unified format
 */
export function adaptExternalResult(result: any): UnifiedSearchResult {
  const id = result.linkedin_url || result.website || result.source_url || `ext-${Date.now()}`;

  // Detect LinkedIn search results (have title/snippet but no full_name)
  const isLinkedInResult = result.linkedin_url && result.title && !result.full_name && !result.name;

  const displayName = isLinkedInResult
    ? extractNameFromLinkedInTitle(result.title)
    : (result.full_name || result.name || 'Unknown');

  return {
    id,
    type: 'external',
    displayName,
    title: undefined, // Don't show title row for LinkedIn results
    location: result.location || undefined,
    matchScore: result.match_score || undefined,
    matchReason: result.match_reason || undefined,
    externalData: {
      profileUrl: result.source_url || undefined,
      linkedInUrl: result.linkedin_url || undefined,
      websiteUrl: result.website || undefined,
      sourceUrl: result.source_url || undefined,
      headline: result.headline || undefined,
      summary: isLinkedInResult ? result.snippet : (result.summary || result.bio || undefined),
      currentCompany: result.current_company || undefined,
      skills: result.skills || [],
    },
    _raw: result,
  };
}

/**
 * Type guard to check if result is internal
 */
export function isInternalResult(result: UnifiedSearchResult): result is UnifiedSearchResult & { internalData: NonNullable<UnifiedSearchResult['internalData']> } {
  return result.type === 'internal' && !!result.internalData;
}

/**
 * Type guard to check if result is external
 */
export function isExternalResult(result: UnifiedSearchResult): result is UnifiedSearchResult & { externalData: NonNullable<UnifiedSearchResult['externalData']> } {
  return result.type === 'external' && !!result.externalData;
}
