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
    title: 'Manager Dashboard',
    description: 'Organization-wide overview: activity, team, and key metrics.',
    route: '/manager',
    overview:
      'The Manager Dashboard gives you a bird’s-eye view of your organization’s recruiting activity. You see high-level metrics (e.g. open jobs, applications, pipeline movement), recent activity across the org, and quick links to Team, Jobs, or Audit Logs. As a hiring manager or Account Manager you use this to monitor overall health and drill into specific recruiters or jobs. Account Managers can also switch to Recruiter role to do hands-on recruiting; when in Manager role you see org-wide data.',
    steps: [
      'Open the Manager Dashboard from the left menu (first item when in Manager or Account Manager role).',
      'Review the summary cards and any charts or recent-activity list.',
      'Use the quick links to go to Team, Jobs Overview, Analytics, or Audit Logs.',
      'Click through to a specific area (e.g. a recruiter’s progress or a job) for details.',
    ],
  },
  {
    id: 'analytics-removed',
    title: 'Analytics (on Dashboard)',
    description: 'Pipeline and metrics are now on the Manager Dashboard.',
    route: '/manager',
    overview:
      'Analytics provides reports and visualizations on your organization’s recruiting performance: applications over time, time-to-fill, pipeline conversion, source effectiveness, recruiter activity, and more. Data is scoped to your organization so you can compare jobs, recruiters, or periods. Use it to spot trends, allocate resources, or report to leadership. Filters typically let you narrow by date range, job, or recruiter.',
    steps: [
      'Go to Analytics from the left menu.',
      'View Pipeline funnel and Applications (last 30d) with trend on the Dashboard.',
      'Apply date range or filters as needed.',
      'Needs attention and invite codes are also on the Dashboard.',
    ],
  },
  {
    id: 'team',
    title: 'Team Management',
    description: 'View recruiters and account managers; assign and manage team structure.',
    route: '/manager/team',
    overview:
      'Team Management shows everyone in your organization with a recruiter or account-manager role. You can see who is on the team, what roles they have, and (depending on setup) assign account managers to recruiters or clients. You can invite new recruiters or managers via email; they receive an invite link and complete signup. This is also where you may assign which recruiters an Account Manager oversees, so that the AM can view that recruiter’s pipeline or progress.',
    steps: [
      'Go to Team from the left menu.',
      'View the list of recruiters and account managers; use search or filters if available.',
      'To invite someone: use the invite action, enter email and role (recruiter or account manager), and send.',
      'Open a team member to edit role, assign AM-to-recruiter oversight, or deactivate if supported.',
    ],
  },
  {
    id: 'recruiter-progress',
    title: 'Recruiter Progress (view as)',
    description: 'See a specific recruiter’s pipeline and activity (AM oversight).',
    route: '/manager/team',
    overview:
      'When you are an Account Manager (or manager with oversight), you can “view as” a specific recruiter to see their pipeline, jobs, and applicants as they see it. This is called Recruiter Progress or “view as recruiter.” You select a recruiter from the team; the system then shows that recruiter’s Pipeline or related views so you can coach or audit without taking over their account. Data is read-only in this mode; you are observing, not acting as that user.',
    steps: [
      'Go to Team from the left menu.',
      'Find the recruiter you want to oversee and open their profile or “View progress” (or equivalent).',
      'You may be taken to a view that shows their jobs, pipeline, or engagements.',
      'Use the pipelines or job list to see their activity; switch back to your own view when done.',
    ],
  },
  {
    id: 'jobs-overview',
    title: 'Jobs Overview',
    description: 'See all jobs across the organization (all recruiters).',
    route: '/manager/jobs',
    overview:
      'Jobs Overview lists every job in your organization, regardless of which recruiter owns it. You can see job title, status, recruiter owner, application count, and open/closed state. Use it to ensure coverage, balance workload, or report on all open roles. You can typically filter by recruiter, status, or date. Clicking a job may take you to the job detail or applicants (depending on permissions).',
    steps: [
      'Go to Jobs Overview from the left menu.',
      'Review the list; use filters (recruiter, status, date) to narrow.',
      'Click a job to see detail or applicants.',
      'Use this view to assign or reassign jobs if your org supports it.',
    ],
  },
  {
    id: 'candidates',
    title: 'Candidates (Manager view)',
    description: 'View org-linked candidates and applications across recruiters.',
    route: '/manager/candidates',
    overview:
      'The Manager Candidates (or Candidates) page shows candidates who are linked to your organization—e.g. they applied to a job, were added to the talent pool, or were engaged by a recruiter. You may see applications across all jobs and recruiters, with filters by job, recruiter, or status. This is useful for ensuring no candidate falls through the cracks or for cross-recruiter reporting. Account Managers may have the same view to see candidates in the org.',
    steps: [
      'Go to Candidates (or the equivalent in the manager nav) from the left menu.',
      'Use filters by job, recruiter, or status to find the right set.',
      'Click a candidate to see their profile, applications, and timeline.',
      'Export or report on the list if the option is available.',
    ],
  },
  {
    id: 'clients',
    title: 'Client Management',
    description: 'Manage client accounts and link them to recruiters or jobs.',
    route: '/manager/clients',
    overview:
      'Client Management lets you define and manage client accounts (e.g. hiring companies or departments) that your organization serves. You can add clients, assign account managers or recruiters to them, and optionally link jobs to clients for reporting. This is useful for agencies or teams that serve multiple internal or external “clients” and need to track which recruiter or AM is responsible for which account.',
    steps: [
      'Go to Clients from the left menu.',
      'View the list of clients; add a new client with name and optional details.',
      'Assign an Account Manager or recruiter to a client if your setup supports it.',
      'Link jobs to clients if you use client-based reporting.',
    ],
  },
  {
    id: 'organization',
    title: 'Organization Settings',
    description: 'Org-wide settings, branding, and invite codes.',
    route: '/manager/organization',
    overview:
      'Organization Settings hold org-level configuration: organization name, branding (e.g. logo or theme), invite codes for recruiters or candidates, and other tenant-wide options. Only users with manager or org-admin permissions can change these. Invite codes may control who can sign up as a recruiter or join the org. Changes here apply to the whole organization.',
    steps: [
      'Go to Organization from the left menu.',
      'Edit organization name, logo, or other branding if needed.',
      'Create or manage invite codes for recruiters or candidates.',
      'Save changes; they apply org-wide.',
    ],
  },
  {
    id: 'audit-logs',
    title: 'Audit Logs',
    description: 'View a history of important actions for compliance and debugging.',
    route: '/manager/audit-logs',
    overview:
      'Audit Logs record who did what and when: job created, application status changed, candidate added to pool, invite sent, etc. You can filter by date range, user, action type, or entity (e.g. a specific job or candidate). Use this for compliance, troubleshooting, or understanding how the org uses the platform. Logs are typically read-only; only certain roles (e.g. manager, org admin) can access them.',
    steps: [
      'Go to Audit Logs from the left menu.',
      'Set the date range (e.g. last 7 days or custom range).',
      'Optionally filter by user, action type, or entity.',
      'Review the list; click an entry for more detail if available. Use “Load older logs” to fetch more history.',
    ],
  },
  {
    id: 'am-vs-recruiter',
    title: 'Account Manager vs Recruiter',
    description: 'How AM and Recruiter roles differ and when to switch.',
    route: '/manager',
    overview:
      'Account Managers (AMs) have an oversight role: they see org-wide data (team, jobs overview, analytics, audit logs, candidates) and can “view as” a specific recruiter to see that recruiter’s pipeline and progress. They do not, by default, see only their own jobs or pipelines—they see the whole org. When an AM switches to Recruiter role (same account, role switch in the UI), they then see only their own recruiter data: their jobs, their applicants, their pipelines, their outreach. The talent pool stays shared. So: use Manager/AM role for oversight and reporting; use Recruiter role for hands-on recruiting.',
    steps: [
      'When signed in as Account Manager, the left menu shows Manager pages: Dashboard, Team, Jobs Overview, Analytics, Clients, Organization, Audit Logs.',
      'Use “Switch role” (or profile menu) to switch to Recruiter; the menu changes to Recruiter pages (My Jobs, Talent Pool, Pipelines, etc.).',
      'In Recruiter role you see only your own jobs, applicants, pipelines, and campaigns; the talent pool is still shared.',
      'Switch back to Manager/AM when you need org-wide views or to view a specific recruiter’s progress.',
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

const HELP_CHAT_STORAGE_KEY = 'talentmatch-help-chat-manager-messages';

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

export default function ManagerHowToGuide() {
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
          audience: 'manager',
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
                <div className="p-2 rounded-xl bg-manager/10 text-manager border border-manager/20">
                  <BookOpen className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">
                  Help & <span className="text-gradient-manager">How-to Guide</span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans">
                Step-by-step guides for managers and account managers. Search below or ask the assistant.
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <Input
              placeholder="Search the guide (e.g. team, audit, recruiter progress, analytics)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-lg border-border bg-background focus:ring-2 focus:ring-manager/20 font-sans"
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
                      No topics match your search. Try different words (e.g. team, audit, recruiter).
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
                          isExpanded ? 'border-manager/20 bg-manager/5' : 'border-border bg-card'
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
                              className="shrink-0 rounded-lg p-2 text-manager hover:bg-manager/10 border border-manager/20"
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
            <div className="shrink-0 flex items-center justify-between gap-2 p-4 border-b border-manager/10 bg-manager/5">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-manager" strokeWidth={1.5} />
                <h2 className="text-lg font-display font-bold text-foreground">Chat with assistant</h2>
              </div>
              {chatMessages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChatMessages([])}
                  disabled={chatLoading}
                  className="shrink-0 h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-manager/10 font-sans text-xs"
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
                      Ask how to do something (e.g. &quot;How do I view a recruiter’s pipeline?&quot; or &quot;Where are audit logs?&quot;). I’ll use the guide to answer.
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
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-manager/10 border border-manager/20 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-manager" strokeWidth={1.5} />
                        </div>
                      )}
                      <div
                        className={cn(
                          'rounded-xl px-4 py-2.5 max-w-[85%] text-sm font-sans',
                          m.role === 'user'
                            ? 'bg-manager/10 border border-manager/20 text-foreground'
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
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-manager/10 border border-manager/20 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 text-manager animate-spin" strokeWidth={1.5} />
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
                  className="flex-1 h-11 rounded-lg border-border focus:ring-2 focus:ring-manager/20 font-sans"
                />
                <Button
                  onClick={sendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="shrink-0 h-11 rounded-lg border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager"
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
