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
          'Your central hub for every candidate in your organization. Add people via the Upload button on this page (resumes), from applications, or from Talent Search; group them by role or campaign; filter by skills, location, and stage. New candidates show as New until you start an engagement.',
        details: [
          'Filter and search by skills, location, status, and source',
          'Upload resumes in-page: select files, see progress, Cancel or Dismiss',
          'View full profiles, match scores, and activity; add to shortlists or start engagement',
        ],
        href: '/recruiter/talent-pool',
        icon: Users,
        image: IMG.talent,
      },
      {
        title: 'Shortlists',
        description:
          'Build and maintain shortlists for specific roles or hiring managers. Add candidates from Talent Pool or Talent Search, share lists for feedback, and track stage and notes.',
        details: [
          'Create shortlists per job, campaign, or hiring manager',
          'Share with hiring managers and capture feedback in one place',
          'Track stage and add notes; start engagement from a shortlist',
        ],
        href: '/recruiter/shortlists',
        icon: ListChecks,
        image: IMG.shortlist,
      },
      {
        title: 'Talent Search',
        description:
          'Find candidates on the web and LinkedIn. Use Web Search for broad discovery, Basic Search (Google X-ray) for LinkedIn profiles, or Deep Search (Serp API) for paginated results. Enrich and import profiles into your talent pool or shortlists.',
        details: [
          'Web Search for broad web and profile discovery',
          'Basic Search: Google X-ray for LinkedIn profiles',
          'Deep Search: Serp API with pagination and more results',
        ],
        href: '/recruiter/talent-search/search',
        icon: Search,
        image: IMG.search,
      },
    ],
  },
  Jobs: {
    title: 'Jobs',
    description: 'Manage job postings and applicants.',
    blocks: [
      {
        title: 'My Jobs',
        description:
          'View and manage all your job postings in one place. See status (draft, published, closed), applicant counts, and quick links to edit or view applicants. Keep roles organized and fill them faster.',
        details: [
          'See all jobs with status, applicant counts, and last activity',
          'Edit title, description, requirements, and visibility',
          'Open applicants or pipeline per job',
        ],
        href: '/recruiter/jobs',
        icon: Briefcase,
        image: IMG.jobs,
      },
      {
        title: 'Post a Job',
        description:
          'Create a new job posting with title, description, location, and requirements. Paste a job blurb to auto-fill or enter manually. Set visibility, then publish or save as draft. New roles appear in My Jobs.',
        details: [
          'Paste & Auto-Fill or Manual entry',
          'Add title, description, location, job type, experience, skills',
          'Publish or save as draft',
        ],
        href: '/recruiter/jobs/new',
        icon: PlusCircle,
        image: IMG.createJob,
      },
      {
        title: 'My Applicants',
        description:
          'See every applicant across your jobs in one list (My Candidates page). Filter by job or status, search by name or title; open a row for resume, timeline, and status. Update status or add notes.',
        details: [
          'Filter by job and status; search by name or title',
          'Click a row to open detail sheet (resume, timeline, status)',
          'Update status or add notes; changes save automatically',
        ],
        href: '/recruiter/candidates',
        icon: Users,
        image: IMG.applicants,
      },
    ],
  },
  Pipelines: {
    title: 'Pipelines',
    description: 'Track applications, engagement, and interviews in one place.',
    blocks: [
      {
        title: 'Pipelines',
        description:
          'One pipeline for all candidates: applicants (from job page) and people you engage (from talent pool). Candidates start at New until you start engagement, then Applied/Engaged → RTR & rate → Doc check → Screening → Submission → Outcome. Kanban-style board with drag-and-drop.',
        details: [
          'Stages: Applied/Engaged → RTR & rate → Doc check → Screening → Submission → Outcome',
          'Drag-and-drop and stage updates; filter by job',
          'Applicants and engaged candidates in one view',
        ],
        href: '/recruiter/pipeline',
        icon: ListChecks,
        image: IMG.pipeline,
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
};

/** Base path for each category landing (for sidebar links). Only categories that appear in the recruiter nav are linked. */
export const CATEGORY_LANDING_HREFS: Record<string, string> = {
  'TALENT MANAGEMENT': '/recruiter/talent-management',
  Jobs: '/recruiter/jobs-home',
  Pipelines: '/recruiter/pipelines',
};
