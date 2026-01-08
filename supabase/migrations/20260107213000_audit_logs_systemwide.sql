-- System-wide audit logging for write activity (INSERT/UPDATE/DELETE)
-- Goals:
-- - Capture actor (auth.uid()) and org scope when available
-- - Support platform-level events (org_id may be NULL)
-- - Support candidate/self events (org_id may be NULL)
-- - Prevent client-side forgery of audit logs

-- 1) Make organization_id nullable to support platform + public candidate actions
ALTER TABLE public.audit_logs
  ALTER COLUMN organization_id DROP NOT NULL;

-- 2) Replace insert policy with a safer one:
-- - user_id must be the actor
-- - org_id may be NULL OR must match actor's org
-- - super_admin may log against any org (still user_id must be actor)
DROP POLICY IF EXISTS "Users can insert audit logs for themselves in their org" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

CREATE POLICY "Actors can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    organization_id IS NULL
    OR organization_id = get_user_organization(auth.uid())
    OR has_role(auth.uid(), 'super_admin')
  )
);

-- 3) Generic audit trigger function
CREATE OR REPLACE FUNCTION public.audit_log_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  org_id uuid;
  entity uuid;
  details jsonb;
  action text;
BEGIN
  -- Avoid recursion if someone ever adds triggers to audit_logs
  IF TG_TABLE_NAME = 'audit_logs' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  actor := auth.uid();

  -- If no actor (e.g. service role / internal), don't log via trigger.
  -- Edge functions using service role should insert audit logs explicitly.
  IF actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Infer org_id (prefer row org, else actor org, else NULL)
  org_id := NULL;
  BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      org_id := (to_jsonb(NEW)->>'organization_id')::uuid;
    ELSE
      org_id := (to_jsonb(OLD)->>'organization_id')::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    org_id := NULL;
  END;
  IF org_id IS NULL THEN
    org_id := get_user_organization(actor);
  END IF;

  -- Entity id if present (best effort)
  entity := NULL;
  BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      entity := (to_jsonb(NEW)->>'id')::uuid;
    ELSE
      entity := (to_jsonb(OLD)->>'id')::uuid;
    END IF;
  EXCEPTION WHEN others THEN
    entity := NULL;
  END;

  action := lower(TG_OP);

  IF TG_OP = 'UPDATE' THEN
    details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'INSERT' THEN
    details := jsonb_build_object('new', to_jsonb(NEW));
  ELSE
    details := jsonb_build_object('old', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    ip_address
  ) VALUES (
    org_id,
    actor,
    action,
    TG_TABLE_NAME,
    entity,
    details,
    NULL
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4) Attach triggers to core tables (write activity)
-- Note: Keep scope to tables that represent user/system actions.
DROP TRIGGER IF EXISTS audit_profiles_write ON public.profiles;
CREATE TRIGGER audit_profiles_write
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_user_roles_write ON public.user_roles;
CREATE TRIGGER audit_user_roles_write
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_organizations_write ON public.organizations;
CREATE TRIGGER audit_organizations_write
AFTER INSERT OR UPDATE OR DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_jobs_write ON public.jobs;
CREATE TRIGGER audit_jobs_write
AFTER INSERT OR UPDATE OR DELETE ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_applications_write ON public.applications;
CREATE TRIGGER audit_applications_write
AFTER INSERT OR UPDATE OR DELETE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_profiles_write ON public.candidate_profiles;
CREATE TRIGGER audit_candidate_profiles_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_recruiter_invites_write ON public.recruiter_invites;
CREATE TRIGGER audit_recruiter_invites_write
AFTER INSERT OR UPDATE OR DELETE ON public.recruiter_invites
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_manager_invites_write ON public.manager_invites;
CREATE TRIGGER audit_manager_invites_write
AFTER INSERT OR UPDATE OR DELETE ON public.manager_invites
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_org_admin_invites_write ON public.org_admin_invites;
CREATE TRIGGER audit_org_admin_invites_write
AFTER INSERT OR UPDATE OR DELETE ON public.org_admin_invites
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

-- Additional tables (broader coverage of system activity)
DROP TRIGGER IF EXISTS audit_clients_write ON public.clients;
CREATE TRIGGER audit_clients_write
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_skills_write ON public.candidate_skills;
CREATE TRIGGER audit_candidate_skills_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_skills
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_experience_write ON public.candidate_experience;
CREATE TRIGGER audit_candidate_experience_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_experience
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_education_write ON public.candidate_education;
CREATE TRIGGER audit_candidate_education_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_education
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_resumes_write ON public.resumes;
CREATE TRIGGER audit_resumes_write
AFTER INSERT OR UPDATE OR DELETE ON public.resumes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_candidate_shortlists_write ON public.candidate_shortlists;
CREATE TRIGGER audit_candidate_shortlists_write
AFTER INSERT OR UPDATE OR DELETE ON public.candidate_shortlists
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_shortlist_candidates_write ON public.shortlist_candidates;
CREATE TRIGGER audit_shortlist_candidates_write
AFTER INSERT OR UPDATE OR DELETE ON public.shortlist_candidates
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_outreach_campaigns_write ON public.outreach_campaigns;
CREATE TRIGGER audit_outreach_campaigns_write
AFTER INSERT OR UPDATE OR DELETE ON public.outreach_campaigns
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_campaign_recipients_write ON public.campaign_recipients;
CREATE TRIGGER audit_campaign_recipients_write
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_email_sequences_write ON public.email_sequences;
CREATE TRIGGER audit_email_sequences_write
AFTER INSERT OR UPDATE OR DELETE ON public.email_sequences
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_email_templates_write ON public.email_templates;
CREATE TRIGGER audit_email_templates_write
AFTER INSERT OR UPDATE OR DELETE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_ai_recruiting_agents_write ON public.ai_recruiting_agents;
CREATE TRIGGER audit_ai_recruiting_agents_write
AFTER INSERT OR UPDATE OR DELETE ON public.ai_recruiting_agents
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_agent_recommendations_write ON public.agent_recommendations;
CREATE TRIGGER audit_agent_recommendations_write
AFTER INSERT OR UPDATE OR DELETE ON public.agent_recommendations
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_talent_insights_write ON public.talent_insights;
CREATE TRIGGER audit_talent_insights_write
AFTER INSERT OR UPDATE OR DELETE ON public.talent_insights
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_ai_resume_analyses_write ON public.ai_resume_analyses;
CREATE TRIGGER audit_ai_resume_analyses_write
AFTER INSERT OR UPDATE OR DELETE ON public.ai_resume_analyses
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_notifications_write ON public.notifications;
CREATE TRIGGER audit_notifications_write
AFTER INSERT OR UPDATE OR DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_job_alerts_write ON public.job_alerts;
CREATE TRIGGER audit_job_alerts_write
AFTER INSERT OR UPDATE OR DELETE ON public.job_alerts
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_user_settings_write ON public.user_settings;
CREATE TRIGGER audit_user_settings_write
AFTER INSERT OR UPDATE OR DELETE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_application_status_history_write ON public.application_status_history;
CREATE TRIGGER audit_application_status_history_write
AFTER INSERT OR UPDATE OR DELETE ON public.application_status_history
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();

DROP TRIGGER IF EXISTS audit_interview_schedules_write ON public.interview_schedules;
CREATE TRIGGER audit_interview_schedules_write
AFTER INSERT OR UPDATE OR DELETE ON public.interview_schedules
FOR EACH ROW EXECUTE FUNCTION public.audit_log_write();


