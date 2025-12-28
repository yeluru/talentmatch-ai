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
    const { profiles, organizationId, source } = await req.json();
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      throw new Error("No profiles provided");
    }

    if (!organizationId) {
      throw new Error("Organization ID is required");
    }

    console.log("Importing", profiles.length, "profiles for org:", organizationId);

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[]
    };

    for (const profile of profiles) {
      try {
        // Check if candidate already exists by email (if provided)
        if (profile.email) {
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("email", profile.email)
            .maybeSingle();

          if (existingProfile) {
            console.log("Skipping duplicate:", profile.email);
            results.skipped++;
            continue;
          }
        }

        // Create a placeholder auth user (for external candidates)
        // We generate a unique ID for tracking
        const candidateId = crypto.randomUUID();

        // Create candidate profile directly
        const { data: candidateProfile, error: candidateError } = await supabase
          .from("candidate_profiles")
          .insert({
            id: candidateId,
            user_id: candidateId, // Self-referential for external candidates
            organization_id: organizationId,
            current_title: profile.headline || profile.current_title || null,
            current_company: profile.current_company || null,
            years_of_experience: profile.experience_years || profile.years_of_experience || null,
            headline: profile.headline || profile.summary || null,
            summary: profile.summary || null,
            is_actively_looking: true,
            profile_completeness: 50
          })
          .select()
          .single();

        if (candidateError) {
          console.error("Error creating candidate:", candidateError);
          results.errors.push(`Failed to import ${profile.full_name || 'unknown'}: ${candidateError.message}`);
          continue;
        }

        // Add profile record for name/email/contact info
        const { error: profileError } = await supabase
          .from("profiles")
          .insert({
            user_id: candidateId,
            email: profile.email || `imported-${candidateId.substring(0, 8)}@placeholder.local`,
            full_name: profile.full_name || "Unknown",
            location: profile.location || null,
            linkedin_url: profile.linkedin_url || null,
            phone: profile.phone || null
          });

        if (profileError) {
          console.error("Error creating profile:", profileError);
          // Don't fail completely, candidate profile was created
        }

        // Add skills if provided
        if (profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0) {
          const skillInserts = profile.skills.map((skill: string) => ({
            candidate_id: candidateId,
            skill_name: skill.trim()
          }));

          const { error: skillsError } = await supabase
            .from("candidate_skills")
            .insert(skillInserts);

          if (skillsError) {
            console.error("Error adding skills:", skillsError);
          }
        }

        results.imported++;
        console.log("Imported:", profile.full_name);

      } catch (e) {
        console.error("Error importing profile:", e);
        results.errors.push(`Failed to import ${profile.full_name || 'unknown'}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    console.log("Import complete:", results);

    return new Response(JSON.stringify({ 
      success: true, 
      results 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("bulk-import-candidates error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
