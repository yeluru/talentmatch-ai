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

    // Simple counts for different timeframes
    const now = new Date();
    const queries = await Promise.all([
      // Total candidates
      supabaseAdmin.from('candidate_profiles').select('id', { count: 'exact', head: true }),

      // Candidates in last 24 hours
      supabaseAdmin.from('candidate_profiles').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()),

      // Candidates in last 3 days
      supabaseAdmin.from('candidate_profiles').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()),

      // Candidates in last 7 days
      supabaseAdmin.from('candidate_profiles').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),

      // Candidates in last 14 days
      supabaseAdmin.from('candidate_profiles').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()),

      // Total resumes
      supabaseAdmin.from('resumes').select('id', { count: 'exact', head: true }),

      // Resumes in last 14 days
      supabaseAdmin.from('resumes').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()),

      // Get sample of recent candidates with basic info
      supabaseAdmin.from('candidate_profiles').select('id, first_name, last_name, email, created_at, source')
        .gte('created_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20),

      // Get sample of recent resumes
      supabaseAdmin.from('resumes').select('id, file_name, created_at, uploaded_by, candidate_profile_id')
        .gte('created_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      counts: {
        total_candidates: queries[0].count || 0,
        candidates_24h: queries[1].count || 0,
        candidates_3d: queries[2].count || 0,
        candidates_7d: queries[3].count || 0,
        candidates_14d: queries[4].count || 0,
        total_resumes: queries[5].count || 0,
        resumes_14d: queries[6].count || 0,
      },
      recent_candidates_sample: queries[7].data,
      recent_resumes_sample: queries[8].data,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Investigation error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
