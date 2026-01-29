# Talent Sourcing — Plan & Progress (working doc)

This file is a **living plan** for Talent Sourcing, focused on **usability, flexibility, and simplicity**.

## Master checklist (DONE vs TODO)
This is the **source of truth** list of items discussed in this initiative.

### DONE
- **Web Search returns results more reliably**
  - Added multi-query strategy + retries to reduce “No profiles found”.
  - Added “Load more” for Web search with dedupe (`excludeUrls` + `strategyIndex`).
- **Search progress / visibility**
  - Search UX no longer has a “blank” experience; results + states are shown in the UI.
- **Fixed “App failed to render” crashes**
  - Missing React imports (e.g., `useEffect`) fixed.
- **Web Search quality guardrails**
  - LLM is used for enrichment only (not filtering results).
  - Emails are not hallucinated: only accepted if present on page text.
- **Provenance links persisted and shown**
  - `github_url` + `website` (or fallback `source_url`) are persisted during import.
  - Candidate detail UI shows GitHub/Website/Source links.
- **Web Search results persistence**
  - Results now persist across page navigation (via `localStorage`).
- **Talent Sourcing layout / usability**
  - Restructured to reduce clutter and keep a consistent results experience.
- **Google X‑Ray implemented**
  - `google-search-linkedin` edge function (API key + CX) returns LinkedIn profile URLs.
  - Pagination/dedupe/scoring + UI query builder + manual query toggle.
- **OAuth cleanup**
  - OAuth-based workaround removed; Google X‑Ray is API-key based.
- **Google API root cause clarified**
  - Confirmed: personal Gmail project key worked; org-owned project key returned 403 due to org/project restrictions.
- **“Description section above View Source”**
  - In current UI, the preview shows headline/snippet and actions (“View source” / “View on LinkedIn”). No separate “description section above the button” exists anymore.
- **Ashby-inspired visual redesign (Ultrahire branding)**
  - Updated global typography to a TT Norms-like open alternative (Plus Jakarta Sans).
  - Updated design tokens (backgrounds, borders, primary/accent) toward a crisp neutral + restrained accent.
  - Polished core components (Button/Input/Card) to feel closer to `ashbyhq.com` (radius, shadows, hover/focus).
- **Web Search tab redesign (declutter + best-in-class UX)**
  - Replaced cluttered inline controls with **one primary search bar row** + a **Filters drawer**.
  - Examples are now collapsed by default; status is inline and calm.
  - Kept all existing functionality: paging, persistence, selection, import, view source.
- **Google X‑Ray: Build from JD (paste OR posted job)**
  - Added “Build from JD” panel to Google X‑Ray:
    - Paste JD text, or select from posted `jobs` and pull its `description`.
  - Added edge function `build-xray-from-jd` to extract titles/skills/locations/seniority and auto-fill the query builder (skills capped to 12).
- **Fix Google X‑Ray JD job picker flicker**
  - Stopped repeated job list reload loops; if loading jobs fails, UI shows a stable error + Retry (no continuous flicker).
- **Google X‑Ray query builder improvements (Juicebox-style usability)**
  - Added a **Prompt** (plain English) field.
  - Split skills into **Must-have** (AND) and **Nice-to-have** (OR by default).
  - JD extraction no longer treats Remote/Hybrid/On-site as geographic locations (and UI filters them out as a backstop).
- **Google X‑Ray: JD extracted options as checkboxes (include/exclude by toggling)**
  - After “Build from JD”, extracted titles/skills/locations are shown as checkbox lists.
  - Defaults are pre-selected; users can uncheck to exclude and the Final query updates immediately.
- **Google X‑Ray JD suggestions UX polish (compact + persistent + titles free-text)**
  - Suggested checkbox UI is compact (no wasted whitespace).
  - Suggested items persist across navigation/refresh.
  - Titles remain a free-text field; checkbox suggestions are used for skills.
- **Google X‑Ray UI cleanup (reduce clutter, show advanced on demand)**
  - Simplified the default view to essentials and moved “manual query + exclude” behind an Advanced toggle.
  - Suggested JD skills now show as compact chips (toggle on/off) instead of a long checkbox list.

### TODO (not started or not complete)
- **Strict US-only enforcement**
  - Current behavior is “US-biased”, not a strict guarantee. If you want strict US-only, we need a deterministic US-location filter on enriched fields (requires enrichment).
