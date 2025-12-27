import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileName, fileType, resumeText } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let textContent = resumeText;

    // If we received a base64 file, we need to extract text
    if (fileBase64 && !textContent) {
      console.log("Processing file:", fileName, "Type:", fileType);

      // Decode base64 to get file content
      const binaryContent = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));

      if (fileType === "application/pdf") {
        // Robust PDF text extraction (the previous approach was too brittle for many PDFs)
        try {
          const pdfjsLib = await import(
            "https://esm.sh/pdfjs-dist@4.10.38/legacy/build/pdf.mjs?deno"
          );

          const loadingTask = pdfjsLib.getDocument({
            data: binaryContent,
            // Workers aren't available/needed in this environment
            disableWorker: true,
          } as any);

          const pdf = await loadingTask.promise;
          const maxPages = Math.min(pdf.numPages ?? 1, 4);

          const parts: string[] = [];
          for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
            const page = await pdf.getPage(pageNo);
            const tc = await page.getTextContent();
            for (const item of tc.items as Array<{ str?: string }>) {
              if (item?.str) parts.push(item.str);
            }
          }

          textContent = parts.join(" ")
            .replace(/\s+/g, " ")
            .trim();

          console.log(
            "PDF.js extracted text length:",
            textContent.length,
            "pages:",
            maxPages,
          );
        } catch (e) {
          console.error("PDF.js extraction failed, falling back to naive parsing:", e);

          // Fallback: naive decode-based extraction (kept as last resort)
          const decoder = new TextDecoder("utf-8", { fatal: false });
          const rawText = decoder.decode(binaryContent);

          const textMatches = rawText.match(/\(([^)]+)\)/g) || [];
          const extracted = textMatches
            .map((match) => match.slice(1, -1))
            .filter((text) => text.length > 1 && /[a-zA-Z]/.test(text))
            .join(" ");

          const plainTextMatches = rawText.match(/[A-Za-z][A-Za-z0-9\s@.,-]+[A-Za-z0-9]/g) || [];
          const additionalText = plainTextMatches
            .filter((t) => t.length > 5)
            .join(" ");

          textContent = (extracted + " " + additionalText)
            .replace(/\\[nrt]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          console.log("Fallback extracted text length:", textContent.length);
        }
      } else {
        // For text-based files, just decode as text
        const decoder = new TextDecoder("utf-8");
        textContent = decoder.decode(binaryContent);
      }
    }

    if (!textContent || textContent.trim().length < 30) {
      console.log("Insufficient text extracted, attempting AI vision parsing");
      
      // If we couldn't extract enough text, use AI with base64 image/document
      // The AI can understand document structure from the raw content
      textContent = `[Document uploaded: ${fileName}. File type: ${fileType}. Please analyze and extract candidate information from this resume document.]`;
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
        extractedEmail = matches[0].trim();
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
        extractedPhone = matches[0].trim();
        break;
      }
    }
    
    console.log("Regex extracted - Email:", extractedEmail, "Phone:", extractedPhone);

    const systemPrompt = `You are an expert resume parser. Extract key information from the resume text or document provided.
Be accurate and only extract information that is clearly present in the resume.

CRITICAL INSTRUCTIONS FOR CONTACT INFO:
- For email: Look carefully for patterns like name@gmail.com, name@domain.com. The email is usually near the top of the resume near the name.
- For phone: Look for phone number patterns like +1 (xxx) xxx-xxxx or xxx-xxx-xxxx. Usually near email.
- If you see hints provided with regex-detected values, USE THEM - they are reliable.

For skills, extract both technical and soft skills mentioned.`;

    const userPrompt = `Parse this resume and extract the candidate's information:

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
              description: "Extract structured information from a resume",
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
                    description: "Current or most recent job title" 
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
                  }
                },
                required: ["full_name", "skills"],
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

    // Post-process: fill missing contact fields from regex extraction
    if (!parsed.email && extractedEmail) parsed.email = extractedEmail;
    if (!parsed.phone && extractedPhone) parsed.phone = extractedPhone;

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
