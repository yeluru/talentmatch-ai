import { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Upload, FileText, Trash2, Star, StarOff, Download } from 'lucide-react';
import { format } from 'date-fns';
import { resumesObjectPath } from '@/lib/storagePaths';

interface Resume {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  is_primary: boolean | null;
  ats_score: number | null;
  created_at: string;
}

export default function CandidateResumes() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      fetchResumes();
    }
  }, [user]);

  const fetchResumes = async () => {
    try {
      const { data: cpData, error: cpError } = await supabase
        .from('candidate_profiles')
        .select('id, updated_at')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (cpError) throw cpError;
      const cp = (cpData || [])[0] as any;
      if (!cp?.id) throw new Error('Candidate profile not found');
      setCandidateId(cp.id);

      const { data: resumesData, error: resumesError } = await supabase
        .from('resumes')
        .select('*')
        .eq('candidate_id', cp.id)
        .order('created_at', { ascending: false });

      if (resumesError) throw resumesError;
      setResumes(resumesData || []);
    } catch (error) {
      console.error('Error fetching resumes:', error);
      toast.error('Failed to load resumes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !candidateId) return;

    // NOTE: Some browsers (notably Safari) may provide an empty/unknown MIME type for DOCX.
    // Accept by extension as a fallback.
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const lowerName = file.name.toLowerCase();
    const looksLikePdf = lowerName.endsWith('.pdf');
    const looksLikeDocx = lowerName.endsWith('.docx');
    const typeOk = allowedTypes.includes(file.type);
    if (!typeOk && !looksLikePdf && !looksLikeDocx) {
      toast.error('Please upload a PDF or DOCX (Word)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const readFileAsBase64 = (f: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || '');
            const commaIdx = result.indexOf(',');
            if (commaIdx >= 0) return resolve(result.slice(commaIdx + 1));
            // If not a data URL (unlikely), just return raw
            resolve(result);
          };
          reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
          reader.readAsDataURL(f);
        });

      const fileExt = file.name.split('.').pop();
      // Use user.id for storage path to match RLS policy
      const fileName = `${user!.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Store a bucket-relative path reference, not a public URL (bucket is private).
      const storedFileUrl = `resumes/${fileName}`;

      const { data: resumeData, error: resumeError } = await supabase
        .from('resumes')
        .insert({
          candidate_id: candidateId,
          file_name: file.name,
          file_url: storedFileUrl,
          file_type: file.type,
          is_primary: resumes.length === 0,
        })
        .select()
        .single();

      if (resumeError) throw resumeError;

      setResumes([resumeData, ...resumes]);
      toast.success('Resume uploaded successfully');

      // Auto-extract candidate details from resume and save (reduce friction)
      try {
        const fileBase64 = await readFileAsBase64(file);
        const { data: parsedResp, error: parseErr } = await supabase.functions.invoke('parse-resume', {
          body: {
            fileBase64,
            fileName: file.name,
            fileType: file.type,
          },
        });

        if (parseErr) throw parseErr;
        const parsed = (parsedResp as any)?.parsed as any;
        const parseMode = (parsedResp as any)?.mode as string | undefined;
        const parseWarning = (parsedResp as any)?.warning as string | undefined;

        // Store parsed_content on the resume row for reuse elsewhere (e.g., Resume Workspace tailoring).
        // Best-effort: do not fail the upload if this update fails.
        try {
          if (parsed && resumeData?.id) {
            const diagnostics = (parsedResp as any)?.diagnostics || null;
            await supabase
              .from('resumes')
              .update({
                parsed_content: {
                  parsed,
                  mode: parseMode || null,
                  warning: parseWarning || null,
                  diagnostics,
                  parsed_at: new Date().toISOString(),
                },
              } as any)
              .eq('id', resumeData.id);
          }
        } catch (e) {
          console.warn('Failed to persist resumes.parsed_content (non-blocking)', e);
        }

        const looksLikeContactJunk = (v: unknown): boolean => {
          const s = String(v ?? '').trim();
          if (!s) return false;
          // IMPORTANT: do NOT treat "long text" as junk; summaries are often > 180 chars.
          // Only flag actual contact/header artifacts.
          if (/@/.test(s)) return true;
          if (/https?:\/\/|www\./i.test(s)) return true;
          if (/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(s)) return true;
          if (/\blinkedin\.com\b|\bgithub\.com\b/i.test(s)) return true;
          if (/\bcontact\b/i.test(s)) return true;
          if (/\blocal to\b/i.test(s) && (/@/.test(s) || /https?:\/\/|www\./i.test(s))) return true;
          return false;
        };

        const looksLikeSentence = (v: unknown): boolean => {
          const s = String(v ?? '').trim();
          if (!s) return false;
          if (s.length > 70) return true;
          if (/[.!?]/.test(s)) return true;
          if (/\bto\s+\w+/i.test(s)) return true;
          const words = s.split(/\s+/).filter(Boolean);
          return words.length > 6;
        };

        const cleanSkillClient = (v: unknown): string | null => {
          let s = String(v ?? '').trim();
          if (!s) return null;
          s = s.replace(/^[•\-\*\u2022]+\s*/g, '').replace(/\s+/g, ' ').trim();
          if (!s) return null;
          const lower = s.toLowerCase();
          if (lower.startsWith('and ')) return null;
          if (lower.includes('such as')) return null;
          if (lower.includes('experience in')) return null;
          if (lower.includes('to achieve') || lower.includes('improved the process')) return null;
          if (/@/.test(s)) return null;
          if (/https?:\/\/|www\./i.test(s)) return null;
          if (/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(s)) return null;
          const words = s.split(/\s+/).filter(Boolean);
          if (words.length > 5) return null;
          if (s.length > 50) return null;
          return s;
        };

        const cleanSoftSkillClient = (v: unknown): string | null => {
          let s = String(v ?? '').trim();
          if (!s) return null;
          s = s.replace(/^[•\-\*\u2022]+\s*/g, '').replace(/\s+/g, ' ').trim();
          if (!s) return null;
          const lower = s.toLowerCase();
          if (lower.startsWith('and ')) return null;
          if (lower.includes('such as')) return null;
          if (lower.includes('experience in')) return null;
          if (lower.includes('to achieve') || lower.includes('improved the process')) return null;
          if (/@/.test(s)) return null;
          if (/https?:\/\/|www\./i.test(s)) return null;
          if (/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(s)) return null;
          // soft skills should be words, not tech punctuation
          if (/[^a-zA-Z\s\-]/.test(s)) return null;
          const words = s.split(/\s+/).filter(Boolean);
          if (words.length > 4) return null;
          if (s.length > 40) return null;
          return s;
        };

        const buildHeadline = (title: unknown, skills: string[]) => {
          const t = String(title ?? '').trim();
          if (!t) return '';
          const top = (skills || []).slice(0, 2).map((s) => String(s).trim()).filter(Boolean);
          return top.length ? `${t} | ${top.join(' • ')}` : t;
        };

        if (parsed) {
          // Merge into candidate profile (do not overwrite manually-entered values unless empty/default)
          const { data: existingProfile } = await supabase
            .from('candidate_profiles')
            .select('full_name, phone, linkedin_url, github_url, current_title, current_company, headline, summary, years_of_experience')
            .eq('id', candidateId)
            .maybeSingle();

          const updates: any = {};
          const existingHeadlineIsJunk = looksLikeContactJunk(existingProfile?.headline);
          const existingSummaryIsJunk = looksLikeContactJunk(existingProfile?.summary);
          const existingCompanyIsJunk = looksLikeSentence(existingProfile?.current_company) || looksLikeContactJunk(existingProfile?.current_company);

          // Contact info (only fill if missing)
          if (existingProfile && !existingProfile.full_name && parsed.full_name) updates.full_name = parsed.full_name;
          if (existingProfile && !existingProfile.phone && parsed.phone) updates.phone = parsed.phone;
          if (existingProfile && !existingProfile.linkedin_url && parsed.linkedin_url) updates.linkedin_url = parsed.linkedin_url;
          if (existingProfile && !existingProfile.github_url && parsed.github_url) updates.github_url = parsed.github_url;

          if (!existingProfile?.current_title && parsed.current_title) updates.current_title = parsed.current_title;

          // Company/title: allow overwrite if existing looks like junk
          if (
            (existingProfile?.current_company == null || existingCompanyIsJunk) &&
            parsed.current_company &&
            !looksLikeSentence(parsed.current_company) &&
            !looksLikeContactJunk(parsed.current_company)
          ) {
            updates.current_company = parsed.current_company;
          }
          // Summary/headline:
          // - summary is the long-form “about me”
          // - headline is the short blurb (prefer current title, else truncate summary)
          if (
            (existingProfile?.summary == null || existingSummaryIsJunk || String(existingProfile?.summary || '').trim().length < 50) &&
            parsed.summary &&
            !looksLikeContactJunk(parsed.summary)
          ) {
            updates.summary = parsed.summary;
          }
          // Merge skills (insert new ones only) + use a cleaned subset for headline (technical only)
          const technicalSkills: string[] = Array.isArray(parsed.technical_skills) ? parsed.technical_skills : [];
          const softSkills: string[] = Array.isArray(parsed.soft_skills) ? parsed.soft_skills : [];
          const technicalNormalized = technicalSkills
            .map(cleanSkillClient)
            .filter(Boolean)
            .slice(0, 60) as string[];
          const softNormalized = softSkills
            .map(cleanSoftSkillClient)
            .filter(Boolean)
            .slice(0, 40) as string[];

          if (
            existingProfile?.headline == null ||
            existingHeadlineIsJunk ||
            String(existingProfile?.headline || '').trim().length < 10
          ) {
            if (parsed.current_title) updates.headline = buildHeadline(parsed.current_title, technicalNormalized);
            else if (parsed.summary && !looksLikeContactJunk(parsed.summary)) updates.headline = String(parsed.summary).slice(0, 140);
          }
          if (
            (existingProfile?.years_of_experience == null || existingProfile?.years_of_experience === 0) &&
            typeof parsed.years_of_experience === 'number'
          ) {
            updates.years_of_experience = Math.max(0, Math.round(parsed.years_of_experience));
          }

          if (Object.keys(updates).length) {
            await supabase.from('candidate_profiles').update(updates).eq('id', candidateId);
          }

          // Insert newly discovered skills (do not delete existing)
          if (technicalNormalized.length || softNormalized.length) {
            // Cleanup: remove obviously junk skills that can get inserted from early parsing runs.
            // This is intentionally conservative (only deletes clearly-bad strings).
            await supabase
              .from('candidate_skills')
              .delete()
              .eq('candidate_id', candidateId)
              .or(
                [
                  'skill_name.ilike.and %',
                  'skill_name.ilike.%such as%',
                  'skill_name.ilike.%experience in%',
                  'skill_name.ilike.%experience with%',
                  'skill_name.ilike.%to achieve%',
                ].join(','),
              );

            const { data: existingSkills } = await supabase
              .from('candidate_skills')
              .select('skill_name, skill_type')
              .eq('candidate_id', candidateId)
              .limit(500);

            const existingSet = new Set(
              (existingSkills || [])
                .map((r: any) => `${String(r.skill_type || 'technical').toLowerCase()}:${String(r.skill_name || '').toLowerCase().trim()}`)
                .filter(Boolean)
            );

            const toInsert = [
              ...technicalNormalized
                .filter((s) => !existingSet.has(`technical:${s.toLowerCase()}`))
                .map((s) => ({ candidate_id: candidateId, skill_name: s, skill_type: 'technical' })),
              ...softNormalized
                .filter((s) => !existingSet.has(`soft:${s.toLowerCase()}`))
                .map((s) => ({ candidate_id: candidateId, skill_name: s, skill_type: 'soft' })),
            ];

            if (toInsert.length) {
              await supabase.from('candidate_skills').insert(toInsert as any);
            }
          }

          toast.message('Profile auto-filled from resume', {
            description:
              parseMode === 'heuristic'
                ? 'Auto-fill ran in fallback mode (AI not configured). Add an AI key for best results.'
                : 'We extracted title/company/headline and skills from your resume.',
          });

          // Let other candidate pages (My Profile) refresh immediately if open.
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('candidate-profile-updated'));
          }
        }
      } catch (e) {
        // Soft-fail — resume upload succeeded; parsing is best-effort.
        console.warn('Resume parse/auto-fill failed', e);
        toast.message('Resume uploaded', {
          description:
            e instanceof Error
              ? `We couldn’t auto-fill your profile from this resume. (${e.message})`
              : 'We couldn’t auto-fill your profile from this resume. You can still edit My Profile manually.',
        });
      }
    } catch (error) {
      console.error('Error uploading resume:', error);
      toast.error('Failed to upload resume');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSetPrimary = async (resumeId: string) => {
    try {
      // First, unset all as primary
      await supabase
        .from('resumes')
        .update({ is_primary: false })
        .eq('candidate_id', candidateId!);

      // Then set the selected one as primary
      const { error } = await supabase
        .from('resumes')
        .update({ is_primary: true })
        .eq('id', resumeId);

      if (error) throw error;

      setResumes(resumes.map(r => ({
        ...r,
        is_primary: r.id === resumeId
      })));
      toast.success('Primary resume updated');
    } catch (error) {
      console.error('Error setting primary resume:', error);
      toast.error('Failed to update primary resume');
    }
  };

  const handleDeleteResume = async (resumeId: string, fileUrl: string) => {
    try {
      const filePath = resumesObjectPath(fileUrl);
      if (!filePath) throw new Error('Could not resolve resume file path');

      await supabase.storage.from('resumes').remove([filePath]);

      const { error } = await supabase
        .from('resumes')
        .delete()
        .eq('id', resumeId);

      if (error) throw error;

      setResumes(resumes.filter(r => r.id !== resumeId));
      toast.success('Resume deleted');
    } catch (error) {
      console.error('Error deleting resume:', error);
      toast.error('Failed to delete resume');
    }
  };

  const handleDownloadResume = async (fileUrl: string, fileName: string) => {
    try {
      const filePath = resumesObjectPath(fileUrl);
      if (!filePath) throw new Error('Could not resolve resume file path');

      const { data, error } = await supabase.storage
        .from('resumes')
        .createSignedUrl(filePath, 600, { download: true });
      if (error) throw error;

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      } else {
        throw new Error('Failed to generate download URL');
      }
    } catch (error: any) {
      console.error('Error downloading resume:', error);
      toast.error(error?.message || 'Failed to download resume');
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">My Resumes</h1>
            <p className="text-muted-foreground mt-1">
              Manage your resume documents
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload Resume
            </Button>
          </div>
        </div>

        {resumes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No resumes uploaded</h3>
              <p className="text-muted-foreground text-center mb-4">
                Upload your resume to start applying for jobs
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Your First Resume
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {resumes.map((resume) => (
              <Card key={resume.id} className={resume.is_primary ? 'border-primary' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      {resume.is_primary && (
                        <Badge variant="default" className="text-xs">Primary</Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSetPrimary(resume.id)}
                        title={resume.is_primary ? 'Primary resume' : 'Set as primary'}
                      >
                        {resume.is_primary ? (
                          <Star className="h-4 w-4 text-warning fill-warning" />
                        ) : (
                          <StarOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteResume(resume.id, resume.file_url)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-base truncate">{resume.file_name}</CardTitle>
                  <CardDescription>
                    Uploaded {format(new Date(resume.created_at), 'MMM d, yyyy')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {resume.ats_score && (
                    <div className="mb-3">
                      <span className="text-sm text-muted-foreground">ATS Score: </span>
                      <span className="font-semibold text-primary">{resume.ats_score}%</span>
                    </div>
                  )}
                  <Button variant="outline" className="w-full" asChild>
                    <button onClick={() => handleDownloadResume(resume.file_url, resume.file_name)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </button>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
