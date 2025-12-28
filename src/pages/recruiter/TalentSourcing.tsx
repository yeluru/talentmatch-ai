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
import {
  Upload,
  Search,
  Globe,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Linkedin,
  Users,
  Sparkles,
  Plus,
  X,
  MapPin,
  Briefcase
} from 'lucide-react';
import { toast } from 'sonner';

interface SearchedProfile {
  full_name: string;
  headline?: string;
  current_company?: string;
  location?: string;
  skills?: string[];
  experience_years?: number;
  summary?: string;
  linkedin_url?: string;
  email?: string;
  source: string;
}

interface UploadProgress {
  fileName: string;
  status: 'pending' | 'parsing' | 'done' | 'error';
  error?: string;
  parsed?: any;
}

export default function TalentSourcing() {
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = roles.find(r => r.role === 'recruiter')?.organization_id;

  // Web search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedProfile[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<number>>(new Set());

  // Resume upload state
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [parsedResumes, setParsedResumes] = useState<any[]>([]);
  const [selectedResumes, setSelectedResumes] = useState<Set<number>>(new Set());

  // LinkedIn search mutation
  const linkedinSearch = useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('linkedin-search', {
        body: { query, limit: 20 }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
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

  // Handle file selection and parsing
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newProgress: UploadProgress[] = files.map(f => ({
      fileName: f.name,
      status: 'pending'
    }));
    setUploadProgress(newProgress);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      setUploadProgress(prev => prev.map((p, idx) => 
        idx === i ? { ...p, status: 'parsing' } : p
      ));

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

        // Parse resume
        const { data, error } = await supabase.functions.invoke('parse-resume', {
          body: {
            fileBase64: base64,
            fileName: file.name,
            fileType: file.type
          }
        });

        if (error) throw error;

        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'done', parsed: data.parsed } : p
        ));

        setParsedResumes(prev => [...prev, {
          ...data.parsed,
          fileName: file.name,
          source: 'resume_upload'
        }]);

      } catch (error: any) {
        console.error('Parse error for', file.name, error);
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'error', error: error.message } : p
        ));
      }
    }
  }, []);

  // Import parsed resumes
  const importResumes = useMutation({
    mutationFn: async (profiles: any[]) => {
      const { data, error } = await supabase.functions.invoke('bulk-import-candidates', {
        body: { profiles, organizationId, source: 'resume_upload' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast.success(`Imported ${data.results.imported} candidates from resumes`);
      setSelectedResumes(new Set());
      setParsedResumes([]);
      setUploadProgress([]);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Import failed');
    }
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }
    linkedinSearch.mutate(searchQuery);
  };

  const toggleProfileSelection = (index: number) => {
    setSelectedProfiles(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleResumeSelection = (index: number) => {
    setSelectedResumes(prev => {
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

  const selectAllResumes = () => {
    if (selectedResumes.size === parsedResumes.length) {
      setSelectedResumes(new Set());
    } else {
      setSelectedResumes(new Set(parsedResumes.map((_, i) => i)));
    }
  };

  const handleImportSelected = () => {
    const profiles = Array.from(selectedProfiles).map(i => searchResults[i]);
    importProfiles.mutate(profiles);
  };

  const handleImportResumes = () => {
    const profiles = Array.from(selectedResumes).map(i => parsedResumes[i]);
    importResumes.mutate(profiles);
  };

  const completedUploads = uploadProgress.filter(p => p.status === 'done').length;
  const totalUploads = uploadProgress.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Talent Sourcing</h1>
          <p className="text-muted-foreground mt-1">
            Import candidates from resumes or search the web for profiles
          </p>
        </div>

        <Tabs defaultValue="resumes" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="resumes" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Resumes
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

          {/* Bulk Resume Upload Tab */}
          <TabsContent value="resumes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Bulk Resume Upload
                </CardTitle>
                <CardDescription>
                  Upload multiple resumes at once. We'll parse them using AI and extract candidate profiles.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Upload Area */}
                <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    id="resume-upload"
                    multiple
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <label htmlFor="resume-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-1">Drop resumes here or click to upload</p>
                    <p className="text-sm text-muted-foreground">
                      Supports PDF, DOC, DOCX, TXT • Max 20MB per file
                    </p>
                  </label>
                </div>

                {/* Upload Progress */}
                {uploadProgress.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Processing {totalUploads} files</h3>
                      <span className="text-sm text-muted-foreground">
                        {completedUploads} / {totalUploads} complete
                      </span>
                    </div>
                    <Progress value={(completedUploads / totalUploads) * 100} />
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {uploadProgress.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          {item.status === 'pending' && <div className="h-4 w-4 rounded-full bg-muted" />}
                          {item.status === 'parsing' && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
                          {item.status === 'done' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {item.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                          <span className={item.status === 'error' ? 'text-destructive' : ''}>
                            {item.fileName}
                          </span>
                          {item.error && <span className="text-destructive text-xs">({item.error})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parsed Results */}
                {parsedResumes.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedResumes.size === parsedResumes.length}
                          onCheckedChange={selectAllResumes}
                        />
                        <h3 className="font-medium">
                          Parsed Resumes ({parsedResumes.length})
                        </h3>
                      </div>
                      <Button
                        onClick={handleImportResumes}
                        disabled={selectedResumes.size === 0 || importResumes.isPending}
                      >
                        {importResumes.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        Import {selectedResumes.size} Selected
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {parsedResumes.map((resume, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                            selectedResumes.has(i) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => toggleResumeSelection(i)}
                        >
                          <Checkbox checked={selectedResumes.has(i)} />
                          <Avatar>
                            <AvatarFallback>
                              {(resume.full_name || 'U').charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{resume.full_name || 'Unknown'}</div>
                            <div className="text-sm text-muted-foreground">
                              {resume.current_title || resume.headline || 'No title'}
                              {resume.current_company && ` at ${resume.current_company}`}
                            </div>
                            {resume.skills?.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {resume.skills.slice(0, 5).map((skill: string, si: number) => (
                                  <Badge key={si} variant="secondary" className="text-xs">
                                    {skill}
                                  </Badge>
                                ))}
                                {resume.skills.length > 5 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{resume.skills.length - 5}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {resume.fileName}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Web Search Tab */}
          <TabsContent value="search" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Linkedin className="h-5 w-5" />
                  LinkedIn & Web Search
                </CardTitle>
                <CardDescription>
                  Search for candidate profiles across LinkedIn and the web using natural language
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Search Input */}
                <div className="flex gap-3">
                  <Input
                    placeholder="e.g., React developer San Francisco 5+ years experience"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} disabled={linkedinSearch.isPending}>
                    {linkedinSearch.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Search
                  </Button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedProfiles.size === searchResults.length}
                          onCheckedChange={selectAllProfiles}
                        />
                        <h3 className="font-medium">
                          Found {searchResults.length} profiles
                        </h3>
                      </div>
                      <Button
                        onClick={handleImportSelected}
                        disabled={selectedProfiles.size === 0 || importProfiles.isPending}
                      >
                        {importProfiles.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        Import {selectedProfiles.size} Selected
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {searchResults.map((profile, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors ${
                            selectedProfiles.has(i) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => toggleProfileSelection(i)}
                        >
                          <Checkbox checked={selectedProfiles.has(i)} />
                          <Avatar>
                            <AvatarFallback>
                              {profile.full_name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{profile.full_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {profile.headline || 'No headline'}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
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
                            {profile.skills?.length ? (
                              <div className="flex gap-1 mt-2 flex-wrap">
                                {profile.skills.slice(0, 5).map((skill, si) => (
                                  <Badge key={si} variant="secondary" className="text-xs">
                                    {skill}
                                  </Badge>
                                ))}
                                {profile.skills.length > 5 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{profile.skills.length - 5}
                                  </Badge>
                                )}
                              </div>
                            ) : null}
                          </div>
                          {profile.linkedin_url && (
                            <a
                              href={profile.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-500 hover:text-blue-600"
                            >
                              <Linkedin className="h-5 w-5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {linkedinSearch.isPending && (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Searching the web for profiles...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Integration Tab */}
          <TabsContent value="api" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Profile API Integrations
                </CardTitle>
                <CardDescription>
                  Connect to professional profile databases for enriched candidate data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    {
                      name: 'Apollo.io',
                      description: 'B2B database with 275M+ contacts. Get verified emails, phone numbers, and company data.',
                      status: 'available',
                      logo: '🚀'
                    },
                    {
                      name: 'Hunter.io',
                      description: 'Find and verify professional email addresses. Domain search and email finder.',
                      status: 'available',
                      logo: '🎯'
                    },
                    {
                      name: 'RocketReach',
                      description: 'Access 700M+ professional profiles with direct contact info.',
                      status: 'available',
                      logo: '🔥'
                    },
                    {
                      name: 'People Data Labs',
                      description: 'Comprehensive people data API for enrichment and search.',
                      status: 'available',
                      logo: '📊'
                    }
                  ].map((api) => (
                    <div
                      key={api.name}
                      className="p-4 border rounded-lg hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{api.logo}</span>
                        <div>
                          <h3 className="font-semibold">{api.name}</h3>
                          <Badge variant="outline" className="text-xs">
                            Requires API Key
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {api.description}
                      </p>
                      <Button variant="outline" className="w-full">
                        Configure API Key
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="font-medium mb-1">Need help choosing?</h4>
                      <p className="text-sm text-muted-foreground">
                        <strong>Apollo.io</strong> is best for sales-focused sourcing with company data. 
                        <strong> Hunter.io</strong> excels at email verification. 
                        <strong> RocketReach</strong> and <strong>People Data Labs</strong> offer comprehensive profile data for technical recruiting.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
