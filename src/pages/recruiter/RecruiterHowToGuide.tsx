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
    title: 'Talent Search & Query Builder',
    description: 'Advanced LinkedIn X-ray search with AI-powered query building and match scoring.',
    route: '/recruiter/talent-search/search',
    overview:
      'Talent Search is your most powerful sourcing tool. It uses Google X-ray search to find LinkedIn profiles matching your criteria. You can build queries manually or use the AI Query Builder to parse job descriptions and auto-generate optimized search queries. Results are scored based on keyword matching to help you prioritize the best candidates. Choose between Basic mode (fast, up to 100 results) or Deep mode (comprehensive, up to 450 results via SerpAPI). All imported candidates join your organization talent pool.',
    steps: [
      'Go to Talent Management → Talent Search.',
      'Choose search mode: Basic (fast, Google CSE, 100 results max) or Deep (SerpAPI, 450 results max, deeper pagination).',
      'Build your query: Use the Query Builder button to parse a job description and auto-generate an optimized LinkedIn X-ray query, or enter a custom query in the Raw X-ray Query field.',
      'Query Builder: Click "Build Query from Job", select a job, and the system parses it to extract title, core skills, secondary skills, methods/tools, certifications, and locations. Skills are displayed as tags - click to toggle selection, use X to remove. Click "Add skill" in any section to add custom terms. All selected items are combined into one OR group for broad matching (profiles need ANY of the terms, not all). Click "Regenerate" to rebuild the query from your selections, or edit the query directly in the text box.',
      'Review match scores: Each result shows a % score based on keyword matches. See "Match Score Details" section below for calculation breakdown.',
      'Use filters: After searching, filter by Must-have skills, Nice-to-have skills, Job titles, Industries, Min score, and Keyword match (any/all). These filters refine results without re-running the search and affect the match scoring.',
      'Import candidates: Select profiles and click Import to add them to your talent pool. They will appear under Talent Pool with stage "New" until you start an engagement.',
    ],
  },
  {
    id: 'match-score',
    title: 'Match Score Details',
    description: 'How the % match score is calculated for search results.',
    route: '/recruiter/talent-search/search',
    overview:
      'The match score (%) is calculated by analyzing each profile text (title + snippet) and scoring it based on keyword matches from your search filters. The score starts at 10 points (base) and adds points for each matching term. Must-have skills are worth the most (+20 each), followed by job titles (+15), nice-to-have skills (+8), industries (+5), years of experience mentions (+5), and open-to-work signals (+5). Exclusion terms (like recruiter or staffing) subtract 25 points each. The final score is capped between 0-100%. This scoring helps you quickly identify the most relevant candidates - higher scores mean more keyword matches with your criteria.',
    steps: [
      'Base score: Every profile starts with 10 points.',
      'Must-have skills: +20 points per match (from Must-have skills filter field).',
      'Job titles: +15 points per match (from Job titles filter field).',
      'Nice-to-have skills: +8 points per match (from Skills filter field).',
      'Industries: +5 points per match (from Industries filter field).',
      'Years of experience: +5 points if profile mentions X years or X+ years.',
      'Open to work: +5 points if profile contains open to work, opentowork, or similar phrases.',
      'Exclusion terms: -25 points per match (e.g., recruiter, staffing, sales).',
      'Final score: Capped between 0-100%. Example: 2 must-have matches (40) + 1 title (15) + 3 nice-to-have (24) + years (5) + open to work (5) = 89%.',
      'Tip: Use the Min score filter to show only candidates above a threshold (e.g., 70%+).',
    ],
  },
  {
    id: 'query-builder',
    title: 'Query Builder Best Practices',
    description: 'Tips for building effective LinkedIn X-ray search queries.',
    route: '/recruiter/talent-search/search',
    overview:
      'The Query Builder parses job descriptions to extract relevant search terms, but not all parsed terms should be included in the query. The most effective queries use short, concrete keywords rather than long conceptual phrases. The system automatically filters out overly generic phrases (like principles, understanding of, experience with) and long terms (over 40 chars) that are too specific. All selected skills are combined into one OR group, meaning profiles only need to match ANY term (not all). This broad matching strategy aims for 50-200 highly relevant results rather than 0-10 perfect matches. Certifications are extracted as abbreviations (e.g., CISSP instead of Certified Information Systems Security Professional) for broader matching. You can edit any field or add custom skills to refine the query before searching.',
    steps: [
      'Use the Query Builder: Click "Build Query from Job", select a job with a detailed description. The AI parses it and extracts titles, skills (core, secondary, methods/tools), certifications, and locations.',
      'Review parsed skills: Skills appear as colored tags by category. Click tags to toggle selection (checkmark = selected). Use the X button on hover to remove skills you do not want.',
      'Add custom skills: Each section (Core, Secondary, Methods/Tools, Certs) has an "Add skill" input. Type and press Enter or click Add to include custom terms.',
      'Understand the query structure: The generated query is: site:linkedin.com/in (title-keywords OR skill1 OR skill2 OR ... OR cert1 OR cert2) (location if present) -exclusions. Everything is OR logic for broad matching.',
      'Edit directly: The query text box is editable. Power users can manually adjust the query for specific needs. Click "Regenerate" to rebuild from tag selections.',
      'Optimize for results: If you get too few results (less than 20), remove specific long-tail skills or very niche certifications. If too many (over 500), add more specific technical skills or use the Min score filter post-search.',
      'Location tips: Locations are extracted as state/country level only (cities are removed for broader matching). Keep 1-2 locations max.',
      'Title strategy: Titles are kept as phrases but seniority prefixes (Senior, Jr, etc.) are removed for broader matching. The system extracts 2-3 keywords from the title to include in the OR group.',
      'Best results: Aim for 15-30 unique terms in the OR group. More terms = broader but potentially less targeted. Fewer terms = more precise but risk missing good candidates.',
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
      'The Pipeline (Jobs → Candidates Pipeline) shows all candidates for your jobs in one place. Candidates who applied via the job page start at **Applied**; candidates you add from the talent pool start at **New** until you start an engagement, then they appear at **Engaged**. Stages run from Applied/Engaged → RTR & rate → Doc check → Screening → Submission → Outcome. You can drag and drop cards between stages, open a candidate for notes or status change, and filter by job. The page header aligns with other recruiter pages (no extra top spacing). Scoped to jobs you own; Account Managers can view a specific recruiter’s pipeline in oversight mode.',
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
    id: 'search-modes',
    title: 'Search Modes Comparison',
    description: 'Web Search vs Basic LinkedIn vs Deep LinkedIn - which to use when.',
    route: '/recruiter/talent-search/search',
    overview:
      'Talent Search offers three distinct modes. Web Search crawls general web results and may include LinkedIn profiles mixed with other sites. Basic LinkedIn (Google X-Ray) uses Google CSE to find LinkedIn profiles with a result limit of approximately 100. Deep LinkedIn (SerpAPI) uses a premium API for deeper pagination, accessing up to 450 LinkedIn results. Basic is fast and free-tier friendly for quick searches. Deep is best for comprehensive sourcing when you need many candidates. Web mode is useful when you want to find candidates on GitHub, personal sites, or other platforms beyond LinkedIn.',
    steps: [
      'Web Search: General web crawl, includes non-LinkedIn results, good for finding GitHub profiles or personal sites. Limited to 50 stored results per search. Use when sourcing from multiple platforms.',
      'Basic LinkedIn (Google X-Ray): Uses Google CSE, site:linkedin.com/in syntax, fast, approximately 100 result limit. Best for quick targeted searches when you expect fewer matches.',
      'Deep LinkedIn (SerpAPI): Premium API, deeper pagination, up to 450 results accessible. Best for exhaustive sourcing, larger result sets, comprehensive candidate pools. Uses page-based pagination (20 per page).',
      'Choose mode based on need: Quick search = Basic. Large pool needed = Deep. Multi-platform sourcing = Web.',
      'Both LinkedIn modes use same filters and query builder. Results are scored identically across modes.',
    ],
  },
  {
    id: 'search-filters',
    title: 'Search Filters Explained',
    description: 'All filter types, match modes, and how they affect results.',
    route: '/recruiter/talent-search/search',
    overview:
      'Talent Search filters are organized into collapsible sections. General filters include freeform prompts and raw X-Ray input (for power users). Job Title filters accept comma-separated titles with match mode Any (OR logic, one title required) or All (AND logic, all titles required). Skills filters split into Must-have (required, AND logic) and Nice-to-have (optional, OR or AND based on mode). Location filters accept freeform text with optional US-only toggle. Seniority dropdown offers Any/Junior/Mid/Senior/Staff. Industries are comma-separated. Advanced filters include Exclude keywords (terms to filter out, pre-populated with recruiter, staffing, etc.), Boost Open to Work (prioritizes availability signals), and Strictness mode (Broad = unquoted terms, Balanced = smart quoting, Strict = all terms quoted). After search, result-level filters (keyword chips, min score slider) refine displayed results without re-running the query.',
    steps: [
      'General: Freeform prompt for natural language, or Raw X-Ray for manual site:linkedin.com/in syntax (power users).',
      'Job Titles: Comma-separated, match mode Any (OR) or All (AND). Any means candidate needs one title, All means all titles must appear.',
      'Must-have Skills: Comma-separated required skills, AND logic. Candidate must have all listed. Affects match score (+20 points per match).',
      'Nice-to-have Skills: Optional skills, OR or AND mode toggle. OR means candidate should have at least one. Affects match score (+8 points per match).',
      'Location: Freeform text (e.g., California, New York, Remote). US-only toggle restricts to United States.',
      'Seniority: Dropdown (Any/Junior/Mid/Senior/Staff). Maps to years of experience hints in query (e.g., Senior adds 5+ years, 7+ years).',
      'Industries: Comma-separated (e.g., Technology, Healthcare). Affects match score (+5 points per match).',
      'Exclude Keywords: Comma-separated terms to filter out (default: recruiter, staffing, talent, sales, job, jobs, hiring, career). Subtracts 25 points per match from score.',
      'Boost Open to Work: Runs additional query with open-to-work keywords, prioritizes candidates signaling availability (+5 points to score).',
      'Strictness: Broad (no quotes, wider matching), Balanced (smart quoting based on spaces), Strict (all terms quoted for exact matches). Affects how Google interprets your query.',
      'Result-level filters (post-search): Keyword chips (click to add/remove), Min score slider (numeric threshold), Clear filters button. These refine displayed results without new API call.',
    ],
  },
  {
    id: 'bulk-operations',
    title: 'Bulk Import & Selection',
    description: 'Select multiple candidates, bulk import, and keyboard shortcuts.',
    route: '/recruiter/talent-search/search',
    overview:
      'Talent Search supports bulk operations for efficiency. Each result row has a checkbox for individual selection. A Select All button at the top selects all visible results on the current page. Once selected, the Import Selected button (shown with count badge) imports all checked profiles to your organization Talent Pool in one operation. Import checks for duplicates by LinkedIn URL - duplicates are skipped and counted in the success toast (e.g., Imported 15 candidates, 3 duplicates skipped). Selections are cleared after successful import. You can also export all displayed results (respecting current filters) to CSV via the Export button. CSV includes Name, Headline, Match Score, and URL columns.',
    steps: [
      'Select individual candidates: Click checkbox on any result row.',
      'Select all visible: Click Select All button at top of results list. Applies to current page only (not all pages).',
      'Deselect: Click Select All again to toggle off, or uncheck individual rows.',
      'Import selected: Click Import Selected button (shows count badge). All checked profiles imported to Talent Pool.',
      'Duplicate handling: System checks LinkedIn URL. If candidate already exists, import is skipped. Toast shows duplicates skipped count.',
      'Clear selection: Selections automatically cleared after import completes.',
      'Export to CSV: Click Export button. Downloads all displayed results (respecting filters) as CSV file. Includes Name, Headline/Snippet, Match Score (%), URL.',
      'Single row import: Click individual result row to expand, then import directly from detail view.',
    ],
  },
  {
    id: 'saved-searches',
    title: 'Save & Load Searches',
    description: 'Save query configurations, manage favorites, and reload saved searches.',
    route: '/recruiter/talent-search/search',
    overview:
      'Talent Search lets you save query configurations for reuse. Click Save Search, enter a name, and all current filter values (query, skills, titles, location, seniority, industries, exclusions, strictness) are stored. Saved searches appear in a dropdown menu. You can star favorites - they appear at the top of the menu separated by a line. Click a saved search to reload all its filters and re-run the query. Saved searches are stored in the database (saved_talent_searches table) and tied to your user ID and organization. Delete saved searches via the menu (trash icon) with confirmation toast. Saved searches persist across sessions - close browser, reopen, and your saved queries are still available.',
    steps: [
      'Save current search: Click Save Search button, enter a name, click Save. All filters and query configuration stored.',
      'View saved searches: Click Saved Searches dropdown menu. Shows all your saved queries.',
      'Star favorites: Click star icon next to a search name. Favorites appear at top of menu, separated by line.',
      'Load saved search: Click a saved search name in menu. All filters reload with saved values, query re-executes automatically.',
      'Delete saved search: Click trash icon next to search name. Confirmation toast appears. Search removed from list and database.',
      'Persistence: Saved searches stored in database, tied to your user and organization. Available across sessions and devices.',
      'What is saved: Query string, all filter values (skills, titles, location, seniority, industries, exclusions, strictness mode, match modes).',
    ],
  },
  {
    id: 'result-sorting',
    title: 'Result Sorting & Views',
    description: 'Sort by name, title, or match score. Understanding sort directions.',
    route: '/recruiter/talent-search/search',
    overview:
      'Search results support multiple sorting options. Default sort shows results in natural order (as returned by API). Sort by Name orders alphabetically by candidate full name (A-Z ascending, Z-A descending). Sort by Title orders by headline or job title field (ascending or descending). Sort by Score orders by match percentage - descending shows highest scores first (recommended), ascending shows lowest first. Click a column header to sort by that column. Click again to reverse sort direction. Visual indicators (up/down arrows) show current sort column and direction. Sorting applies to all displayed results respecting current filters. Sort state persists during pagination - load more pages and sort order is maintained.',
    steps: [
      'Default sort: No sorting applied. Results shown in API return order (typically relevance-based from Google/SerpAPI).',
      'Sort by Name: Click Name column header. Orders alphabetically by full name. Click again to reverse (A-Z to Z-A or vice versa).',
      'Sort by Title: Click Title/Headline column header. Orders by job title or headline text. Toggle ascending/descending.',
      'Sort by Score: Click Score column header. Descending (default) shows highest match percentages first. Ascending shows lowest first. Recommended to use descending to see best matches at top.',
      'Visual indicators: Arrow icons (up/down) show which column is sorted and direction.',
      'Persistence: Sort order maintained during pagination. Load more pages and results stay sorted.',
      'Combine with filters: Sorting applies to filtered results. Filter by min score, then sort by name to see alphabetical list of high-scorers.',
    ],
  },
  {
    id: 'open-to-work',
    title: 'Open to Work Badge',
    description: 'What the green badge means and how to boost these candidates.',
    route: '/recruiter/talent-search/search',
    overview:
      'The Open to Work badge is a green outline indicator shown on candidate rows when their LinkedIn profile or snippet contains availability signals. These signals include phrases like open to work, opentowork hashtag, open to new opportunities, seeking new opportunities, or similar language. When detected, the candidate receives a +5 point boost to their match score and the badge appears for visual identification. You can prioritize these candidates using the Boost Open to Work filter toggle, which runs an additional search query specifically targeting open-to-work keywords and merges results. Open to Work candidates are more likely to respond to outreach and engage with opportunities, making them high-value targets for recruiting.',
    steps: [
      'What it means: Candidate has signaled availability on their LinkedIn profile. Phrases detected: open to work, opentowork, open to new opportunities, seeking opportunities.',
      'Badge appearance: Green outline badge labeled Open to Work shown on result row, next to match score.',
      'Score boost: Candidates with this signal receive +5 points to match score automatically.',
      'How to find more: Enable Boost Open to Work toggle in Advanced filters. Runs additional query targeting availability keywords, merges results.',
      'Why it matters: Open to Work candidates are more responsive, more likely to engage, higher conversion rates. Prioritize for outreach.',
      'No exclusivity: Badge does not mean candidate is ONLY looking. They may be passively open or actively searching.',
    ],
  },
  {
    id: 'exhaustive-search',
    title: 'Exhaustive Search Mode',
    description: 'Multi-query strategy to overcome result limits and find more candidates.',
    route: '/recruiter/talent-search/search',
    overview:
      'Exhaustive Search is an advanced feature that runs multiple search queries automatically to overcome API result limits. Instead of one query returning 100 results, Exhaustive mode splits your search into multiple variants (by location, title, industry, or skill) and runs each as a separate query. Results are merged and deduplicated. This strategy can yield 500+ candidates from a single Exhaustive search. Configure target result count (default 500) and max queries (default 20). Progress is shown (e.g., Query 5 of 12). The system auto-detects bucketing strategy: if you have multiple locations, it splits by location; if multiple titles, by title; etc. Use Exhaustive when you need a large candidate pool and Basic search returns too few results. Works with both Google CSE (Basic mode) and SerpAPI (Deep mode).',
    steps: [
      'Enable Exhaustive: Toggle Exhaustive Search checkbox in filter panel.',
      'Configure limits: Set Target Results (default 500, how many candidates you want) and Max Queries (default 20, prevents runaway searches).',
      'Bucketing strategy: System auto-selects strategy based on your filters. Multiple locations = split by location. Multiple titles = split by title. Multiple industries = split by industry. Multiple skills = split by skill.',
      'Progress tracking: During search, progress indicator shows Query X of Y.',
      'Result merging: All query results combined, deduplicated by LinkedIn URL. If same candidate appears in multiple queries, kept once with highest score.',
      'When to use: Use when Basic search yields too few results (under 50). Use when you need comprehensive candidate pool (hundreds of profiles). Use for high-volume roles or hard-to-fill positions.',
      'Performance: Takes longer than single query (multiple API calls). Recommended to start with single query, then Exhaustive if needed.',
    ],
  },
  {
    id: 'bulk-resume-upload',
    title: 'Bulk Resume Upload',
    description: 'Upload multiple resumes, auto-parse, and import to Talent Pool.',
    route: '/recruiter/talent-search/uploads',
    overview:
      'The Resumes tab (Bulk Upload) lets you upload multiple resume files at once for automatic parsing and import. Drag-and-drop or click to select PDF, DOCX, or TXT files. Each file is parsed to extract full name, current job title, skills, and years of experience. Files are stored in Supabase storage with unique filenames. The system calculates an ATS generic score (percentage) for each resume. Processing happens per-file with status indicators: pending, parsing, importing, done, or error. A progress bar shows overall completion. After parsing, all profiles are automatically imported to your organization Talent Pool with stage New. Duplicate detection by file content hash prevents re-uploading the same resume. View results with individual cards showing name, title, ATS score (color-coded), and error messages if parsing failed. Use Clear button to reset session and upload more resumes.',
    steps: [
      'Go to Resumes tab (first tab in Talent Search).',
      'Upload files: Drag-and-drop multiple resume files onto upload zone, or click to open file picker. Supports PDF, DOCX, TXT.',
      'Auto-parsing: Each file parsed automatically. Extracts: full name, current job title, skills array, years of experience.',
      'Status tracking: Each file shows status: pending (queued), parsing (extracting data), importing (saving to database), done (success), error (failed with message).',
      'Progress bar: Shows percentage completion across all files.',
      'ATS score: After parsing, each resume receives a generic ATS score (0-100%). Higher scores indicate better-structured resumes.',
      'Result cards: Individual cards per file show name (or filename), title, ATS score (color-coded: green=high, yellow=medium, red=low), error message if failed.',
      'Import to Talent Pool: All successfully parsed profiles automatically imported with stage New. Appear in Talent Pool immediately.',
      'Duplicate prevention: System hashes file content. If same file uploaded again, skipped with duplicate message.',
      'Clear session: Click Clear button to reset upload area and results. Previously imported candidates remain in Talent Pool.',
      'Storage: Files stored in Supabase storage bucket at resumes/{uniqueFileName}.',
    ],
  },
  {
    id: 'pagination-load-more',
    title: 'Pagination & Load More',
    description: 'How pagination works across different search modes.',
    route: '/recruiter/talent-search/search',
    overview:
      'Pagination behavior differs by search mode. Web Search uses tab-based pagination - each Load More creates a new page tab. You can switch between pages to revisit previous result sets. All pages remain in memory. Google X-Ray Basic mode supports Load More to fetch additional results up to approximately 100 total. A Load All button fetches all accessible results at once. SerpAPI Deep mode uses page-based pagination with 20 results per page, controlled via Load Next Page button. Result limits vary: Web caps at 50 stored results per search, Basic caps at approximately 100 via Google CSE, Deep can access up to 450 via SerpAPI. During pagination, sort order and filters are preserved. Loading indicators show when fetching. If no more results available, pagination buttons are disabled or hidden.',
    steps: [
      'Web Search pagination: Click Load More to fetch next page. Each page becomes a new tab. Click tabs to switch between result pages. All pages remain in browser memory. Limit: 50 results stored per search.',
      'Basic LinkedIn pagination (Google CSE): Click Load More to fetch additional results. Appends to existing result list. Load All button fetches all remaining results at once. Limit: Approximately 100 results accessible via Google CSE.',
      'Deep LinkedIn pagination (SerpAPI): Page-based, 20 results per page. Click Load Next Page button to fetch next page. Page number indicator shows current page. Limit: Up to 450 results accessible via SerpAPI deep pagination.',
      'Preserved state: During pagination, current sort order and result filters are maintained. Load more pages and results appear in same sort order.',
      'Loading indicators: Spinner or loading text shown while fetching. Buttons disabled during load to prevent double-clicks.',
      'End of results: When no more results available, pagination buttons hidden or disabled. Toast message may indicate end reached.',
      'Performance: Loading all results at once (Load All) is faster but uses more memory. Incremental Load More is slower but lighter on memory.',
    ],
  },
  {
    id: 'profile-data',
    title: 'Candidate Profile Data',
    description: 'What data you get from each candidate profile and how it is stored.',
    route: '/recruiter/talent-search/search',
    overview:
      'Each candidate profile in search results contains: full name, email (if available), headline/current title, summary/bio snippet, current company, job title, years of experience, location (geographic), LinkedIn URL, GitHub URL (if found), personal website (if found), skills array (extracted or inferred), source URL (where profile was found), source title and excerpt, match score percentage (calculated), matched terms array (which keywords triggered the match), and open to work flag (availability signal). When you import a candidate, this data is saved to your organization Talent Pool in the candidate_profiles table. The profile stage is set to New until you start an engagement. Source metadata helps you track where candidates came from (web search, LinkedIn Basic, LinkedIn Deep). Match score and matched terms help you prioritize and filter results.',
    steps: [
      'Basic info: Full name, email (if available), headline/current title, summary/bio snippet.',
      'Work history: Current company, current job title, years of experience (integer).',
      'Location: Geographic location (city, state, or country level).',
      'Contact links: LinkedIn URL (primary identifier), GitHub URL (if found), personal website/portfolio (if found).',
      'Skills: Array of skills (extracted from resume or inferred from text). Used for matching and filtering.',
      'Source info: Source URL (original link), source title (page title), source excerpt (snippet from search result).',
      'Match data: Match score (0-100% calculated), matched terms (array of keywords that triggered match).',
      'Availability: Open to work flag (boolean, true if availability signal detected).',
      'Storage: On import, data saved to candidate_profiles table in your organization. Stage set to New.',
      'Deduplication: Checked by LinkedIn URL. If candidate already exists, import skipped.',
      'Privacy: Email and contact info only captured if publicly available in search results. No scraping of private LinkedIn data.',
    ],
  },
  {
    id: 'query-persistence',
    title: 'Search State & Persistence',
    description: 'What data persists across sessions and how state is saved.',
    route: '/recruiter/talent-search/search',
    overview:
      'Talent Search automatically saves your state to browser LocalStorage under key talent_sourcing_search_v1:{organizationId}. Persisted data includes: active tab (Resumes/Search/API), active search mode (Web/Basic/Deep), current query strings, all filter values, search results (last 250 per mode), pagination state, web page history, and search provider selection. When you close the browser and return, your last search state is restored - filters, results, and mode are exactly as you left them. URL-based deep linking is supported: ?tab=search&mode=deep navigates directly to Deep LinkedIn mode. State is also saved on unmount (when you leave the page). This persistence ensures you do not lose work if you accidentally close the tab or navigate away. Saved searches (named queries) are stored separately in the database, not LocalStorage, so they persist across devices.',
    steps: [
      'Auto-save to LocalStorage: Search state saved automatically as you work. Key: talent_sourcing_search_v1:{organizationId}.',
      'What persists: Active tab, active search mode, query strings, all filter values, last 250 results per mode, pagination state, web page tabs, provider selection.',
      'Session restore: Close browser, reopen Talent Search - filters, results, and mode restored exactly as you left them.',
      'URL-based navigation: Use ?tab=search&mode=deep in URL to deep-link directly to a specific tab/mode.',
      'Saved searches separate: Named saved searches stored in database (saved_talent_searches table), not LocalStorage. Available across devices and sessions.',
      'Unmount save: When you navigate away from Talent Search page, current state saved to LocalStorage.',
      'Organization-scoped: Each organization has separate LocalStorage state. Switching organizations loads that org state.',
      'Clear state: No UI button to clear state. Can manually clear via browser DevTools > LocalStorage > delete key.',
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