- **Leads-first workflow completion**
  - Full “leads → enrich → convert to candidate” workflow (beyond saving leads) is not fully built.
- **Search as a first-class object**
  - Persist searches with editable filters (search entity) + live match counts.
- **Filter system (Juicebox-like)**
  - Radius + multi-location OR, timezone, title scopes (current/recent/past/nested), tenure filters, company include modes (current/past/both), exclude companies, company tags vs skills.
- **Presets**
  - Save/apply filter presets.
- **Find Similar**
  - Expand job titles and companies.
- **Autopilot**
  - Async second-pass ranking/reduction with explainability and progress UI.
- **Outreach / sequences**
  - Templates → sequences (email integration first; LinkedIn direct messaging is high-risk).
- **Light CRM**
  - Shortlists, notes, statuses (beyond candidate import).
- **Insights (optional)**
  - Simple market breakdown charts with click-to-filter.
- **Agents (optional)**
  - Always-on searches that add new leads / queue outreach.

## Product scope & boundaries (non-negotiable)
- **LinkedIn-only sourcing layer**: the product is a search + workflow layer over **LinkedIn public profiles/URLs**.
- **No “our proprietary database” copy**: UI/copy must not imply Dice or a proprietary candidate DB.
- **Every search result must include a LinkedIn reference**: `linkedin_url` (or a LinkedIn public identifier).

## Juicebox PDF feature mapping (what we adopt vs reject)
The Juicebox PDF describes a broader “all-in-one” product (multi-source database + insights + CRM + sequences + agents).
We **intentionally diverge** in a few areas to keep the product simple and aligned with our scope.

- **Out of scope by design (conflicts with our boundary)**
  - Multi-source “800M profiles from 30+ sources” proprietary database model (PDF) → we are **LinkedIn-URL-first**.

- **In-scope (we will implement, phased)**
  - Search + ranking + “second pass” refinement (Autopilot-style).
  - Presets, edit filters, match counts.
  - Outreach (templates, sequences) via safe channels (email first; LinkedIn direct is high-risk).
  - Light CRM: shortlists, notes, status.
  - Optional: insights dashboards (only if it improves usability vs adding noise).
  - Optional: integrations (ATS export/import) after core workflow is stable.

---

## What’s already implemented (since project start of this thread)

### Talent Sourcing UI (Recruiter)
- **Single-column layout + full-width Results pane** for better usability and reduced clutter.
- **Tabs** for sourcing modes (Resumes / Web Search / Google X‑Ray).
- **State persistence** via `localStorage`:
  - Active tab
  - Search pages/results (bounded, e.g. last N pages)
  - Active page selection
- **Remove clutter**: status content consolidated into the results experience (no “blank status panel”).

### Web Search (Firecrawl → URLs → base profiles + optional AI enrichment)
- Web search now:
  - **Aggregates** results across query variants to reach **up to 20 unique URLs** per page.
  - Uses `excludeUrls` + `strategyIndex` to support **Load more** without repeats.
  - Returns **base profiles fast**; runs **LLM extraction only as enrichment** (not as a filter).
  - Uses timeouts/batching to avoid early-termination issues.
  - **Never hallucinates emails** (email must appear in page content).
- **US-only bias** supported via Firecrawl `country=us` and query shaping (not strict guarantees).

### Google X‑Ray (Custom Search JSON API → LinkedIn URLs)
- Edge function `google-search-linkedin`:
  - **API key + CX** based requests to `https://www.googleapis.com/customsearch/v1`.
  - Pagination support to fetch more than 10 results (up to a capped limit).
  - URL canonicalization + dedupe for `linkedin.com/in/...`.
  - Returns `match_score` based on snippet/title heuristics.
- UI:
  - Query builder (titles/skills/location/seniority/excludes) + “Manual query” toggle.
  - “Final query” reflects builder by default.
  - Better error reporting including `debug.key_suffix` / `debug.cx_suffix`.

### Data model + import plumbing
- Introduced a **leads-first direction** (store leads, enrich later, then convert to candidates).
- DB migrations added/updated:
  - `candidate_profiles.website` column added.
  - `sourced_leads` table created (leads storage).
