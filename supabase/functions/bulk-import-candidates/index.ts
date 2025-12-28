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

        // Generate a unique ID for the sourced profile
        const candidateId = crypto.randomUUID();

        // Create candidate profile with null user_id (sourced profile, not an actual user)
        const { error: candidateError } = await supabase
          .from("candidate_profiles")
          .insert({
            id: candidateId,
            user_id: null, // Null for sourced/imported profiles (not real users)
            organization_id: organizationId,
            full_name: profile.full_name || "Unknown",
            email: profile.email || null,
            phone: profile.phone || null,
            location: profile.location || null,
            linkedin_url: profile.linkedin_url || null,
            current_title: profile.headline || profile.current_title || null,
            current_company: profile.current_company || null,
            years_of_experience: profile.experience_years || profile.years_of_experience || null,
            headline: profile.headline || profile.summary || null,
            summary: profile.summary || null,
            ats_score: profile.ats_score || null,
            is_actively_looking: true,
            profile_completeness: 50
          });

        if (candidateError) {
          console.error("Error creating candidate:", candidateError);
          results.errors.push(`Failed to import ${profile.full_name || 'unknown'}: ${candidateError.message}`);
          continue;
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

        // Create resume record if resume file info is provided
        if (profile.resume_file) {
          const { file_name, file_url, file_type } = profile.resume_file;
          
          const { error: resumeError } = await supabase
            .from("resumes")
            .insert({
              candidate_id: candidateId,
              file_name: file_name,
              file_url: file_url,
              file_type: file_type || 'application/pdf',
              ats_score: profile.ats_score || null,
              is_primary: true, // First resume is primary
              parsed_content: profile // Store parsed data
            });

          if (resumeError) {
            console.error("Error creating resume record:", resumeError);
            // Don't fail the whole import, just log the error
          } else {
            console.log("Created resume record for:", profile.full_name);
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
