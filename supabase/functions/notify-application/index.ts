import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationPayload {
  type: 'new_application' | 'status_change';
  applicationId: string;
  candidateId: string;
  jobId: string;
  oldStatus?: string;
  newStatus?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: NotificationPayload = await req.json();
    console.log("Received notification payload:", payload);

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('title, organization_id, recruiter_id')
      .eq('id', payload.jobId)
      .single();

    if (jobError) {
      console.error("Error fetching job:", jobError);
      throw jobError;
    }

    // Get candidate profile
    const { data: candidate, error: candidateError } = await supabase
      .from('candidate_profiles')
      .select('full_name, email, user_id')
      .eq('id', payload.candidateId)
      .single();

    if (candidateError) {
      console.error("Error fetching candidate:", candidateError);
      throw candidateError;
    }

    if (payload.type === 'new_application') {
      // Notify recruiters in the organization about new application
      const { data: recruiters, error: recruitersError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('organization_id', job.organization_id)
        .eq('role', 'recruiter');

      if (recruitersError) {
        console.error("Error fetching recruiters:", recruitersError);
        throw recruitersError;
      }

      // Create notifications for all recruiters
      const notifications = recruiters?.map(r => ({
        user_id: r.user_id,
        title: 'New Application',
        message: `${candidate.full_name || 'A candidate'} applied for ${job.title}`,
        type: 'application',
        link: `/recruiter/jobs/${payload.jobId}/applicants`,
      })) || [];

      if (notifications.length > 0) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notifications);

        if (notifError) {
          console.error("Error creating recruiter notifications:", notifError);
        } else {
          console.log(`Created ${notifications.length} notifications for recruiters`);
        }
      }

      // Create notification for candidate confirming application
      if (candidate.user_id) {
        const { error: candidateNotifError } = await supabase
          .from('notifications')
          .insert({
            user_id: candidate.user_id,
            title: 'Application Submitted',
            message: `Your application for ${job.title} has been submitted successfully`,
            type: 'application',
            link: `/candidate/applications`,
          });

        if (candidateNotifError) {
          console.error("Error creating candidate notification:", candidateNotifError);
        } else {
          console.log("Created notification for candidate");
        }
      }
    } else if (payload.type === 'status_change' && candidate.user_id) {
      // Notify candidate about status change
      let message = `Your application for ${job.title} has been updated to ${payload.newStatus}`;
      
      if (payload.newStatus === 'screening') {
        message = `Great news! Your application for ${job.title} is now being reviewed`;
      } else if (payload.newStatus === 'interviewing') {
        message = `Congratulations! You've been selected for an interview for ${job.title}`;
      } else if (payload.newStatus === 'offered') {
        message = `Amazing news! You've received an offer for ${job.title}`;
      } else if (payload.newStatus === 'hired') {
        message = `Welcome aboard! You've been hired for ${job.title}`;
      } else if (payload.newStatus === 'rejected') {
        message = `Thank you for your interest in ${job.title}. Unfortunately, we've decided to move forward with other candidates`;
      }

      const { error: statusNotifError } = await supabase
        .from('notifications')
        .insert({
          user_id: candidate.user_id,
          title: 'Application Update',
          message,
          type: 'status_update',
          link: `/candidate/applications`,
        });

      if (statusNotifError) {
        console.error("Error creating status notification:", statusNotifError);
      } else {
        console.log("Created status update notification for candidate");
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in notify-application function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
