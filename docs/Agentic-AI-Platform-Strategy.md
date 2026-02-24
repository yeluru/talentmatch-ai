# TalentMatch: Agentic AI Platform Strategy

**Goal:** Make TalentMatch the **world’s best all-in-one recruiting SaaS** by adding **Agentic AI**—autonomous or semi-autonomous agents that use tools, reason over data, and execute recruiting workflows so recruiters and Account Managers get more done in one place.

---

## What “Agentic AI” Means Here

- **Agents** = software that can **plan**, **use tools** (search, enrich, score, add to shortlist, send email), and **persist outcomes** (candidates, recommendations, audit logs).
- **Agentic** = agents **decide steps** (e.g. “search → enrich → score → add to pool”) instead of a single fixed pipeline; they can **loop** (e.g. “find 10 more if under target”) and **handle failures** (retry, fallback).
- **Platform** = one place for: **sourcing** (Web, Google X-Ray, Serp), **talent pool**, **jobs**, **pipelines**, **outreach**, **analytics**, and **agents**—all sharing the same data and audit trail.

Today TalentMatch already has:
- **One agent type:** "Search Agents" - job-specific candidate matching (manual Run; no tools, no schedule; org-scoped only).
- **Many tools as edge functions:** web-search, google-search-linkedin, serpapi-search-linkedin, parse-resume, match-candidates, generate-email, send-engagement-email, enrich-linkedin-profile, etc.
- **No orchestration:** the agent cannot call these tools; it only scores a pre-loaded candidate list from the organization.

The strategy below adds **orchestration**, **tool use**, **new agent types**, and **triggers** so TalentMatch becomes a true Agentic AI platform.

---

## Architecture: Orchestrator + Tools + Agents + Triggers

### 1. **Agent Orchestrator** (new backend layer)

- **Role:** Runs an agent with a **plan**: receive a goal (e.g. “Find 10 strong Python candidates in NYC for Job X”), call tools in sequence or loop until done or stopped.
- **Inputs:** Agent config (type, job_id, org_id, criteria, limits), trigger (manual / schedule / event).
- **Outputs:** Tool calls (with params), tool results, final state (candidates added, recommendations created, emails queued), and **audit log** (who/what/when).
- **Implementation:** New edge function `run-agentic-agent` (or extend `run-agent`) that:
  - Loads agent definition and allowed tools.
  - Loop: LLM decides next action (e.g. `web_search`, `enrich_profile`, `add_to_talent_pool`, `create_recommendation`) or “done”.
  - Executes tool via existing edge functions (or internal steps), passes result back to LLM.
  - Stops on “done”, max steps, or error; persists recommendations / pool links / outreach queue and writes to `agent_runs` + audit.

### 2. **Tool Registry** (agents can call these)

| Tool | Description | Existing? | Used by |
|------|-------------|-----------|---------|
| `web_search` | Web search (Firecrawl); returns URLs + snippets | ✅ web-search | Sourcing agent |
| `google_xray` | Google CSE LinkedIn URLs | ✅ google-search-linkedin | Sourcing agent |
| `serp_search` | SerpAPI LinkedIn search | ✅ serpapi-search-linkedin | Sourcing agent |
| `enrich_profile` | Enrich URL/profile (email, skills, etc.) | ✅ enrich-linkedin-profile | Sourcing / outreach agent |
| `add_to_talent_pool` | Add candidate to org talent pool | ✅ bulk-import / link | Sourcing agent |
| `match_candidates` | Score candidates vs job | ✅ match-candidates / run-agent | Matching agent |
| `create_recommendation` | Store agent recommendation (shortlist/queue) | ✅ agent_recommendations | All agents |
| `generate_email` | Draft outreach email | ✅ generate-email | Outreach agent |
| `queue_outreach` | Queue email for send (human approval optional) | ✅ send-engagement-email / queue | Outreach agent |
| `add_to_shortlist` | Add candidate to shortlist | DB + RLS | Sourcing / matching agent |
| `get_job_criteria` | Get job title, description, required_skills | DB | All agents |
| `list_talent_pool` | List org candidates (with filters) | DB | Matching agent |

