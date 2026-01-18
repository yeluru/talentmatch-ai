import { useState, useCallback, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBulkUploadStore, type UploadResult } from '@/stores/bulkUploadStore';
import {
  Upload,
  Search,
  Globe,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Linkedin,
  Sparkles,
  Plus,
  MapPin,
  Briefcase
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface SearchedProfile {
  full_name: string;
  headline?: string;
  current_company?: string;
  location?: string;
  skills?: string[];
  experience_years?: number;
  summary?: string;
  linkedin_url?: string;
  github_url?: string;
  website?: string;
  source_url?: string;
  email?: string;
  source: string;
}

type GoogleLeadResult = {
  linkedin_url: string;
  source_url?: string;
  title?: string;
  snippet?: string;
  match_score?: number;
  matched_terms?: string[];
  raw_result?: any;
};

export default function TalentSourcing() {
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;
  const [activeTab, setActiveTab] = useState<'resumes' | 'search' | 'api'>('resumes');

  // Web search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedProfile[]>([]);
  const [leadResults, setLeadResults] = useState<GoogleLeadResult[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<number>>(new Set());
  const [searchMode, setSearchMode] = useState<'web' | 'linkedin' | 'google'>('web');
  const [activeResultIndex, setActiveResultIndex] = useState<number>(0);
  const [lastSearch, setLastSearch] = useState<{
    mode: 'web' | 'linkedin' | 'google';
    query: string;
    found: number;
    totalFound?: number;
    debug?: any;
    ts: number;
  } | null>(null);

  const searchStorageKey = organizationId ? `talent_sourcing_search_v1:${organizationId}` : null;

  // Restore search state when returning to this page
  // (So recruiters don't lose results when navigating away.)
  useEffect(() => {
    if (!searchStorageKey) return;
    try {
      const raw = localStorage.getItem(searchStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.query && typeof parsed.query === 'string') setSearchQuery(parsed.query);
      if (parsed?.mode === 'web' || parsed?.mode === 'linkedin' || parsed?.mode === 'google') setSearchMode(parsed.mode);
      if (Array.isArray(parsed?.searchResults)) setSearchResults(parsed.searchResults);
      if (Array.isArray(parsed?.leadResults)) setLeadResults(parsed.leadResults);
      if (parsed?.lastSearch && typeof parsed.lastSearch === 'object') setLastSearch(parsed.lastSearch);
      if (Array.isArray(parsed?.selected)) setSelectedProfiles(new Set(parsed.selected.filter((n: any) => Number.isInteger(n))));
      if (Number.isInteger(parsed?.activeIndex)) setActiveResultIndex(Math.max(0, parsed.activeIndex));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchStorageKey]);

  // Persist search state
  useEffect(() => {
    if (!searchStorageKey) return;
    try {
      const safeSearchResults = searchResults.slice(0, 20);
      const safeLeadResults = leadResults.slice(0, 50);
      const payload = {
        mode: searchMode,
        query: searchQuery,
        // Keep it small
        searchResults: safeSearchResults,
        leadResults: safeLeadResults,
        selected: Array.from(selectedProfiles).slice(0, 200),
        activeIndex: activeResultIndex,
        lastSearch,
        ts: Date.now(),
      };
      localStorage.setItem(searchStorageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [searchStorageKey, searchMode, searchQuery, searchResults, leadResults, selectedProfiles, activeResultIndex, lastSearch]);

  // Resume upload state - persisted via zustand
  const { uploadResults, setUploadResults, clearResults, updateResult } = useBulkUploadStore();

  // Web search mutation (public web)
  const webSearch = useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('web-search', {
        body: { query, limit: 20, country: 'us', strictCountry: true, includeLinkedIn: false }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setLastSearch({
        mode: 'web',
        query: searchQuery,
        found: data?.profiles?.length || 0,
        totalFound: data?.total_found,
        debug: data?.debug,
        ts: Date.now(),
      });
      if (data.profiles && data.profiles.length > 0) {
        setSearchResults(data.profiles);
        setLeadResults([]);
        setActiveResultIndex(0);
        setSelectedProfiles(new Set());
        toast.success(`Found ${data.profiles.length} profiles`);
      } else {
        setSearchResults([]);
        setLeadResults([]);
        setSelectedProfiles(new Set());
        toast.info('No profiles found. Try different search terms.');
      }
    },
    onError: (error: any) => {
      console.error('Search error:', error);
      toast.error(error.message || 'Search failed');
    }
  });

  // LinkedIn search mutation (provider-based; may be restricted)
  const linkedinSearch = useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('linkedin-search', {
        body: { query, limit: 20 }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setLastSearch({
        mode: 'linkedin',
        query: searchQuery,
        found: data?.profiles?.length || 0,
        totalFound: data?.total_found,
        ts: Date.now(),
      });
      if (data.profiles && data.profiles.length > 0) {
        setSearchResults(data.profiles);
        setLeadResults([]);
        setActiveResultIndex(0);
        setSelectedProfiles(new Set());
        toast.success(`Found ${data.profiles.length} profiles`);
      } else {
        setSearchResults([]);
        setLeadResults([]);
        setSelectedProfiles(new Set());
        toast.info('No profiles found. Try different search terms.');
      }
    },
    onError: (error: any) => {
      console.error('Search error:', error);
      toast.error(error.message || 'Search failed');
    }
  });

  const googleSearch = useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('google-search-linkedin', {
        body: { query, limit: 20, country: 'us' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const results = Array.isArray(data?.results) ? (data.results as GoogleLeadResult[]) : [];
      setLastSearch({
        mode: 'google',
        query: searchQuery,
        found: results.length,
        totalFound: data?.total_found,
        ts: Date.now(),
      });
      setLeadResults(results);
      setSearchResults([]);
      setActiveResultIndex(0);
      setSelectedProfiles(new Set());
      if (results.length > 0) toast.success(`Found ${results.length} LinkedIn profiles`);
      else toast.info('No profiles found. Try different search terms.');
    },
    onError: (error: any) => {
      console.error('Search error:', error);
      toast.error(error.message || 'Search failed');
    }
  });

  const saveLeads = useMutation({
    mutationFn: async (leads: GoogleLeadResult[]) => {
      if (!organizationId) throw new Error('Missing organization');
      if (!user?.id) throw new Error('Missing user');
      const rows = leads.map((l) => ({
        organization_id: organizationId,
        created_by: user.id,
        source: 'google_xray',
        search_query: searchQuery,
        linkedin_url: l.linkedin_url,
        source_url: l.source_url || l.linkedin_url,
        title: l.title || null,
        snippet: l.snippet || null,
        match_score: typeof l.match_score === 'number' ? Math.round(l.match_score) : null,
        matched_terms: Array.isArray(l.matched_terms) ? l.matched_terms : [],
        status: 'new',
        raw_result: l.raw_result || {},
      }));

      const { data, error } = await (supabase as any)
        .from('sourced_leads')
        .upsert(rows, { onConflict: 'organization_id,linkedin_url' })
        .select('id');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Saved ${data?.length || 0} leads`);
      setSelectedProfiles(new Set());
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save leads');
    }
  });

  // Import profiles mutation
  const importProfiles = useMutation({
    mutationFn: async (profiles: SearchedProfile[]) => {
      const { data, error } = await supabase.functions.invoke('bulk-import-candidates', {
        body: { profiles, organizationId, source: 'web_search' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
      toast.success(`Imported ${data.results.imported} candidates`);
      if (data.results.skipped > 0) {
        toast.info(`${data.results.skipped} duplicates skipped`);
      }
      setSelectedProfiles(new Set());
      // Keep results + last search so recruiters can continue browsing without losing context.
    },
    onError: (error: any) => {
      toast.error(error.message || 'Import failed');
    }
  });

  // Handle file upload - parse, store file, and auto-import
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newResults: UploadResult[] = files.map(f => ({
      fileName: f.name,
      status: 'pending'
    }));
    
    // Append to existing results instead of replacing
    setUploadResults(prev => [...prev, ...newResults]);
    const startIndex = uploadResults.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const resultIndex = startIndex + i;
      
      // Update to parsing
      updateResult(resultIndex, { status: 'parsing' });

      try {
        // Read file as base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Compute SHA-256 hash of the raw file content for duplicate detection
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Check if this exact file already exists BEFORE parsing
        const { data: existingResume } = await supabase
          .from('resumes')
          .select('id, file_name')
          .eq('content_hash', fileHash)
          .maybeSingle();

        if (existingResume) {
          console.log('Duplicate resume detected:', file.name);
          // Instead of erroring, re-link the existing candidate to this org so it becomes visible again.
          try {
            const { data: relinkData, error: relinkErr } = await supabase.functions.invoke('resolve-duplicate-resume', {
              body: { organizationId, contentHash: fileHash, source: 'resume_upload' }
            });
            if (relinkErr) throw relinkErr;
            const score = (relinkData as any)?.resume?.ats_score;
            updateResult(resultIndex, {
              status: 'done',
              atsScore: typeof score === 'number' ? score : undefined,
              parsed: undefined,
              note: 'Duplicate detected: existing profile re-linked to Talent Pool',
              error: undefined,
            });
          } catch (e: any) {
            updateResult(resultIndex, {
              status: 'error',
              error: `Duplicate rejected: This exact resume already exists in the system`,
            });
          }
          continue; // Skip to next file
        }

        // Parse resume
        const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-resume', {
          body: {
            fileBase64: base64,
            fileName: file.name,
            // Some browsers may provide empty/unknown MIME types (esp. DOCX). Let the edge function infer via extension.
            fileType: file.type || 'application/octet-stream'
          }
        });

        if (parseError) throw parseError;

        const parsed = parseData.parsed;
        
        // Store the file hash for later use
        parsed._fileHash = fileHash;
        
        // Update to importing
        updateResult(resultIndex, { status: 'importing', parsed, atsScore: parsed.ats_score });

        // Upload file to storage
        const fileExt = file.name.split('.').pop();
        const uniqueFileName = `sourced/${organizationId}/${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(uniqueFileName, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          throw new Error(`Failed to upload file: ${uploadError.message}`);
        }

        // Auto-import the candidate with resume file info
        const { data: importData, error: importError } = await supabase.functions.invoke('bulk-import-candidates', {
          body: { 
            profiles: [{
              ...parsed,
              source: 'resume_upload',
              ats_score: parsed.ats_score,
              resume_file: {
                file_name: file.name,
                file_url: `resumes/${uniqueFileName}`,
                file_type: file.type || 'application/octet-stream',
                content_hash: parsed._fileHash // Pass the pre-computed file hash
              }
            }], 
            organizationId, 
            source: 'resume_upload' 
          }
        });

        if (importError) throw importError;
        
        // If the backend reported duplicates, treat as a non-fatal outcome (we re-link existing profiles).
        const relinked = Number((importData as any)?.results?.relinked ?? 0);
        const hasDuplicateError = (importData as any)?.results?.errors?.some((e: string) =>
          String(e || '').toUpperCase().includes('DUPLICATE')
        );

        if (relinked > 0) {
          updateResult(resultIndex, {
            status: 'done',
            parsed,
            atsScore: parsed.ats_score,
            note: 'Duplicate detected: existing profile re-linked to Talent Pool',
            error: undefined,
          });
        } else if (hasDuplicateError) {
          updateResult(resultIndex, {
            status: 'error',
            error: 'Duplicate resume: identical content already exists in the system',
            parsed,
            atsScore: parsed.ats_score,
          });
        } else {
          updateResult(resultIndex, { status: 'done', parsed, atsScore: parsed.ats_score, error: undefined });
        }

      } catch (error: any) {
        console.error('Upload error for', file.name, error);
        updateResult(resultIndex, { status: 'error', error: error.message });
      }
    }

    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    queryClient.invalidateQueries({ queryKey: ['talent-pool'] });
    
    // Reset input
    e.target.value = '';
  }, [organizationId, queryClient, uploadResults.length, setUploadResults, updateResult]);

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    if (searchMode === 'web') webSearch.mutate(searchQuery);
    else if (searchMode === 'linkedin') linkedinSearch.mutate(searchQuery);
    else googleSearch.mutate(searchQuery);
  };

  const toggleProfileSelection = (index: number) => {
    setSelectedProfiles(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllProfiles = () => {
    const total = searchMode === 'google' ? leadResults.length : searchResults.length;
    if (selectedProfiles.size === total) {
      setSelectedProfiles(new Set());
    } else {
      const next = new Set<number>();
      for (let i = 0; i < total; i++) next.add(i);
      setSelectedProfiles(next);
    }
  };

  const handleImportSelected = () => {
    if (searchMode === 'google') {
      const leads = Array.from(selectedProfiles).map(i => leadResults[i]).filter(Boolean);
      saveLeads.mutate(leads);
      return;
    }
    const profiles = Array.from(selectedProfiles).map(i => searchResults[i]);
    importProfiles.mutate(profiles);
  };

  const completedCount = uploadResults.filter(p => p.status === 'done').length;
  const errorCount = uploadResults.filter(p => p.status === 'error').length;
  const processingCount = uploadResults.filter(p => ['pending', 'parsing', 'importing'].includes(p.status)).length;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Talent Sourcing</h1>
          <p className="text-muted-foreground mt-1">
            Upload resumes or search the web to add candidates
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 items-start lg:items-stretch">
          {/* Left: inputs/workflows */}
          <Card className="min-w-0 lg:h-[calc(100vh-240px)] flex flex-col">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-0">
              <CardHeader className="space-y-3">
                <CardTitle>Source candidates</CardTitle>
                <CardDescription>Upload resumes or search the web to add candidates to your pool.</CardDescription>

                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="resumes" className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Resumes
                    {uploadResults.length > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {uploadResults.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="search" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Web Search
                  </TabsTrigger>
                  <TabsTrigger value="api" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    API
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="pt-0 flex-1 min-h-0 overflow-auto">

          {/* Bulk Resume Upload Tab */}
          <TabsContent value="resumes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Bulk Resume Upload
                </CardTitle>
                <CardDescription>
                  Upload resumes to automatically parse, score, and import candidates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Upload Area */}
                <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    id="resume-upload"
                    multiple
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <label htmlFor="resume-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-1">Drop resumes here or click to upload</p>
                    <p className="text-sm text-muted-foreground">
                      PDF, DOC, DOCX, TXT • Auto-imports with a generic resume-quality score (not JD-based)
                    </p>
                  </label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Web Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Web Search
                </CardTitle>
                <CardDescription>
                  Search public profiles using natural language (US). Preview results, then import into Talent Pool.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant={searchMode === 'web' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSearchMode('web')}
                    className="justify-start"
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Web
                  </Button>
                  <Button
                    type="button"
                    variant={searchMode === 'google' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSearchMode('google')}
                    className="justify-start"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Google X‑Ray (Leads)
                  </Button>
                  <Button
                    type="button"
                    variant={searchMode === 'linkedin' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSearchMode('linkedin')}
                    className="justify-start"
                  >
                    <Linkedin className="h-4 w-4 mr-2" />
                    LinkedIn (provider)
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Web = public pages. Google X‑Ray = LinkedIn URLs as leads. LinkedIn requires an approved provider/API.
                </div>

                <div className="flex gap-3">
                  <Input
                    placeholder="e.g., Python developer 5+ years AWS"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={webSearch.isPending || linkedinSearch.isPending || googleSearch.isPending}
                  >
                    {(searchMode === 'web'
                      ? webSearch.isPending
                      : searchMode === 'linkedin'
                        ? linkedinSearch.isPending
                        : googleSearch.isPending) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Search
                  </Button>
                </div>

                {(searchMode === 'google' ? leadResults.length > 0 : searchResults.length > 0) && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedProfiles.size === (searchMode === 'google' ? leadResults.length : searchResults.length)}
                          onCheckedChange={selectAllProfiles}
                        />
                        <span className="text-sm font-medium">
                          {(searchMode === 'google' ? leadResults.length : searchResults.length)} {searchMode === 'google' ? 'leads found' : 'profiles found'}
                          {searchMode === 'google' && typeof lastSearch?.totalFound === 'number' && (
                            <span className="text-muted-foreground"> (of ~{lastSearch.totalFound})</span>
                          )}
                        </span>
                      </div>
                      <Button
                        onClick={handleImportSelected}
                        disabled={
                          selectedProfiles.size === 0 ||
                          importProfiles.isPending ||
                          saveLeads.isPending
                        }
                        size="sm"
                      >
                        {(searchMode === 'google' ? saveLeads.isPending : importProfiles.isPending) ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        {searchMode === 'google' ? 'Save leads' : 'Import'} {selectedProfiles.size || ''}
                      </Button>
                    </div>

                    {/* Results pane */}
                    <div className="rounded-xl border bg-muted/20 overflow-hidden">
                      <div className="grid lg:grid-cols-[1fr_360px]">
                        {/* List */}
                        <div className="max-h-[420px] overflow-y-auto p-2">
                          <div className="space-y-2">
                            {(searchMode === 'google' ? leadResults : searchResults).map((row: any, i: number) => {
                              const isActive = i === activeResultIndex;
                              const isSelected = selectedProfiles.has(i);
                              const title =
                                searchMode === 'google'
                                  ? (row?.title ? String(row.title).replace(/\s*\|\s*LinkedIn\s*$/i, '') : 'LinkedIn Profile')
                                  : (row?.full_name || 'Unknown');
                              const subtitle =
                                searchMode === 'google'
                                  ? (row?.snippet ? String(row.snippet) : '')
                                  : (row?.headline ? String(row.headline) : '');
                              const url =
                                searchMode === 'google'
                                  ? row?.linkedin_url
                                  : (row?.linkedin_url || row?.website || row?.source_url);

                              return (
                                <div
                                  key={row?.linkedin_url || row?.source_url || i}
                                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                    isActive ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                                  }`}
                                  onClick={() => setActiveResultIndex(i)}
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleProfileSelection(i)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{title}</div>
                                    {subtitle && (
                                      <div className="text-sm text-muted-foreground line-clamp-2">
                                        {subtitle}
                                      </div>
                                    )}
                                    {url && (
                                      <div className="text-xs text-muted-foreground truncate mt-1">
                                        {String(url)}
                                      </div>
                                    )}
                                  </div>
                                  {typeof row?.match_score === 'number' && (
                                    <Badge variant="secondary" className="shrink-0">
                                      {Math.round(row.match_score)}
                                    </Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Preview */}
                        <div className="border-t lg:border-t-0 lg:border-l bg-background p-4">
                          {searchMode === 'google' ? (
                            leadResults[activeResultIndex] ? (
                              <div className="space-y-3">
                                <div className="font-semibold">
                                  {leadResults[activeResultIndex].title
                                    ? String(leadResults[activeResultIndex].title).replace(/\s*\|\s*LinkedIn\s*$/i, '')
                                    : 'Lead preview'}
                                </div>
                                {leadResults[activeResultIndex].snippet && (
                                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                    {leadResults[activeResultIndex].snippet}
                                  </div>
                                )}
                                <div className="space-y-2">
                                  <div className="text-xs text-muted-foreground break-all">
                                    {leadResults[activeResultIndex].linkedin_url}
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(leadResults[activeResultIndex].linkedin_url!, '_blank')}
                                    className="w-full"
                                  >
                                    View on LinkedIn
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => saveLeads.mutate([leadResults[activeResultIndex]])}
                                    disabled={saveLeads.isPending}
                                    className="w-full"
                                  >
                                    Save this lead
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">Select a lead to preview</div>
                            )
                          ) : (
                            searchResults[activeResultIndex] ? (
                              <div className="space-y-3">
                                <div className="font-semibold">{searchResults[activeResultIndex].full_name || 'Profile'}</div>
                                {searchResults[activeResultIndex].headline && (
                                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                    {searchResults[activeResultIndex].headline}
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  {searchResults[activeResultIndex].current_company && (
                                    <span className="inline-flex items-center gap-1">
                                      <Briefcase className="h-3 w-3" />
                                      {searchResults[activeResultIndex].current_company}
                                    </span>
                                  )}
                                  {searchResults[activeResultIndex].location && (
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {searchResults[activeResultIndex].location}
                                    </span>
                                  )}
                                </div>
                                {searchResults[activeResultIndex].skills?.length ? (
                                  <div className="flex flex-wrap gap-1">
                                    {searchResults[activeResultIndex].skills!.slice(0, 10).map((s, idx) => (
                                      <Badge key={idx} variant="secondary" className="text-xs">
                                        {s}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="space-y-2">
                                  <Button
                                    size="sm"
                                    onClick={() => importProfiles.mutate([searchResults[activeResultIndex]])}
                                    disabled={importProfiles.isPending}
                                    className="w-full"
                                  >
                                    Import this profile
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">Select a profile to preview</div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Tab */}
          <TabsContent value="api" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  API Integration
                </CardTitle>
                <CardDescription>
                  Integrate with external sources via API
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>API integration coming soon</p>
                  <p className="text-sm mt-1">Connect to job boards and HR systems</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {/* Right: status */}
          <div className="space-y-6 min-w-0">
            <Card className="lg:h-[calc(100vh-240px)] flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <span>Status</span>
                  {activeTab === 'resumes' && uploadResults.length > 0 && (
                    <Button variant="outline" size="sm" onClick={clearResults}>
                      Clear All
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  {activeTab === 'resumes'
                    ? 'Upload parsing + import progress'
                    : activeTab === 'search'
                      ? 'Search + import progress'
                      : 'Activity'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 min-h-0 overflow-auto">
                {activeTab === 'resumes' && (
                  <>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {uploadResults.length} file{uploadResults.length === 1 ? '' : 's'}
                      </span>
                      {processingCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing {processingCount}
                        </span>
                      )}
                      {completedCount > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          {completedCount} imported
                        </span>
                      )}
                      {errorCount > 0 && (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          {errorCount} failed
                        </span>
                      )}
                    </div>

                    {uploadResults.length > 0 && processingCount > 0 && (
                      <Progress value={(completedCount / uploadResults.length) * 100} />
                    )}

                    {uploadResults.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No uploads yet. Upload resumes on the left to populate your Talent Pool.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                        {uploadResults.map((item, i) => (
                          <div
                            key={i}
                            className={`flex items-center gap-3 p-3 rounded-lg border ${
                              item.status === 'done'
                                ? 'bg-green-50 dark:bg-green-950/20 border-green-200'
                                : item.status === 'error'
                                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200'
                                  : 'bg-muted/50'
                            }`}
                          >
                            {item.status === 'pending' && <div className="h-5 w-5 rounded-full bg-muted" />}
                            {item.status === 'parsing' && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                            {item.status === 'importing' && <Loader2 className="h-5 w-5 animate-spin text-green-500" />}
                            {item.status === 'done' && <CheckCircle className="h-5 w-5 text-green-600" />}
                            {item.status === 'error' && <AlertCircle className="h-5 w-5 text-destructive" />}

                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{item.parsed?.full_name || item.fileName}</div>
                              {item.parsed?.current_title && (
                                <div className="text-sm text-muted-foreground truncate">{item.parsed.current_title}</div>
                              )}
                              {item.status === 'error' && item.error && (
                                <div className="text-sm text-destructive">{item.error}</div>
                              )}
                              {item.status !== 'error' && item.note && (
                                <div className="text-sm text-muted-foreground">{item.note}</div>
                              )}
                            </div>

                            {item.atsScore !== undefined && (
                              <div className="flex flex-col items-end leading-tight">
                                <div className={`font-bold ${getScoreColor(item.atsScore)}`}>{item.atsScore}%</div>
                                <div className="text-[10px] text-muted-foreground">generic score</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'search' && (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Mode</span>
                      <span className="text-foreground">{searchMode === 'web' ? 'Web (public)' : 'LinkedIn (provider)'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Search status</span>
                      <span className="text-foreground">
                        {(searchMode === 'web' ? webSearch.isPending : linkedinSearch.isPending) ? 'Searching…' : 'Idle'}
                      </span>
                    </div>
                    <div>
                      Results: <span className="text-foreground">{searchResults.length}</span>
                    </div>
                    <div>
                      Selected: <span className="text-foreground">{selectedProfiles.size}</span>
                    </div>
                    <div>
                      Import status:{' '}
                      <span className="text-foreground">
                        {importProfiles.isPending ? 'Importing…' : 'Idle'}
                      </span>
                    </div>
                    {lastSearch && (
                      <div className="pt-2 border-t">
                        <div className="text-xs text-muted-foreground">Last search</div>
                        <div className="text-foreground truncate">{lastSearch.query}</div>
                        <div className="text-xs text-muted-foreground">
                          Found {lastSearch.found}
                          {typeof lastSearch.totalFound === 'number' ? ` (total ${lastSearch.totalFound})` : ''}
                          {' '}• {format(new Date(lastSearch.ts), 'MMM d, h:mm a')}
                        </div>
                      </div>
                    )}
                    {searchResults.length === 0 && !(searchMode === 'web' ? webSearch.isPending : linkedinSearch.isPending) && (
                      <div className="pt-2 text-xs">
                        Tip: try shorter queries like <span className="text-foreground">"python aws resume"</span> or{" "}
                        <span className="text-foreground">"python developer aws united states"</span>.
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'api' && (
                  <div className="text-sm text-muted-foreground">
                    API integrations will show status here once enabled.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
