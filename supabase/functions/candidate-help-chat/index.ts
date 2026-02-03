import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { messages, guideContext } = body as {
      messages: Array<{ role: string; content: string }>;
      guideContext: string;
    };

    if (!messages?.length || typeof guideContext !== "string") {
      return new Response(
        JSON.stringify({ error: "messages and guideContext required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a friendly help assistant for job seekers using this career platform. Your job is to answer their "how do I..." questions using the following How-to Guide. Keep answers clear, short, and in plain English. If the answer is not in the guide, say so and give brief general advice. Do not make up features that are not in the guide.

Format your replies in Markdown for readability:
- Use **bold** for emphasis on key terms or steps.
- Use bullet lists (- or *) for multiple steps or options.
- Use numbered lists (1. 2. 3.) when order matters.
- Use short paragraphs; avoid one long block of text.
- Do not use code blocks unless showing a literal value (e.g. a setting name).

How-to Guide:
${guideContext}`;

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const { res } = await callChatCompletions({
      messages: chatMessages,
      temperature: 0.4,
    });

    if (!res.ok) {
      if (res.status === 429) {
        return new Response(
          JSON.stringify({ error: "Too many requests. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI error: ${res.status}`);
    }

    const data = await res.json();
    const content =
      data.choices?.[0]?.message?.content?.trim() ||
      "I couldn't generate a response. Please try again.";

    return new Response(
      JSON.stringify({ message: content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("candidate-help-chat error:", err);
    const message = err instanceof Error ? err.message : "Something went wrong";
    // Return 200 with error body so the client can always read the message (5xx often drops body in relay)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