Expose these as a **structured tool list** (name, description, parameters) to the orchestrator’s LLM so it can choose and call them.

### 3. **Agent Types** (what recruiters/AMs actually use)

| Agent Type | Goal | Tools used | Trigger | Outcome |
|------------|------|------------|---------|---------|
| **Sourcing Agent** | “Find N strong candidates for Job X” | web_search / google_xray / serp_search, enrich_profile, add_to_talent_pool, create_recommendation | Manual, schedule (e.g. daily) | New candidates in pool + recommendations; optional “queue for outreach” |
| **Matching Agent** (current, enhanced) | “Score talent pool (or new batch) vs Job X” | get_job_criteria, list_talent_pool, match_candidates, create_recommendation | Manual, schedule, or “on new candidates” | agent_recommendations with score + reason |
| **Outreach Agent** | “Draft and queue personalized outreach for top N recommendations for Job X” | list recommendations, generate_email, queue_outreach | Manual or after Matching Agent run | Drafts/queued emails; human approval gate optional |
| **Pipeline Agent** (later) | “Move stuck applicants: suggest stage changes or nudge owners” | List applications by stage/job, suggest moves, write to audit | Schedule | Suggestions or auto-moves with audit |
| **Insight Agent** (later) | “Summarize pipeline or market for Job X” | get_job_criteria, list_talent_pool, applications, generate summary | Manual | Short report or dashboard widget |

Start with **Sourcing Agent** and **Matching Agent (enhanced)** so the platform clearly “does more on its own” in one place.

### 4. **Triggers**

- **Manual:** User clicks “Run” (current) or “Run Sourcing Agent” with goal.
- **Schedule:** Cron (e.g. “Every day at 9am run Sourcing Agent for Job X” or “Run Matching Agent weekly for all active jobs”).
- **Event (later):** “On new candidate in pool for Job X” → run Matching Agent; “On 5 new recommendations” → run Outreach Agent.

Store in DB: `agent_schedules` (agent_id, cron, timezone, enabled). Use Supabase pg_cron or an external scheduler to call the orchestrator.

### 5. **Audit & Safety**

- **Agent run log:** Every orchestrator run writes to `agent_runs` (id, agent_id, org_id, user_id, trigger, started_at, ended_at, status, steps_count, result_summary).
- **Tool call log:** Each tool call: tool name, params (sanitized), result (e.g. “added 5 to pool”), error if any. Stored in `agent_run_steps` or in a single JSONB column on `agent_runs`.
- **Audit log:** All mutations (add to pool, add to shortlist, queue email, create recommendation) already go through RLS; add `actor_type: 'agent'` and `agent_run_id` so compliance sees “Agent X did Y at Z”.
- **Guardrails:** Per-org or global limits (e.g. max runs per day, max emails per agent per day); optional **human-in-the-loop** for outreach (queue only, send only after approval).

---

## What to Build First (Phased)

### Phase 1: Orchestrator + Tool Use (foundation)

1. **`run-agentic-agent` edge function**
   - Input: agent_id (or agent_type + job_id + org_id), goal (string), max_steps.
   - Loop: LLM with tool list → tool choice + params → execute tool (call existing edge fn or DB) → return result to LLM → next step or done.
   - Persist: `agent_runs`, `agent_run_steps`; create/update `agent_recommendations` and talent pool links as today.
2. **Tool adapter layer**
   - Map LLM tool names to existing edge functions (e.g. `web_search` → invoke `web-search` with parsed params).
   - Return structured result (e.g. “Added 3 candidates; 2 failed duplicate”) so LLM can reason.
3. **Extend `ai_recruiting_agents`**
   - Add `agent_type` (e.g. `matching` | `sourcing` | `outreach`), `goal_template`, `allowed_tools` (JSON array), `schedule_cron`, `is_active` (for schedule).
