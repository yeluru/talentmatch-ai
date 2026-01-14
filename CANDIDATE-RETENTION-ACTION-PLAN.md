## Candidate Retention Action Plan (Resume Workspace + Learning)

This is the execution checklist for making TalentMatch a candidate “career cockpit” (not just a job board).

### Product goals (north stars)
- **Daily/weekly value**: Candidates come back for progress, improvements, and guidance—not only to browse jobs.
- **Compounding assets**: Resume versions, tailored variants, applications, and learning plans accumulate over time.
- **Truth + traceability**: No fabricated experience. Every AI change should reference evidence or ask for missing facts.
- **Persona-adaptive**: Support any candidate level by inferring track/seniority, with an override UI.

---

## Phase 0 — Foundation (definitions + UX rails)
- [ ] **Target role + track inference**
  - **Done when**: Candidate has a “Target role” selector (IC/Manager/Director/Architect + title) and the system can auto-suggest from resume/profile.
- [ ] **Safety rules**
  - **Done when**: Resume generation cannot invent employers/titles/skills; it must request missing facts.
- [ ] **Audit trail for AI edits**
  - **Done when**: Every AI-generated change includes an explanation and a link to supporting evidence.

---

## Phase 1 — Resume Workspace MVP (new page, uploads remain separate)

### 1.1 Routing + navigation
- [x] **New route**: `/candidate/resume-workspace`
- [x] **Candidate nav item**: “Resume Workspace”
- **Done when**: Candidate can open the new page from the dashboard navigation.

### 1.2 Data model (Supabase)
- [x] **`resume_documents` table**
  - Fields: `id`, `candidate_id`, `title`, `template_id`, `target_role`, `target_seniority`, `content_json`, `base_resume_id`, `jd_text`, `additional_instructions`, `linkedin_url`, `created_at`, `updated_at`
- [x] **`resume_document_versions` table**
  - Fields: `id`, `resume_document_id`, `content_json`, `change_summary`, `created_at`
- [x] **RLS policies**
  - Candidate can CRUD their own docs/versions.
- **Done when**: Candidate can create/save/load documents and see version history.

### 1.2b Base resume + JD tailoring workflow (no friction)
- [x] **Pick base resume from “My Resumes” (uploads)**
  - Default: primary resume if present, else most recent
- [x] **Auto-use LinkedIn from candidate profile**
  - If missing: ask once (optional, recommended)
- [x] **Optionally enrich with LinkedIn profile text**
  - Paste “About + Experience” (plain text) → extract facts → merge with base resume facts
  - Note: auto-fetch from LinkedIn URL is typically blocked/ToS-sensitive; paste/export is the reliable path
- [x] **Paste target JD + optional preferences**
- [x] **Generate tailored resume preview**
  - Uses AI; no invented facts (missing items become questions)
- [x] **Save generated resume back into “My Resumes”**
  - Saves as Word-compatible `.doc` (HTML-in-doc for now)
- **Done when**: A candidate can go from “I have a resume + a JD” → “tailored resume saved in My Resumes” in under a minute.

### 1.3 Editor UX (DOC-like)
- [x] **Structured editor UI (MVP)**
  - Sections: Summary, Experience, Projects, Skills, Education, Certifications, Contact
  - Bullet editing + reorder
- [ ] **Autosave + manual save**
- [x] **Version “Save checkpoint”**
- **Done when**: Candidate can edit and persist a resume without uploads.
  - Note: Experience/Education are MVP text-based editors today; we’ll upgrade to fully structured rows + reorder next.

### 1.4 Templates (candidate choice)
- [x] **Template choices**
  - **ATS-safe single-column** (recommended)
  - **Two-column** (warning: may reduce ATS parsing accuracy)
- [x] **Template preview + selector**
- **Done when**: Candidate can switch templates and see a preview.

### 1.5 Export
- [x] **Export PDF (via print)**
- [x] **Export DOC (Word-compatible HTML)**
- [ ] **Export true DOCX**
- **Done when**: Candidate can export a document from the workspace and download both formats.

---

## Phase 2 — JD Tailoring (“wow” feature)
- [ ] **Paste JD / pick job → generate tailored resume variant**
- [ ] **Change log**
  - “What changed” + “Which JD requirement it addresses”
- [ ] **Missing facts Q&A**
  - If a JD needs details not present, ask questions instead of inventing.
- **Done when**: Candidate can produce a job-specific resume version with traceable edits.

---

## Phase 3 — Best-in-class Resume Analysis (explainable + actionable)
- [ ] **Evidence-backed matching**
  - Output: `{ requirement, resume_evidence, confidence }`
- [ ] **Gap → task conversion**
  - Output: `{ gap, severity, fix_action }`
- [ ] **One-click “apply fixes” into the editor**
  - AI returns editor patches (structured) rather than raw text.
- [ ] **ATS checks**
  - Parsing hazards, section order, keyword density warnings.
- **Done when**: The analysis produces tasks and direct edits, not only a score.

---

## Phase 4 — Learning Platform (gap → plan → progress)
- [ ] **Learning plan generator**
  - 2–4 week plan from gaps (adjustable cadence)
- [ ] **Resource library**
  - Curated links by category + difficulty
- [ ] **Progress tracking**
  - Mark done, notes, “proof link”
- **Done when**: Candidate can follow a plan and see progress improve analysis.

---

## Phase 5 — Retention extras (high ROI)
- [ ] **Application hub**
  - Timeline, reminders, follow-ups, outcomes.
- [ ] **Interview prep**
  - Role-based questions, mock practice, answer scoring (STAR rewrites).
- [ ] **LinkedIn assets**
  - Headline/summary generator aligned to target roles.

---

## UI/UX improvements (ongoing)
- [ ] **Candidate “career cockpit” dashboard**
  - Progress ring, next best action, streaks, recent wins.
- [ ] **Visual polish**
  - Higher contrast, richer gradients, more “stateful” components.

---

## Notes / decisions made
- **Editor location**: new route `/candidate/resume-workspace` (uploads stay in `/candidate/resumes`)
- **Templates**: offer both single-column ATS-safe and two-column (with a warning)

