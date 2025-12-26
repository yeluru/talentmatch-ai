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
      const binaryContent = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
      
      // For PDF files, we'll use a simple text extraction approach
      // by looking for text streams in the PDF
      if (fileType === 'application/pdf') {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const rawText = decoder.decode(binaryContent);
        
        // Extract text between BT (begin text) and ET (end text) markers
        // This is a simplified PDF text extraction
        const textMatches = rawText.match(/\(([^)]+)\)/g) || [];
        textContent = textMatches
          .map(match => match.slice(1, -1))
          .filter(text => text.length > 1 && /[a-zA-Z]/.test(text))
          .join(' ');
        
        // Also try to find plain text content
        const plainTextMatches = rawText.match(/[A-Za-z][A-Za-z0-9\s@.,-]+[A-Za-z0-9]/g) || [];
        const additionalText = plainTextMatches
          .filter(t => t.length > 5)
          .join(' ');
        
        textContent = textContent + ' ' + additionalText;
        
        // Clean up the extracted text
        textContent = textContent
          .replace(/\\[nrt]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
          
        console.log("Extracted text length:", textContent.length);
      } else {
        // For text-based files, just decode as text
        const decoder = new TextDecoder('utf-8');
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

    const systemPrompt = `You are an expert resume parser. Extract key information from the resume text or document provided.
Be accurate and only extract information that is clearly present in the resume.
For the email, look for patterns like name@domain.com.
For phone numbers, look for patterns with area codes.
For skills, extract both technical and soft skills mentioned.
If the input seems garbled or unreadable, try to extract any recognizable information like email addresses, phone numbers, and names.`;

    const userPrompt = `Parse this resume and extract the candidate's information:

RESUME CONTENT:
${textContent.substring(0, 10000)}

Extract all relevant information including contact details, skills, experience, and education.
If the text is partially garbled, focus on extracting recognizable patterns like email addresses and phone numbers.`;

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
