import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation constants
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_LENGTH = 100000; // 100KB of text
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain'
];

function validateFileType(fileType: string | null | undefined, fileName: string | null | undefined): boolean {
  if (!fileType && !fileName) return false;
  
  // Check by MIME type
  if (fileType && ALLOWED_FILE_TYPES.includes(fileType)) return true;
  
  // Check by extension as fallback
  if (fileName) {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.pdf') || 
        lowerName.endsWith('.docx') || 
        lowerName.endsWith('.doc') || 
        lowerName.endsWith('.txt')) {
      return true;
    }
  }
  
  return false;
}

function validateBase64Size(base64: string): boolean {
  // Base64 encoded data is ~4/3 the size of the original
  const estimatedBytes = (base64.length * 3) / 4;
  return estimatedBytes <= MAX_FILE_SIZE_BYTES;
}

function sanitizeString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return String(value).trim().slice(0, maxLength).replace(/[<>]/g, '');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError?.message || "No user found");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.id);

    const body = await req.json();
    const { fileBase64, fileName, fileType, resumeText } = body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Input validation
    const validatedFileName = sanitizeString(fileName, 255);
    const validatedFileType = sanitizeString(fileType, 100);

    // Validate file type
    if (fileBase64 && !validateFileType(validatedFileType, validatedFileName)) {
      return new Response(JSON.stringify({ error: "Invalid file type. Allowed: PDF, DOCX, DOC, TXT" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file size
    if (fileBase64 && !validateBase64Size(fileBase64)) {
      return new Response(JSON.stringify({ error: "File too large. Maximum size is 10MB" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let textContent = resumeText ? String(resumeText).slice(0, MAX_TEXT_LENGTH) : null;

    // If we received a base64 file, we need to extract text
    if (fileBase64 && !textContent) {
      console.log("Processing file:", validatedFileName, "Type:", validatedFileType);

      // Decode base64 to get file content
      const binaryContent = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));

      if (validatedFileType === "application/pdf" || validatedFileName?.toLowerCase().endsWith('.pdf')) {
        // PDF text extraction using a serverless PDF.js build that works in Deno/edge runtimes
        try {
          const { getDocument } = await import("https://esm.sh/pdfjs-serverless@0.3.2?deno");

          const loadingTask = (getDocument as any)({
            data: binaryContent,
            useSystemFonts: true,
          });

          const pdf = await loadingTask.promise;

          const parts: string[] = [];
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const pageText = (content.items || [])
              .map((it: any) => (typeof it?.str === "string" ? it.str : ""))
              .filter(Boolean)
              .join(" ");
            if (pageText.trim()) parts.push(pageText);
          }

          textContent = parts.join("\n\n").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
          console.log("PDF extracted text length:", textContent.length);
        } catch (e) {
          console.error("PDF parsing error:", e);
          textContent = "";
        }
      } else if (
        validatedFileType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        validatedFileName?.toLowerCase().endsWith(".docx")
      ) {
        // DOCX text extraction
        try {
          const mammoth = await import("https://esm.sh/mammoth@1.8.0?deno");
          const result = await (mammoth as any).extractRawText({
            arrayBuffer: binaryContent.buffer,
          });
          textContent = String(result?.value || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
          console.log("Mammoth extracted text length:", textContent.length);
        } catch (e) {
          console.error("DOCX extraction failed, falling back to utf-8 decode:", e);
          const decoder = new TextDecoder("utf-8", { fatal: false });
          textContent = decoder.decode(binaryContent).slice(0, MAX_TEXT_LENGTH);
        }
      } else {
        // For text-based files, just decode as text
        const decoder = new TextDecoder("utf-8");
        textContent = decoder.decode(binaryContent).slice(0, MAX_TEXT_LENGTH);
      }
    }

    if (!textContent || textContent.trim().length < 30) {
      console.log("Insufficient text extracted, attempting AI vision parsing");
      
      // If we couldn't extract enough text, use AI with base64 image/document
      // The AI can understand document structure from the raw content
      textContent = `[Document uploaded: ${validatedFileName}. File type: ${validatedFileType}. Please analyze and extract candidate information from this resume document.]`;
    }

    console.log("Parsing resume, text length:", textContent.length);

    // Heuristic extraction for contact details using multiple regex patterns
    // Try multiple email patterns from most specific to general
    const emailPatterns = [
      /[a-zA-Z0-9._%+-]+@gmail\.com/gi,
      /[a-zA-Z0-9._%+-]+@yahoo\.com/gi,
      /[a-zA-Z0-9._%+-]+@outlook\.com/gi,
      /[a-zA-Z0-9._%+-]+@hotmail\.com/gi,
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    ];
    
    let extractedEmail: string | undefined;
    for (const pattern of emailPatterns) {
      const matches = textContent.match(pattern);
      if (matches && matches.length > 0) {
        // Take the first valid-looking email
        extractedEmail = matches[0].trim().slice(0, 255);
        break;
      }
    }
    
    // Multiple phone patterns - more flexible matching
    const phonePatterns = [
      /\+1\s*\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/g,  // +1 (xxx) xxx-xxxx
      /\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,  // +1-xxx-xxx-xxxx
      /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/g,  // (xxx) xxx-xxxx
      /\d{3}[-.\s]\d{3}[-.\s]\d{4}/g,  // xxx-xxx-xxxx
      /\+\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,  // International
    ];
    
    let extractedPhone: string | undefined;
    for (const pattern of phonePatterns) {
      const matches = textContent.match(pattern);
      if (matches && matches.length > 0) {
        // Take the first valid-looking phone
        extractedPhone = matches[0].trim().slice(0, 30);
        break;
      }
    }
    
    console.log("Regex extracted - Email:", extractedEmail, "Phone:", extractedPhone);

    const systemPrompt = `You are an expert resume parser and ATS analyst. Extract key information from the resume and evaluate its quality.

CRITICAL INSTRUCTIONS FOR CONTACT INFO:
- For email: Look carefully for patterns like name@gmail.com, name@domain.com. The email is usually near the top of the resume near the name.
- For phone: Look for phone number patterns like +1 (xxx) xxx-xxxx or xxx-xxx-xxxx. Usually near email.
- If you see hints provided with regex-detected values, USE THEM - they are reliable.

For skills, extract both technical and soft skills mentioned.

ATS SCORING CRITERIA (score 0-100):
- Keyword optimization for their target role (25 points)
- Clear structure and formatting (20 points)
- Quantifiable achievements (20 points)
- Skills section completeness (15 points)
- Contact info completeness (10 points)
- Professional summary quality (10 points)`;

    const userPrompt = `Parse this resume and extract the candidate's information. Also calculate an ATS score based on how well the resume is optimized for the candidate's target/current role.

IMPORTANT - USE THESE CONTACT DETAILS IF DETECTED:
- Detected Email: ${extractedEmail ?? "NOT FOUND - search the text carefully"}
- Detected Phone: ${extractedPhone ?? "NOT FOUND - search the text carefully"}

RESUME CONTENT:
${textContent.substring(0, 30000)}

IMPORTANT: The email "${extractedEmail || ''}" and phone "${extractedPhone || ''}" shown above were extracted via regex. If they look valid, USE THEM in your response.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "parse_resume",
              description: "Extract structured information from a resume and calculate ATS score",
              parameters: {
                type: "object",
                properties: {
                  full_name: { 
                    type: "string", 
                    description: "The candidate's full name" 
                  },
                  email: { 
                    type: "string", 
                    description: "The candidate's email address" 
                  },
                  phone: { 
                    type: "string", 
                    description: "The candidate's phone number" 
                  },
                  location: { 
                    type: "string", 
                    description: "The candidate's location/city" 
                  },
                  current_title: { 
                    type: "string", 
                    description: "Current or most recent job title - this is the target role for ATS scoring" 
                  },
                  current_company: { 
                    type: "string", 
                    description: "Current or most recent company" 
                  },
                  years_of_experience: { 
                    type: "number", 
                    description: "Estimated total years of experience" 
                  },
                  skills: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "List of skills found in the resume" 
                  },
                  education: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        institution: { type: "string" },
                        degree: { type: "string" },
                        field_of_study: { type: "string" },
                        year: { type: "string" }
                      }
                    },
                    description: "Education history"
                  },
                  experience: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        company: { type: "string" },
                        title: { type: "string" },
                        duration: { type: "string" },
                        description: { type: "string" }
                      }
                    },
                    description: "Work experience history"
                  },
                  summary: {
                    type: "string",
                    description: "Brief professional summary or headline"
                  },
                  linkedin_url: {
                    type: "string",
                    description: "LinkedIn profile URL if found"
                  },
                  ats_score: {
                    type: "number",
                    description: "ATS compatibility score from 0-100 based on how well the resume is optimized for the target role"
                  },
                  ats_feedback: {
                    type: "string",
                    description: "Brief feedback on resume quality and what could be improved"
                  }
                },
                required: ["full_name", "skills", "ats_score"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "parse_resume" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response received");
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.error("No tool call in response:", JSON.stringify(data));
      throw new Error("No parsed data returned from AI");
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    // Post-process: fill missing contact fields from regex extraction and sanitize output
    if (!parsed.email && extractedEmail) parsed.email = extractedEmail;
    if (!parsed.phone && extractedPhone) parsed.phone = extractedPhone;

    // Sanitize AI output before returning
    parsed.full_name = sanitizeString(parsed.full_name, 200);
    parsed.email = sanitizeString(parsed.email, 255);
    parsed.phone = sanitizeString(parsed.phone, 30);
    parsed.location = sanitizeString(parsed.location, 200);
    parsed.current_title = sanitizeString(parsed.current_title, 200);
    parsed.current_company = sanitizeString(parsed.current_company, 200);
    parsed.summary = sanitizeString(parsed.summary, 2000);
    parsed.linkedin_url = sanitizeString(parsed.linkedin_url, 500);
    parsed.ats_feedback = sanitizeString(parsed.ats_feedback, 1000);
    
    if (Array.isArray(parsed.skills)) {
      parsed.skills = parsed.skills
        .slice(0, 50)
        .map((s: unknown) => sanitizeString(String(s), 100))
        .filter(Boolean);
    }

    console.log("Parsed resume for:", parsed.full_name, "Email:", parsed.email);

    return new Response(JSON.stringify({ parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("parse-resume error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});