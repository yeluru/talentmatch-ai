# MatchTalAI - AI-Powered Recruitment Platform

A modern, full-stack recruitment platform that connects candidates with recruiters using AI-powered matching, resume analysis, and talent insights.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [User Roles](#user-roles)
- [Database Schema](#database-schema)
- [Security Features](#security-features)
- [Testing Guide](#testing-guide)
- [Edge Functions](#edge-functions)
- [Deployment](#deployment)
- [Contributing](#contributing)

## Overview

MatchTalAI is a comprehensive recruitment solution designed to streamline the hiring process for organizations of all sizes. The platform leverages AI to match candidates with job opportunities, analyze resumes, and provide actionable talent insights.

### Key Capabilities

- **For Candidates**: Job search, application tracking, resume management, AI-powered career analysis
- **For Recruiters**: Talent pool management, AI matching, outreach campaigns, shortlist creation
- **For Account Managers**: Team oversight, analytics, organization management

## Architecture

### System Architecture

```mermaid
graph TB
    subgraph Client["🌐 Client Layer"]
        Browser["Browser/PWA"]
    end

    subgraph Frontend["⚛️ Frontend (React + Vite)"]
        Router["React Router v6"]
        Auth["Auth Provider"]
        Query["React Query"]
        UI["shadcn/ui Components"]
        State["Zustand Store"]
    end

    subgraph Backend["☁️ Backend (Supabase)"]
        subgraph Auth_Service["🔐 Auth Service"]
            AuthAPI["Supabase Auth"]
            JWT["JWT Tokens"]
        end
        
        subgraph Database["🗄️ PostgreSQL"]
            Tables["Tables"]
            RLS["Row Level Security"]
            Functions["DB Functions"]
            Triggers["Triggers"]
        end
        
        subgraph Edge["⚡ Edge Functions"]
            AI_Funcs["AI Functions"]
            Search["Search Functions"]
            Email["Email Functions"]
        end
        
        subgraph Storage["📁 Storage"]
            Buckets["File Buckets"]
        end
    end

    subgraph External["🔌 External Services"]
        AI["AI Models"]
        LinkedIn["LinkedIn API"]
    end

    Browser --> Frontend
    Router --> Auth
    Auth --> Query
    Query --> UI
    State --> UI
    
    Frontend -->|REST API| AuthAPI
    Frontend -->|REST API| Tables
    Frontend -->|Invoke| Edge
    Frontend -->|Upload/Download| Storage
    
    Edge --> AI
    Edge --> LinkedIn
    Edge --> Database
    
    AuthAPI --> JWT
    Tables --> RLS
    RLS --> Functions
```

### Component Architecture

```mermaid
graph TB
    subgraph App["App.tsx"]
        Providers["Providers Layer"]
        ErrorBoundary["Error Boundary"]
        RouterConfig["Router Config"]
    end

    subgraph Providers_Detail["Providers"]
        Helmet["HelmetProvider (SEO)"]
        QueryClient["QueryClientProvider"]
        AuthProvider["AuthProvider"]
        Tooltip["TooltipProvider"]
        Theme["Theme Provider"]
    end

    subgraph Routes["Route Groups"]
        Public["Public Routes"]
        Candidate["Candidate Routes"]
        Recruiter["Recruiter Routes"]
        Manager["Manager Routes"]
    end

    subgraph Protected["Protected Route Wrapper"]
        RoleCheck["Role Validation"]
        Redirect["Auth Redirect"]
    end

    subgraph Layouts["Layouts"]
        DashboardLayout["Dashboard Layout"]
        Sidebar["Sidebar Nav"]
        Header["Header"]
    end

    subgraph Shared["Shared Components"]
        UIComponents["UI Components"]
        Forms["Form Components"]
        Tables["Table Components"]
        Cards["Card Components"]
    end

    App --> Providers_Detail
    Providers --> RouterConfig
    RouterConfig --> Routes
    
    Candidate --> Protected
    Recruiter --> Protected
    Manager --> Protected
    
    Protected --> RoleCheck
    Protected --> Layouts
    Layouts --> Shared
```

### Authentication Flow

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant C as Client App
    participant A as Auth Provider
    participant S as Supabase Auth
    participant D as Database
    participant R as RPC Functions

    rect rgb(240, 248, 255)
        Note over U,R: Sign Up Flow
        U->>C: Fill signup form
        C->>S: signUp(email, password, metadata)
        S->>S: Create auth.users record
        S->>D: Trigger handle_new_user()
        D->>D: Create profiles record
        S-->>C: Return session + user
        C->>R: assign_user_role(user_id, role, org_id)
        R->>D: Insert user_roles record
        C->>A: Update auth state
        A-->>U: Redirect to dashboard
    end

    rect rgb(255, 248, 240)
        Note over U,R: Sign In Flow
        U->>C: Enter credentials
        C->>S: signInWithPassword()
        S->>S: Validate credentials
        S-->>C: Return session + user
        C->>D: Fetch user roles
        D-->>C: Return roles array
        C->>A: Set user, session, roles
        A-->>U: Redirect based on role
    end

    rect rgb(240, 255, 240)
        Note over U,R: Password Reset Flow
        U->>C: Request password reset
        C->>S: resetPasswordForEmail()
        S->>U: Send reset email
        U->>C: Click reset link
        C->>S: updateUser(new_password)
        S-->>C: Confirm update
        C-->>U: Redirect to login
    end
```

### Data Flow Architecture

```mermaid
flowchart LR
    subgraph Client["Client Layer"]
        Components["React Components"]
        Hooks["Custom Hooks"]
        Store["Zustand Store"]
    end

    subgraph Query["React Query Layer"]
        Queries["useQuery"]
        Mutations["useMutation"]
        Cache["Query Cache"]
    end

    subgraph API["API Layer"]
        SupaClient["Supabase Client"]
        EdgeCalls["Edge Function Calls"]
    end

    subgraph Backend["Backend Layer"]
        Tables["Database Tables"]
        RLS_Policies["RLS Policies"]
        EdgeFuncs["Edge Functions"]
        Storage["File Storage"]
    end

    Components --> Hooks
    Hooks --> Queries
    Hooks --> Mutations
    Queries --> Cache
    Mutations --> Cache
    Cache --> SupaClient
    Cache --> EdgeCalls
    SupaClient --> Tables
    SupaClient --> Storage
    EdgeCalls --> EdgeFuncs
    Tables --> RLS_Policies
    EdgeFuncs --> Tables

    Store -.->|Local State| Components
```

### Database Entity Relationship Diagram

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USER_ROLES : has
    ORGANIZATIONS ||--o{ JOBS : posts
    ORGANIZATIONS ||--o{ CANDIDATE_PROFILES : manages
    ORGANIZATIONS ||--o{ CANDIDATE_SHORTLISTS : creates
    ORGANIZATIONS ||--o{ OUTREACH_CAMPAIGNS : runs
    ORGANIZATIONS ||--o{ AI_RECRUITING_AGENTS : configures
    ORGANIZATIONS ||--o{ ORGANIZATION_INVITE_CODES : generates
    ORGANIZATIONS ||--o{ EMAIL_SEQUENCES : defines
    ORGANIZATIONS ||--o{ TALENT_INSIGHTS : stores

    PROFILES ||--|| USER_ROLES : has
    
    CANDIDATE_PROFILES ||--o{ CANDIDATE_SKILLS : has
    CANDIDATE_PROFILES ||--o{ CANDIDATE_EXPERIENCE : has
    CANDIDATE_PROFILES ||--o{ CANDIDATE_EDUCATION : has
    CANDIDATE_PROFILES ||--o{ RESUMES : uploads
    CANDIDATE_PROFILES ||--o{ APPLICATIONS : submits
    CANDIDATE_PROFILES ||--o{ SHORTLIST_CANDIDATES : included_in
    CANDIDATE_PROFILES ||--o{ CAMPAIGN_RECIPIENTS : receives
    CANDIDATE_PROFILES ||--o{ AGENT_RECOMMENDATIONS : matched_by
    CANDIDATE_PROFILES ||--o{ AI_RESUME_ANALYSES : analyzed_by

    JOBS ||--o{ APPLICATIONS : receives
    JOBS ||--o{ AI_RECRUITING_AGENTS : linked_to
    JOBS ||--o{ OUTREACH_CAMPAIGNS : associated_with
    JOBS ||--o{ TALENT_INSIGHTS : generates
    JOBS ||--o{ AI_RESUME_ANALYSES : compared_against

    CANDIDATE_SHORTLISTS ||--o{ SHORTLIST_CANDIDATES : contains

    OUTREACH_CAMPAIGNS ||--o{ CAMPAIGN_RECIPIENTS : targets

    AI_RECRUITING_AGENTS ||--o{ AGENT_RECOMMENDATIONS : produces

    RESUMES ||--o{ AI_RESUME_ANALYSES : analyzed_in
    RESUMES ||--o{ APPLICATIONS : attached_to

    ORGANIZATIONS {
        uuid id PK
        string name
        string industry
        string size
        string website
        string logo_url
        string description
    }

    PROFILES {
        uuid id PK
        uuid user_id FK
        string email
        string full_name
        string phone
        string location
    }

    USER_ROLES {
        uuid id PK
        uuid user_id FK
        enum role
        uuid organization_id FK
    }

    JOBS {
        uuid id PK
        uuid organization_id FK
        uuid recruiter_id FK
        string title
        text description
        string status
        string[] required_skills
    }

    CANDIDATE_PROFILES {
        uuid id PK
        uuid user_id FK
        uuid organization_id FK
        string full_name
        string current_title
        string current_company
        int years_of_experience
    }

    APPLICATIONS {
        uuid id PK
        uuid candidate_id FK
        uuid job_id FK
        uuid resume_id FK
        string status
        int ai_match_score
    }
```

### Recruiter Workflow

```mermaid
flowchart TD
    Start([Recruiter Login]) --> Dashboard[View Dashboard]
    
    Dashboard --> PostJob[Post New Job]
    Dashboard --> ViewPool[View Talent Pool]
    Dashboard --> ViewShortlists[Manage Shortlists]
    Dashboard --> RunAgents[Configure AI Agents]
    
    PostJob --> DefineReqs[Define Requirements]
    DefineReqs --> Publish[Publish Job]
    Publish --> ReceiveApps[Receive Applications]
    
    ViewPool --> Search[Search Candidates]
    Search --> Filter[Apply Filters]
    Filter --> ViewProfile[View Candidate Profile]
    ViewProfile --> AddToShortlist[Add to Shortlist]
    ViewProfile --> StartOutreach[Start Outreach]
    
    ReceiveApps --> AIMatch[AI Matching]
    AIMatch --> ReviewMatches[Review Matches]
    ReviewMatches --> ViewProfile
    
    RunAgents --> ConfigCriteria[Set Search Criteria]
    ConfigCriteria --> AutoSearch[Automated Search]
    AutoSearch --> Recommendations[Get Recommendations]
    Recommendations --> ReviewMatches
    
    AddToShortlist --> ViewShortlists
    ViewShortlists --> CreateCampaign[Create Campaign]
    CreateCampaign --> StartOutreach
    StartOutreach --> TrackResponses[Track Responses]
    TrackResponses --> Schedule[Schedule Interviews]
```

### Edge Function Architecture

```mermaid
flowchart TB
    subgraph Client["Client Application"]
        React["React App"]
    end

    subgraph EdgeLayer["Edge Functions Layer (Deno)"]
        subgraph AI_Functions["AI Functions"]
            AnalyzeResume["analyze-resume"]
            MatchCandidates["match-candidates"]
            GenerateEmail["generate-email"]
            GenerateInsights["generate-insights"]
            RecommendJobs["recommend-jobs"]
        end

        subgraph Data_Functions["Data Functions"]
            ParseResume["parse-resume"]
            BulkImport["bulk-import-candidates"]
            TalentSearch["talent-search"]
            LinkedInSearch["linkedin-search"]
        end

        subgraph Automation["Automation"]
            RunAgent["run-agent"]
        end
    end

    subgraph External["External Services"]
        AIModels["AI Models<br/>(Lovable AI)"]
        LinkedIn["LinkedIn API"]
    end

    subgraph Database["Supabase Database"]
        Tables["PostgreSQL Tables"]
    end

    React -->|invoke| AI_Functions
    React -->|invoke| Data_Functions
    React -->|invoke| Automation

    AnalyzeResume --> AIModels
    MatchCandidates --> AIModels
    GenerateEmail --> AIModels
    GenerateInsights --> AIModels
    RecommendJobs --> AIModels

    LinkedInSearch --> LinkedIn

    AI_Functions --> Tables
    Data_Functions --> Tables
    Automation --> Tables
    Automation --> AI_Functions
```



## Features

### Candidate Features
- 🔍 **Job Search** - Browse and filter job listings
- 📄 **Resume Management** - Upload and manage multiple resumes
- 🤖 **AI Analysis** - Get AI-powered feedback on your resume
- 📊 **Application Tracking** - Monitor application status in real-time
- 👤 **Profile Management** - Comprehensive profile with skills, experience, education

### Recruiter Features
- 👥 **Talent Pool** - Centralized candidate database with filtering
- 🎯 **AI Matching** - Intelligent candidate-job matching algorithms
- 📧 **Outreach Campaigns** - Automated email sequences
- 📋 **Shortlists** - Create and manage candidate shortlists
- 🔎 **Talent Search** - Advanced search with multiple criteria
- 🤖 **AI Agents** - Automated recruiting assistants
- 📈 **Talent Insights** - Data-driven hiring analytics

### Account Manager Features
- 📊 **Analytics Dashboard** - Organization-wide metrics
- 👥 **Team Management** - Manage recruiters and permissions
- 🏢 **Organization Settings** - Configure company profile
- 📋 **Job Oversight** - Monitor all job postings

## Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library
- **React Router v6** - Client-side routing
- **React Query (TanStack Query)** - Server state management
- **React Hook Form** - Form handling
- **Zod** - Schema validation
- **Recharts** - Data visualization
- **Lucide React** - Icon library
- **Framer Motion** - Animations (via Tailwind)

### Backend
- **Supabase** - Backend-as-a-Service
  - PostgreSQL database
  - Row Level Security (RLS)
  - Edge Functions (Deno)
  - Authentication
  - Real-time subscriptions
  - File storage

### AI Integration
- Resume parsing and analysis
- Candidate-job matching
- Email generation
- Talent insights generation

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher) - [Download](https://nodejs.org/)
- **npm** (v9.0.0 or higher) - Comes with Node.js
- **Git** - [Download](https://git-scm.com/)
- **Supabase CLI** (for database setup) - [Install Guide](https://supabase.com/docs/guides/cli)

To verify your installations:

```bash
node --version      # Should be v18.x.x or higher
npm --version       # Should be v9.x.x or higher
git --version       # Any recent version
supabase --version  # Should be v1.x.x or higher
```

### Installing Supabase CLI

**macOS (Homebrew):**
```bash
brew install supabase/tap/supabase
```

**Windows (Scoop):**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Linux/WSL:**
```bash
curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh
```

**npm (all platforms):**
```bash
npm install -g supabase
```

## Getting Started

You have two options for setting up the backend:

### Option A: Use Existing Supabase Project (Quickest)

Use the pre-configured Supabase project (database already set up):

#### 1. Clone the Repository

```bash
git clone https://github.com/yeluru/query-create-launch.git
cd query-create-launch
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
touch .env
```

Add the following environment variables:

```env
VITE_SUPABASE_URL=https://rnwyflevkpamxhxkhkww.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJud3lmbGV2a3BhbXhoeGtoa3d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2ODc5ODAsImV4cCI6MjA4MjI2Mzk4MH0.zXASSo0trZxl8wTFD7DykquOFYbQ0OPXisX-XkhB9bY
VITE_SUPABASE_PROJECT_ID=rnwyflevkpamxhxkhkww
```

#### 4. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:8080`

---

### Option B: Create Your Own Supabase Project (Full Independence)

Set up your own Supabase project with fresh database:

#### 1. Clone the Repository

```bash
git clone https://github.com/yeluru/query-create-launch.git
cd query-create-launch
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create an account
2. Click "New Project"
3. Fill in project details:
   - **Name**: MatchTalAI (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
4. Wait for project to be created (~2 minutes)

#### 4. Get Your Supabase Credentials

From your Supabase dashboard:
1. Go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxxxxxxxxxx.supabase.co`)
   - **anon public** key (starts with `eyJ...`)
   - **Project Reference ID** (the `xxxxxxxxxxxx` part from URL)

#### 5. Set Up Environment Variables

Create a `.env` file:

```bash
touch .env
```

Add your credentials:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key_here
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_ID
```

#### 6. Link Supabase CLI to Your Project

```bash
# Login to Supabase
supabase login

# Link to your project (you'll need your project reference ID)
supabase link --project-ref YOUR_PROJECT_ID
```

#### 7. Run Database Migrations

Apply all database migrations to set up tables, RLS policies, and functions:

```bash
supabase db push
```

This command will:
- Create all required tables (22 migrations)
- Set up Row Level Security policies
- Create database functions and triggers
- Configure storage buckets

#### 8. Deploy Edge Functions

Deploy all serverless functions:

```bash
supabase functions deploy
```

Or deploy specific functions:

```bash
supabase functions deploy analyze-resume
supabase functions deploy match-candidates
supabase functions deploy generate-email
supabase functions deploy generate-insights
supabase functions deploy parse-resume
supabase functions deploy recommend-jobs
supabase functions deploy talent-search
supabase functions deploy linkedin-search
supabase functions deploy bulk-import-candidates
supabase functions deploy run-agent
```

#### 9. Set Up Edge Function Secrets

Some edge functions require API keys. Set them via CLI:

```bash
# Required for AI features
supabase secrets set LOVABLE_API_KEY=your_lovable_api_key

# Optional - for LinkedIn search feature
supabase secrets set FIRECRAWL_API_KEY=your_firecrawl_key
```

#### 10. Create Storage Bucket

The resume upload feature requires a storage bucket:

```bash
# Via Supabase Dashboard:
# 1. Go to Storage → New Bucket
# 2. Name: "resumes"
# 3. Set as Public bucket
# 4. Create bucket
```

Or via SQL (run in SQL Editor):

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true);
```

#### 11. Start the Development Server

```bash
npm run dev
```

---

## Database Migrations

The project includes 22 database migrations in `supabase/migrations/`. These set up:

### Tables Created
- `organizations` - Company data
- `profiles` - User profiles
- `user_roles` - Role assignments (candidate, recruiter, account_manager)
- `jobs` - Job postings
- `applications` - Job applications
- `candidate_profiles` - Extended candidate info
- `candidate_skills` - Skills data
- `candidate_experience` - Work history
- `candidate_education` - Education records
- `resumes` - Resume files
- `candidate_shortlists` - Recruiter shortlists
- `shortlist_candidates` - Candidates in shortlists
- `outreach_campaigns` - Email campaigns
- `campaign_recipients` - Campaign targets
- `email_sequences` - Email templates
- `ai_recruiting_agents` - AI agent configs
- `agent_recommendations` - AI recommendations
- `ai_resume_analyses` - Resume analysis results
- `talent_insights` - Generated insights
- `notifications` - User notifications
- `organization_invite_codes` - Invite codes

### Database Functions
- `has_role()` - Check if user has specific role
- `get_user_organization()` - Get user's organization ID
- `assign_user_role()` - Securely assign roles
- `recruiter_can_access_candidate()` - Check candidate access
- `generate_invite_code()` - Generate org invite codes
- `use_invite_code()` - Validate and use invite codes
- `handle_new_user()` - Trigger for new user setup
- `update_updated_at_column()` - Timestamp trigger

### Verifying Migration Success

After running migrations, verify in Supabase Dashboard:

1. **Tables**: Go to Table Editor - should see all 20+ tables
2. **Functions**: Go to Database → Functions - should see 8 functions
3. **Policies**: Each table should have RLS enabled with policies

Or via CLI:

```bash
# List all tables
supabase db diff

# Check migration status
supabase migration list
```

---

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 8080) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key | Yes |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ID | Yes |

> **Note**: The `VITE_` prefix is required for Vite to expose these variables to the client-side code.

## Project Structure

```
├── public/                  # Static assets
│   ├── favicon.ico
│   ├── placeholder.svg
│   └── robots.txt
├── src/
│   ├── components/          # React components
│   │   ├── layouts/         # Layout components
│   │   ├── recruiter/       # Recruiter-specific components
│   │   └── ui/              # shadcn/ui components
│   ├── hooks/               # Custom React hooks
│   │   ├── useAuth.tsx      # Authentication hook
│   │   ├── use-mobile.tsx   # Mobile detection
│   │   └── use-toast.ts     # Toast notifications
│   ├── integrations/        # External service integrations
│   │   └── supabase/        # Supabase client and types
│   ├── lib/                 # Utility libraries
│   │   ├── orgSlug.ts       # Organization slug helpers
│   │   └── utils.ts         # General utilities
│   ├── pages/               # Page components (routes)
│   │   ├── candidate/       # Candidate pages
│   │   ├── manager/         # Account manager pages
│   │   ├── public/          # Public pages
│   │   └── recruiter/       # Recruiter pages
│   ├── stores/              # Zustand state stores
│   ├── App.tsx              # Main app component with routing
│   ├── App.css              # Global styles
│   ├── index.css            # Tailwind imports and CSS variables
│   └── main.tsx             # Application entry point
├── supabase/
│   ├── config.toml          # Supabase configuration
│   ├── functions/           # Edge functions
│   │   ├── analyze-resume/
│   │   ├── bulk-import-candidates/
│   │   ├── generate-email/
│   │   ├── generate-insights/
│   │   ├── linkedin-search/
│   │   ├── match-candidates/
│   │   ├── parse-resume/
│   │   ├── recommend-jobs/
│   │   ├── run-agent/
│   │   └── talent-search/
│   └── migrations/          # Database migrations
├── .env                     # Environment variables (create this)
├── index.html               # HTML entry point
├── package.json             # Dependencies and scripts
├── tailwind.config.ts       # Tailwind configuration
├── tsconfig.json            # TypeScript configuration
└── vite.config.ts           # Vite configuration
```

## User Roles

The platform supports three distinct user roles:

### 1. Candidate (`candidate`)
- Can search and apply for jobs
- Manage personal profile and resumes
- Track application status
- Access AI-powered career analysis

### 2. Recruiter (`recruiter`)
- Manage talent pool for their organization
- Create and manage job postings
- Run AI matching and outreach campaigns
- Create candidate shortlists
- Access talent insights

### 3. Account Manager (`account_manager`)
- Full organizational oversight
- Manage team members
- Access analytics dashboard
- Configure organization settings

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profile information |
| `organizations` | Company/organization data |
| `user_roles` | User role assignments |
| `jobs` | Job postings |
| `applications` | Job applications |
| `candidate_profiles` | Extended candidate information |
| `candidate_skills` | Candidate skills |
| `candidate_experience` | Work experience |
| `candidate_education` | Education history |
| `resumes` | Uploaded resumes |
| `candidate_shortlists` | Recruiter shortlists |
| `shortlist_candidates` | Candidates in shortlists |
| `outreach_campaigns` | Email campaigns |
| `campaign_recipients` | Campaign recipients |
| `ai_recruiting_agents` | AI agent configurations |
| `agent_recommendations` | AI recommendations |
| `ai_resume_analyses` | Resume analysis results |
| `talent_insights` | Generated insights |
| `notifications` | User notifications |
| `organization_invite_codes` | Invite codes |
| `email_sequences` | Email templates |

## Security Features

### Row Level Security (RLS)

All tables are protected with Row Level Security policies:

1. **Organization Isolation** - Recruiters can only access candidates within their organization
2. **User Data Protection** - Users can only read/modify their own data
3. **Role-Based Access** - Different access levels based on user roles

### Authentication

- Email/password authentication via Supabase Auth
- Auto-confirm enabled for development
- Password reset flow implemented
- Secure session management

### Key Security Policies

- Candidates can only self-assign the `candidate` role
- Recruiter/manager roles must be assigned via secure RPC function
- Cross-organization data access is prevented
- All sensitive operations require authentication

## Testing Guide

### 1. Authentication Testing

**Sign Up as Candidate:**
1. Go to `/auth`
2. Click "Sign Up" tab
3. Fill in details with role "Candidate"
4. Submit and verify redirect to candidate dashboard

**Sign Up as Recruiter:**
1. Go to `/auth`
2. Click "Sign Up" tab
3. Fill in details with role "Recruiter"
4. Enter organization name
5. Submit and verify redirect to recruiter dashboard

**Password Reset:**
1. Go to `/auth`
2. Click "Forgot password?"
3. Enter email
4. Check for confirmation message

### 2. Candidate Features Testing

- **Profile**: Navigate to Profile page, update information
- **Resume Upload**: Upload a PDF resume
- **Job Search**: Browse available jobs
- **Apply**: Submit application to a job
- **AI Analysis**: Check AI-powered resume feedback

### 3. Recruiter Features Testing

- **Talent Pool**: View candidates in your organization
- **Create Job**: Post a new job listing
- **AI Matching**: Run AI matching for a job
- **Shortlists**: Create and manage candidate lists
- **Outreach**: Set up email campaigns

### 4. Security Testing

**Organization Isolation:**
1. Create two recruiter accounts in different organizations
2. Add candidates to each organization
3. Verify Recruiter A cannot see Recruiter B's candidates

**Role Protection:**
1. Attempt to sign up as recruiter without organization
2. Verify it fails or defaults to candidate

## Edge Functions

The platform includes several Supabase Edge Functions:

| Function | Purpose |
|----------|---------|
| `analyze-resume` | AI-powered resume analysis |
| `bulk-import-candidates` | Batch candidate import |
| `generate-email` | AI email generation |
| `generate-insights` | Talent insights generation |
| `linkedin-search` | LinkedIn profile search |
| `match-candidates` | AI candidate matching |
| `parse-resume` | Resume text extraction |
| `recommend-jobs` | Job recommendations |
| `run-agent` | Execute AI agents |
| `talent-search` | Advanced talent search |

## Deployment

### Option 1: Lovable Deployment

1. Open project in Lovable
2. Click "Publish" button
3. Your app is live!

### Option 2: Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts to link/create project
# Set environment variables in Vercel dashboard
```

**Environment Variables to set in Vercel:**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

### Option 3: Netlify Deployment

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build the project
npm run build

# Deploy
netlify deploy --prod --dir=dist
```

**netlify.toml** (create in project root):
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Option 4: Docker Deployment

**Dockerfile** (create in project root):
```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**nginx.conf** (create in project root):
```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        server_name localhost;
        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

**Build and run:**
```bash
docker build -t matchtalai .
docker run -p 80:80 matchtalai
```

### Option 5: AWS S3 + CloudFront

```bash
# Build
npm run build

# Sync to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront cache (if using)
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (port 8080) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Supabase CLI Commands Reference

| Command | Description |
|---------|-------------|
| `supabase login` | Authenticate with Supabase |
| `supabase link --project-ref ID` | Link to existing project |
| `supabase db push` | Apply all migrations |
| `supabase db diff` | Show schema differences |
| `supabase migration list` | List all migrations |
| `supabase functions deploy` | Deploy all edge functions |
| `supabase functions deploy NAME` | Deploy specific function |
| `supabase secrets set KEY=VALUE` | Set edge function secret |
| `supabase secrets list` | List all secrets |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

### Code Style

- Use TypeScript for all new files
- Follow existing component patterns
- Use Tailwind CSS for styling
- Prefer shadcn/ui components
- Write meaningful commit messages

## Troubleshooting

### Common Issues

**"Cannot connect to database"**
- Verify `.env` file exists with correct values
- Check Supabase project is active
- Ensure you're using the correct project URL

**"Unauthorized" errors**
- Clear browser storage and re-login
- Verify RLS policies are correctly applied
- Check that user has correct role assigned

**"Edge function not found"**
- Deploy functions: `supabase functions deploy`
- Check function name matches exactly
- Verify function is in `supabase/functions/` directory

**"Migration failed"**
- Check for existing conflicting tables
- Run `supabase db reset` to start fresh (WARNING: deletes all data)
- Review migration SQL for errors

**Build failures**
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`
- Check for TypeScript errors: `npx tsc --noEmit`

**Resume upload fails**
- Verify `resumes` storage bucket exists
- Check bucket is set to public
- Verify file size is under limit

### Debug Mode

Enable detailed logging by opening browser DevTools:
- **Console tab**: View application logs
- **Network tab**: Monitor API requests
- **Application tab**: Check localStorage/sessionStorage

## License

This project is proprietary software.

## Support

For questions or issues, please open a GitHub issue or contact the development team.

---

Built with ❤️ using [Lovable](https://lovable.dev)
