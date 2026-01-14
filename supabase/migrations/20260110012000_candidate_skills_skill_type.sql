-- Add skill typing so we can distinguish technical vs soft skills.

ALTER TABLE public.candidate_skills
ADD COLUMN IF NOT EXISTS skill_type text NOT NULL DEFAULT 'technical';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_skills_skill_type_check') THEN
    ALTER TABLE public.candidate_skills DROP CONSTRAINT candidate_skills_skill_type_check;
  END IF;
END $$;

ALTER TABLE public.candidate_skills
ADD CONSTRAINT candidate_skills_skill_type_check
CHECK (skill_type IN ('technical', 'soft'));

CREATE INDEX IF NOT EXISTS idx_candidate_skills_candidate_type
ON public.candidate_skills(candidate_id, skill_type);

