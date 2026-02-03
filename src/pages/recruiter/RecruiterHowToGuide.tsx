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
      'The Talent Pool is shared across your organization. Every recruiter and Account Manager sees the same pool of candidate profiles. You can browse by group (e.g. by job, by source), search, and open a profile to view details, add to a shortlist, or start an engagement. Profiles are added when candidates apply, when you bulk-upload resumes, or when you add someone from Talent Search or Marketplace. You do not own individual profiles; the pool is one shared repository.',
    steps: [
      'Go to Talent Management → Talent Pool in the left menu.',
      'Use the list or grouped view to see candidates; filter or search by name, skills, or source.',
      'Click a row to open the candidate detail sheet (resume, skills, experience, contact).',
      'From the detail sheet you can add the candidate to a shortlist, start an engagement, or link them to a job.',
    ],
  },
  {
    id: 'bulk-upload',
    title: 'Bulk Upload Profiles',
    description: 'Upload many resumes at once to add candidates to the talent pool.',
    route: '/recruiter/talent-search/uploads',
    overview:
      'Bulk Upload lets you add many candidates to the organization’s talent pool in one go. You upload a batch of resumes (PDF or Word); the system parses each file and creates or updates a candidate profile. You can map columns if you upload a CSV with profile data. After upload, candidates appear in the Talent Pool and can be searched, shortlisted, or engaged. This is the fastest way to build the pool from a batch of files or a spreadsheet.',
    steps: [
      'Go to Talent Management → Bulk Upload Profiles (or Talent Search → uploads section).',
      'Choose to upload files (resumes) or a CSV. For resumes, select multiple PDF/Word files.',
      'Start the upload; the system parses each resume and creates profiles.',
      'Review any errors or duplicates; resolve duplicates if prompted.',
      'When done, go to Talent Pool to see the new candidates.',
    ],
  },
  {
    id: 'ats-match-search',
    title: 'ATS Match Search',
    description: 'Search candidates by skills and criteria with ATS-style matching.',
    route: '/recruiter/ats-match-search',
    overview:
      'ATS Match Search lets you find candidates in the talent pool (or marketplace) by skills, keywords, and other criteria. Results can be ranked by how well they match a job or a custom set of requirements. You can then shortlist or contact candidates directly. This is useful when you have a job in mind and want to see who in the pool best fits before opening the job or moving applicants.',
    steps: [
      'Go to Talent Management → ATS Match Search.',
      'Enter a job title or paste a job description; optionally add keywords, skills, or filters.',
      'Run the search; results show match scores and key details.',
      'Open a candidate to view full profile, or add several to a shortlist.',
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
    id: 'marketplace',
    title: 'Marketplace Profiles',
    description: 'Discover candidates who have opted in to recruiter discovery.',
    route: '/recruiter/marketplace',
    overview:
      'Marketplace Profiles are candidates who have opted in to be discoverable by recruiters. They are not necessarily in your talent pool yet; they have chosen to appear in marketplace search. You can search and filter by skills, location, and other criteria, then view profiles and invite or add them to your pool (e.g. by starting an engagement or adding to a shortlist). Only candidates who have allowed “recruiters to discover my profile” in their settings appear here.',
    steps: [
      'Go to Talent Management → Marketplace Profiles.',
      'Use search and filters to find candidates by skills, location, or keywords.',
      'Click a profile to view details; you can then start an engagement or add them to a shortlist.',
      'Starting an engagement typically creates a link between the candidate and your organization and opens the Engagement Pipeline.',
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
    id: 'api-integration',
    title: 'API Integration',
    description: 'Connect external ATS or sourcing tools via API.',
    route: '/recruiter/talent-search/api',
    overview:
      'The API Integration section explains how to connect external systems (e.g. an ATS, HRIS, or sourcing tool) to this platform via API. You can sync jobs, push candidates, or pull applications depending on the integration. This is typically used by admins or technical users to set up one-way or two-way sync so that recruiters see unified data in this platform.',
    steps: [
      'Go to Talent Management → API Integration.',
      'Follow the on-page instructions or docs to obtain API keys and endpoints.',
      'Configure your external system to call the platform’s APIs (e.g. create job, add candidate).',
      'Verify sync in the platform (e.g. new jobs or candidates appearing in Talent Pool or My Jobs).',
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
    title: 'Post a Job',
    description: 'Create a new job and publish it for applications.',
    route: '/recruiter/jobs/new',
    overview:
      'Post a Job is the flow to create a new job. You enter the job title, description, location, job type, experience level, and optionally salary or other fields. You can set visibility (e.g. public or private). Once saved and published, the job appears in My Jobs and candidates can apply (if public) or be linked via invite. You are set as the job owner (recruiter), so it appears under My Jobs and its applicants under My Applicants.',
    steps: [
      'Go to Jobs → Post a Job (or My Jobs → Create / Post a Job).',
      'Fill in required fields: title, description, location, job type, experience level.',
      'Add optional details (salary range, benefits, team) and set visibility (public/private).',
      'Save and publish; the job then appears in My Jobs and can accept applications or be shared by link.',
    ],
  },
  {
    id: 'applicants',
    title: 'My Applicants',
    description: 'See all applicants for your jobs in one place.',
    route: '/recruiter/candidates',
    overview:
      'My Applicants lists every candidate who has applied to any of your jobs. You can filter by job, status, or date. Each row shows the candidate, the job they applied to, and current status (e.g. applied, reviewing, interviewing, offered). Clicking a row opens the applicant detail where you can update status, add notes, or move them in the pipeline. This view is scoped to your jobs only; you do not see applicants for other recruiters’ jobs.',
    steps: [
      'Go to Jobs → My Applicants in the left menu.',
      'Use the job filter or search to narrow to one job or status.',
      'Click an applicant row to open the detail sheet (resume, timeline, status).',
      'Update status (e.g. reviewing, interviewing, rejected) or add notes; changes are saved automatically.',
    ],
  },
  {
    id: 'ai-matching',
    title: 'AI Matching',
    description: 'Get AI-ranked candidates for a job from your pool or applicants.',
    route: '/recruiter/ai-matching',
    overview:
      'AI Matching takes a job (from your jobs or a pasted description) and ranks candidates—from your applicants or from the talent pool—by how well they fit. You see a list with match scores and short reasons. You can then shortlist or contact the top matches. This speeds up screening when you have many applicants or a large pool. Matching is run per job and uses the same AI model as other analysis features.',
    steps: [
      'Go to Jobs → AI Matching.',
      'Select one of your jobs or paste a job description.',
      'Choose to match against applicants for that job or against the talent pool.',
      'Run the match; review the ranked list and open or shortlist candidates.',
    ],
  },
  {
    id: 'applications-pipeline',
    title: 'Applications Pipeline',
    description: 'Manage applicants by stage (e.g. applied, screening, interview, offer).',
    route: '/recruiter/pipeline',
    overview:
      'The Applications Pipeline shows applicants for your jobs grouped by stage (e.g. applied, reviewing, interviewing, offered, rejected). You can drag and drop candidates between stages, open a candidate to update status or add notes, and see at a glance how many are in each stage. The pipeline is per job or across your jobs; either way it is scoped to jobs you own. Account Managers can view a specific recruiter’s pipeline when in oversight mode.',
    steps: [
      'Go to Pipelines → Applications Pipeline.',
      'Select a job (or “All my jobs”) to see applicants by stage.',
      'Drag a candidate card to a new stage to update their status.',
      'Click a card to open the applicant detail for notes or full status change.',
    ],
  },
  {
    id: 'engagement-pipeline',
    title: 'Engagement Pipeline',
    description: 'Manage outreach and engagement (rate confirmation, RTR, offer).',
    route: '/recruiter/engagements',
    overview:
      'The Engagement Pipeline tracks candidates you are actively engaging: rate confirmation, ready-to-recruit (RTR), screening, submission, or onboarding. You send engagement requests (e.g. rate, offer); candidates respond (accept, reject, counter). The pipeline is scoped to engagements you own (owner_user_id). You can move candidates between stages, send emails, and see who has responded. This is separate from the applications pipeline; it is for sourced or marketplace candidates you are nurturing.',
    steps: [
      'Go to Pipelines → Engagement Pipeline.',
      'View candidates by stage (rate confirmation, RTR, screening, etc.).',
      'Open a candidate to send or resend an engagement request (rate, offer) or to see their response.',
      'Update stage when the candidate responds or when you move them to the next step.',
    ],
  },
  {
    id: 'interviews',
    title: 'Interviews',
    description: 'Schedule and track interviews for your jobs.',
    route: '/recruiter/interviews',
    overview:
      'The Interviews page helps you manage interview scheduling for your jobs. You can see which applicants are in the “interview” stage, propose times, and track upcoming or past interviews. Calendar integration or meeting links may be available depending on configuration. All data is scoped to your jobs and your applicants.',
    steps: [
      'Go to Pipelines → Interviews.',
      'Filter by job or date to see scheduled or pending interviews.',
      'Open an applicant to propose times or send a calendar invite.',
      'Mark interviews as completed or update status from the applicant detail.',
    ],
  },
  {
    id: 'outreach',
    title: 'Outreach / Campaigns',
    description: 'Run email campaigns to candidates or prospects.',
    route: '/recruiter/outreach',
    overview:
      'Outreach (or Campaigns) lets you send bulk or templated emails to candidates—e.g. in your talent pool, on a shortlist, or from a search. You choose a template (or write ad hoc), select recipients, and send. Campaigns are owned by you; you see only your own campaigns and templates. This is useful for nurturing leads or inviting candidates to apply.',
    steps: [
      'Go to Communications → Outreach.',
      'Create a new campaign or choose an existing template.',
      'Select recipients (e.g. from a shortlist, pool, or search result).',
      'Edit the email content and send; track opens or replies if the system supports it.',
    ],
  },
  {
    id: 'email-templates',
    title: 'Email Templates',
    description: 'Create and reuse email templates for outreach and notifications.',
    route: '/recruiter/email-templates',
    overview:
      'Email Templates are reusable message bodies (and optionally subjects) that you use in outreach, engagement emails, or other flows. You create a template with placeholders (e.g. candidate name, job title); when you send, the system fills them in. Templates are per recruiter: you see and edit only your own. This keeps messaging consistent and saves time when sending many similar emails.',
    steps: [
      'Go to Communications → Email Templates.',
      'Create a new template: name, subject line, body; use placeholders like {{candidate_name}} or {{job_title}}.',
      'Save the template; it then appears in the template list when composing outreach or engagement emails.',
      'Edit or duplicate templates as needed from the templates list.',
    ],
  },
  {
    id: 'insights',
    title: 'Insights',
    description: 'View analytics and reports on your recruiting activity.',
    route: '/recruiter/insights',
    overview:
      'Insights (or Analytics) shows reports and charts on your recruiting activity: applications over time, time-to-fill, pipeline conversion, source effectiveness, etc. Data is scoped to your jobs and your pipelines so you can see your own performance. Use it to spot bottlenecks, compare jobs, or report to hiring managers.',
    steps: [
      'Go to Insights in the left menu.',
      'Choose a report or dashboard (e.g. applications by job, pipeline funnel).',
      'Use date range or filters to narrow the view.',
      'Export or share if the option is available.',
    ],
  },
  {
    id: 'ai-agents',
    title: 'AI Agents',
    description: 'Configure AI agents to recommend candidates for your criteria.',
    route: '/recruiter/agents',
    overview:
      'AI Agents are automated recommenders: you set criteria (e.g. skills, experience, location) and the agent periodically finds and ranks candidates from the pool or marketplace. You can enable or disable agents, view their recommendations, and then shortlist or contact candidates. Agents are owned by you; each recruiter has their own agents. Useful for ongoing sourcing without manual search every time.',
    steps: [
      'Go to Automation → AI Agents.',
      'Create an agent: name it and set search criteria (skills, job type, location, etc.).',
      'Save and turn the agent on; it will run on a schedule and produce recommendations.',
      'Open the recommendations list to review and act on suggested candidates.',
    ],
  },
  {
    id: 'data-scoping',
    title: 'How data is scoped (Recruiter vs AM)',
    description: 'What you see: shared talent pool vs your own jobs and pipelines.',
    route: '/recruiter',
    overview:
      'Talent Management (Talent Pool, Bulk Upload, Search, Marketplace, Shortlists, API) is shared across the organization: all recruiters and Account Managers see the same pool of candidates. Jobs, My Applicants, Applications Pipeline, Engagement Pipeline, Interviews, Outreach, Email Templates, and AI Agents are per recruiter: you see only jobs you own, applicants to your jobs, and your own pipelines and campaigns. When an Account Manager switches to Recruiter role, they see their own recruiter data (their jobs and pipelines), not every recruiter’s data. AMs can use a “view as” or “recruiter” filter to see a specific recruiter’s pipeline or progress when in oversight mode.',
    steps: [
      'Talent Pool, Marketplace, Bulk Upload, Talent Search: shared; everyone in the org sees the same candidates.',
      'My Jobs, Post a Job, My Applicants, AI Matching: only jobs you own and their applicants.',
      'Applications Pipeline, Engagement Pipeline, Interviews: only your pipelines and engagements.',
      'Outreach, Email Templates, AI Agents: only your campaigns, templates, and agents.',
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
      <div className="flex flex-col h-[calc(100vh-7rem)] min-h-0 overflow-hidden max-w-[1600px] mx-auto w-full">
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
