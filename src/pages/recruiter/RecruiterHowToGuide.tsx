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
    title: 'Recruiter Dashboard',
    description: 'Your home base: metrics, recent activity, and quick links.',
    route: '/recruiter',
    overview:
      'The Recruiter Dashboard is your starting point after you sign in. It shows key metrics (e.g. open jobs, applicants, pipeline stages), recent activity, and quick links to post a job, view applicants, or open the talent pool. If you are an Account Manager, you can switch to Recruiter role and see your own recruiter dashboard with your jobs and pipelines. Data here is scoped to jobs you own (recruiter) or to the recruiter you are viewing as (AM).',
    steps: [
      'Open the Dashboard from the left menu (first item under Recruiter).',
      'Review the summary cards: open jobs, applicants, pipeline activity.',
      'Use the quick actions to post a job, go to My Applicants, or open Talent Pool.',
      'Click any recent-activity item to jump to the relevant job or candidate.',
    ],
  },
  {
    id: 'talent-pool',
    title: 'Talent Pool',
    description: 'Browse and manage the organization’s shared candidate profiles.',
    route: '/recruiter/talent-pool',
    overview:
      'The Talent Pool is shared across your organization. Every recruiter and Account Manager sees the same pool of candidate profiles. You can browse by group (e.g. by job, by source), search, filter by stage, and open a profile to view details, add to a shortlist, or start an engagement. Profiles are added when candidates apply, when you upload resumes (Upload button on this page), or when you add someone from Talent Search or Marketplace. Newly added candidates show stage **New** until you start an engagement; then they move to **Engaged** and pipeline stages. The stage shown is the same in the list row and in the detail drawer.',
    steps: [
      'Go to Talent Management → Talent Pool in the left menu.',
      'Use the list or grouped view to see candidates; filter or search by name, skills, source, or stage.',
      'Click a row to open the candidate detail sheet (resume, skills, experience, contact, stage).',
      'From the detail sheet you can add the candidate to a shortlist, start an engagement, or link them to a job.',
      'To add many candidates at once: click **Upload**, select one or more resume files; a status bar shows progress. You can Cancel to stop; already-uploaded candidates stay in the pool.',
    ],
  },
  {
    id: 'bulk-upload',
    title: 'Upload resumes from Talent Pool',
    description: 'Add many candidates at once by uploading resumes from the Talent Pool page.',
    route: '/recruiter/talent-pool',
    overview:
      'You can bulk-add candidates to the talent pool directly from the Talent Pool page. Click **Upload**, select one or more resume files (PDF or Word). The system parses each file and creates or updates a candidate profile in the background. A status bar on the same page shows progress per file (parsing, importing, done, or error). You can Cancel to stop further processing; candidates already imported remain in the pool. Each new upload run starts fresh (previous run’s status is cleared). New candidates appear with stage **New** until you start an engagement.',
    steps: [
      'Go to Talent Management → Talent Pool.',
      'Click **Upload** and select one or more resume files (PDF or Word).',
      'Watch the status bar for progress; use **Cancel** to stop, or **Dismiss** when done.',
      'New candidates appear in the list with stage **New**; open the Talent Pool to search or start engagement.',
    ],
  },
  {
    id: 'shortlists',
    title: 'Shortlists',
    description: 'Create and manage lists of candidates for a role or project.',
    route: '/recruiter/shortlists',
    overview:
      'Shortlists are named lists of candidates. You create a shortlist (e.g. “Senior React – Q1”), then add candidates from the Talent Pool, search results, or applicants. You can use shortlists to keep a running list for a role, share with a hiring manager, or move candidates into your engagement pipeline. Shortlists are scoped per recruiter: you see and manage your own shortlists; the candidates in the pool are still shared.',
    steps: [
      'Go to Talent Management → Shortlists.',
      'Create a new shortlist: give it a name and optional description.',
      'Add candidates from search or Talent Pool by opening the candidate and choosing “Add to shortlist”.',
      'Open a shortlist to view or remove candidates, or to start an engagement with someone on the list.',
    ],
  },
  {
    id: 'talent-search',
    title: 'Talent Search',
    description: 'Search the web or external sources and import candidates.',
    route: '/recruiter/talent-search/search',
    overview:
      'Talent Search lets you find candidates from external sources (e.g. web search, LinkedIn-style search) and bring them into your process. You run a search, review results, and then enrich or import selected profiles into your talent pool. This is useful for sourcing outside your existing pool. The search and import actions are tied to your user; any imported candidates become part of the org talent pool.',
    steps: [
      'Go to Talent Management → Talent Search.',
      'Enter search terms (role, skills, location) and run the search.',
      'Review results; open a result to see more details or to enrich the profile.',
      'Import or add selected candidates to your talent pool; they will appear in Talent Pool and can be shortlisted or engaged.',
    ],
  },
  {
    id: 'my-jobs',
    title: 'My Jobs',
    description: 'View and manage jobs you own (post, edit, close).',
    route: '/recruiter/jobs',
    overview:
      'My Jobs shows only the jobs you own as the recruiting owner. You can create a new job (Post a Job), edit an existing one, or close it. Each job has its own applicants and pipeline. If you are an Account Manager viewing as a recruiter, you see that recruiter’s jobs. Jobs are not shared: each recruiter sees only their own jobs, so your list is your responsibility.',
    steps: [
      'Go to Jobs → My Jobs in the left menu.',
      'View the list of your jobs; use filters or search by title or status.',
      'Click a job to open it, or click “Post a Job” to create a new one.',
      'From the job detail you can edit the job, view applicants, or open the applications pipeline for that job.',
    ],
  },
  {
    id: 'post-job',
    title: 'Post a New Job',
    description: 'Create a new job and publish it for applications.',
    route: '/recruiter/jobs/new',
    overview:
      'Post a New Job is the flow to create a job. The page has one heading at the top and a left-aligned form. You can paste a job description to auto-fill fields (Paste & Auto-Fill) or enter details manually. Enter title, description, location, job type, experience level, and optionally requirements, responsibilities, and skills. You can set visibility (public or private). Once saved and published, the job appears in My Jobs and candidates can apply (if public) or be linked via invite. You are set as the job owner, so it appears under My Jobs and its applicants under My Candidates.',
    steps: [
      'Go to Jobs → My Jobs, then **Post a Job** (or open **Post a New Job** from the menu).',
      'Optionally paste a job blurb and click **Extract fields**, or switch to **Manual** and fill the form.',
      'Fill in required fields: title, description, location, job type, experience level; add skills or other details as needed.',
      'Save as draft or publish; the job then appears in My Jobs and can accept applications or be shared by link.',
    ],
  },
  {
    id: 'applicants',
    title: 'My Candidates',
    description: 'See all applicants for your jobs in one place.',
    route: '/recruiter/candidates',
    overview:
      'My Candidates lists every candidate who has applied to any of your jobs. The page has one main section: the **My Candidates** heading, search and filters (job, status), and the list. You can filter by job or status and search by name or title. Each row shows the candidate, the job they applied to, and current status. Clicking a row opens the applicant detail where you can update status, add notes, or move them in the pipeline. This view is scoped to your jobs only; you do not see applicants for other recruiters’ jobs.',
    steps: [
      'Go to Jobs → My Applicants in the left menu.',
      'Use the search box and filters (job, status) to narrow the list.',
      'Click an applicant row to open the detail sheet (resume, timeline, status).',
      'Update status or add notes; changes are saved automatically.',
    ],
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    description: 'One pipeline for all candidates: applicants and engaged. Move by stage from Applied/Engaged to outcome.',
    route: '/recruiter/pipeline',
    overview:
      'The Pipeline (Jobs → Candidates Pipeline) shows all candidates for your jobs in one place. Candidates who applied via the job page start at **Applied**; candidates you add from the talent pool start at **New** until you start an engagement, then they appear at **Engaged**. Stages run from Applied/Engaged → RTR & rate → Document check → Screening → Submission → Outcome. You can drag and drop cards between stages, open a candidate for notes or status change, and filter by job. The page header aligns with other recruiter pages (no extra top spacing). Scoped to jobs you own; Account Managers can view a specific recruiter’s pipeline in oversight mode.',
    steps: [
      'Go to Pipelines → Pipelines.',
      'Select a job (or “All Jobs”) to see candidates by stage.',
      'Drag a candidate card to a new stage to update their status.',
      'Click a card to open the applicant detail for notes or full status change.',
    ],
  },
  {
    id: 'interviews',
    title: 'Interview Schedule',
    description: 'Schedule and track interviews for your jobs.',
    route: '/recruiter/interviews',
    overview:
      'The Interview Schedule page helps you manage interview scheduling for your jobs. You can see which applicants are in the interview stage, propose times, and track upcoming or past interviews. The page layout matches other recruiter pages (same title spacing). Calendar integration or meeting links may be available depending on configuration. All data is scoped to your jobs and your applicants.',
    steps: [
      'Go to Pipelines → Interviews.',
      'Filter by job or date to see scheduled or pending interviews.',
      'Click **Schedule Interview** or open an applicant to propose times or send a calendar invite.',
      'Mark interviews as completed or update status from the applicant detail.',
    ],
  },
  {
    id: 'ai-agents',
    title: 'AI Agents',
    description: 'Configure AI agents to recommend candidates for your criteria.',
    route: '/recruiter/agents',
    overview:
      'AI Agents let you match candidates from the talent pool against job criteria. You create an agent (name and criteria), then click **Run** to analyze; the agent uses candidates already in your organization’s talent pool. You can view recommendations, approve or reject, and shortlist or contact candidates. Agents are owned by you; each recruiter has their own agents. If there are no candidates in the pool, Run will notify you—add candidates via Talent Pool (e.g. upload or import) first. The page has one main section: heading, Create Agent, and your agents list with Run and recommendations.',
    steps: [
      'Go to Automation → AI Agents.',
      'Click **Create Agent**: name it and set search criteria (e.g. job, skills, location).',
      'Click **Run** on an agent to analyze candidates from the talent pool; review recommendations.',
      'Approve or reject recommendations; shortlist or contact candidates from the recommendations list.',
    ],
  },
  {
    id: 'data-scoping',
    title: 'How data is scoped (Recruiter vs AM)',
    description: 'What you see: shared talent pool vs your own jobs and pipelines.',
    route: '/recruiter',
    overview:
      'Talent Management (Talent Pool with in-page Upload, Shortlists, Talent Search) is shared across the organization: all recruiters and Account Managers see the same pool of candidates. Jobs (My Jobs, Post a Job, My Applicants), Pipelines, and Automation (AI Agents) are per recruiter: you see only jobs you own, applicants to your jobs, and your own pipeline. When an Account Manager switches to Recruiter role, they see their own recruiter data. AMs can use a “view as” or “recruiter” filter to see a specific recruiter’s pipeline or progress when in oversight mode.',
    steps: [
      'Talent Management (Talent Pool, Shortlists, Talent Search): shared; everyone in the org sees the same candidates.',
      'Jobs (My Jobs, Post a Job, My Applicants): only jobs you own and their applicants.',
      'Pipelines (Pipelines, Interviews): only your pipeline and interviews.',
      'Automation (AI Agents): only your agents.',
      'As an AM, switch role to Recruiter to see your own recruiter dashboard; use oversight views to see a specific recruiter’s progress.',
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

const HELP_CHAT_STORAGE_KEY = 'talentmatch-help-chat-recruiter-messages';

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

export default function RecruiterHowToGuide() {
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
          audience: 'recruiter',
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = data as { message?: string; error?: string } | null;
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
      <div className="flex flex-col h-[calc(100vh-7rem)] min-h-0 overflow-hidden max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <header className="shrink-0 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20">
                  <BookOpen className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Help & <span className="text-gradient-recruiter">How-to Guide</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Step-by-step guides for recruiters and account managers. Search below or ask the assistant.
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search the guide (e.g. talent pool, pipeline, shortlist, applicants)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-recruiter/20 font-sans"
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
                      No topics match your search. Try different words (e.g. talent pool, pipeline, applicants).
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
                          isExpanded ? 'border-recruiter/20 bg-recruiter/5' : 'border-border bg-card'
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
                              className="shrink-0 rounded-lg p-2 text-recruiter hover:bg-recruiter/10 border border-recruiter/20"
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
            <div className="shrink-0 flex items-center justify-between gap-2 p-4 border-b border-recruiter/10 bg-recruiter/5">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-recruiter" strokeWidth={1.5} />
                <h2 className="text-lg font-display font-bold text-foreground">Chat with assistant</h2>
              </div>
              {chatMessages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChatMessages([])}
                  disabled={chatLoading}
                  className="shrink-0 h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-recruiter/10 font-sans text-xs"
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
                      Ask how to do something (e.g. &quot;How do I add candidates to the talent pool?&quot; or &quot;Where do I see my applicants?&quot;). I’ll use the guide to answer.
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
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-recruiter/10 border border-recruiter/20 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-recruiter" strokeWidth={1.5} />
                        </div>
                      )}
                      <div
                        className={cn(
                          'rounded-xl px-4 py-2.5 max-w-[85%] text-sm font-sans',
                          m.role === 'user'
                            ? 'bg-recruiter/10 border border-recruiter/20 text-foreground'
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
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-recruiter/10 border border-recruiter/20 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 text-recruiter animate-spin" strokeWidth={1.5} />
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
                  className="flex-1 h-11 rounded-lg border-border focus:ring-2 focus:ring-recruiter/20 font-sans"
                />
                <Button
                  onClick={sendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="shrink-0 h-11 rounded-lg border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter"
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
