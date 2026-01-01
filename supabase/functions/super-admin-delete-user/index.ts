import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type DeleteUserRequest = {
  targetUserId: string;
  reason?: string;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Helpful request tracing (no PII beyond ids/emails already in our DB)
  const requestId = crypto.randomUUID();

  try {
    console.log(`[super-admin-delete-user] start requestId=${requestId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requester },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !requester) throw new Error("Unauthorized");

    const body = (await req.json()) as DeleteUserRequest;
    if (!body?.targetUserId || !isUuid(body.targetUserId)) {
      return new Response(JSON.stringify({ error: "Invalid targetUserId" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const targetUserId = body.targetUserId;
    const reason = body.reason?.trim() || "Deleted by super admin";

    console.log(
      `[super-admin-delete-user] requestId=${requestId} requester=${requester.id} target=${targetUserId}`,
    );

    // Verify requester is super admin
    const { data: superAdminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", requester.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!superAdminRole) {
      return new Response(JSON.stringify({ error: "Only super admins can delete users" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Prevent deleting super admins
    const { data: targetRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId);

    if (targetRoles?.some((r) => r.role === "super_admin")) {
      return new Response(JSON.stringify({ error: "Cannot delete a super admin account" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch target auth user for archiving
    const { data: targetAuthUser, error: getUserError } = await supabase.auth.admin.getUserById(
      targetUserId,
    );

    if (getUserError || !targetAuthUser?.user) {
      console.log(`[super-admin-delete-user] requestId=${requestId} target not found`);
      return new Response(JSON.stringify({ error: "Target user not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const authUser = targetAuthUser.user;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();

    const { data: candidateProfile } = await supabase
      .from("candidate_profiles")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();

    const candidateId = candidateProfile?.id as string | undefined;

    const [applicationsRes, resumesRes, eduRes, expRes, skillsRes] = await Promise.all([
      candidateId
        ? supabase.from("applications").select("*").eq("candidate_id", candidateId)
        : Promise.resolve({ data: [] as unknown[] }),
      candidateId
        ? supabase.from("resumes").select("*").eq("candidate_id", candidateId)
        : Promise.resolve({ data: [] as unknown[] }),
      candidateId
        ? supabase.from("candidate_education").select("*").eq("candidate_id", candidateId)
        : Promise.resolve({ data: [] as unknown[] }),
      candidateId
        ? supabase.from("candidate_experience").select("*").eq("candidate_id", candidateId)
        : Promise.resolve({ data: [] as unknown[] }),
      candidateId
        ? supabase.from("candidate_skills").select("*").eq("candidate_id", candidateId)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const rolesData = targetRoles ?? [];

    const fullName = (profile as any)?.full_name ?? (authUser.user_metadata as any)?.full_name ?? null;
    const email = authUser.email ?? (profile as any)?.email ?? null;

    // Archive snapshot
    const { error: archiveError } = await supabase.from("archived_users").insert({
      original_user_id: targetUserId,
      archived_by: requester.id,
      archive_reason: reason,
      email,
      full_name: fullName,
      user_data: {
        id: authUser.id,
        email: authUser.email,
        created_at: authUser.created_at,
        last_sign_in_at: (authUser as any).last_sign_in_at,
        user_metadata: authUser.user_metadata,
        app_metadata: authUser.app_metadata,
      },
      profile_data: profile ?? null,
      roles_data: rolesData ?? null,
      candidate_profile_data: candidateProfile
        ? {
            ...candidateProfile,
            education: (eduRes as any).data ?? [],
            experience: (expRes as any).data ?? [],
            skills: (skillsRes as any).data ?? [],
          }
        : null,
      applications_data: (applicationsRes as any).data ?? null,
      resumes_data: (resumesRes as any).data ?? null,
    });

    if (archiveError) throw archiveError;

    // Delete related public data (best-effort order)
    if (candidateId) {
      await supabase.from("applications").delete().eq("candidate_id", candidateId);
      await supabase.from("resumes").delete().eq("candidate_id", candidateId);
      await supabase.from("candidate_education").delete().eq("candidate_id", candidateId);
      await supabase.from("candidate_experience").delete().eq("candidate_id", candidateId);
      await supabase.from("candidate_skills").delete().eq("candidate_id", candidateId);
      await supabase.from("candidate_profiles").delete().eq("id", candidateId);
    }

    await Promise.all([
      supabase.from("notifications").delete().eq("user_id", targetUserId),
      supabase.from("user_suspensions").delete().eq("user_id", targetUserId),
      supabase.from("user_roles").delete().eq("user_id", targetUserId),
      supabase.from("profiles").delete().eq("user_id", targetUserId),
    ]);

    // Finally delete from authentication
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(targetUserId);
    if (deleteAuthError) throw deleteAuthError;

    // Verify deletion actually took effect (prevents "looks deleted" but auth user remains)
    const { data: verifyUser } = await supabase.auth.admin.getUserById(targetUserId);
    if (verifyUser?.user) {
      console.error(
        `[super-admin-delete-user] requestId=${requestId} deleteUser returned success but user still exists target=${targetUserId}`,
      );
      return new Response(
        JSON.stringify({
          error:
            "Deletion did not fully complete (auth account still exists). Please try again or contact support.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    console.log(`[super-admin-delete-user] success requestId=${requestId} target=${targetUserId}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error(`[super-admin-delete-user] error requestId=${requestId}:`, error);
    return new Response(JSON.stringify({ error: error.message ?? "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

