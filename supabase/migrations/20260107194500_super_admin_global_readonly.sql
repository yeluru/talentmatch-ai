-- Platform Admin (super_admin) global read-only
-- Allows internal troubleshooting + audit log review across all organizations.
-- Write operations remain blocked by default RLS policies (except explicit RPCs like revoke_org_admin).

-- =========================
-- Core identity/tenant tables
-- =========================
CREATE POLICY "Super admins can read all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all user roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all organizations"
ON public.organizations
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Hiring workflow tables
-- =========================
CREATE POLICY "Super admins can read all jobs"
ON public.jobs
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all applications"
ON public.applications
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all application status history"
ON public.application_status_history
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all interview schedules"
ON public.interview_schedules
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Candidates + resumes
-- =========================
CREATE POLICY "Super admins can read all candidate profiles"
ON public.candidate_profiles
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all candidate skills"
ON public.candidate_skills
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all candidate experience"
ON public.candidate_experience
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all candidate education"
ON public.candidate_education
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all resumes"
ON public.resumes
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all ai resume analyses"
ON public.ai_resume_analyses
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Talent ops / recruiter tooling tables
-- =========================
CREATE POLICY "Super admins can read all clients"
ON public.clients
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all candidate shortlists"
ON public.candidate_shortlists
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all shortlist candidates"
ON public.shortlist_candidates
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all outreach campaigns"
ON public.outreach_campaigns
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all campaign recipients"
ON public.campaign_recipients
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all email sequences"
ON public.email_sequences
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all email templates"
ON public.email_templates
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all ai recruiting agents"
ON public.ai_recruiting_agents
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all agent recommendations"
ON public.agent_recommendations
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all talent insights"
ON public.talent_insights
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- User-facing supporting tables
-- =========================
CREATE POLICY "Super admins can read all notifications"
ON public.notifications
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all job alerts"
ON public.job_alerts
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all user settings"
ON public.user_settings
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Invite/admin tables
-- =========================
CREATE POLICY "Super admins can read all org admin invites"
ON public.org_admin_invites
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all manager invites"
ON public.manager_invites
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all recruiter invites"
ON public.recruiter_invites
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all organization invite codes"
ON public.organization_invite_codes
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- =========================
-- Audit / ops tables
-- =========================
CREATE POLICY "Super admins can read all audit logs"
ON public.audit_logs
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- Make audit logs tamper-resistant from the client surface area.
-- Service role bypasses RLS, so edge functions and trusted services can still insert.
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert audit logs for themselves in their org"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND organization_id = get_user_organization(auth.uid())
);

-- Archived users and suspensions are platform-level operational data; allow read-only for super_admin.
CREATE POLICY "Super admins can read all archived users"
ON public.archived_users
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can read all user suspensions"
ON public.user_suspensions
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));


