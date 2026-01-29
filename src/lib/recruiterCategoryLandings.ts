import {
  Users,
  Search,
  ListChecks,
  Upload,
  Sparkles,
  Briefcase,
  PlusCircle,
  Mail,
  BarChart3,
  Bot,
} from 'lucide-react';
import type { CategoryLandingConfig } from '@/components/recruiter/CategoryLanding';

// Thematic images — Picsum (reliable placeholders); optional; omit to use icon visual
const IMG = {
  talent: 'https://picsum.photos/seed/talent-pool/600/300',
  search: 'https://picsum.photos/seed/ats-search/600/300',
  shortlist: 'https://picsum.photos/seed/shortlists/600/300',
  marketplace: 'https://picsum.photos/seed/marketplace/600/300',
  upload: 'https://picsum.photos/seed/uploads/600/300',
  api: 'https://picsum.photos/seed/api/600/300',
  jobs: 'https://picsum.photos/seed/jobs/600/300',
  createJob: 'https://picsum.photos/seed/create-job/600/300',
  applicants: 'https://picsum.photos/seed/applicants/600/300',
  aiMatch: 'https://picsum.photos/seed/ai-matching/600/300',
  pipeline: 'https://picsum.photos/seed/pipeline/600/300',
  engagement: 'https://picsum.photos/seed/engagement/600/300',
  interviews: 'https://picsum.photos/seed/interviews/600/300',
  outreach: 'https://picsum.photos/seed/outreach/600/300',
  templates: 'https://picsum.photos/seed/templates/600/300',
  insights: 'https://picsum.photos/seed/insights/600/300',
  automation: 'https://picsum.photos/seed/automation/600/300',
};

/**
 * Landing page config for each recruiter sidebar category.
 * Used by CategoryLandingPage and by the sidebar for category label links.
 */
