import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScoreBadge } from '@/components/ui/score-badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Briefcase,
  MapPin,
  Mail,
  Phone,
  Linkedin,
  Calendar,
  GraduationCap,
  Loader2,
  FileText,
  Download,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface TalentDetailSheetProps {
  talentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TalentDetailSheet({ talentId, open, onOpenChange }: TalentDetailSheetProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: talent, isLoading } = useQuery({
    queryKey: ['talent-detail', talentId],
    queryFn: async () => {
      if (!talentId) return null;

      const { data: profile, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('id', talentId)
        .single();

      if (error) throw error;

      // Fetch skills
      const { data: skills } = await supabase
        .from('candidate_skills')
        .select('skill_name, proficiency_level, years_of_experience')
        .eq('candidate_id', talentId);

      // Fetch experience
      const { data: experience } = await supabase
        .from('candidate_experience')
        .select('*')
        .eq('candidate_id', talentId)
        .order('start_date', { ascending: false });

      // Fetch education
      const { data: education } = await supabase
        .from('candidate_education')
        .select('*')
        .eq('candidate_id', talentId)
        .order('end_date', { ascending: false });

      // Fetch resumes
      const { data: resumes } = await supabase
        .from('resumes')
        .select('*')
        .eq('candidate_id', talentId)
        .order('is_primary', { ascending: false });

      return {
        ...profile,
        skills: skills || [],
        experience: experience || [],
        education: education || [],
        resumes: resumes || [],
      };
    },
    enabled: !!talentId && open,
  });

  const extractResumePath = (fileUrl: string) => {
    // Supports both stored public URLs and raw storage paths
    // Example public URL: .../storage/v1/object/public/resumes/sourced/...
    const byPublic = fileUrl.split('/object/public/resumes/')[1];
    if (byPublic) return byPublic;

    const byBucket = fileUrl.split('/resumes/')[1];
    if (byBucket) return byBucket;

    return null;
  };

  const handleViewResume = async (fileUrl: string, fileName: string) => {
    // Open the tab synchronously to avoid popup blockers.
    const tab = window.open('about:blank', '_blank');

    setIsDownloading(true);
    try {
      const filePath = extractResumePath(fileUrl);

      if (filePath) {
        const { data: signedUrlData, error: signedUrlError } = await supabase
          .storage
          .from('resumes')
          .createSignedUrl(filePath, 3600);

        if (signedUrlError) throw signedUrlError;

        const urlToOpen = signedUrlData?.signedUrl || fileUrl;
        if (tab) tab.location.href = urlToOpen;
        else window.open(urlToOpen, '_blank');
      } else {
        if (tab) tab.location.href = fileUrl;
        else window.open(fileUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing resume:', error);
      if (tab) tab.close();
      toast.error(`Failed to open resume: ${fileName}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadResume = async (fileUrl: string, fileName: string) => {
    setIsDownloading(true);
    try {
      // Extract file path from URL
      const filePath = fileUrl.split('/resumes/')[1];
      
      if (filePath) {
        // Try to get signed URL for download
        const { data: signedUrlData, error: signedUrlError } = await supabase
          .storage
          .from('resumes')
          .createSignedUrl(filePath, 3600, { download: true });

        if (signedUrlError) throw signedUrlError;
        
        if (signedUrlData?.signedUrl) {
          const link = document.createElement('a');
          link.href = signedUrlData.signedUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success('Resume downloaded');
        }
      } else {
        // Fallback: try direct download
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = fileName;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error downloading resume:', error);
      toast.error('Failed to download resume');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Candidate Profile</SheetTitle>
          <SheetDescription>Full profile details</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : talent ? (
          <ScrollArea className="h-[calc(100vh-8rem)] pr-4 mt-4">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-accent text-accent-foreground text-xl">
                    {(talent.full_name || 'U').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{talent.full_name || 'Unknown'}</h2>
                    {talent.ats_score && <ScoreBadge score={talent.ats_score} />}
                  </div>
                  {talent.headline && (
                    <p className="text-muted-foreground">{talent.headline}</p>
                  )}
                  {talent.current_title && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      {talent.current_title}
                      {talent.current_company && ` at ${talent.current_company}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-2">
                {talent.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${talent.email}`} className="hover:underline">
                      {talent.email}
                    </a>
                  </div>
                )}
                {talent.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {talent.phone}
                  </div>
                )}
                {talent.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {talent.location}
                  </div>
                )}
                {talent.linkedin_url && (
                  <div className="flex items-center gap-2 text-sm">
                    <Linkedin className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={talent.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-primary"
                    >
                      LinkedIn Profile
                    </a>
                  </div>
                )}
              </div>

              {/* Summary */}
              {talent.summary && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Summary</h3>
                    <p className="text-sm text-muted-foreground">{talent.summary}</p>
                  </div>
                </>
              )}

              {/* Skills */}
              {talent.skills && talent.skills.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2">Skills</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {talent.skills.map((skill: { skill_name: string }, i: number) => (
                        <Badge key={i} variant="secondary">
                          {skill.skill_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Experience */}
              {talent.experience && talent.experience.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-3">Experience</h3>
                    <div className="space-y-4">
                      {talent.experience.map((exp: {
                        id: string;
                        job_title: string;
                        company_name: string;
                        location?: string;
                        start_date: string;
                        end_date?: string;
                        is_current?: boolean;
                        description?: string;
                      }) => (
                        <div key={exp.id} className="space-y-1">
                          <div className="font-medium">{exp.job_title}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" />
                            {exp.company_name}
                            {exp.location && ` • ${exp.location}`}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(exp.start_date), 'MMM yyyy')} -{' '}
                            {exp.is_current ? 'Present' : exp.end_date ? format(new Date(exp.end_date), 'MMM yyyy') : 'N/A'}
                          </div>
                          {exp.description && (
                            <p className="text-sm text-muted-foreground mt-1">{exp.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Education */}
              {talent.education && talent.education.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-3">Education</h3>
                    <div className="space-y-3">
                      {talent.education.map((edu: {
                        id: string;
                        degree: string;
                        institution: string;
                        field_of_study?: string;
                        end_date?: string;
                      }) => (
                        <div key={edu.id} className="space-y-1">
                          <div className="font-medium">{edu.degree}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <GraduationCap className="h-3.5 w-3.5" />
                            {edu.institution}
                            {edu.field_of_study && ` • ${edu.field_of_study}`}
                          </div>
                          {edu.end_date && (
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(edu.end_date), 'yyyy')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Resumes */}
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3">Resumes</h3>

                  {talent.resumes && talent.resumes.length > 0 ? (
                    <div className="space-y-2">
                      {talent.resumes.map((resume: {
                        id: string;
                        file_name: string;
                        file_url: string;
                        is_primary?: boolean;
                        ats_score?: number;
                        created_at: string;
                      }) => (
                        <div
                          key={resume.id}
                          className="p-3 rounded-md bg-muted/50 space-y-2"
                        >
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium break-words">
                                  {resume.file_name}
                                </span>
                                {resume.is_primary && (
                                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                                    Primary
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {format(new Date(resume.created_at), 'MMM d, yyyy')}
                                {resume.ats_score && ` • ATS: ${resume.ats_score}%`}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pl-6">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewResume(resume.file_url, resume.file_name)}
                              disabled={isDownloading}
                              className="h-8"
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadResume(resume.file_url, resume.file_name)}
                              disabled={isDownloading}
                              className="h-8"
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                      No resumes found for this candidate.
                    </div>
                  )}
                </div>
              </>

              {/* Meta info */}
              <Separator />
              <div className="text-xs text-muted-foreground">
                Added {format(new Date(talent.created_at), 'MMMM d, yyyy')}
                {talent.years_of_experience !== null && talent.years_of_experience !== undefined && (
                  <> • {talent.years_of_experience} years experience</>
                )}
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            Profile not found
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
