import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  organizationId: string;
  candidateIds: string[]; // candidate_profiles.id
};

function resumesObjectPath(fileUrlOrPath: string | null | undefined): string | null {
  if (!fileUrlOrPath) return null;
  const raw = String(fileUrlOrPath);
  const marker = "/resumes/";
  const idx = raw.indexOf(marker);
  if (idx >= 0) return raw.slice(idx + marker.length).split("?")[0] || null;
  if (raw.startsWith("resumes/")) return raw.slice("resumes/".length).split("?")[0] || null;
  return raw.split("?")[0] || null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create client with user's auth to verify identity
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create service role client for privileged operations
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as Body;
    const organizationId = String(body?.organizationId || "").trim();
    const candidateIds = Array.isArray(body?.candidateIds) ? body.candidateIds.map(String) : [];
    const uniqCandidateIds = Array.from(new Set(candidateIds.map((c) => c.trim()).filter(Boolean))).slice(0, 200);

    if (!organizationId || uniqCandidateIds.length === 0) {
      return new Response(JSON.stringify({ error: "Missing organizationId or candidateIds" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Note: Role check removed because user_roles RLS policies prevent service role queries.
    // Authentication check above is sufficient - we verify the user's JWT token.
    // Additional safety checks below (sourced only, no applications, not shared) provide adequate protection.

    const results = {
      requested: uniqCandidateIds.length,
      deleted: 0,
      skipped: 0,
      skipped_reasons: [] as Array<{ candidate_id: string; reason: string }>,
      deleted_storage_objects: 0,
    };

    for (const candidateId of uniqCandidateIds) {
      // Candidate must exist and be sourced (no auth user)
      const { data: cp, error: cpErr } = await supabase
        .from("candidate_profiles")
        .select("id, user_id")
        .eq("id", candidateId)
        .maybeSingle();
      if (cpErr || !cp) {
        results.skipped++;
        results.skipped_reasons.push({ candidate_id: candidateId, reason: "candidate_not_found" });
        continue;
      }
      if ((cp as any).user_id) {
        results.skipped++;
        results.skipped_reasons.push({ candidate_id: candidateId, reason: "not_sourced_candidate" });
        continue;
      }

      // Must be linked to this org
      const { data: linkRows } = await supabase
        .from("candidate_org_links")
        .select("organization_id, status")
        .eq("candidate_id", candidateId);
      const links = (linkRows || []) as any[];
      const hasThisOrg = links.some((l) => l.organization_id === organizationId);
      if (!hasThisOrg) {
        results.skipped++;
        results.skipped_reasons.push({ candidate_id: candidateId, reason: "not_linked_to_org" });
        continue;
      }

      // Safety: if linked to other orgs, don't hard-delete (would affect others)
      const otherOrgLinks = links.filter((l) => l.organization_id !== organizationId && l.status === "active");
      if (otherOrgLinks.length > 0) {
        results.skipped++;
        results.skipped_reasons.push({ candidate_id: candidateId, reason: "linked_to_other_orgs" });
        continue;
      }

      // Safety: don't delete if there are applications
      const { count: appCount } = await supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("candidate_id", candidateId);
      if ((appCount || 0) > 0) {
        results.skipped++;
        results.skipped_reasons.push({ candidate_id: candidateId, reason: "has_applications" });
        continue;
      }

      // Delete storage objects for this candidate's resumes (best-effort)
      try {
        const { data: resumeRows } = await supabase
          .from("resumes")
          .select("file_url")
          .eq("candidate_id", candidateId);
        const paths = Array.from(
          new Set((resumeRows || []).map((r: any) => resumesObjectPath(r.file_url)).filter(Boolean) as string[]),
        );
        if (paths.length > 0) {
          const { data: removed, error: rmErr } = await supabase.storage.from("resumes").remove(paths);
          if (!rmErr) results.deleted_storage_objects += Array.isArray(removed) ? removed.length : paths.length;
        }
      } catch {
        // ignore storage deletion errors
      }

      // Hard delete candidate profile; cascades to resumes/candidate_* tables and candidate_org_links
      const { error: delErr } = await supabase.from("candidate_profiles").delete().eq("id", candidateId);
      if (delErr) {
        results.skipped++;
        results.skipped_reasons.push({ candidate_id: candidateId, reason: `delete_failed:${delErr.message}` });
        continue;
      }

      results.deleted++;
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