export const RECRUITER_CATEGORY_LANDINGS: Record<string, CategoryLandingConfig> = {
  'TALENT MANAGEMENT': {
    title: 'Talent Management',
    description: 'Manage your talent pool, shortlists, and candidate sources in one place.',
    blocks: [
      {
        title: 'Talent Pool',
        description:
          'Your central hub for every candidate in your organization. Add people from sourcing, imports, or applications; group them by role or campaign; and run bulk actions. Use filters by skills, location, and status so you can quickly build shortlists and move candidates into jobs.',
        details: [
          'Filter and search by skills, location, status, and source',
          'Bulk tag, move between groups, and export for hiring managers',
          'View full profiles, match scores, and activity in one place',
        ],
        href: '/recruiter/talent-pool',
        icon: Users,
        image: IMG.talent,
      },
      {
        title: 'Bulk Upload Profiles',
        description:
          'Upload resume files (PDF, DOC, DOCX, TXT) to parse, score, and import candidates in bulk. Resumes are parsed for skills, experience, and contact info; you get quality scores and duplicate detection. Use this for application batches or one-off imports.',
        details: [
          'Drag-and-drop or select multiple files at once',
          'Auto-parse skills, experience, and contact info',
          'Quality score and duplicate detection before import',
        ],
        href: '/recruiter/talent-search/uploads',
        icon: Upload,
        image: IMG.upload,
      },
      {
        title: 'ATS Match Search',
        description:
          'Search your ATS by skills, experience, and job criteria. Get AI-ranked match scores so you can see who fits each role best. One-click import into shortlists or talent pool keeps your workflow fast when filling multiple positions.',
        details: [
          'Search by skills, job titles, experience level, and requirements',
          'See AI-ranked match scores and short reasons for each match',
          'Import matches into shortlists or talent pool in one click',
        ],
        href: '/recruiter/ats-match-search',
        icon: Search,
        image: IMG.search,
      },
      {
        title: 'Shortlists',
        description:
          'Build and maintain shortlists for specific roles or hiring managers. Add candidates from talent pool or ATS search, share lists for feedback, and track stage and notes. Move people from applied through to hired in one place.',
        details: [
          'Create shortlists per job, campaign, or hiring manager',
          'Share with hiring managers and capture feedback in one place',
          'Track stage (e.g. screen, interview, offer) and add notes',
        ],
        href: '/recruiter/shortlists',
        icon: ListChecks,
        image: IMG.shortlist,
      },
      {
        title: 'Marketplace Profiles',
        description:
          'Browse pre-vetted candidate profiles from the marketplace. Filter by skills, experience, and availability; compare fit for your roles; and add the best candidates to your talent pool or shortlists without re-entering data.',
        details: [
          'Browse and filter by skills, experience, and availability',
          'Compare profiles and fit against your open roles',
          'Import into talent pool or shortlists with one click',
        ],
        href: '/recruiter/marketplace',
        icon: Search,
        image: IMG.marketplace,
      },
      {
        title: 'Talent Search',
        description:
          'Find candidates on the web and LinkedIn. Use Web Search for broad discovery, Basic Search (Google X-ray) for LinkedIn profiles, or Deep Search (Serp API) for paginated LinkedIn results. Enrich and import profiles into your talent pool or shortlists.',
        details: [
          'Web Search for broad web and profile discovery',
          'Basic Search: Google X-ray for LinkedIn profiles',
          'Deep Search: Serp API with pagination and more results',
        ],
        href: '/recruiter/talent-search/search',
        icon: Search,
        image: IMG.search,
      },
      {
        title: 'API Integration',
        description:
          'Import candidates programmatically via our API. Sync from your ATS or job boards, run bulk imports, and build custom sourcing workflows. Webhooks let you react to events and keep systems in sync.',
        details: [
          'REST API for candidate create, update, and bulk import',
          'Sync from ATS, job boards, or internal tools',
          'Webhooks for events and automation',
        ],
        href: '/recruiter/talent-search/api',
        icon: Sparkles,
        image: IMG.api,
      },
    ],
  },
  Jobs: {
    title: 'Jobs',
    description: 'Manage job postings, applicants, and AI-powered matching.',
    blocks: [
      {
        title: 'My Jobs',
        description:
          'View and manage all your job postings in one place. See status (draft, published, closed), applicant counts, and quick links to edit, view applicants, or run AI matching. Keep roles organized and fill them faster.',
        details: [
          'See all jobs with status, applicant counts, and last activity',
          'Edit title, description, requirements, and visibility',
          'Open applicants pipeline or AI matching per job',
        ],
        href: '/recruiter/jobs',
        icon: Briefcase,
        image: IMG.jobs,
      },
      {
        title: 'Post a Job',
        description:
          'Create a new job posting with title, description, location, and requirements. Set visibility and application options, then publish immediately or save as draft. New roles appear in My Jobs and can use AI matching.',
        details: [
          'Add title, description, location, and requirements',
          'Set visibility and application options',
          'Publish or save as draft',
        ],
        href: '/recruiter/jobs/new',
        icon: PlusCircle,
        image: IMG.createJob,
      },
      {
        title: 'My Applicants',
        description:
          'See every applicant across your jobs in one list. Filter by job, status, or stage; move candidates through pipeline stages; and use bulk actions or export. Coordinate with hiring managers without switching tools.',
        details: [
          'Filter by job, status, and pipeline stage',
          'Move candidates through stages and add notes',
          'Bulk actions and export for hiring managers',
        ],
        href: '/recruiter/candidates',
        icon: Users,
        image: IMG.applicants,
      },
      {
        title: 'AI Matching',
        description:
          'Get AI-ranked candidate recommendations for each job. See match scores and short reasons (skills, experience). Shortlist the best fits and add them to the pipeline in one click so you spend less time screening.',
        details: [
          'AI-ranked match scores and reasons per job',
          'See why candidates match (skills, experience)',
          'Shortlist and add to pipeline in one click',
        ],
        href: '/recruiter/ai-matching',
        icon: Sparkles,
        image: IMG.aiMatch,
      },
    ],
  },
  Pipelines: {
    title: 'Pipelines',
    description: 'Track applications, engagement, and interviews in one place.',
    blocks: [
      {
        title: 'Applications Pipeline',
        description:
          'Move candidate applications through stages from applied to hired. Use a Kanban-style board to drag-and-drop or bulk-update stages. See funnel metrics and where candidates drop off so you can fix bottlenecks.',
        details: [
          'Kanban-style stages (e.g. Applied → Screen → Interview → Offer)',
          'Drag-and-drop and bulk stage updates',
          'Funnel metrics and stage conversion',
        ],
        href: '/recruiter/pipeline',
        icon: ListChecks,
        image: IMG.pipeline,
      },
      {
        title: 'Engagement Pipeline',
        description:
          'Track outreach and engagement with candidates. See who you’ve contacted, response status, and follow-ups. Keep engagement history in one place.',
        details: [
          'Track outreach and response status',
          'Schedule and log follow-ups',
          'View engagement history per candidate',
        ],
        href: '/recruiter/engagements',
        icon: ListChecks,
        image: IMG.engagement,
      },
      {
        title: 'Interviews',
        description:
          'Schedule and manage interviews by candidate and job. See upcoming and past interviews, assign interviewers, and keep notes in one calendar view.',
        details: [
          'Schedule interviews and assign interviewers',
          'Calendar view of upcoming interviews',
          'Notes and feedback per interview',
        ],
        href: '/recruiter/interviews',
        icon: Briefcase,
        image: IMG.interviews,
      },
    ],
  },
  Communications: {
    title: 'Communications',
    description: 'Outreach campaigns and reusable email templates.',
    blocks: [
      {
        title: 'Outreach',
        description:
          'Run outreach campaigns with personalized emails. Track opens, clicks, and responses; schedule follow-up sequences; and use templates or one-off messages. Keep all candidate communication in one place.',
        details: [
          'Send personalized emails to candidates',
          'Track opens, clicks, and responses',
          'Schedule follow-ups and sequences',
        ],
        href: '/recruiter/outreach',
        icon: Mail,
        image: IMG.outreach,
      },
      {
        title: 'Email Templates',
        description:
          'Create reusable email templates for outreach, follow-ups, and scheduling. Use variables (e.g. candidate name, role) for personalization and keep messaging consistent across your team and campaigns.',
        details: [
          'Create and edit templates with variables',
          'Use for outreach, follow-ups, and scheduling',
          'Reuse across campaigns and recruiters',
        ],
        href: '/recruiter/email-templates',
        icon: Mail,
        image: IMG.templates,
      },
    ],
  },
  Insights: {
    title: 'Insights',
    description: 'Analytics and reporting for your recruiting activity.',
    blocks: [
      {
        title: 'Insights',
        description:
          'View dashboards and reports on sourcing, applications, and pipeline performance. See where candidates come from, conversion by stage, and time-to-hire so you can improve process and report to stakeholders.',
        details: [
          'Sourcing and application dashboards',
          'Pipeline conversion and time-to-hire',
          'Export reports for stakeholders',
        ],
        href: '/recruiter/insights',
        icon: BarChart3,
        image: IMG.insights,
      },
    ],
  },
  Automation: {
    title: 'Automation',
    description: 'AI-powered automation for sourcing and outreach.',
    blocks: [
      {
        title: 'AI Agents',
        description:
          'Configure and run AI agents to automate sourcing, screening, and outreach. Let AI handle repetitive tasks like screening resumes, scoring candidates, or drafting messages so you can focus on high-value decisions.',
        details: [
          'Configure agents for sourcing or screening',
          'Run on schedule or on demand',
          'Review and approve AI suggestions',
        ],
        href: '/recruiter/agents',
        icon: Bot,
        image: IMG.automation,
      },
    ],
  },
};

/** Base path for each category landing (for sidebar links). */
export const CATEGORY_LANDING_HREFS: Record<string, string> = {
  'TALENT MANAGEMENT': '/recruiter/talent-management',
  Jobs: '/recruiter/jobs-home',
  Pipelines: '/recruiter/pipelines',
  Communications: '/recruiter/communications',
  Insights: '/recruiter/insights-home',
  Automation: '/recruiter/automation-home',
};
