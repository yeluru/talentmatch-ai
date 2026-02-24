-- Make job_id required for search agents (formerly AI agents)
-- Search agents are job-specific monitoring tools, so job_id should be mandatory

-- Note: This migration assumes all existing agents have job_id set.
-- If any agents have NULL job_id, this will fail and require manual cleanup first.

-- Make job_id NOT NULL
ALTER TABLE public.ai_recruiting_agents
ALTER COLUMN job_id SET NOT NULL;

-- Add helpful comment
COMMENT ON COLUMN public.ai_recruiting_agents.job_id IS
'Required: Search agents are job-specific. This links the agent to the job it monitors.';

-- Update table comment to reflect rename
COMMENT ON TABLE public.ai_recruiting_agents IS
'Search Agents (formerly AI Agents) - job-specific continuous candidate monitoring. Each agent is linked to a job and runs searches to find matching candidates within the organization.';
