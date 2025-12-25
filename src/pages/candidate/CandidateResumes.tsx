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
        .select('id')
        .eq('user_id', user!.id)
        .single();

      if (cpError) throw cpError;
      setCandidateId(cpData.id);

      const { data: resumesData, error: resumesError } = await supabase
        .from('resumes')
        .select('*')
        .eq('candidate_id', cpData.id)
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

    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PDF or Word document');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${candidateId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);

      const { data: resumeData, error: resumeError } = await supabase
        .from('resumes')
        .insert({
          candidate_id: candidateId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          is_primary: resumes.length === 0,
        })
        .select()
        .single();

      if (resumeError) throw resumeError;

      setResumes([resumeData, ...resumes]);
      toast.success('Resume uploaded successfully');
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
      // Extract file path from URL
      const urlParts = fileUrl.split('/');
      const filePath = urlParts.slice(-2).join('/');

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
              accept=".pdf,.doc,.docx"
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
                    <a href={resume.file_url} target="_blank" rel="noopener noreferrer">
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
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
