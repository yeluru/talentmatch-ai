import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Find Uma's user ID
    const { data: umaProfile } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, full_name')
      .or('email.ilike.%uma%,full_name.ilike.%uma%')
      .limit(5);

    if (!umaProfile || umaProfile.length === 0) {
      return new Response(JSON.stringify({ error: "Uma not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const umaUserId = umaProfile[0].user_id;

    // Get bulk import audit logs (last 3 days) - for Uma
    const { data: bulkImportLogs } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .eq('user_id', umaUserId)
      .in('action', ['bulk_import_start', 'bulk_import_complete', 'bulk_import_error', 'bulk_import_progress'])
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    // Get ALL bulk imports by ANY user in last 3 days
    const { data: allBulkImports } = await supabaseAdmin
      .from('audit_logs')
      .select('created_at, user_id, action, details')
      .in('action', ['bulk_import_start', 'bulk_import_complete', 'bulk_import_error', 'bulk_import_progress'])
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    // Get ALL recent resume uploads (last 3 days)
    const { data: allRecentResumes, count: allResumeCount } = await supabaseAdmin
      .from('resumes')
      .select('id, uploaded_by, created_at, file_name', { count: 'exact' })
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1000);

    // Get candidates created in last 14 days with details
    const { data: recentCandidates, count: recentCandidateCount } = await supabaseAdmin
      .from('candidate_profiles')
      .select('id, first_name, last_name, email, created_by, created_at, source', { count: 'exact' })
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1000);

    // Check if these candidates have resumes
    const candidateIds = recentCandidates?.map(c => c.id) || [];
    const { data: resumesForCandidates, count: resumeLinksCount } = await supabaseAdmin
      .from('resumes')
      .select('id, candidate_profile_id, file_name, created_at, uploaded_by', { count: 'exact' })
      .in('candidate_profile_id', candidateIds.slice(0, 100))
      .limit(1000);

    // Group candidates by creator
    const candidatesByCreator = recentCandidates?.reduce((acc, c) => {
      const creator = c.created_by || 'unknown';
      if (!acc[creator]) acc[creator] = [];
      acc[creator].push(c);
      return acc;
    }, {} as Record<string, typeof recentCandidates>);

    // Get all recent activity (last 2 days)
    const { data: recentActivity } = await supabaseAdmin
      .from('audit_logs')
      .select('created_at, action, entity_type, details')
      .eq('user_id', umaUserId)
      .gte('created_at', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    // Count resumes uploaded by Uma
    const { data: resumeCount } = await supabaseAdmin
      .from('resumes')
      .select('id', { count: 'exact', head: true })
      .eq('uploaded_by', umaUserId);

    // Count candidate profiles created by Uma
    const { data: candidateCount } = await supabaseAdmin
      .from('candidate_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', umaUserId);

    // Get candidate_org_links for Uma's organization
    const { data: orgLinks } = await supabaseAdmin
      .from('candidate_org_links')
      .select('id, candidate_id, created_at', { count: 'exact' })
      .eq('added_by', umaUserId)
      .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1000);

    return new Response(JSON.stringify({
      success: true,
      uma_profile: umaProfile[0],
      uma_bulk_import_logs: bulkImportLogs,
      uma_recent_activity_count: recentActivity?.length || 0,
      uma_recent_activity_sample: recentActivity?.slice(0, 20),
      uma_resume_count: resumeCount || 0,
      uma_candidate_count: candidateCount || 0,
      uma_org_links_count: orgLinks?.length || 0,
      // System-wide stats
      all_bulk_imports: allBulkImports,
      all_recent_resumes_count: allResumeCount || 0,
      all_recent_resumes_sample: allRecentResumes?.slice(0, 20),
      all_recent_candidates_count: recentCandidateCount || 0,
      recent_candidates_sample: recentCandidates?.slice(0, 30),
      candidates_by_creator: Object.entries(candidatesByCreator || {}).map(([creator, cands]) => ({
        creator,
        count: cands.length,
        sample: cands.slice(0, 3),
      })),
      resume_links_for_candidates: resumeLinksCount || 0,
      resume_links_sample: resumesForCandidates?.slice(0, 20),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Investigation error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
