-- Create candidate shortlists table
CREATE TABLE public.candidate_shortlists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shortlist candidates junction table
CREATE TABLE public.shortlist_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shortlist_id UUID NOT NULL REFERENCES public.candidate_shortlists(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  notes TEXT,
  status TEXT DEFAULT 'added',
  added_by UUID NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(shortlist_id, candidate_id)
);

-- Create email sequences table
CREATE TABLE public.email_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  sequence_order INTEGER NOT NULL DEFAULT 1,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create outreach campaigns table
CREATE TABLE public.outreach_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create campaign recipients table
CREATE TABLE public.campaign_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.outreach_campaigns(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,
  current_step INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create AI agents table
CREATE TABLE public.ai_recruiting_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  search_criteria JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  auto_outreach BOOLEAN DEFAULT false,
  last_run_at TIMESTAMP WITH TIME ZONE,
  candidates_found INTEGER DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create agent recommendations table
CREATE TABLE public.agent_recommendations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ai_recruiting_agents(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidate_profiles(id) ON DELETE CASCADE,
  match_score INTEGER,
  recommendation_reason TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id, candidate_id)
);

-- Create talent insights cache table
CREATE TABLE public.talent_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  search_query TEXT,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  insights_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.candidate_shortlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlist_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recruiting_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies for candidate_shortlists
CREATE POLICY "Users can view org shortlists" ON public.candidate_shortlists
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org shortlists" ON public.candidate_shortlists
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update org shortlists" ON public.candidate_shortlists
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org shortlists" ON public.candidate_shortlists
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- RLS Policies for shortlist_candidates
CREATE POLICY "Users can view shortlist candidates" ON public.shortlist_candidates
  FOR SELECT USING (
    shortlist_id IN (
      SELECT id FROM public.candidate_shortlists WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can add shortlist candidates" ON public.shortlist_candidates
  FOR INSERT WITH CHECK (
    shortlist_id IN (
      SELECT id FROM public.candidate_shortlists WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update shortlist candidates" ON public.shortlist_candidates
  FOR UPDATE USING (
    shortlist_id IN (
      SELECT id FROM public.candidate_shortlists WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete shortlist candidates" ON public.shortlist_candidates
  FOR DELETE USING (
    shortlist_id IN (
      SELECT id FROM public.candidate_shortlists WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for email_sequences
CREATE POLICY "Users can view org sequences" ON public.email_sequences
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org sequences" ON public.email_sequences
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update org sequences" ON public.email_sequences
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org sequences" ON public.email_sequences
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- RLS Policies for outreach_campaigns
CREATE POLICY "Users can view org campaigns" ON public.outreach_campaigns
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org campaigns" ON public.outreach_campaigns
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update org campaigns" ON public.outreach_campaigns
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org campaigns" ON public.outreach_campaigns
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- RLS Policies for campaign_recipients
CREATE POLICY "Users can view campaign recipients" ON public.campaign_recipients
  FOR SELECT USING (
    campaign_id IN (
      SELECT id FROM public.outreach_campaigns WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can add campaign recipients" ON public.campaign_recipients
  FOR INSERT WITH CHECK (
    campaign_id IN (
      SELECT id FROM public.outreach_campaigns WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update campaign recipients" ON public.campaign_recipients
  FOR UPDATE USING (
    campaign_id IN (
      SELECT id FROM public.outreach_campaigns WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for ai_recruiting_agents
CREATE POLICY "Users can view org agents" ON public.ai_recruiting_agents
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org agents" ON public.ai_recruiting_agents
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update org agents" ON public.ai_recruiting_agents
  FOR UPDATE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can delete org agents" ON public.ai_recruiting_agents
  FOR DELETE USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- RLS Policies for agent_recommendations
CREATE POLICY "Users can view agent recommendations" ON public.agent_recommendations
  FOR SELECT USING (
    agent_id IN (
      SELECT id FROM public.ai_recruiting_agents WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update agent recommendations" ON public.agent_recommendations
  FOR UPDATE USING (
    agent_id IN (
      SELECT id FROM public.ai_recruiting_agents WHERE organization_id IN (
        SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for talent_insights
CREATE POLICY "Users can view org insights" ON public.talent_insights
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create org insights" ON public.talent_insights
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid())
  );

-- Add triggers for updated_at
CREATE TRIGGER update_candidate_shortlists_updated_at
  BEFORE UPDATE ON public.candidate_shortlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_outreach_campaigns_updated_at
  BEFORE UPDATE ON public.outreach_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_recruiting_agents_updated_at
  BEFORE UPDATE ON public.ai_recruiting_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();