export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_recommendations: {
        Row: {
          agent_id: string
          candidate_id: string
          created_at: string
          id: string
          match_score: number | null
          recommendation_reason: string | null
          reviewed_at: string | null
          status: string | null
        }
        Insert: {
          agent_id: string
          candidate_id: string
          created_at?: string
          id?: string
          match_score?: number | null
          recommendation_reason?: string | null
          reviewed_at?: string | null
          status?: string | null
        }
        Update: {
          agent_id?: string
          candidate_id?: string
          created_at?: string
          id?: string
          match_score?: number | null
          recommendation_reason?: string | null
          reviewed_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_recommendations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_recruiting_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_recommendations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_recruiting_agents: {
        Row: {
          auto_outreach: boolean | null
          candidates_found: number | null
          created_at: string
          created_by: string
          id: string
          is_active: boolean | null
          job_id: string | null
          last_run_at: string | null
          name: string
          organization_id: string
          search_criteria: Json
          updated_at: string
        }
        Insert: {
          auto_outreach?: boolean | null
          candidates_found?: number | null
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean | null
          job_id?: string | null
          last_run_at?: string | null
          name: string
          organization_id: string
          search_criteria?: Json
          updated_at?: string
        }
        Update: {
          auto_outreach?: boolean | null
          candidates_found?: number | null
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean | null
          job_id?: string | null
          last_run_at?: string | null
          name?: string
          organization_id?: string
          search_criteria?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recruiting_agents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recruiting_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_resume_analyses: {
        Row: {
          candidate_id: string
          created_at: string
          full_analysis: Json | null
          id: string
          job_description_text: string | null
          job_id: string | null
          match_score: number | null
          matched_skills: string[] | null
          missing_skills: string[] | null
          recommendations: string[] | null
          resume_id: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          full_analysis?: Json | null
          id?: string
          job_description_text?: string | null
          job_id?: string | null
          match_score?: number | null
          matched_skills?: string[] | null
          missing_skills?: string[] | null
          recommendations?: string[] | null
          resume_id?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          full_analysis?: Json | null
          id?: string
          job_description_text?: string | null
          job_id?: string | null
          match_score?: number | null
          matched_skills?: string[] | null
          missing_skills?: string[] | null
          recommendations?: string[] | null
          resume_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_resume_analyses_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_resume_analyses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_resume_analyses_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      application_status_history: {
        Row: {
          application_id: string
          changed_by: string
          created_at: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
        }
        Insert: {
          application_id: string
          changed_by: string
          created_at?: string
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
        }
        Update: {
          application_id?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
        }
        Relationships: []
      }
      applications: {
        Row: {
          ai_match_details: Json | null
          ai_match_score: number | null
          applied_at: string
          candidate_id: string
          cover_letter: string | null
          id: string
          job_id: string
          recruiter_notes: string | null
          recruiter_rating: number | null
          rejection_feedback: string | null
          rejection_reason: string | null
          resume_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          ai_match_details?: Json | null
          ai_match_score?: number | null
          applied_at?: string
          candidate_id: string
          cover_letter?: string | null
          id?: string
          job_id: string
          recruiter_notes?: string | null
          recruiter_rating?: number | null
          rejection_feedback?: string | null
          rejection_reason?: string | null
          resume_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          ai_match_details?: Json | null
          ai_match_score?: number | null
          applied_at?: string
          candidate_id?: string
          cover_letter?: string | null
          id?: string
          job_id?: string
          recruiter_notes?: string | null
          recruiter_rating?: number | null
          rejection_feedback?: string | null
          rejection_reason?: string | null
          resume_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_resume_id_fkey"
            columns: ["resume_id"]
            isOneToOne: false
            referencedRelation: "resumes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          organization_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          organization_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          organization_id?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          candidate_id: string
          created_at: string
          current_step: number | null
          email: string
          id: string
          opened_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          campaign_id: string
          candidate_id: string
          created_at?: string
          current_step?: number | null
          email: string
          id?: string
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          campaign_id?: string
          candidate_id?: string
          created_at?: string
          current_step?: number | null
          email?: string
          id?: string
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_education: {
        Row: {
          candidate_id: string
          created_at: string
          degree: string
          end_date: string | null
          field_of_study: string | null
          gpa: number | null
          id: string
          institution: string
          start_date: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          degree: string
          end_date?: string | null
          field_of_study?: string | null
          gpa?: number | null
          id?: string
          institution: string
          start_date?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          degree?: string
          end_date?: string | null
          field_of_study?: string | null
          gpa?: number | null
          id?: string
          institution?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_education_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_experience: {
        Row: {
          candidate_id: string
          company_name: string
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          is_current: boolean | null
          job_title: string
          location: string | null
          start_date: string
        }
        Insert: {
          candidate_id: string
          company_name: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          job_title: string
          location?: string | null
          start_date: string
        }
        Update: {
          candidate_id?: string
          company_name?: string
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean | null
          job_title?: string
          location?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_experience_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_profiles: {
        Row: {
          ats_score: number | null
          created_at: string
          current_company: string | null
          current_title: string | null
          desired_job_types: string[] | null
          desired_locations: string[] | null
          desired_salary_max: number | null
          desired_salary_min: number | null
          email: string | null
          full_name: string | null
          headline: string | null
          id: string
          is_actively_looking: boolean | null
          is_open_to_remote: boolean | null
          linkedin_url: string | null
          location: string | null
          onboarding_completed: boolean | null
          organization_id: string | null
          phone: string | null
          profile_completeness: number | null
          recruiter_notes: string | null
          recruiter_status: string | null
          summary: string | null
          updated_at: string
          user_id: string | null
          years_of_experience: number | null
        }
        Insert: {
          ats_score?: number | null
          created_at?: string
          current_company?: string | null
          current_title?: string | null
          desired_job_types?: string[] | null
          desired_locations?: string[] | null
          desired_salary_max?: number | null
          desired_salary_min?: number | null
          email?: string | null
          full_name?: string | null
          headline?: string | null
          id?: string
          is_actively_looking?: boolean | null
          is_open_to_remote?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          organization_id?: string | null
          phone?: string | null
          profile_completeness?: number | null
          recruiter_notes?: string | null
          recruiter_status?: string | null
          summary?: string | null
          updated_at?: string
          user_id?: string | null
          years_of_experience?: number | null
        }
        Update: {
          ats_score?: number | null
          created_at?: string
          current_company?: string | null
          current_title?: string | null
          desired_job_types?: string[] | null
          desired_locations?: string[] | null
          desired_salary_max?: number | null
          desired_salary_min?: number | null
          email?: string | null
          full_name?: string | null
          headline?: string | null
          id?: string
          is_actively_looking?: boolean | null
          is_open_to_remote?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          organization_id?: string | null
          phone?: string | null
          profile_completeness?: number | null
          recruiter_notes?: string | null
          recruiter_status?: string | null
          summary?: string | null
          updated_at?: string
          user_id?: string | null
          years_of_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_shortlists: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_shortlists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_skills: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          proficiency_level: string | null
          skill_name: string
          years_of_experience: number | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          proficiency_level?: string | null
          skill_name: string
          years_of_experience?: number | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          proficiency_level?: string | null
          skill_name?: string
          years_of_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_skills_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          id: string
          industry: string | null
          name: string
          notes: string | null
          organization_id: string
          status: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by: string
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          organization_id: string
          status?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          status?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          body_template: string
          created_at: string
          created_by: string
          delay_days: number
          id: string
          name: string
          organization_id: string
          sequence_order: number
          subject_template: string
        }
        Insert: {
          body_template: string
          created_at?: string
          created_by: string
          delay_days?: number
          id?: string
          name: string
          organization_id: string
          sequence_order?: number
          subject_template: string
        }
        Update: {
          body_template?: string
          created_at?: string
          created_by?: string
          delay_days?: number
          id?: string
          name?: string
          organization_id?: string
          sequence_order?: number
          subject_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string
          id: string
          is_default: boolean | null
          name: string
          organization_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_default?: boolean | null
          name: string
          organization_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_default?: boolean | null
          name?: string
          organization_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      interview_schedules: {
        Row: {
          application_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          interview_type: string
          interviewer_id: string
          location: string | null
          meeting_link: string | null
          notes: string | null
          scheduled_at: string
          status: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          interview_type?: string
          interviewer_id: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          scheduled_at: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          interview_type?: string
          interviewer_id?: string
          location?: string | null
          meeting_link?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_alerts: {
        Row: {
          created_at: string
          frequency: string | null
          id: string
          is_active: boolean | null
          job_types: string[] | null
          keywords: string[] | null
          last_sent_at: string | null
          locations: string[] | null
          name: string
          salary_max: number | null
          salary_min: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          job_types?: string[] | null
          keywords?: string[] | null
          last_sent_at?: string | null
          locations?: string[] | null
          name: string
          salary_max?: number | null
          salary_min?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          job_types?: string[] | null
          keywords?: string[] | null
          last_sent_at?: string | null
          locations?: string[] | null
          name?: string
          salary_max?: number | null
          salary_min?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          applications_count: number | null
          client_id: string | null
          closes_at: string | null
          created_at: string
          description: string
          experience_level: string | null
          id: string
          is_remote: boolean | null
          job_type: string | null
          location: string | null
          nice_to_have_skills: string[] | null
          organization_id: string
          posted_at: string | null
          recruiter_id: string
          required_skills: string[] | null
          requirements: string | null
          responsibilities: string | null
          salary_max: number | null
          salary_min: number | null
          status: string | null
          title: string
          updated_at: string
          views_count: number | null
        }
        Insert: {
          applications_count?: number | null
          client_id?: string | null
          closes_at?: string | null
          created_at?: string
          description: string
          experience_level?: string | null
          id?: string
          is_remote?: boolean | null
          job_type?: string | null
          location?: string | null
          nice_to_have_skills?: string[] | null
          organization_id: string
          posted_at?: string | null
          recruiter_id: string
          required_skills?: string[] | null
          requirements?: string | null
          responsibilities?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string | null
          title: string
          updated_at?: string
          views_count?: number | null
        }
        Update: {
          applications_count?: number | null
          client_id?: string | null
          closes_at?: string | null
          created_at?: string
          description?: string
          experience_level?: string | null
          id?: string
          is_remote?: boolean | null
          job_type?: string | null
          location?: string | null
          nice_to_have_skills?: string[] | null
          organization_id?: string
          posted_at?: string | null
          recruiter_id?: string
          required_skills?: string[] | null
          requirements?: string | null
          responsibilities?: string | null
          salary_max?: number | null
          salary_min?: number | null
          status?: string | null
          title?: string
          updated_at?: string
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      organization_invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          organization_id: string
          uses_count: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          organization_id: string
          uses_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          organization_id?: string
          uses_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_invite_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          size: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      outreach_campaigns: {
        Row: {
          created_at: string
          created_by: string
          id: string
          job_id: string | null
          name: string
          organization_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          job_id?: string | null
          name: string
          organization_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          job_id?: string | null
          name?: string
          organization_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaigns_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          linkedin_url: string | null
          location: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          linkedin_url?: string | null
          location?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      resumes: {
        Row: {
          ats_score: number | null
          candidate_id: string
          content_hash: string | null
          created_at: string
          file_name: string
          file_type: string
          file_url: string
          id: string
          is_primary: boolean | null
          parsed_content: Json | null
          updated_at: string
        }
        Insert: {
          ats_score?: number | null
          candidate_id: string
          content_hash?: string | null
          created_at?: string
          file_name: string
          file_type: string
          file_url: string
          id?: string
          is_primary?: boolean | null
          parsed_content?: Json | null
          updated_at?: string
        }
        Update: {
          ats_score?: number | null
          candidate_id?: string
          content_hash?: string | null
          created_at?: string
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          is_primary?: boolean | null
          parsed_content?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resumes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shortlist_candidates: {
        Row: {
          added_at: string
          added_by: string
          candidate_id: string
          id: string
          notes: string | null
          shortlist_id: string
          status: string | null
        }
        Insert: {
          added_at?: string
          added_by: string
          candidate_id: string
          id?: string
          notes?: string | null
          shortlist_id: string
          status?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string
          candidate_id?: string
          id?: string
          notes?: string | null
          shortlist_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shortlist_candidates_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shortlist_candidates_shortlist_id_fkey"
            columns: ["shortlist_id"]
            isOneToOne: false
            referencedRelation: "candidate_shortlists"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_insights: {
        Row: {
          created_at: string
          id: string
          insights_data: Json
          job_id: string | null
          organization_id: string
          search_query: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          insights_data?: Json
          job_id?: string | null
          organization_id: string
          search_query?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          insights_data?: Json
          job_id?: string | null
          organization_id?: string
          search_query?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_insights_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_organization"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          application_updates: boolean | null
          created_at: string
          email_notifications: boolean | null
          id: string
          job_alert_frequency: string | null
          language: string | null
          marketing_emails: boolean | null
          push_notifications: boolean | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_updates?: boolean | null
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          job_alert_frequency?: string | null
          language?: string | null
          marketing_emails?: boolean | null
          push_notifications?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_updates?: boolean | null
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          job_alert_frequency?: string | null
          language?: string | null
          marketing_emails?: boolean | null
          push_notifications?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_user_role: {
        Args: {
          _organization_id?: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      generate_invite_code: { Args: never; Returns: string }
      get_user_organization: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recruiter_can_access_candidate: {
        Args: { _candidate_id: string }
        Returns: boolean
      }
      use_invite_code: { Args: { invite_code: string }; Returns: string }
    }
    Enums: {
      app_role: "candidate" | "recruiter" | "account_manager"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["candidate", "recruiter", "account_manager"],
    },
  },
} as const
