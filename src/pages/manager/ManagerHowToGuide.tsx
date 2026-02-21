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
      "The Manager Dashboard gives you a bird\'s-eye view of your organization\'s recruiting activity. You see high-level metrics (e.g. open jobs, applications, pipeline movement), recent activity across the org, and quick links to Team, Jobs, or Audit Logs. As a hiring manager or Account Manager you use this to monitor overall health and drill into specific recruiters or jobs. Account Managers can also switch to Recruiter role to do hands-on recruiting; when in Manager role you see org-wide data.",
    steps: [
      'Click on "Dashboard" in the left sidebar when signed in as Manager or Account Manager (it appears at the top of the navigation menu).',
      "Look at the top row of metric cards showing your organization\'s key numbers: total open jobs, total applications received, active candidates in the pipeline, and team size.",
      'Scroll down to view the Pipeline Funnel visualization, which shows how many candidates are at each stage (Engaged → Applied → RTR → Doc Check → Screening → Submission → Outcome).',
      'Check the "Applications (last 30 days)" chart to see the trend of new applications over time, with a percentage change indicator.',
      'Review the "Needs Attention" section for jobs or candidates that require immediate action (e.g., pending applications, stalled candidates).',
      'Use the quick action buttons or cards to navigate directly to Team Management, Jobs Overview, Analytics, or Audit Logs without going through the sidebar menu.',
      'If you see specific recruiters or jobs mentioned in activity feeds or alerts, click on them to drill down into detailed views.',
      'Return to the Dashboard anytime to refresh your understanding of overall organization health before making decisions.',
    ],
  },
  {
    id: 'analytics-removed',
    title: 'Analytics (on Dashboard)',
    description: 'Pipeline and metrics are now on the Manager Dashboard.',
    route: '/manager',
    overview:
      'Analytics provides reports and visualizations on your organization\'s recruiting performance: applications over time, time-to-fill, pipeline conversion, source effectiveness, recruiter activity, and more. Data is scoped to your organization so you can compare jobs, recruiters, or periods. Use it to spot trends, allocate resources, or report to leadership. Filters typically let you narrow by date range, job, or recruiter.',
    steps: [
      'Navigate to the Manager Dashboard (all analytics are now integrated into the main Dashboard view rather than a separate page).',
      'Locate the Pipeline Funnel chart on the Dashboard, which shows the conversion rate at each recruiting stage (how many candidates move from Engaged to Applied to RTR, etc.).',
      'View the Applications trend chart showing the last 30 days of activity, with a visual line graph and percentage change indicator to understand momentum.',
      'Check the "Needs Attention" section for actionable insights: jobs with no recent applications, candidates stuck in a stage for too long, or pending invites.',
      'Review invite codes section on the Dashboard if available, showing how many candidates signed up via each code (useful for tracking sourcing effectiveness).',
      'Use date range filters if provided to narrow analytics to specific time periods (e.g., last week, last quarter) for trend analysis or reporting.',
      'Export or screenshot the Dashboard metrics if you need to share performance reports with leadership or stakeholders.',
    ],
  },
  {
    id: 'team',
    title: 'Team Management',
    description: 'View recruiters and account managers; assign and manage team structure.',
    route: '/manager/team',
    overview:
      'Team Management shows everyone in your organization with a recruiter or account-manager role. You can see who is on the team, what roles they have, and (depending on setup) assign account managers to recruiters or clients. You can invite new recruiters or managers via email; they receive an invite link and complete signup. This is also where you may assign which recruiters an Account Manager oversees, so that the AM can view that recruiter\'s pipeline or progress.',
    steps: [
      'Click on "Team" or "Team Management" in the left sidebar menu to open the team list page.',
      'View the table or cards showing all team members, including their name, email address, role (Recruiter, Account Manager, Org Admin), and activity metrics.',
      'Use the search box at the top to quickly find a specific team member by name or email.',
      'Apply filters (if available) to show only recruiters, only account managers, or active vs inactive members.',
      'To invite a new team member, click the "Invite" or "+ Add Team Member" button (usually in the top-right corner).',
      'In the invite dialog, enter the person's email address and select their role (Recruiter or Account Manager) from the dropdown.',
      'Click "Send Invite" to email them a signup link; they will receive an email with instructions to create their account and join your organization.',
      'To view or edit an existing team member, click on their name or row in the table to open their profile.',
      'In the team member profile, you can change their role, assign an Account Manager to oversee them (for recruiter accountability), or deactivate their account if they leave the team.',
      'Click "View Progress" or "View as Recruiter" on a team member to see detailed metrics about their recruiting activity (see Recruiter Progress Detail section below for more).',
    ],
  },
  {
    id: 'recruiter-progress',
    title: 'Recruiter Progress (view as)',
    description: 'See a specific recruiter\'s pipeline and activity (AM oversight).',
    route: '/manager/team',
    overview:
      'When you are an Account Manager (or manager with oversight), you can "view as" a specific recruiter to see their pipeline, jobs, and applicants as they see it. This is called Recruiter Progress or "view as recruiter." You select a recruiter from the team; the system then shows that recruiter\'s Pipeline or related views so you can coach or audit without taking over their account. Data is read-only in this mode; you are observing, not acting as that user.',
    steps: [
      'Go to Team Management by clicking "Team" in the left sidebar.',
      'Find the recruiter whose progress you want to review in the team member list.',
      'Click on the recruiter\'s name or row to open their team member detail page.',
      'Look for a button labeled "View Progress", "View as Recruiter", or "View Pipeline" (usually near the top of their profile).',
      'Click this button to enter the "view as" mode, where you'll see the system from their perspective.',
      'You'll now see their specific jobs, their candidate pipeline, their engagements, and their outreach activities, exactly as they see it in Recruiter role.',
      'Navigate through their Pipelines page to see which candidates they're working on for each job, what stages those candidates are in, and when they last took action.',
      'Review their Jobs page to see which positions they own, how many applications each job has, and whether any jobs need attention.',
      'Use this view to coach the recruiter (e.g., "I noticed you have 5 candidates stuck in Screening stage for Job X—let's follow up"), audit compliance, or understand workload distribution.',
      'When finished, click "Back to Manager View" or navigate back to Team Management to exit the "view as" mode and return to your manager-level view.',
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
      'Click on "Jobs" or "Jobs Overview" in the left sidebar to open the organization-wide jobs list.',
      'View the table showing all jobs with columns: Job Title, Status (Open/Closed), Recruiter Owner, Client (if linked), Application Count, and Date Created.',
      'Use the search box to find a specific job by title, keywords, or client name.',
      'Apply filters to narrow the list: filter by recruiter (to see one person's jobs), by status (only open jobs or only closed jobs), or by date range.',
      'Sort the table by clicking column headers (e.g., sort by Application Count to see which jobs are most active, or by Date Created to see newest jobs).',
      'Click on any job row or job title to open the Job Detail page, where you can see full job description, associated client, all applicants, and pipeline metrics for that specific job.',
      'Look for jobs with zero applications or very old creation dates—these may need attention, reassignment, or closure.',
      'If your organization allows it, use the "Assign" or "Reassign" button on a job to change the recruiter owner (useful for balancing workload or covering for someone on leave).',
      'Use the "Export" button (if available) to download the jobs list as a CSV or Excel file for reporting or sharing with leadership.',
      'Return to this page regularly to ensure all open positions have active recruiting efforts and to spot jobs that may need more resources or attention.',
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
      'Click on "Candidates" in the left sidebar menu to open the organization-wide candidate list.',
      'View the table or cards showing all candidates linked to your organization, including their name, current status, job(s) applied to, recruiter owner, and last activity date.',
      'Use the search box to find a candidate by name, email, phone number, or skills.',
      'Apply filters to narrow the list: filter by job (to see all candidates for a specific role), by recruiter (to see one person's candidates), by status (e.g., only Screening or only Outcome), or by date range.',
      'Click on a candidate\'s name to open their full profile, where you can see their resume, work history, applications across multiple jobs, timeline of interactions, and notes from recruiters.',
      'Review the candidate\'s application timeline to see what stage they're in for each job, when they last moved stages, and what actions recruiters have taken (e.g., sent RTR, scheduled screening).',
      'Use this view to identify candidates who may have applied to multiple jobs or are being considered by multiple recruiters, to avoid duplicate outreach or conflicting communications.',
      'Export the candidate list (if available) to create reports, share with hiring managers, or analyze sourcing effectiveness across the organization.',
    ],
  },
  {
    id: 'clients',
    title: 'Client Management',
    description: 'Manage client accounts and link them to recruiters or jobs.',
    route: '/manager/clients',
    overview:
      'Client Management lets you define and manage client accounts (e.g. hiring companies or departments) that your organization serves. You can add clients, assign account managers or recruiters to them, and optionally link jobs to clients for reporting. This is useful for agencies or teams that serve multiple internal or external "clients" and need to track which recruiter or AM is responsible for which account.',
    steps: [
      'Click on "Clients" in the left sidebar menu to open the client management page.',
      'View the list of all clients your organization works with, showing client name, assigned account manager, number of active jobs, and contact information.',
      'To add a new client, click the "+ Add Client" or "Create Client" button (usually in the top-right corner).',
      'In the client creation form, enter the client's company name, contact person name, email address, phone number, and any notes or additional details.',
      'Click "Save" or "Create Client" to add the client to your organization\'s client list.',
      'To assign an Account Manager or recruiter to a client, click on the client row to open the client detail page, then use the "Assign Account Manager" dropdown to select the responsible person.',
      'Link jobs to clients by editing a job and selecting the client from the "Client" dropdown, or by using the "Add Job" button on the client detail page to create a new job for that client.',
      'View all jobs associated with a client by opening the client detail page and scrolling to the "Jobs" section, where you'll see all open and closed positions for that client.',
      'Use client-based filtering on the Jobs Overview or Candidates pages to see all activity related to a specific client, which is helpful for client reporting or account management.',
      'Update client information anytime by clicking on the client name, editing the fields, and saving changes.',
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
      'Click on "Organization" or "Settings" in the left sidebar to open the organization settings page.',
      'View and edit the organization name in the "Organization Name" field, which appears in emails, branding, and candidate-facing pages.',
      'Upload or change the organization logo by clicking the "Upload Logo" button or logo preview area, then selecting an image file from your computer.',
      'Configure invite codes by scrolling to the "Invite Codes" section, where you can create codes for recruiters or candidates to sign up (e.g., "SPRING2026" for a candidate recruiting campaign).',
      'To create a new invite code, click "+ Create Invite Code", enter a code name, select the type (Recruiter or Candidate), set expiration date if needed, and click "Save".',
      'View active invite codes and their usage statistics (how many people signed up with each code) in the invite codes table.',
      'Adjust other organization-wide settings such as default time zone, email notification preferences, or recruiter onboarding instructions if these options are available.',
      'After making changes, click "Save" or "Update Organization" at the bottom of the page to apply your changes org-wide.',
      'Remember that all changes here affect everyone in the organization, so communicate significant changes (like branding updates) to your team.',
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
      'Click on "Audit Logs" in the left sidebar to open the audit log viewer.',
      'Set the date range using the date picker controls (e.g., "Last 7 days", "Last 30 days", or select a custom date range) to narrow down the time period you want to review.',
      'View the list of audit log entries, which shows the date/time, user who performed the action, action type (e.g., "Job Created", "Application Status Changed", "Candidate Engaged"), and the entity affected (e.g., specific job or candidate).',
      'Use the filters to narrow the logs: filter by specific user (to see all actions by a particular recruiter), by action type (to see only job creations or only status changes), or by entity (to see all actions related to a specific job or candidate).',
      'Click on a log entry row to expand it and see full details, including before/after values (e.g., status changed from "Screening" to "Submission"), IP address, and any notes or context.',
      'Use the "Load Older Logs" or "Show More" button at the bottom to fetch additional history beyond the initial results.',
      'Export audit logs (if available) for compliance reporting, external audits, or long-term record-keeping by clicking the "Export" button and selecting CSV or PDF format.',
      'Regularly review audit logs to spot unusual patterns, ensure compliance with recruiting processes, or troubleshoot issues (e.g., "Who changed this candidate\'s status?" or "When was this job created?").',
    ],
  },
  {
    id: 'am-vs-recruiter',
    title: 'Account Manager vs Recruiter',
    description: 'How AM and Recruiter roles differ and when to switch.',
    route: '/manager',
    overview:
      'Account Managers (AMs) have an oversight role: they see org-wide data (team, jobs overview, analytics, audit logs, candidates) and can "view as" a specific recruiter to see that recruiter\'s pipeline and progress. They do not, by default, see only their own jobs or pipelines—they see the whole org. When an AM switches to Recruiter role (same account, role switch in the UI), they then see only their own recruiter data: their jobs, their applicants, their pipelines, their outreach. The talent pool stays shared. So: use Manager/AM role for oversight and reporting; use Recruiter role for hands-on recruiting.',
    steps: [
      'When signed in as Account Manager, look at the left sidebar menu; you'll see Manager pages: Dashboard, Team, Jobs Overview, Candidates, Clients, Organization, and Audit Logs.',
      'In Manager/AM role, you see organization-wide data: all jobs across all recruiters, all candidates in the org, team member activity, and audit logs. This is your oversight mode.',
      'To switch to Recruiter role, click on your profile picture or name in the top-right corner of the screen to open the profile dropdown menu.',
      'Select "Switch to Recruiter" or "Recruiter Mode" from the dropdown; the page will refresh and the left sidebar menu will change.',
      'After switching, the left sidebar now shows Recruiter pages: My Jobs, Talent Pool, Pipelines, Outreach, and Campaigns. You now see only your own recruiter data.',
      'In Recruiter role, you see only the jobs you own, the candidates you engaged, your pipeline progress, and your outreach campaigns. The Talent Pool remains shared across all recruiters.',
      'Use Recruiter role when you need to do hands-on recruiting work: creating jobs, engaging candidates, moving them through your pipeline, sending RTRs, and tracking your own performance.',
      'Switch back to Manager/AM role when you need org-wide visibility: reviewing team performance, checking audit logs, managing clients, or viewing a specific recruiter\'s progress for coaching.',
      'Remember: the Talent Pool is shared regardless of role, so candidates added by any recruiter appear in the pool for everyone, but pipeline engagements are recruiter-specific.',
      'If you're ever unsure which role you're in, check the left sidebar menu (Manager pages = Manager role; Recruiter pages = Recruiter role) or the role indicator in the top navigation bar.',
    ],
  },
  {
    id: 'team-activity',
    title: 'Team Activity Feed',
    description: 'Real-time updates on team actions and recruiting activity.',
    route: '/manager/team-activity',
    overview:
      'The Team Activity Feed shows a live stream of actions taken by recruiters and account managers across your organization. You can see who engaged a candidate, who moved an applicant to a new stage, who created a job, and more—all in real-time. Use this feed for daily oversight, to spot trends, or to understand what your team is working on right now. It's like a social media feed for your recruiting operations.',
    steps: [
      'Click on "Team Activity" or "Activity Feed" in the left sidebar menu to open the team activity page.',
      'View the chronological list of recent actions, showing the timestamp, team member who performed the action, action type (e.g., "Engaged candidate", "Moved to Screening", "Created job"), and the candidate or job affected.',
      'Use the date range picker at the top to filter activity by time period (e.g., "Today", "Last 7 days", or a custom date range).',
      'Apply the "Filter by Recruiter" dropdown to see only actions by a specific team member, which is useful for daily check-ins or coaching sessions.',
      'Filter by action type using the "Action Type" dropdown to see only specific activities (e.g., only "Candidate Engaged" or only "Status Changed" events).',
      'Click on an activity entry to see more details, including the full context (e.g., which job the candidate was engaged for, what the status changed from and to, notes added by the recruiter).',
      'Use the activity feed in your daily stand-up or team meetings to review what happened yesterday or this week, celebrate wins (e.g., "5 candidates moved to Submission!"), or identify bottlenecks.',
      'Compare Team Activity with Audit Logs: Team Activity is for day-to-day oversight and real-time awareness, while Audit Logs are for compliance, historical research, and detailed forensic analysis.',
    ],
  },
  {
    id: 'job-detail',
    title: 'Job Details & Performance',
    description: 'Deep-dive into a specific job\'s metrics, applicants, and pipeline.',
    route: '/manager/jobs/:jobId',
    overview:
      'The Job Detail page gives you a complete view of a single job\'s performance and activity. You can see the full job description, which recruiter owns it, which client it's linked to, how many applications it has received, and the distribution of candidates across pipeline stages. Use this page to understand if a job is performing well, needs more sourcing, or has candidates stuck in a particular stage.',
    steps: [
      'Navigate to Jobs Overview by clicking "Jobs" in the left sidebar.',
      'Find the job you want to analyze in the jobs list (use search or filters if needed).',
      'Click on the job title or job row to open the Job Detail page.',
      'At the top of the page, view the job summary: job title, recruiter owner, associated client, status (Open/Closed), and creation date.',
      'Scroll down to see the full job description, requirements, and any notes or instructions from the hiring manager or client.',
      'Review the metrics section showing total applications received, number of candidates at each pipeline stage (Engaged, Applied, RTR, Screening, Submission, Outcome), and conversion rates between stages.',
      'Click on the "Applicants" or "Pipeline" tab to see the full list of candidates who applied or were engaged for this job, with their current stage and last activity date.',
      'Use the pipeline visualization (funnel chart or stage columns) to identify bottlenecks: if you have many candidates in Screening but few in Submission, the screening process may need attention.',
      'Click on any candidate in the applicants list to open their profile and see full details, timeline, and recruiter notes.',
      'Use the "Edit Job" button to update the job description, change the recruiter owner, link a different client, or close the job if it's been filled or canceled.',
      'Return to this page regularly for active jobs to monitor progress, ensure the recruiter is making steady progress, and identify when a job needs more sourcing or faster movement through stages.',
    ],
  },
  {
    id: 'recruiter-detail',
    title: 'Recruiter Progress & Performance Tracking',
    description: 'Detailed metrics and activity for an individual recruiter.',
    route: '/manager/team/recruiters/:recruiterUserId',
    overview:
      'The Recruiter Progress Detail page shows comprehensive performance data for a single recruiter. You can see how many jobs they own, how many candidates they've added to the pool, how many applications they've received, and the distribution of their candidates across pipeline stages. Use this page for performance reviews, coaching sessions, workload balancing, or identifying top performers.',
    steps: [
      'Navigate to Team Management by clicking "Team" in the left sidebar.',
      'Find the recruiter you want to analyze in the team member list.',
      'Click on the recruiter\'s name to open their team member profile.',
      'Click the "View Progress" or "View Detailed Metrics" button to open the Recruiter Progress Detail page.',
      'At the top, view the recruiter\'s summary metrics: total jobs owned, total candidates added to the talent pool, total applications (across all their jobs), and current pipeline distribution.',
      'Scroll down to the "Jobs" section to see a list of all jobs this recruiter owns, with application counts, last activity date, and status for each job.',
      'Review the "Pipeline Distribution" chart showing how many of this recruiter\'s candidates are at each stage (Engaged, RTR, Screening, etc.), which helps you understand their workload and bottlenecks.',
      'Check the "Candidate Import Sources" section (if available) to see where this recruiter is sourcing candidates from (e.g., LinkedIn, referrals, job boards), which helps assess sourcing effectiveness.',
      'Use the "Activity Timeline" or "Recent Actions" section to see what this recruiter has done recently: which candidates they engaged, which status changes they made, when they last took action.',
      'Click on any job in their jobs list to drill down to the Job Detail page for that specific job.',
      'Use this data in one-on-one coaching sessions to discuss performance, identify training needs, celebrate successes, or redistribute workload if the recruiter is overloaded.',
      'Compare multiple recruiters' progress pages to identify top performers, spot best practices to share with the team, or ensure equitable workload distribution.',
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
                      Ask how to do something (e.g. &quot;How do I view a recruiter\'s pipeline?&quot; or &quot;Where are audit logs?&quot;). I'll use the guide to answer.
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