4. **UI: "Run with goal"**
   - On Search Agents page: for a given agent, optional "Goal" text box (e.g. "Find 10 Python devs in NYC"); Run calls `run-agentic-agent` with that goal. Show run history (last run, step count, result summary).

This gives **one** agent that can both match (current behavior) and, if given the right tools and goal, source (search + enrich + add to pool). No new agent types yet—just “one agent that can use tools.”

### Phase 2: Sourcing Agent (always-on / scheduled)

1. **Sourcing Agent type**
   - Predefined tools: google_xray or serp_search, enrich_profile, add_to_talent_pool, create_recommendation.
   - Default goal: “Find up to N candidates matching Job X criteria and add to talent pool; create recommendations for top M.”
2. **Schedule**
   - DB + cron: “Run Sourcing Agent for Job X daily.”
   - UI: On agent card or job detail, “Schedule: Daily at 9am” with toggle.
3. **Result UX**
   - “Agent run completed: 5 added to pool, 3 recommendations” with link to Talent Pool and to Recommendations.

This is the **“always-on search that adds leads”** from the Talent Sourcing doc—differentiated and high value.

### Phase 3: Outreach Agent + Human-in-the-Loop

1. **Outreach Agent type**
   - Tools: list recommendations for job, generate_email, queue_outreach (no send yet).
   - Goal: “Draft and queue outreach for top 5 recommendations for Job X.”
2. **Outreach queue**
   - Table or status: `outreach_queue` (candidate_id, job_id, agent_run_id, draft_content, status: pending_approval | approved | sent).
   - UI: “Pending outreach” list; Approve / Edit / Send.
3. **Send**
   - On Approve, call existing send-engagement-email; mark sent and write audit.

This makes the platform **“source + match + draft outreach”** in one place with clear audit and control.

### Phase 4: Observability + Multi-Agent Flows

1. **Agent run history UI**
   - List runs (agent, trigger, time, status, steps, summary); drill into steps (tool + params + result).
2. **Event triggers (optional)**
   - “When Sourcing Agent adds ≥5 candidates for Job X, run Matching Agent.”
   - Implement via small workflow table or server-side hook after agent run.
3. **Pipeline / Insight agents**
   - As needed: pipeline nudge agent, insight/summary agent using same orchestrator + tool pattern.

---

## Why This Makes TalentMatch “World’s Best” with Agentic AI

1. **One platform:** Sourcing (Web, X-Ray, Serp), talent pool, jobs, pipelines, outreach, and **agents** share one data model, one UI, one audit trail. No context switching.
2. **Agents that act:** Unlike “chat with your data,” agents **do** things: search, enrich, add to pool, recommend, draft outreach—with tool use and persistence.
3. **Recruiter and AM value:** Recruiters get “set a goal, get candidates and recommendations”; AMs get oversight (who ran which agent, what changed) and optional schedule/automation.
4. **Safe and compliant:** Every agent action is logged; optional human-in-the-loop for outreach; rate limits and guardrails.
5. **Extensible:** New agent types = new goal templates + tool subsets; new tools = new capabilities without rewriting the orchestrator.

---

## Next Steps

1. **Align on Phase 1 scope:** Orchestrator + tool adapter + one “match + optional source” agent with “Run with goal” in UI.
2. **Design `agent_runs` and `agent_run_steps` schema** (and any `outreach_queue`) in Supabase.
3. **Implement `run-agentic-agent`** with a minimal tool set (e.g. get_job_criteria, list_talent_pool, match_candidates, create_recommendation; then add web_search / add_to_talent_pool).
4. **Add "Goal" + run history to Search Agents page** and ship Phase 1.
5. **Then** Phase 2 (Sourcing Agent + schedule), Phase 3 (Outreach Agent + queue), Phase 4 (observability + events).

Once Phase 1–3 are in place, TalentMatch is a **single, agentic recruiting platform** where recruiters and AMs run agents that search, match, and queue outreach—all in one place, with full audit and control.
