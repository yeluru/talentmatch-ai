import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  BookOpen,
  Search,
  MessageCircle,
  Send,
  Loader2,
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

export type GuideSection = {
  id: string;
  title: string;
  description: string;
  overview: string;
  route: string;
  steps: string[];
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'dashboard',
    title: 'Your dashboard',
    description: 'Your home base: see what’s next and jump to key actions.',
    route: '/candidate',
    overview:
      'The Dashboard is your starting point after you sign in. It shows a quick greeting, a suggested next step (such as completing your profile, adding a resume, or finding jobs), and your most recent applications. You can use it to see at a glance what to do next and to open Profile, Resume analysis, or Job Alerts with one click.',
    steps: [
      'Open the Dashboard from the left menu to see a greeting and your recent activity.',
      'Use the suggested next step (e.g. complete profile, add a resume, find jobs) to know what to do next.',
      'Check your recent applications and use quick links to go to Profile, Resume analysis, or Job alerts.',
    ],
  },
  {
    id: 'profile',
    title: 'My profile',
    description: 'Your professional snapshot that recruiters and job matching use.',
    route: '/candidate/profile',
    overview:
      'Your profile is the main place recruiters and the platform use to understand who you are and what you’re looking for. The more complete it is, the better you show up in searches and job matches. You can add your contact details, a headline and summary, your current role and experience, where you want to work, what type of job you want, whether you’re open to relocating, and your skills. The page shows a completeness score and a checklist so you know what’s missing.',
    steps: [
      'Go to My Profile from the left menu.',
      'Fill in your contact info (name, phone, LinkedIn, GitHub).',
      'Add a headline and short summary about yourself.',
      'Set your current job title and company, and how many years of experience you have.',
      'Choose your desired job types and locations, and say if you are open to relocating.',
      'Add or remove skills. The more skills you add, the better your profile completeness.',
      'Click Save at the bottom when you are done.',
    ],
  },
  {
    id: 'resumes',
    title: 'Upload and manage resumes',
    description: 'Store and organize your resumes so you can apply and use resume tools.',
    route: '/candidate/resumes',
    overview:
      'Before you can apply to jobs or use tools like ATS Checkpoint and Resume Workspace, you need at least one resume on file. This page is where you upload PDF or Word resumes. The system automatically reads and stores the content so it can be used for applications and analysis. You can keep multiple resumes (e.g. one per role type), choose which one is “primary” for applications, and download or delete any of them. There is also a shortcut to send a resume into Resume Workspace for tailoring.',
    steps: [
      'Go to My Resumes from the left menu.',
      'Click to upload a resume (PDF or Word). The system will read it and save the content.',
      'Your first upload is set as your primary resume. You can change which one is primary anytime.',
      'You can download or delete a resume. Use "Use in Workspace" to open it in Resume Workspace.',
    ],
  },
  {
    id: 'resume-workspace',
    title: 'Resume Workspace',
    description: 'Tailor your resume to a specific job and get ATS-style feedback.',
    route: '/candidate/resume-workspace',
    overview:
      'Resume Workspace helps you adapt your resume for a particular job. You pick one of your saved resumes and a target job (from the list or by pasting a job description). The tool then generates a tailored version that highlights relevant experience and wording. You can save that version and download it as a Word file to use when applying. The workspace also shows ATS-style insights so you can see how the tailored resume might perform and what to tweak further.',
    steps: [
      'Open Resume Workspace from the left menu.',
      'Pick a base resume and a target job (or paste a job description).',
      'Click Tailor to get a version of your resume tuned for that job.',
      'You can save the tailored version and download it as a Word file.',
      'Use the ATS-style insights to see what to improve.',
    ],
  },
  {
    id: 'ats-checkpoint',
    title: 'ATS Checkpoint (resume vs job analysis)',
    description: 'See how well your resume matches a job and what’s missing.',
    route: '/candidate/ai-analysis',
    overview:
      'ATS Checkpoint uses AI to compare your resume against a job description and tell you how strong the match is. You get a score, a list of skills that match and skills the job wants but your resume doesn’t clearly show, plus short recommendations and a summary. This helps you decide what to add or rephrase before you apply. You can use one of your saved resumes and either select a job from the platform or paste any job description. The result is for your eyes only—it’s to guide you, not to grade you for the employer.',
    steps: [
      'Go to ATS Checkpoint from the left menu.',
      'Select one of your resumes and either pick a job from the list or paste a job description.',
      'Click Run Analysis. You will get a match score and a list of matched and missing skills.',
      'Read the recommendations and summary to improve your resume or application.',
    ],
  },
  {
    id: 'find-jobs',
    title: 'Find and browse jobs',
    description: 'Search and filter jobs, then open full details.',
    route: '/candidate/jobs',
    overview:
      'Find Jobs is where you see roles that are open for applications. You can search by keyword and filter by location, experience level, job type, and whether the job is remote. Some jobs are public (visible to all signed-in candidates) and some are private (only visible once you’re linked to that company, for example after you apply to one of their jobs). Clicking a job card opens the full description so you can decide whether to apply.',
    steps: [
      'Go to Find Jobs from the left menu.',
      'Use the search box and filters (location, experience level, job type, remote) to narrow results.',
      'Click a job card to open the full job details.',
      'Public jobs are visible to everyone. Some jobs are only visible if you are linked to that company (e.g. after you apply).',
    ],
  },
  {
    id: 'apply',
    title: 'Apply to a job',
    description: 'Submit your application with a resume and optional cover letter.',
    route: '/candidate/jobs',
    overview:
      'Applying is done from the job’s detail page. You choose which of your saved resumes to attach and can add a cover letter if you want. When you submit, the system creates an application record so the employer can see you in their pipeline. If you’ve already applied to that job, you’ll see an “Already applied” state instead of the apply button, so you don’t send a duplicate.',
    steps: [
      'Open a job from Find Jobs and go to its detail page.',
      'Choose which resume to use for this application.',
      'Optionally add a cover letter.',
      'Click Apply. If you already applied, you will see an "Already applied" state.',
    ],
  },
  {
    id: 'applications',
    title: 'Track your applications',
    description: 'See every application you’ve submitted and its current status.',
    route: '/candidate/applications',
    overview:
      'My Applications is your list of all jobs you’ve applied to through this platform. Each row shows the job and the current status (e.g. applied, reviewing, interviewing, closed). You can switch between All, Active, and Closed to focus on applications that are still in progress or already finished. Clicking a row takes you to the job details so you can review what you applied to or check for updates.',
    steps: [
      'Go to My Applications from the left menu.',
      'Use the tabs: All, Active, or Closed to filter applications.',
      'Each row shows the job and current status (e.g. applied, reviewing, interviewing).',
      'Click a row to open the job details.',
    ],
  },
  {
    id: 'job-alerts',
    title: 'Job alerts',
    description: 'Get email when new jobs match your criteria.',
    route: '/candidate/job-alerts',
    overview:
      'Job Alerts save you from having to check the job board every day. You create an alert by giving it a name and defining what you’re looking for: keywords, locations, job types, and how often you want emails (instant, daily digest, or weekly). When a new job is posted that matches, you get an email. You can create several alerts (e.g. one per role type or location), and you can edit them or turn them on or off at any time.',
    steps: [
      'Go to Job Alerts from the left menu.',
      'Click Create New Alert and give it a name.',
      'Add keywords, locations, and job types. Choose how often you want emails (instant, daily, or weekly).',
      'You can edit or turn alerts on or off anytime.',
    ],
  },
  {
    id: 'engagements',
    title: 'Respond to recruiter outreach',
    description: 'Reply to rate confirmations, offers, and other requests from recruiters.',
    route: '/candidate/engagements',
    overview:
      'Sometimes a recruiter will send you an engagement request—for example to confirm a rate, discuss a role, or make an offer. When they do, you’ll get a link to a page where you can see the full request. You can respond by accepting, rejecting, or (where it applies) countering, and you can add a short message. Your response updates the status on the recruiter’s side so they know your answer and can move to the next step.',
    steps: [
      'If a recruiter sends you an engagement request, you will get a link to view it.',
      'Open the request to see the details (e.g. rate confirmation, offer).',
      'You can Accept, Reject, or Counter (for rate or offer) and add an optional message.',
      'Your response updates the stage so the recruiter knows where things stand.',
    ],
  },
  {
    id: 'privacy',
    title: 'Control who can discover your profile',
    description: 'Choose whether recruiters can find you in the talent marketplace.',
    route: '/settings',
    overview:
      'When you’re “discoverable,” recruiters can find your profile when they search the talent marketplace or browse candidates. You can turn this on or off in Settings under the Privacy tab. When the switch is on, your profile may appear in those searches. When it’s off, your profile is not shown in the marketplace; only recruiters you’ve applied to or who have a direct link to your profile can see it. You can change this setting anytime.',
    steps: [
      'Go to Settings (from the menu under your avatar) and open the Privacy tab.',
      'Use the switch "Allow recruiters to discover my profile". When it is on, your profile can appear in recruiter search and marketplace.',
      'When it is off, only recruiters you apply to or who have your link can see your profile.',
    ],
  },
  {
    id: 'settings',
    title: 'Account settings',
    description: 'Notifications, appearance, and security in one place.',
    route: '/settings',
    overview:
      'Settings is where you manage your account preferences. The Profile tab lets you update the basic info (name, phone, location, LinkedIn) that’s stored in your account. Notifications control whether you get email or browser notifications and how often you get job alert digests. Appearance lets you switch between light, dark, or system theme and set your language. Security is where you can reset your password or sign out other devices. Candidates also have a Privacy tab to control profile discoverability.',
    steps: [
      'Open Settings from the menu under your avatar.',
      'In Profile, update your name, phone, location, and LinkedIn if needed.',
      'In Notifications, turn email or push notifications on or off, and set job alert frequency.',
      'In Appearance, choose light, dark, or system theme and your language.',
      'In Security, you can reset your password or sign out other sessions.',
    ],
  },
];

