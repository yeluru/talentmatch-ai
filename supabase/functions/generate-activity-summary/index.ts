import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  acting_role?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { userId, userName, organizationId, startDate, endDate, actingRole, auditLogs } = body;

    if (!userId || !organizationId || !startDate || !endDate) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use provided audit logs or fetch them
    let logs: AuditLog[] = auditLogs || [];

    if (!logs || logs.length === 0) {
      const { data: fetchedLogs, error: logsError } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .gte('created_at', startDate + 'T00:00:00')
        .lte('created_at', endDate + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (logsError) {
        console.error('Error fetching audit logs:', logsError);
        return new Response(JSON.stringify({ error: 'Failed to fetch audit logs' }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      logs = fetchedLogs || [];
    }

    // If no activity, return early
    if (logs.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        summary: "No activity recorded for this period.",
        activityCount: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profile if not provided
    let displayName = userName || 'User';
    if (!userName) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('user_id', userId)
        .single();

      if (profile) {
        displayName = profile.full_name || profile.email || 'User';
      }
    }

    // Extract structured activity details from audit logs
    const activityDetails = extractActivityDetails(logs);

    // Build context for AI with actual audit log details
    const role = actingRole || 'team member';
    const periodLabel = startDate === endDate
      ? new Date(startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : `${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const systemPrompt = `You are an AI assistant that generates detailed, insightful activity summaries for managers reviewing their team's performance.

Guidelines:
- Write in third person, past tense
- Be specific and detailed - mention names of clients, jobs, candidates when provided
- Highlight notable achievements and patterns
- Keep it to 2-4 sentences
- Focus on impact and outcomes with concrete details
- If activity is low, be neutral and factual
- Make it actionable and informative for the manager

Examples of good summaries:
✓ "Sarah created client 'Acme Corp' with contact person John Smith, and posted a new 'Senior Java Developer' position for them. She uploaded resumes for candidates Jane Doe and Robert Brown, and moved 3 candidates to Interview stage including updating their LinkedIn profiles and contact information."

✓ "Mike updated client 'IT Vision 360' (email, phone, contact person) and modified the 'AWS Security Engineer' job posting (salary range, requirements). He added detailed notes to 5 candidate profiles and sent RTR documents for John Smith to TechCorp and Jane Doe to StartupXYZ."

✓ "Lisa had minimal activity with a single update to candidate profile for Michael Johnson (updated phone and location). This may indicate focus on other priorities outside the tracking system."

Bad examples to avoid:
✗ "User had 12 actions." (No detail, just counting)
✗ "Sarah worked on some clients and jobs." (Too vague)
✗ "Mike was not very productive." (Judgmental tone)`;

    const userPrompt = `Generate an activity summary for ${displayName} (${role}) for the period ${periodLabel}.

Activity Details from Audit Logs:
${formatActivityForLLM(activityDetails, logs)}

Total Actions: ${logs.length}

Generate a detailed 2-4 sentence summary that provides meaningful insights with specific names and details for the manager.`;

    // Call LLM
    const { res, provider } = await callChatCompletions({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      timeoutMs: 20000,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`AI provider error (${provider}):`, res.status, errorText);
      throw new Error(`AI provider returned ${res.status}`);
    }

    const data = await res.json();
    const summary = data?.choices?.[0]?.message?.content?.trim() || "";

    if (!summary) {
      throw new Error("AI provider returned empty summary");
    }

    return new Response(JSON.stringify({
      success: true,
      summary,
      provider,
      activityCount: logs.length,
      details: activityDetails,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error generating activity summary:", message);
    return new Response(JSON.stringify({
      success: false,
      error: message,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function extractActivityDetails(logs: AuditLog[]) {
  const details = {
    clientsCreated: [] as string[],
    clientsUpdated: [] as string[],
    jobsCreated: [] as string[],
    jobsUpdated: [] as string[],
    candidatesCreated: [] as string[],
    candidatesUpdated: [] as string[],
    resumesUploaded: [] as string[],
    rtrSent: [] as string[],
    notesAdded: [] as string[],
    applicationMoves: [] as string[],
    rolesGranted: [] as string[],
    documentsUploaded: [] as string[],
  };

  logs.forEach(log => {
    try {
      // Clients
      if (log.entity_type === 'clients') {
        if (log.action === 'insert') {
          const name = log.details?.new?.name;
          const contact = log.details?.new?.contact_person;
          if (name) details.clientsCreated.push(contact ? `${name} (contact: ${contact})` : name);
        } else if (log.action === 'update') {
          const name = log.details?.new?.name || log.details?.old?.name;
          if (name) details.clientsUpdated.push(name);
        }
      }

      // Jobs
      if (log.entity_type === 'jobs') {
        if (log.action === 'insert') {
          const title = log.details?.new?.title;
          const client = log.details?.new?.client_name;
          if (title) details.jobsCreated.push(client ? `${title} for ${client}` : title);
        } else if (log.action === 'update') {
          const title = log.details?.new?.title || log.details?.old?.title;
          if (title) details.jobsUpdated.push(title);
        }
      }

      // Candidates
      if (log.entity_type === 'candidate_profiles') {
        const firstName = log.details?.new?.first_name || log.details?.old?.first_name;
        const lastName = log.details?.new?.last_name || log.details?.old?.last_name;
        const name = firstName && lastName ? `${firstName} ${lastName}` : null;

        if (log.action === 'insert' && name) {
          details.candidatesCreated.push(name);
        } else if (log.action === 'update' && name) {
          details.candidatesUpdated.push(name);
        }
      }

      // Resumes
      if (log.entity_type === 'resumes' && log.action === 'insert') {
        const candidateName = log.details?.candidate_name || log.details?.new?.candidate_name;
        if (candidateName) details.resumesUploaded.push(candidateName);
      }

      // RTR
      if (log.action?.toLowerCase().includes('rtr') || log.action === 'send_rtr') {
        const candidate = log.details?.candidate_name;
        const client = log.details?.client_name;
        if (candidate && client) {
          details.rtrSent.push(`${candidate} to ${client}`);
        }
      }

      // Notes
      if (log.entity_type === 'candidate_profiles' && log.action === 'update') {
        if (log.details?.old?.notes !== log.details?.new?.notes && log.details?.new?.notes) {
          const firstName = log.details?.new?.first_name || log.details?.old?.first_name;
          const lastName = log.details?.new?.last_name || log.details?.old?.last_name;
          const name = firstName && lastName ? `${firstName} ${lastName}` : null;
          if (name) details.notesAdded.push(name);
        }
      }

      // Application movements
      if (log.entity_type === 'applications' && log.action === 'update') {
        const status = log.details?.new?.status;
        if (status) details.applicationMoves.push(status);
      }

      // Role grants
      if (log.action === 'grant_role') {
        const role = log.details?.granted_role;
        const email = log.details?.user_email;
        if (role && email) {
          details.rolesGranted.push(`${role.replace('_', ' ')} to ${email}`);
        }
      }
    } catch (e) {
      console.error('Error extracting detail from log:', e);
    }
  });

  return details;
}

function formatActivityForLLM(details: ReturnType<typeof extractActivityDetails>, logs: AuditLog[]): string {
  const parts: string[] = [];

  if (details.clientsCreated.length > 0) {
    parts.push(`\nClients Created (${details.clientsCreated.length}):\n${details.clientsCreated.slice(0, 5).map(c => `  - ${c}`).join('\n')}`);
  }

  if (details.clientsUpdated.length > 0) {
    parts.push(`\nClients Updated (${details.clientsUpdated.length}):\n${details.clientsUpdated.slice(0, 5).map(c => `  - ${c}`).join('\n')}`);
  }

  if (details.jobsCreated.length > 0) {
    parts.push(`\nJobs Created (${details.jobsCreated.length}):\n${details.jobsCreated.slice(0, 5).map(j => `  - ${j}`).join('\n')}`);
  }

  if (details.jobsUpdated.length > 0) {
    parts.push(`\nJobs Updated (${details.jobsUpdated.length}):\n${details.jobsUpdated.slice(0, 5).map(j => `  - ${j}`).join('\n')}`);
  }

  if (details.candidatesCreated.length > 0) {
    parts.push(`\nCandidates Added (${details.candidatesCreated.length}):\n${details.candidatesCreated.slice(0, 5).map(c => `  - ${c}`).join('\n')}`);
  }

  if (details.candidatesUpdated.length > 0) {
    parts.push(`\nCandidate Profiles Updated (${details.candidatesUpdated.length}):\n${details.candidatesUpdated.slice(0, 5).map(c => `  - ${c}`).join('\n')}`);
  }

  if (details.resumesUploaded.length > 0) {
    parts.push(`\nResumes Uploaded (${details.resumesUploaded.length}):\n${details.resumesUploaded.slice(0, 5).map(r => `  - ${r}`).join('\n')}`);
  }

  if (details.rtrSent.length > 0) {
    parts.push(`\nRTR Documents Sent (${details.rtrSent.length}):\n${details.rtrSent.slice(0, 5).map(r => `  - ${r}`).join('\n')}`);
  }

  if (details.notesAdded.length > 0) {
    parts.push(`\nNotes Added to Candidates (${details.notesAdded.length}):\n${details.notesAdded.slice(0, 5).map(n => `  - ${n}`).join('\n')}`);
  }

  if (details.applicationMoves.length > 0) {
    const stageCounts: { [key: string]: number } = {};
    details.applicationMoves.forEach(stage => {
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    });
    parts.push(`\nCandidates Moved in Pipeline (${details.applicationMoves.length} total):\n${Object.entries(stageCounts).map(([stage, count]) => `  - ${count} to ${stage}`).join('\n')}`);
  }

  if (details.rolesGranted.length > 0) {
    parts.push(`\nRoles Granted (${details.rolesGranted.length}):\n${details.rolesGranted.map(r => `  - ${r}`).join('\n')}`);
  }

  if (parts.length === 0) {
    // Fallback: show action types if no structured details
    const actionTypes: { [key: string]: number } = {};
    logs.forEach(log => {
      const key = `${log.action} ${log.entity_type}`;
      actionTypes[key] = (actionTypes[key] || 0) + 1;
    });
    parts.push(`\nAction Summary:\n${Object.entries(actionTypes).map(([action, count]) => `  - ${count}x ${action}`).join('\n')}`);
  }

  return parts.join('\n');
}
