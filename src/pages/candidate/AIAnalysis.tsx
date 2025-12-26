import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Sparkles, CheckCircle, XCircle, AlertTriangle, Lightbulb, FileText } from 'lucide-react';

interface Resume {
  id: string;
  file_name: string;
  file_url: string;
  is_primary: boolean | null;
}

interface AnalysisResult {
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  key_strengths?: string[];
  areas_for_improvement?: string[];
  recommendations: string[];
  summary: string;
}

export default function AIAnalysis() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [jobDescription, setJobDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    if (user) {
      fetchResumes();
    }
  }, [user]);

  const fetchResumes = async () => {
    try {
      const { data: cpData } = await supabase
        .from('candidate_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .single();

      if (cpData) {
        setCandidateId(cpData.id);

        const { data: resumesData } = await supabase
          .from('resumes')
          .select('id, file_name, file_url, is_primary')
          .eq('candidate_id', cpData.id);

        setResumes(resumesData || []);
        const primaryResume = resumesData?.find(r => r.is_primary);
        if (primaryResume) {
          setSelectedResumeId(primaryResume.id);
        }
      }
    } catch (error) {
      console.error('Error fetching resumes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedResumeId) {
      toast.error('Please select a resume');
      return;
    }

    const selectedResume = resumes.find(r => r.id === selectedResumeId);
    if (!selectedResume) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      // Fetch resume content (for demo, we'll use the filename as content)
      // In production, you'd parse the actual PDF/DOCX
      const resumeText = `Resume: ${selectedResume.file_name}
      
This is a placeholder for the actual resume content. In production, the resume file would be parsed and its content extracted for analysis.

For demonstration purposes, please imagine this contains the candidate's:
- Work experience
- Education
- Skills
- Projects
- Certifications`;

      const { data, error } = await supabase.functions.invoke('analyze-resume', {
        body: {
          resumeText,
          jobDescription: jobDescription || undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.analysis) throw new Error('No analysis returned');

      setAnalysisResult(data.analysis);

      // Save analysis to database
      if (candidateId) {
        await supabase.from('ai_resume_analyses').insert({
          candidate_id: candidateId,
          resume_id: selectedResumeId,
          job_description_text: jobDescription || null,
          match_score: data.analysis.match_score,
          matched_skills: data.analysis.matched_skills,
          missing_skills: data.analysis.missing_skills,
          recommendations: data.analysis.recommendations,
          full_analysis: data.analysis,
        });
      }

      toast.success('Analysis complete!');
    } catch (error: unknown) {
      console.error('Error analyzing resume:', error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Failed to analyze resume. Please try again.';
      toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent Match';
    if (score >= 60) return 'Good Match';
    if (score >= 40) return 'Partial Match';
    return 'Needs Improvement';
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
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-accent" />
            AI Resume Analysis
          </h1>
          <p className="text-muted-foreground mt-1">
            Get AI-powered feedback on your resume and job match
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Section */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Select Resume</CardTitle>
                <CardDescription>Choose which resume to analyze</CardDescription>
              </CardHeader>
              <CardContent>
                {resumes.length === 0 ? (
                  <div className="text-center py-4">
                    <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground">No resumes uploaded yet</p>
                    <Button variant="link" asChild className="mt-2">
                      <a href="/candidate/resumes">Upload a resume</a>
                    </Button>
                  </div>
                ) : (
                  <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a resume" />
                    </SelectTrigger>
                    <SelectContent>
                      {resumes.map((resume) => (
                        <SelectItem key={resume.id} value={resume.id}>
                          {resume.file_name} {resume.is_primary && '(Primary)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Job Description (Optional)</CardTitle>
                <CardDescription>
                  Paste a job description to see how well you match
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Paste the job description here..."
                  rows={8}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </CardContent>
            </Card>

            <Button 
              onClick={handleAnalyze} 
              disabled={isAnalyzing || !selectedResumeId}
              className="w-full"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Analyze Resume
                </>
              )}
            </Button>
          </div>

          {/* Results Section */}
          <div className="space-y-6">
            {analysisResult ? (
              <>
                {/* Score Card */}
                <Card className="border-primary">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className={`text-5xl font-bold ${getScoreColor(analysisResult.match_score)}`}>
                        {analysisResult.match_score}%
                      </div>
                      <p className="text-lg font-medium mt-1">
                        {getScoreLabel(analysisResult.match_score)}
                      </p>
                      <Progress 
                        value={analysisResult.match_score} 
                        className="mt-4 h-2"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-accent" />
                      Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{analysisResult.summary}</p>
                  </CardContent>
                </Card>

                {/* Matched Skills */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-success" />
                      Matched Skills ({analysisResult.matched_skills.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {analysisResult.matched_skills.map((skill, i) => (
                        <Badge key={i} variant="default" className="bg-success/10 text-success border-success/20">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Missing Skills */}
                {analysisResult.missing_skills.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-destructive" />
                        Missing Skills ({analysisResult.missing_skills.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {analysisResult.missing_skills.map((skill, i) => (
                          <Badge key={i} variant="outline" className="border-destructive/20 text-destructive">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysisResult.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-warning mt-1">•</span>
                          <span className="text-muted-foreground">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Ready to Analyze</h3>
                  <p className="text-muted-foreground text-center">
                    Select a resume and optionally add a job description, then click analyze to get AI-powered feedback.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
