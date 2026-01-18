import { useState, useCallback } from 'react';
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

export default function TalentSourcing() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;
  const [activeTab, setActiveTab] = useState<'resumes' | 'search' | 'api'>('resumes');

  // Web search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedProfile[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<number>>(new Set());
  const [searchMode, setSearchMode] = useState<'web' | 'linkedin'>('web');
  const [lastSearch, setLastSearch] = useState<{
    mode: 'web' | 'linkedin';
    query: string;
    found: number;
    totalFound?: number;
    debug?: any;
    ts: number;
  } | null>(null);

  // Resume upload state - persisted via zustand
  const { uploadResults, setUploadResults, clearResults, updateResult } = useBulkUploadStore();

  // Web search mutation (public web)
  const webSearch = useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('web-search', {
        body: { query, limit: 20, country: 'us', includeLinkedIn: false }
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
        toast.success(`Found ${data.profiles.length} profiles`);
      } else {
        setSearchResults([]);
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
        toast.success(`Found ${data.profiles.length} profiles`);
      } else {
        setSearchResults([]);
        toast.info('No profiles found. Try different search terms.');
      }
    },
    onError: (error: any) => {
      console.error('Search error:', error);
      toast.error(error.message || 'Search failed');
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
      setSearchResults([]);
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
    else linkedinSearch.mutate(searchQuery);
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
    if (selectedProfiles.size === searchResults.length) {
      setSelectedProfiles(new Set());
    } else {
      setSelectedProfiles(new Set(searchResults.map((_, i) => i)));
    }
  };

  const handleImportSelected = () => {
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
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={searchMode === 'web' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSearchMode('web')}
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Web
                  </Button>
                  <Button
                    type="button"
                    variant={searchMode === 'linkedin' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSearchMode('linkedin')}
                  >
                    <Linkedin className="h-4 w-4 mr-2" />
                    LinkedIn (provider)
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Use Web for public pages. LinkedIn requires an approved provider/API.
                  </span>
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
                    disabled={webSearch.isPending || linkedinSearch.isPending}
                  >
                    {(searchMode === 'web' ? webSearch.isPending : linkedinSearch.isPending) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Search
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedProfiles.size === searchResults.length}
                          onCheckedChange={selectAllProfiles}
                        />
                        <span className="text-sm font-medium">
                          {searchResults.length} profiles found
                        </span>
                      </div>
                      <Button
                        onClick={handleImportSelected}
                        disabled={selectedProfiles.size === 0 || importProfiles.isPending}
                        size="sm"
                      >
                        {importProfiles.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        Import {selectedProfiles.size || ''}
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {searchResults.map((profile, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-4 p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedProfiles.has(i) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => toggleProfileSelection(i)}
                        >
                          <Checkbox checked={selectedProfiles.has(i)} />
                          <Avatar className="h-10 w-10">
                            <AvatarFallback>
                              {(profile.full_name || 'U').charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{profile.full_name}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                              {profile.headline && <span className="truncate">{profile.headline}</span>}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              {profile.current_company && (
                                <span className="flex items-center gap-1">
                                  <Briefcase className="h-3 w-3" />
                                  {profile.current_company}
                                </span>
                              )}
                              {profile.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {profile.location}
                                </span>
                              )}
                            </div>
                          </div>
                          {profile.skills && profile.skills.length > 0 && (
                            <div className="hidden md:flex flex-wrap gap-1 max-w-xs">
                              {profile.skills.slice(0, 3).map((skill, j) => (
                                <Badge key={j} variant="secondary" className="text-xs">
                                  {skill}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
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
