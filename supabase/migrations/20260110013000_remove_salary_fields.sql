-- Remove salary fields from the system (contracting-first product).
-- This drops:
-- - candidate_profiles.desired_salary_min / desired_salary_max
-- - jobs.salary_min / salary_max
-- - job_alerts.salary_min / salary_max

ALTER TABLE public.candidate_profiles
  DROP COLUMN IF EXISTS desired_salary_min,
  DROP COLUMN IF EXISTS desired_salary_max;

ALTER TABLE public.jobs
  DROP COLUMN IF EXISTS salary_min,
  DROP COLUMN IF EXISTS salary_max;

ALTER TABLE public.job_alerts
  DROP COLUMN IF EXISTS salary_min,
  DROP COLUMN IF EXISTS salary_max;

