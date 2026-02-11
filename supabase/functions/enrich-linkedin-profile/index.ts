import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROXYCURL_API_KEY = Deno.env.get('PROXYCURL_API_KEY')!;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { linkedin_url } = await req.json();

    if (!linkedin_url) {
      return new Response(
        JSON.stringify({ error: 'LinkedIn URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Enriching profile: ${linkedin_url}`);

    // Call Proxycurl API with retry logic
    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(
          `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(linkedin_url)}&fallback_to_cache=on-error&use_cache=if-present`,
          {
            headers: {
              'Authorization': `Bearer ${PROXYCURL_API_KEY}`,
              'Accept': 'application/json'
            }
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Proxycurl API error (${response.status}):`, errorText);

          if (response.status === 404) {
            throw new Error('Profile not found or private');
          }
          if (response.status === 429) {
            throw new Error('Rate limit exceeded');
          }
          if (response.status === 401 || response.status === 403) {
            throw new Error('Invalid API key or unauthorized');
          }
          throw new Error(`Proxycurl API error: ${response.status}`);
        }

        const data = await response.json();

        // Transform Proxycurl response to our format
        const enrichedProfile = {
          linkedin_url,
          full_name: data.full_name || 'Unknown',
          first_name: data.first_name,
          last_name: data.last_name,
          headline: data.headline,
          summary: data.summary,
          profile_pic_url: data.profile_pic_url,

          // Location
          city: data.city,
          state: data.state,
          country: data.country_full_name || data.country,

          // Current position (first experience entry)
          current_title: data.experiences?.[0]?.title,
          current_company: data.experiences?.[0]?.company,
          current_company_logo: data.experiences?.[0]?.logo_url,

          // Education (highest/most recent)
          education_school: data.education?.[0]?.school,
          education_degree: data.education?.[0]?.degree_name,
          education_field: data.education?.[0]?.field_of_study,
          education_logo: data.education?.[0]?.logo_url,

          // Full arrays
          experiences: data.experiences || [],
          education: data.education || [],
          skills: data.skills || [],
          certifications: data.certifications || [],
          languages: data.languages || [],

          // Calculated fields
          years_of_experience: calculateTotalExperience(data.experiences),

          // Metadata
          enriched_at: new Date().toISOString(),
          raw_profile: data // Store full Proxycurl response
        };

        console.log(`Successfully enriched: ${enrichedProfile.full_name}`);

        return new Response(
          JSON.stringify(enrichedProfile),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt + 1} failed:`, error);

        if (attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
      }
    }

    // All retries failed
    throw lastError;

  } catch (error: any) {
    console.error('Enrichment error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Enrichment failed',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function calculateTotalExperience(experiences: any[]): number {
  if (!experiences || experiences.length === 0) return 0;

  let totalMonths = 0;
  for (const exp of experiences) {
    if (!exp.starts_at) continue;

    const startDate = new Date(exp.starts_at.year, (exp.starts_at.month || 1) - 1);
    const endDate = exp.ends_at
      ? new Date(exp.ends_at.year, (exp.ends_at.month || 1) - 1)
      : new Date(); // Current date if still employed

    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12
                  + (endDate.getMonth() - startDate.getMonth());
    totalMonths += Math.max(0, months);
  }

  return Math.round(totalMonths / 12 * 10) / 10; // Years with 1 decimal
}
