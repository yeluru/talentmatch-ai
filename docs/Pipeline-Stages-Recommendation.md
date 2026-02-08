# Pipeline stages: recommendation and consistency

## Current state

- **Recruiter pipeline:** 11 columns (Applied/Engaged, RTR & rate, Document check, Screening, Submission, Client shortlist, Client interview, Offered, Hired, Rejected, Withdrawn).
- **Talent Pool:** Uses same options via `APPLICATION_STAGE_OPTIONS` / `recruiter_status`.
- **DB:** `applications.status` and `candidate_profiles.recruiter_status` share the same allowed values (migration `20260128300000`).

You’re right that some of these feel like **statuses** (state labels) rather than **stages** (steps in a process). Outcomes and “where they sit” get mixed.

---

## Stages vs statuses

- **Stage** = a step in the hiring process (something you “move” the candidate through).
- **Status** = a state or outcome (e.g. Rejected, Withdrawn, or even Hired).

Right now we use one field for both, so the pipeline has many columns and some feel like statuses (Rejected, Withdrawn) or micro-steps (Document check, RTR & rate) rather than clear stages.

---

## Recommendation: fewer, clearer stages

Keep **one ordered list** of values used everywhere: Recruiter Pipeline, Talent Pool, Manager pipeline (when you add it), and any other “manage people” views. Same list in DB and UI.

### Option A – Reduce to 7–8 pipeline stages (recommended)

Treat the pipeline as: **entry → recruiter work → handoff → client work → outcomes.**

| Stage (id)        | Label              | Meaning |
|------------------|--------------------|--------|
| `applied_engaged` | Applied / Engaged  | Entered pipeline (applied or you engaged from pool). |
| `recruiter_review`| Recruiter review   | RTR, docs, screening – one stage, optional sub-notes if needed. |
| `submission`      | Submission         | Sent to manager/client. |
| `client_review`   | Client review      | Shortlist + interview (one stage). |
| `offered`         | Offered            | Offer made. |
| `hired`           | Hired              | Hired. |
| `rejected`        | Rejected           | Outcome: no. |
| `withdrawn`       | Withdrawn          | Outcome: candidate or you withdrew. |

So: **8 columns** in the pipeline, same values in Talent Pool and Manager view. Recruiter review replaces RTR & rate, Document check, and Screening as **one** stage (details can live in notes or future “sub-status” if you want).

**Pros:** Fewer columns, clearer story, same everywhere.  
**Cons:** Requires migration to map existing `rtr_rate`, `document_check`, `screening` → `recruiter_review` (and `client_shortlist` + `client_interview` → `client_review`).

---

### Option B – Keep current stages, single source of truth only

Keep all 11 (or 10 if Applied/Engaged stays merged) stage values as-is. Don’t reduce count; only ensure:

- **One definition:** e.g. `src/lib/statusOptions.ts` (or a small `pipelineStages.ts`) defines the ordered list and labels.
- **Pipeline, Talent Pool, Manager pipeline, and any other “people” views** all import that list for columns, filters, and badges. No duplicate stage lists.

**Pros:** No DB migration; just refactor so Pipeline/TalentPool/others use the same config.  
**Cons:** Still many columns; “stages vs statuses” feeling remains.

---

## Suggested next steps

1. **Short term:**  
   - Make **one** source of truth for “pipeline stages” (ordered ids + labels) and use it in Candidate Pipeline, Talent Pool, TalentDetailSheet, ShortlistCandidateCard, EngagementPipeline, and any Manager pipeline later.  
   - That way, whatever list we use (current or reduced) is consistent everywhere.

2. **Then decide:**  
   - If you want fewer columns and clearer “stages”: do **Option A** (new migration to `recruiter_review` + `client_review`, update UI to the 8-stage list).  
   - If you prefer no DB change: keep **Option B** and only consolidate config.

3. **Manager pipeline:**  
   - When you add it, use the **same** stage list and, if you need “manager-specific” view, filter or group by the same `applications.status` (and recruiter_status where relevant) so Recruiter and Manager always see the same stage semantics.

---

## Summary

- **Stages** = steps in the process; **statuses** = outcomes or state labels. Right now one field is used for both, which makes some columns feel like “statuses.”
- **Recommendation:** Fewer stages (Option A: 8 stages, including “Recruiter review” and “Client review”) and **one shared definition** used in Pipeline, Talent Pool, Manager pipeline, and anywhere else we manage people.
- **Consistency:** Whatever we choose (A or B), define the list once and reuse it everywhere so Pipeline, Talent Pool, and Manager stay aligned.
