# MatchTalAI - AI-Powered Recruitment Platform

A modern, full-stack recruitment platform that connects candidates with recruiters using AI-powered matching, resume analysis, and talent insights.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)

## 📋 Table of Contents

- [Overview](#overview)
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

To verify your installations:

```bash
node --version  # Should be v18.x.x or higher
npm --version   # Should be v9.x.x or higher
git --version   # Any recent version
```

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yeluru/query-create-launch.git
cd query-create-launch
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

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

### 4. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:8080`

### 5. Build for Production

```bash
npm run build
```

### 6. Preview Production Build

```bash
npm run preview
```

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

### Lovable Deployment (Recommended)

1. Open project in Lovable
2. Click "Publish" button
3. Your app is live!

### Self-Hosting

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy the `dist` folder to any static hosting:
   - Vercel
   - Netlify
   - AWS S3 + CloudFront
   - GitHub Pages

3. Configure environment variables on your hosting platform

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

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

**"Unauthorized" errors**
- Clear browser storage and re-login
- Verify RLS policies are correctly applied

**Build failures**
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`

## License

This project is proprietary software.

## Support

For questions or issues, please open a GitHub issue or contact the development team.

---

Built with ❤️ using [Lovable](https://lovable.dev)