- `bulk-import-candidates` maps provenance links:
  - `github_url`, `website` (plus LinkedIn/source URL handling).
- `TalentDetailSheet` displays GitHub + Website/Source link.

### Shared utilities / reliability
- `_shared/ai.ts` supports `timeoutMs` (and optional abort signaling) for more reliable AI calls.
- Supabase function config updated so specific functions can be tested locally (`verify_jwt=false` where needed).

### Google API troubleshooting outcome (important context)
- Verified that `403: This project does not have the access to Custom Search JSON API.` can be **project/org-policy related**.
- Confirmed behavior: a **personal Gmail GCP project key worked**, while an **org-owned project key** returned 403.
- OAuth-based workaround was explored previously and then **removed**; current implementation is **API key based**.

---

## Roadmap (Juicebox-like workflow) — planned work

### Phase 0 — Light CRM (shortlists / notes / status)
Goal: keep the recruiter workflow inside the product without becoming a full ATS.
- Shortlists (“projects”) that contain LinkedIn leads
- Notes + simple statuses (new / contacted / replied / rejected)
- Export to ATS later as an optional step

### Phase 1 — “Search is a first-class object” (Edit Filters + Presets)
Goal: run search → **Edit Filters** → results + count update → **Save preset**.
- **Entities**
  - `searches`: `id`, `owner_id`, `name`, `query_text`, `filters_json`, timestamps
  - `search_presets`: `id`, `owner_id`, `name`, `filters_json`, timestamps
  - `search_results`: `search_id`, `linkedin_url`, `title`, `snippet`, `match_score`, timestamps
- **UX**
  - Clear header with match count, “Edit filters”, “Save preset”, “Apply preset”
  - Filter chips + a single “Edit Filters” drawer

### Phase 2 — Filter engine (works now on snippets; upgrades later with enrichment)
Goal: implement filters once, keep UI stable, improve accuracy as enrichment improves.
- **Filters schema** (stored in `filters_json`)
  - Location radius + multiple locations (OR)
  - Time zones (ET/CT/MT/PT or canonical)
  - Titles w/ scopes (current/recent/past/nested)
  - Tenure (current role min) + average tenure
  - Companies include (mode: current/past/both) + exclude list
  - Company tags vs Skills (separate lists)
- **Evaluation**
  - Stage A (no enrichment): keyword/snippet based (fast, approximate)
  - Stage B (with enrichment): structured fields (accurate)

### Phase 3 — “Find Similar” expanders (Titles + Companies)
Goal: one-click expansion that updates count/results and stays editable.
- `expand-job-titles`
- `expand-companies`
- Cache + dedupe suggestions, show expanded terms in UI for removal.

### Phase 4 — Enrichment (unlocks “hard filters” accurately)
Goal: enable accurate timezone, tenure, title scopes, current vs past company filters.
**Decision pending** (choose one):
- CSV import
- Provider integration
- Manual enrichment UI

### Phase 5 — Autopilot (async second-pass rank/reduce)
Goal: “Confirm & start Autopilot” runs in background, UI stays responsive.
- `autopilot_runs` table + polling status
- Explainability (reasons per candidate): matched skills/company/tenure/etc.

### Phase 6 — Messaging / Outreach (templates → sequences)
Goal: Juicebox-like “Sequences”, but keep it safe and simple.
- Start: open LinkedIn + copy-to-clipboard templates
- Next: email integration (Gmail/Outlook) + scheduled follow-ups (“sequences”)
- Track: sent/opened/replied (where available) + basic delivery status

### Phase 7 — Insights (optional, only if it improves decisions)
Goal: lightweight “Talent Insights” like Juicebox, but avoid dashboard bloat.
- Simple breakdowns (top companies, titles, locations, skills) for the **current search**
- Click-to-filter interaction (drill down into a slice → show matching candidates)

### Phase 8 — Agents (optional, after Autopilot is stable)
Goal: “always-on sourcing” for a saved search.
- Runs periodically, finds new profiles, and either:
  - recommends to review, or
  - auto-adds to shortlist/sequence (after user calibration)

---

## Open decisions (to resolve before coding the next phase)
- **Enrichment lane** (CSV vs provider vs manual).
- **Messaging channel** (LinkedIn direct is high-risk; email/sequences may be safer).
- **Performance strategy** for large result sets (batching, caching, async jobs).

