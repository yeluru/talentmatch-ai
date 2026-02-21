-- Merge "applied" status into "outreach" (Engaged) for talent pool
-- Sourced candidates are engaged directly by recruiters, not self-applied,
-- so "applied" and "outreach" are treated as the same stage.

-- Update candidate_profiles recruiter_status
UPDATE public.candidate_profiles
SET recruiter_status = 'outreach'
WHERE recruiter_status = 'applied';

-- Update applications status
UPDATE public.applications
SET status = 'outreach'
WHERE status = 'applied';

-- Update shortlist_candidates status (if any)
UPDATE public.shortlist_candidates
SET status = 'outreach'
WHERE status = 'applied';

-- Note: "applied" remains a valid database value in the CHECK constraint
-- for backward compatibility, but the UI maps it to "Engaged" via normalizeStatusForDisplay().