function buildGuideContext(sections: GuideSection[]): string {
  return sections
    .map(
      (s) =>
        `## ${s.title}\n${s.description}\n\nOverview: ${s.overview}\n\nSteps:\n${s.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}\n(Link: ${s.route})`
    )
    .join('\n\n');
}

const GUIDE_CONTEXT = buildGuideContext(GUIDE_SECTIONS);

const HELP_CHAT_STORAGE_KEY = 'talentmatch-help-chat-messages';

function loadStoredMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
  try {
    const raw = localStorage.getItem(HELP_CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m: unknown): m is { role: 'user' | 'assistant'; content: string } =>
        typeof m === 'object' &&
        m !== null &&
        ((m as { role?: string }).role === 'user' || (m as { role?: string }).role === 'assistant') &&
        typeof (m as { content?: unknown }).content === 'string'
    );
  } catch {
    return [];
  }
}

function saveMessages(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  try {
    if (messages.length === 0) {
      localStorage.removeItem(HELP_CHAT_STORAGE_KEY);
    } else {
      localStorage.setItem(HELP_CHAT_STORAGE_KEY, JSON.stringify(messages));
    }
  } catch {
    // ignore
  }
}

export default function CandidateHowToGuide() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(GUIDE_SECTIONS[0]?.id ?? null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>(loadStoredMessages);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    saveMessages(chatMessages);
  }, [chatMessages]);

  const filteredSections = useMemo(() => {
    if (!search.trim()) return GUIDE_SECTIONS;
    const q = search.trim().toLowerCase();
    return GUIDE_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.overview.toLowerCase().includes(q) ||
        s.steps.some((step) => step.toLowerCase().includes(q))
    );
  }, [search]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    setChatLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        toast.error('Please sign in again to use the chat.');
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Your session may have expired. Please refresh the page or sign in again.' },
        ]);
        setChatLoading(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke('candidate-help-chat', {
        body: {
          messages: [
            ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: text },
          ],
          guideContext: GUIDE_CONTEXT,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = data as { message?: string; error?: string } | null;
      // Server may return 200 with { error } or 5xx with body in data depending on client
      const serverErrorBody = payload?.error ?? (error as { context?: { body?: { error?: string } } })?.context?.body?.error;
      if (serverErrorBody) throw new Error(serverErrorBody);
      if (error) throw error;
      const reply = payload?.message ?? "I couldn't answer that. Please try again.";
      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: unknown) {
      const err = e as { message?: string };
      const serverError = err?.message;
      console.error('Help chat error:', e);
      toast.error(serverError || 'Failed to get a response. Please try again.');
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: serverError ? `Error: ${serverError}` : "Sorry, I couldn't process that. Please try again in a moment." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-7rem)] min-h-0 overflow-hidden max-w-[1600px] mx-auto w-full">
        <header className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <BookOpen className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Help & <span className="text-gradient-candidate">How-to Guide</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Simple steps for everything you can do here. Search below or ask the assistant.
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search the guide (e.g. resume, apply, profile, alerts)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-blue-500/20 font-sans"
            />
          </div>
        </header>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 pt-6 overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 min-h-0 pr-4">
              <div className="space-y-4 pb-6">
                {filteredSections.length === 0 ? (
                  <Card className="rounded-xl border border-border bg-card">
                    <CardContent className="p-6 font-sans text-muted-foreground">
                      No topics match your search. Try different words (e.g. profile, resume, apply).
                    </CardContent>
                  </Card>
                ) : (
                  filteredSections.map((section) => {
                    const isExpanded = expandedId === section.id;
                    return (
                      <Card
                        key={section.id}
                        className={cn(
                          'rounded-xl border transition-all',
                          isExpanded ? 'border-blue-500/20 bg-blue-500/5' : 'border-border bg-card'
                        )}
                      >
                        <CardHeader
                          className="cursor-pointer p-6 border-b border-border/50"
                          onClick={() => setExpandedId(isExpanded ? null : section.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 mt-0.5 text-muted-foreground">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5" strokeWidth={1.5} />
                              ) : (
                                <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-lg font-display font-bold text-foreground">
                                {section.title}
                              </CardTitle>
                              <CardDescription className="mt-1 font-sans text-muted-foreground">
                                {section.description}
                              </CardDescription>
                            </div>
                            <Link
                              to={section.route}
                              onClick={(e) => e.stopPropagation()}
                              className="shrink-0 rounded-lg p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 border border-blue-500/20"
                              title="Go to this page"
                            >
                              <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                            </Link>
                          </div>
                        </CardHeader>
                        {isExpanded && (
                          <CardContent className="p-6 pt-4 space-y-5">
                            <p className="font-sans text-foreground text-sm sm:text-base leading-relaxed">
                              {section.overview}
                            </p>
                            <div>
                              <h4 className="text-sm font-display font-bold text-foreground mb-2">Steps</h4>
                              <ol className="list-decimal list-inside space-y-2 font-sans text-foreground">
                                {section.steps.map((step, i) => (
                                  <li key={i} className="text-sm sm:text-base">
                                    {step}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <aside className="w-full lg:w-[380px] shrink-0 flex flex-col min-h-[320px] lg:min-h-0 lg:h-full rounded-xl border border-border bg-card overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-2 p-4 border-b border-blue-500/10 bg-blue-500/5">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-blue-500" strokeWidth={1.5} />
                <h2 className="text-lg font-display font-bold text-foreground">Chat with assistant</h2>
              </div>
              {chatMessages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChatMessages([])}
                  disabled={chatLoading}
                  className="shrink-0 h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-blue-500/10 font-sans text-xs"
                  title="Clear chat"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" strokeWidth={1.5} />
                  Clear
                </Button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <ScrollArea className="flex-1 min-h-0 p-4">
                <div className="space-y-4">
                {chatMessages.length === 0 && (
                  <p className="text-sm text-muted-foreground font-sans">
                    Ask how to do something (e.g. &quot;How do I add a resume?&quot; or &quot;Where do I turn off job alerts?&quot;). I’ll use the guide to answer.
                  </p>
                )}
                {chatMessages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex gap-3',
                      m.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {m.role === 'assistant' && (
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-blue-500" strokeWidth={1.5} />
                      </div>
                    )}
                    <div
                      className={cn(
                        'rounded-xl px-4 py-2.5 max-w-[85%] text-sm font-sans',
                        m.role === 'user'
                          ? 'bg-blue-500/10 border border-blue-500/20 text-foreground'
                          : 'bg-muted/50 border border-border text-foreground'
                      )}
                    >
                      {m.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-headings:font-display prose-headings:font-bold max-w-none">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        m.content
                      )}
                    </div>
                    {m.role === 'user' && (
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin" strokeWidth={1.5} />
                    </div>
                    <div className="rounded-xl px-4 py-2.5 bg-muted/50 border border-border text-sm font-sans text-muted-foreground">
                      Thinking...
                    </div>
                  </div>
                )}
                </div>
              </ScrollArea>
            </div>
            <div className="shrink-0 p-4 border-t border-border bg-card">
              <div className="flex gap-2">
                <Input
                  placeholder="Ask how to..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  disabled={chatLoading}
                  className="flex-1 h-11 rounded-lg border-border focus:ring-2 focus:ring-blue-500/20 font-sans"
                />
                <Button
                  onClick={sendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="shrink-0 h-11 rounded-lg border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                >
                  {chatLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Send className="h-4 w-4" strokeWidth={1.5} />
                  )}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
