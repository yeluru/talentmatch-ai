import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { jobId, recruiterIds, assignedByUserId } = await req.json();

    if (!jobId || !recruiterIds || recruiterIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: jobId, recruiterIds' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id,
        title,
        location,
        is_remote,
        posted_at,
        clients (
          name
        )
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: 'Job not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch assigner details (AM)
    const { data: assigner } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', assignedByUserId)
      .single();

    const assignerName = assigner?.full_name || assigner?.email || 'Account Manager';

    // Fetch recruiter details
    const { data: recruiters } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', recruiterIds);

    if (!recruiters || recruiters.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No recruiters found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const appUrl = Deno.env.get('PUBLIC_APP_URL') || Deno.env.get('APP_URL') || 'https://ultra-hire.com';
    const jobUrl = `${appUrl}/recruiter/jobs/${jobId}`;

    const clientName = (job as any).clients?.name || 'Client';
    const location = job.location || 'Location not specified';
    const locationText = job.is_remote ? `${location} (Remote)` : location;

    // Send emails to all newly assigned recruiters
    const emailPromises = recruiters.map((recruiter) => {
      const recruiterName = recruiter.full_name || recruiter.email?.split('@')[0] || 'there';

      return resend.emails.send({
        from: 'UltraHire <noreply@ultra-hire.com>',
        to: recruiter.email,
        subject: `You've been assigned to ${job.title}`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
            <div style="background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
              <h1 style="color: #1f2937; font-size: 24px; font-weight: bold; margin: 0 0 16px 0;">
                New Job Assignment
              </h1>

              <p style="color: #4b5563; font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                Hi ${recruiterName},
              </p>

              <p style="color: #4b5563; font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                <strong>${assignerName}</strong> has assigned you to work on the following job:
              </p>

              <div style="background-color: #f3f4f6; border-left: 4px solid #3b82f6; border-radius: 4px; padding: 20px; margin: 0 0 24px 0;">
                <h2 style="color: #1f2937; font-size: 20px; font-weight: bold; margin: 0 0 12px 0;">
                  ${job.title}
                </h2>
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
                  <strong>Client:</strong> ${clientName}
                </p>
                <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0;">
                  <strong>Location:</strong> ${locationText}
                </p>
                ${job.posted_at ? `
                <p style="color: #6b7280; font-size: 14px; margin: 0;">
                  <strong>Posted:</strong> ${new Date(job.posted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                ` : ''}
              </div>

              <p style="color: #4b5563; font-size: 16px; line-height: 1.5; margin: 0 0 24px 0;">
                You can now view the job details, manage applications, and start sourcing candidates.
              </p>

              <a href="${jobUrl}"
                 style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 16px;">
                View Job Details
              </a>

              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />

              <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0;">
                You're receiving this email because you were assigned to a job on UltraHire.
                <br />
                If you have any questions, please contact your account manager.
              </p>
            </div>
          </div>
        `,
      });
    });

    const results = await Promise.allSettled(emailPromises);

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return new Response(
      JSON.stringify({
        success: true,
        sent: successful,
        failed: failed,
        message: `Sent ${successful} email(s) to assigned recruiter(s)`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending job assignment notifications:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
