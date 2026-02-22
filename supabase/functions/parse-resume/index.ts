import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation constants
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_LENGTH = 300000; // 300KB of text (increased for complete extraction)
const PARSER_VERSION = "2026-01-15-parse-resume-v3-links";
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Legacy .doc files (application/msword) are NOT supported - conversion produces poor results
  'text/plain'
];

function validateFileType(fileType: string | null | undefined, fileName: string | null | undefined): boolean {
  if (!fileType && !fileName) return false;
  
  // Check by MIME type
  if (fileType && ALLOWED_FILE_TYPES.includes(fileType)) return true;

  // Common fallback: some clients send application/octet-stream for DOCX/PDF.
  if (fileType && fileType === 'application/octet-stream' && fileName) {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.pdf') || lowerName.endsWith('.docx') || lowerName.endsWith('.txt')) return true;
  }
  
  // Check by extension as fallback
  if (fileName) {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.pdf') ||
        lowerName.endsWith('.docx') ||
        lowerName.endsWith('.txt')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract name from filename as fallback when AI parsing fails
 * Example: "Sundeep Kumar Lead roles.pdf" -> "Sundeep Kumar"
 */
function extractNameFromFilename(fileName: string | null | undefined): string | null {
  if (!fileName) return null;

  // Remove file extension
  let name = fileName.replace(/\.(pdf|docx?|txt)$/i, '').trim();

  // Common patterns to remove
  const patternsToRemove = [
    /resume/gi,
    /cv/gi,
    /curriculum\s+vitae/gi,
    /_+/g,  // underscores
    /\d{4,}/g,  // long numbers (years, IDs)
    /\(.*?\)/g,  // content in parentheses
    /\[.*?\]/g,  // content in brackets
  ];

  patternsToRemove.forEach(pattern => {
    name = name.replace(pattern, ' ');
  });

  // Clean up multiple spaces
  name = name.replace(/\s+/g, ' ').trim();

  // Extract first 2-4 words that look like a name
  // Names typically have 2-4 parts and contain letters
  const words = name.split(/\s+/).filter(w => /^[A-Za-z][A-Za-z'-]*$/.test(w));

  if (words.length >= 2 && words.length <= 4) {
    return words.join(' ');
  } else if (words.length > 4) {
    // Take first 3 words as name
    return words.slice(0, 3).join(' ');
  } else if (words.length === 1 && words[0].length >= 3) {
    // Single word that might be a name
    return words[0];
  }

  return null;
}

function decodeXmlEntities(s: string): string {
  return String(s || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = parseInt(String(n), 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

function docxXmlToText(xml: string): string {
  let t = String(xml || "");
  // Normalize WordprocessingML structural markers into newlines/tabs before extracting text runs.
  t = t.replace(/<w:tab\b[^\/]*\/>/gi, "\t");
  t = t.replace(/<w:br\b[^\/]*\/>/gi, "\n");
  t = t.replace(/<\/w:p>/gi, "\n");

  // Extract text runs
  const parts: string[] = [];
  for (const m of t.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)) {
    parts.push(m[1] || "");
  }
  // Also include field instruction text sometimes used for hyperlinks, etc.
  for (const m of t.matchAll(/<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/gi)) {
    parts.push(m[1] || "");
  }
  return decodeXmlEntities(parts.join(""));
}

async function extractDocxText(binaryContent: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import("https://esm.sh/fflate@0.8.2?deno");
  const files = unzipSync(binaryContent);
  const docXml = files?.["word/document.xml"];
  if (!docXml) return "";
  const xml = strFromU8(docXml);
  return docxXmlToText(xml);
}

function normalizeLikelyUrl(u: string): string {
  const v = String(u || "").trim();
  if (!v) return "";
  const decoded = decodeXmlEntities(v);
  if (/^https?:\/\//i.test(decoded)) return decoded;
  // Common in Word rels: "www.linkedin.com/in/..." without scheme
  if (/^(www\.)?(linkedin\.com|github\.com)\//i.test(decoded)) return `https://${decoded.replace(/^www\./i, "")}`;
  return decoded;
}

function extractDocxHyperlinkUrlsFromXml(documentXml: string, relsXml: string | null | undefined): string[] {
  const rels = String(relsXml || "");
  const relMap = new Map<string, string>();

  // Map r:id -> Target URL from document.xml.rels
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/gi)) {
    const tag = String(m[0] || "");
    const id = tag.match(/\bId="([^"]+)"/i)?.[1] || "";
    const target = tag.match(/\bTarget="([^"]+)"/i)?.[1] || "";
    const type = tag.match(/\bType="([^"]+)"/i)?.[1] || "";
    const mode = tag.match(/\bTargetMode="([^"]+)"/i)?.[1] || "";
    if (!id || !target) continue;
    const isHyperlink = /\/hyperlink\b/i.test(type) || /external/i.test(mode);
    if (!isHyperlink) continue;
    relMap.set(id, normalizeLikelyUrl(target));
  }

  const urls: string[] = [];

  // 1) Hyperlink tags referencing r:id
  for (const m of String(documentXml || "").matchAll(/<w:hyperlink\b[^>]*\br:id="([^"]+)"[^>]*>/gi)) {
    const rid = String(m[1] || "").trim();
    const u = rid ? relMap.get(rid) : null;
    if (u) urls.push(u);
  }

  // 2) Field codes sometimes embed hyperlinks: HYPERLINK "https://..."
  for (const m of String(documentXml || "").matchAll(/HYPERLINK\s+"([^"]+)"/gi)) urls.push(normalizeLikelyUrl(String(m[1] || "")));
  for (const m of String(documentXml || "").matchAll(/HYPERLINK\s+'([^']+)'/gi)) urls.push(normalizeLikelyUrl(String(m[1] || "")));

  // 3) As a fallback, include any obvious linkedin/github targets found in rels
  for (const u of relMap.values()) {
    if (/linkedin\.com/i.test(u) || /github\.com/i.test(u)) urls.push(u);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const u0 of urls) {
    const u = normalizeLikelyUrl(u0);
    if (!u) continue;
    const key = u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u.slice(0, 500));
  }
  return out.slice(0, 50);
}

async function extractDocxTextAndUrls(binaryContent: Uint8Array): Promise<{ text: string; urls: string[] }> {
  const { unzipSync, strFromU8 } = await import("https://esm.sh/fflate@0.8.2?deno");
  const files = unzipSync(binaryContent);
  const docXmlU8 = files?.["word/document.xml"];
  if (!docXmlU8) return { text: "", urls: [] };
  const docXml = strFromU8(docXmlU8);
  const relsU8 = files?.["word/_rels/document.xml.rels"];
  const relsXml = relsU8 ? strFromU8(relsU8) : "";
  const urls = extractDocxHyperlinkUrlsFromXml(docXml, relsXml);
  return { text: docxXmlToText(docXml), urls };
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

function normalizeExtractedText(raw: string): string {
  // Preserve newlines (critical for bullets/sections), but normalize intra-line whitespace.
  let t = String(raw || "");
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/\t/g, " ");

  const lines = t
    .split("\n")
    .map((l) => l.replace(/[ \u00A0]{2,}/g, " ").trim())
    .filter((l, idx, arr) => {
      // keep blank lines, but avoid huge blank runs
      if (l.length > 0) return true;
      const prev = arr[idx - 1];
      return Boolean(prev && prev.length > 0);
    });

  t = lines.join("\n");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  // Fix common PDF token splits that break readability and downstream parsing.
  t = t
    .replace(/\bH\s*T\s*M\s*L\s*5\b/gi, "HTML5")
    .replace(/\bH\s*T\s*M\s*L\b/gi, "HTML")
    .replace(/\bX\s*M\s*L\b/gi, "XML")
    .replace(/\bJ\s*S\s*O\s*N\b/gi, "JSON")
    .replace(/\bI\s*T\s*S\s*M\b/gi, "ITSM")
    .replace(/\bI\s*T\s*O\s*M\b/gi, "ITOM")
    .replace(/\bI\s*T\s*B\s*M\b/gi, "ITBM")
    .replace(/\bH\s*R\s*S\s*D\b/gi, "HRSD")
    .replace(/\bS\s*D\s*L\s*C\b/gi, "SDLC")
    .replace(/\bR\s*E\s*S\s*T\b/gi, "REST")
    .replace(/\bS\s*O\s*A\s*P\b/gi, "SOAP");
  return t.slice(0, MAX_TEXT_LENGTH);
}

function splitIntoChunksByLines(text: string, maxChars: number) {
  const lines = String(text || "").split("\n");
  const chunks: string[] = [];
  let buf: string[] = [];
  let size = 0;
  for (const line of lines) {
    const add = (buf.length ? 1 : 0) + line.length;
    if (size + add > maxChars && buf.length) {
      chunks.push(buf.join("\n").trim());
      buf = [];
      size = 0;
    }
    buf.push(line);
    size += add;
  }
  if (buf.length) chunks.push(buf.join("\n").trim());
  return chunks.filter(Boolean);
}

function normalizeExperienceEntry(e: any) {
  return {
    company: sanitizeString(e?.company ?? null, 200),
    title: sanitizeString(e?.title ?? null, 200),
    start: sanitizeString(e?.start ?? null, 40),
    end: sanitizeString(e?.end ?? null, 40),
    location: sanitizeString(e?.location ?? null, 120),
    bullets: Array.isArray(e?.bullets) ? e.bullets.map((b: any) => String(b ?? "").replace(/\s*\n\s*/g, " ").trim()).filter(Boolean) : [],
  };
}

function expKeyLoose(e: any) {
  const norm = (s: any) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(e?.company)}|${norm(e?.title)}`;
}

function mergeExperienceAppendMissing(baseExp: any[], moreExp: any[]) {
  const out = Array.isArray(baseExp) ? baseExp.map(normalizeExperienceEntry) : [];
  const more = Array.isArray(moreExp) ? moreExp.map(normalizeExperienceEntry) : [];
  const seen = new Set(out.map(expKeyLoose));

  for (const e of more) {
    const k = expKeyLoose(e);
    if (!k || k === "|") continue;
    const existing = out.find((oe) => expKeyLoose(oe) === k);
    if (!existing) {
      out.push(e);
      seen.add(k);
      continue;
    }
    // Merge bullets (dedupe by normalized text)
    const normB = (b: string) => b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
    const bSeen = new Set((existing.bullets || []).map((b: string) => normB(b)));
    for (const b of e.bullets || []) {
      const nb = normB(b);
      if (!nb || bSeen.has(nb)) continue;
      existing.bullets.push(b);
      bSeen.add(nb);
    }
    // Fill missing meta if absent
    existing.start = existing.start || e.start;
    existing.end = existing.end || e.end;
    existing.location = existing.location || e.location;
  }
  return out;
}

async function recoverExperienceChunked(experienceText: string) {
  const chunks = splitIntoChunksByLines(experienceText, 6500);
  const recovered: any[] = [];
  for (const chunk of chunks.slice(0, 20)) { // Increased from 10 to support longer resumes
    if (!chunk.trim()) continue;
    const sys = `You extract WORK EXPERIENCE entries from resume text.
Hard rules:
- Do NOT fabricate anything.
- Return ALL roles in this chunk.
- Preserve bullet meaning; keep metrics and tool names as written.
- Output strictly via the tool call.`;
    const user = `Extract experience from this resume chunk:\n\n${chunk}`;
    const { res } = await callChatCompletions({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      temperature: 0,
      tools: [
        {
          type: "function",
          function: {
            name: "extract_experience",
            description: "Extract experience entries from a resume chunk",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                experience: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      company: { type: ["string", "null"] },
                      title: { type: ["string", "null"] },
                      start: { type: ["string", "null"] },
                      end: { type: ["string", "null"] },
                      location: { type: ["string", "null"] },
                      bullets: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
              required: ["experience"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_experience" } },
    });

    if (!res.ok) continue;
    const data = await res.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) continue;
    const parsed = JSON.parse(toolCall.function.arguments);
    if (Array.isArray(parsed?.experience)) recovered.push(...parsed.experience);
  }
  return recovered;
}

function computeExtractionDiagnostics(text: string) {
  const t = String(text || "");
  const lines = t.split("\n");
  const bullets =
    (t.match(/[•\u2022]\s+/g) || []).length +
    (t.match(/\n\s*-\s+/g) || []).length +
    (t.match(/\n\s*\*\s+/g) || []).length;
  return {
    extracted_text_length: t.length,
    extracted_lines: lines.length,
    extracted_newlines: (t.match(/\n/g) || []).length,
    bullet_markers: bullets,
    has_experience: /\bexperience\b/i.test(t) || /\bwork experience\b/i.test(t),
    has_education: /\beducation\b/i.test(t),
    has_skills: /\bskills\b/i.test(t) || /\btechnical skills\b/i.test(t),
  };
}

function scoreExtractedText(text: string) {
  const t = String(text || "");
  const diag = computeExtractionDiagnostics(t);
  const upper = t.toUpperCase();
  const sectionHits =
    (upper.includes("EXPERIENCE") ? 1 : 0) +
    (upper.includes("WORK EXPERIENCE") ? 1 : 0) +
    (upper.includes("EDUCATION") ? 1 : 0) +
    (upper.includes("SKILLS") ? 1 : 0) +
    (upper.includes("CERTIFICATIONS") ? 1 : 0);

  const month =
    "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
  const yearRange = (t.match(/\b(19|20)\d{2}\s*(?:[-–—→to]{1,3})\s*(?:present|current|\b(19|20)\d{2}\b)/gi) || []).length;
  const monthYear = (t.match(new RegExp(`\\b${month}\\s+(19|20)\\d{2}\\b`, "gi")) || []).length;
  const monthYearRange =
    (t.match(new RegExp(`\\b${month}\\s+(19|20)\\d{2}\\s*(?:[-–—→to]{1,3})\\s*(?:present|current|${month}\\s+(19|20)\\d{2}|\\b(19|20)\\d{2}\\b)`, "gi")) || []).length;
  const dateRanges = Math.max(yearRange, monthYearRange, Math.floor(monthYear / 2));
  const yearMentions = (t.match(/\b(19|20)\d{2}\b/g) || []).length;
  const eduSignals = (t.match(/\b(university|college|institute|mba|bachelor|master|phd|b\.s\.|m\.s\.|bachelors|masters)\b/gi) || []).length;

  // Weighted score: prefer longer text, more bullets, clear sections, and date ranges.
  const score =
    Math.min(45, diag.extracted_text_length / 2200) +
    Math.min(35, diag.bullet_markers / 6) +
    Math.min(20, sectionHits * 3) +
    Math.min(30, dateRanges * 5) +
    Math.min(10, yearMentions / 8) +
    Math.min(10, eduSignals / 4);

  return {
    score,
    section_hits: sectionHits,
    date_ranges: dateRanges,
    year_mentions: yearMentions,
    edu_signals: eduSignals,
    ...diag,
  };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampScore(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Deterministic "resume quality" score (0-100), NOT JD-based.
 * Purpose: avoid model scores clustering around the 80s and provide a stricter, more explainable baseline.
 */
function computeGenericResumeQualityScore(opts: { extractedText: string; parsed: any }) {
  const extractedText = String(opts?.extractedText || "");
  const parsed = opts?.parsed || {};

  const diag = scoreExtractedText(extractedText);
  const expCount = Array.isArray(parsed?.experience) ? parsed.experience.length : 0;
  const eduCount = Array.isArray(parsed?.education) ? parsed.education.length : 0;
  const techCount = Array.isArray(parsed?.technical_skills) ? parsed.technical_skills.length : 0;
  const softCount = Array.isArray(parsed?.soft_skills) ? parsed.soft_skills.length : 0;
  const summaryLen = String(parsed?.summary || "").trim().length;

  const hasEmail = Boolean(String(parsed?.email || "").trim());
  const hasPhone = Boolean(String(parsed?.phone || "").trim());
  const hasLinkedIn = Boolean(String(parsed?.linkedin_url || "").trim());
  const hasGitHub = Boolean(String(parsed?.github_url || "").trim());
  const hasLocation = Boolean(String(parsed?.location || "").trim());

  // Quantification signals: %, $, numbers with unit suffixes, and common impact verbs.
  const quantSignals =
    (extractedText.match(/\b\d+(\.\d+)?\s*%/g) || []).length +
    (extractedText.match(/\$\s*\d+/g) || []).length +
    (extractedText.match(/\b\d+(\.\d+)?\s*(k|m|b)\b/gi) || []).length +
    (extractedText.match(/\b(saved|reduced|increased|improved|grew|accelerated)\b/gi) || []).length;

  // Contact completeness (0..10)
  const contact =
    (hasEmail ? 4 : 0) +
    (hasPhone ? 3 : 0) +
    (hasLinkedIn ? 1 : 0) +
    (hasGitHub ? 1 : 0) +
    (hasLocation ? 1 : 0);

  // Structure (0..22)
  const structure =
    Math.min(12, (diag.section_hits || 0) * 3) +
    (expCount >= 2 ? 6 : expCount === 1 ? 3 : 0) +
    (eduCount >= 1 ? 2 : 0) +
    (summaryLen >= 80 ? 2 : summaryLen >= 40 ? 1 : 0);

  // Bullets (0..18)
  const bullets = 18 * clamp01((diag.bullet_markers || 0) / 16);

  // Dates (0..10)
  const dates = 10 * clamp01((diag.date_ranges || 0) / 5);

  // Skills completeness (0..18)
  const skills =
    14 * clamp01(techCount / 28) +
    4 * clamp01(softCount / 10);

  // Quantifiable achievements (0..22)
  const quant = 22 * clamp01(quantSignals / 14);

  let total = contact + structure + bullets + dates + skills + quant; // ~0..100

  // Stricter penalties for weak structure/content
  if ((diag.extracted_text_length || 0) < 1200) total -= 10;
  if ((diag.extracted_text_length || 0) < 800) total -= 10;
  if (expCount < 1) total -= 20;
  if ((diag.bullet_markers || 0) < 6) total -= 10;
  if (techCount < 8) total -= 6;
  if (!hasEmail) total -= 8;

  return clampScore(total);
}

function itemsWithEOLToText(items: any[]): string {
  // Alternate PDF text reconstruction: preserve PDF.js intrinsic ordering and use hasEOL when present.
  // This can sometimes outperform coordinate bucketing for certain PDFs.
  const out: string[] = [];
  let line = "";

  for (const it of items || []) {
    const s = typeof it?.str === "string" ? it.str : "";
    if (!s) continue;
    const token = s.replace(/[ \u00A0]{2,}/g, " ").trim();
    if (!token) {
      if (it?.hasEOL && line.trim()) {
        out.push(line.trim());
        line = "";
      }
      continue;
    }
    if (!line) line = token;
    else if (/^[,.:;)\]]/.test(token)) line += token;
    else if (/[([$]$/.test(line)) line += token;
    else line += " " + token;

    if (it?.hasEOL) {
      out.push(line.trim());
      line = "";
    }
  }
  if (line.trim()) out.push(line.trim());
  return out.join("\n");
}

function estimateStructureFromText(text: string) {
  const t = String(text || "");
  const month =
    "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
  const yearRange = (t.match(/\b(19|20)\d{2}\s*(?:[-–—→to]{1,3})\s*(?:present|current|\b(19|20)\d{2}\b)/gi) || []).length;
  const monthYear = (t.match(new RegExp(`\\b${month}\\s+(19|20)\\d{2}\\b`, "gi")) || []).length;
  const monthYearRange =
    (t.match(new RegExp(`\\b${month}\\s+(19|20)\\d{2}\\s*(?:[-–—→to]{1,3})\\s*(?:present|current|${month}\\s+(19|20)\\d{2}|\\b(19|20)\\d{2}\\b)`, "gi")) || []).length;
  const dateRanges = Math.max(yearRange, monthYearRange, Math.floor(monthYear / 2));
  const eduSignals = (t.match(/\b(university|college|institute|mba|bachelor|master|phd|b\.s\.|m\.s\.|bachelors|masters)\b/gi) || []).length;
  const hasExperience = /\b(experience|work experience)\b/i.test(t);
  const hasEducation = /\beducation\b/i.test(t);
  const bullets =
    (t.match(/[•\u2022]\s+/g) || []).length +
    (t.match(/\n\s*-\s+/g) || []).length +
    (t.match(/\n\s*\*\s+/g) || []).length;
  return { dateRanges, eduSignals, hasExperience, hasEducation, bullet_markers: bullets, month_year_mentions: monthYear };
}

function shouldRetryAiParse(parsed: any, sourceText: string) {
  const pExp = Array.isArray(parsed?.experience) ? parsed.experience : [];
  const pEdu = Array.isArray(parsed?.education) ? parsed.education : [];
  const est = estimateStructureFromText(sourceText);

  // If the resume clearly has multiple date ranges and we extracted <2 roles, retry.
  if (est.dateRanges >= 3 && pExp.length < 2) return { retry: true, reason: `Detected ${est.dateRanges} date-ranges but extracted ${pExp.length} experience entries` };
  if ((est.hasExperience || est.bullet_markers >= 8 || est.month_year_mentions >= 4) && pExp.length < 2) {
    return { retry: true, reason: `Resume indicates multiple roles (experience:${est.hasExperience}, bullets:${est.bullet_markers}, month-years:${est.month_year_mentions}) but extracted ${pExp.length} experience entries` };
  }
  // If education signals exist and we extracted none/one, retry.
  if ((est.hasEducation || est.eduSignals >= 2) && pEdu.length < 2) return { retry: true, reason: `Detected education signals but extracted ${pEdu.length} education entries` };
  return { retry: false as const, reason: null as string | null, est };
}

function normalizeWrappedUrls(text: string): string {
  // Some PDF/DOCX text extraction wraps URLs across lines, e.g.
  // https://www.linkedin.com/in/vad
  // uguru-bharadwaj/
  // This stitches obviously-wrapped URLs so regex can capture the full link.
  let t = String(text || "");

  // Join generic wrapped URLs (protocol present)
  t = t.replace(/(\bhttps?:\/\/[^\s]+)\s*\n\s*([^\s]+)/g, '$1$2');

  // Join linkedin.com wrapped even when protocol is missing
  t = t.replace(/(\blinkedin\.com\/in\/[A-Za-z0-9_-]+)\s*\n\s*([A-Za-z0-9_-]+\/?)/gi, '$1$2');

  // If extraction inserted spaces inside URLs (rare), stitch common cases
  t = t.replace(/(\bhttps?:\/\/[^\s]+)\s+([^\s]+)/g, '$1$2');

  return t;
}

function stripContactNoise(value: string | null | undefined): string | null {
  if (!value) return null;
  let s = String(value);

  // Remove obvious contact artifacts anywhere in the text
  s = s.replace(/\bhttps?:\/\/\S+\b/gi, " ");
  s = s.replace(/\bwww\.\S+\b/gi, " ");
  s = s.replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, " ");
  s = s.replace(/\b(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g, " ");
  // Remove spaced-out CONTACT blocks like "C O N T A C T"
  s = s.replace(/\bC\s*O\s*N\s*T\s*A\s*C\s*T\b/gi, " ");

  // Remove full lines that are mostly contact-y (common in resume headers)
  const lines = s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => {
      const lower = l.toLowerCase();
      if (lower.includes("linkedin.com")) return false;
      if (lower.includes("github.com")) return false;
      if (lower.includes("portfolio")) return false;
      if (lower.includes("contact")) return false;
      if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(l)) return false;
      if (/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(l)) return false;
      if (/https?:\/\/|www\./i.test(l)) return false;
      return true;
    });

  s = lines.join("\n");
  s = s.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ").trim();
  return s || null;
}

function isLikelyTitle(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = String(value).trim();
  if (!s) return false;
  if (s.length > 80) return false;
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return false;
  if (/https?:\/\/|www\./i.test(s)) return false;
  if (/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(s)) return false;
  // Titles are not sentences
  if (/[.!?]/.test(s)) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 10) return false;
  return true;
}

function isLikelyCompany(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = String(value).trim();
  if (!s) return false;
  if (s.length > 70) return false;
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return false;
  if (/https?:\/\/|www\./i.test(s)) return false;
  if (/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(s)) return false;
  // Companies are usually not sentences
  if (/[.!?]/.test(s)) return false;
  // Guard against “to achieve …” / action phrases
  if (/\bto\s+\w+/i.test(s)) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  return true;
}

function cleanSkills(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    let s = String(item ?? "").trim();
    if (!s) continue;
    s = s.replace(/^[•\-\*\u2022]+\s*/g, "");
    s = s.replace(/\s+/g, " ").trim();
    if (!s) continue;

    const lower = s.toLowerCase();
    if (lower.includes("linkedin.com") || lower.includes("github.com")) continue;
    if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) continue;
    if (/https?:\/\/|www\./i.test(s)) continue;
    if (/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(s)) continue;
    if (lower.startsWith("and ")) continue;
    if (lower.includes("such as")) continue;
    if (lower.includes("to achieve") || lower.includes("improved the process")) continue;

    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 4) continue;
    if (s.length > 40) continue;

    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(s);
    if (cleaned.length >= 50) break;
  }
  return cleaned;
}

function canonicalizeSkill(raw: string): string {
  const s = String(raw || "").trim().replace(/\s+/g, " ");
  const lower = s.toLowerCase();
  const map: Record<string, string> = {
    "node js": "Node.js",
    "nodejs": "Node.js",
    "react js": "React",
    "micro services": "Microservices",
    "microservices": "Microservices",
    "spring boot": "Spring Boot",
    "aws": "AWS",
    "sql": "SQL",
    "graphql": "GraphQL",
    "typescript": "TypeScript",
    "javascript": "JavaScript",
    "devops": "DevOps",
    "devops tooling": "DevOps Tooling",
    "junit": "JUnit",
    "jmeter": "JMeter",
    "cucumber": "Cucumber",
    "selenium": "Selenium",
    "swiftui": "SwiftUI",
    "ios": "iOS",
    "api design": "API Design",
  };
  if (map[lower]) return map[lower];
  // Title-case fallback for 2-3 word skills; keep acronyms as-is
  if (/^[a-z0-9 .+#-]{2,40}$/i.test(s) && !/[()]/.test(s)) {
    return s
      .split(" ")
      .filter(Boolean)
      .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
      .join(" ");
  }
  return s;
}

function isSoftSkill(s: string): boolean {
  const v = String(s || "").trim().toLowerCase();
  if (!v) return false;
  const soft = new Set([
    "leadership",
    "communication",
    "teamwork",
    "collaboration",
    "stakeholder management",
    "stakeholder",
    "management",
    "people management",
    "mentoring",
    "coaching",
    "problem solving",
    "problem-solving",
    "critical thinking",
    "strategic thinking",
    "technical strategy",
    "business innovation",
    "innovation",
    "presentation",
    "negotiation",
    "time management",
    "project management",
    "organizational skills",
    "adaptability",
  ]);
  if (soft.has(v)) return true;
  // soft skills tend to be pure words (no dots/slashes/plus) and 1-3 words
  if (/[^a-z\s\-]/.test(v)) return false;
  const words = v.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  // Avoid misclassifying "agile/scrum" as soft
  if (v === "agile" || v === "scrum") return false;
  return soft.has(v);
}

function postClassifySkills(technical: string[], soft: string[]) {
  const techOut: string[] = [];
  const softOut: string[] = [];
  const seenTech = new Set<string>();
  const seenSoft = new Set<string>();

  // seed soft from provided list
  for (const s of soft) {
    const key = s.toLowerCase();
    if (seenSoft.has(key)) continue;
    seenSoft.add(key);
    softOut.push(s);
  }

  for (const s of technical) {
    if (isSoftSkill(s)) {
      const key = s.toLowerCase();
      if (!seenSoft.has(key)) {
        seenSoft.add(key);
        softOut.push(s);
      }
      continue;
    }
    const key = s.toLowerCase();
    if (seenTech.has(key)) continue;
    seenTech.add(key);
    techOut.push(s);
  }

  return { technical_skills: techOut, soft_skills: softOut };
}

function normalizeSkillList(items: unknown, limit: number): string[] {
  const raw = Array.isArray(items) ? items : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    let s = String(item ?? "").trim();
    if (!s) continue;
    s = s.replace(/^[•\-\*\u2022]+\s*/g, "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    // reject obvious garbage phrases
    const lower = s.toLowerCase();
    if (lower.startsWith("and ")) continue;
    if (lower.includes("such as")) continue;
    if (lower.includes("experience in")) continue;
    if (lower.includes("experience with")) continue;
    if (lower.includes("to achieve")) continue;
    if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) continue;
    if (/https?:\/\/|www\./i.test(s)) continue;
    if (/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/.test(s)) continue;

    // keep skills short-ish (avoid sentences)
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length > 4) continue;
    if (s.length > 50) continue;

    const canon = canonicalizeSkill(s);
    const key = canon.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(canon);
    if (out.length >= limit) break;
  }
  return out;
}

function buildFallbackSummary(parsed: any): string | null {
  const title = String(parsed?.current_title ?? "").trim();
  const company = String(parsed?.current_company ?? "").trim();
  const years =
    typeof parsed?.years_of_experience === "number" && Number.isFinite(parsed.years_of_experience)
      ? Math.max(0, Math.round(parsed.years_of_experience))
      : null;
  const skills: string[] = Array.isArray(parsed?.technical_skills) ? parsed.technical_skills : [];
  const topSkills = skills.map((s) => String(s).trim()).filter(Boolean).slice(0, 6);

  // If we have nothing at all, don't invent.
  if (!title && !company && !years && topSkills.length === 0) return null;

  const rolePhrase =
    title && company ? `${title} with experience at ${company}` : title ? title : company ? `professional with experience at ${company}` : "professional";

  const parts: string[] = [];
  if (years != null) parts.push(`Experienced ${rolePhrase} with ${years}+ years of industry experience.`);
  else parts.push(`Experienced ${rolePhrase}.`);

  if (topSkills.length) parts.push(`Strong in ${topSkills.join(", ")}.`);
  parts.push(`Open to roles that leverage these strengths to deliver measurable impact.`);

  return parts.join(" ");
}

function heuristicParseResume(text: string, fallbackName?: string | null, fallbackEmail?: string | null) {
  const normalizedForUrls = normalizeWrappedUrls(String(text || ""));
  const t = normalizedForUrls.replace(/\s+/g, " ").trim();

  const linkedinMatch =
    t.match(/\bhttps?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?\b/i) ||
    t.match(/\blinkedin\.com\/in\/[A-Za-z0-9_-]+\/?\b/i);
  const linkedin_url = linkedinMatch
    ? (linkedinMatch[0].toLowerCase().startsWith('http') ? linkedinMatch[0] : `https://${linkedinMatch[0]}`).slice(0, 500)
    : null;

  const githubMatch = t.match(/\bhttps?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+/i);
  const github_url = githubMatch ? githubMatch[0].slice(0, 500) : null;

  const yearsMatches = t.match(/(\d{1,2})\s*\+?\s*years?/gi) || [];
  const years = yearsMatches
    .map((m) => parseInt(m.replace(/[^0-9]/g, ""), 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)[0];

  const titleMatch = t.match(
    /\b(Senior|Lead|Principal|Staff|Junior|Mid[- ]Level)?\s*(Software Engineer|Engineer|Developer|Full Stack Developer|Frontend Developer|Backend Developer|Data Scientist|Data Engineer|ML Engineer|DevOps Engineer|SRE|Product Manager|Project Manager|Business Analyst|QA Engineer|Test Engineer)\b/i,
  );

  const companyMatch =
    t.match(/\b(at|@)\s+([A-Z][A-Za-z0-9&.,\- ]{2,60})\b/) ||
    t.match(/\bCompany[:\s]+([A-Z][A-Za-z0-9&.,\- ]{2,60})\b/i);

  const skillsSection = t.match(/\b(skills|technical skills)\b[:\s]+(.{0,800})/i);
  const rawSkills =
    skillsSection?.[2] ||
    "";

  const skillsFromSection = rawSkills
    .split(/[,;|•·\u2022]/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 40)
    .slice(0, 30);

  const keywordSkills = [
    "JavaScript","TypeScript","React","Next.js","Node.js","Express","Python","Java","C#",".NET","Go","Ruby",
    "PostgreSQL","MySQL","MongoDB","Redis","AWS","Azure","GCP","Docker","Kubernetes","Terraform",
    "REST","GraphQL","CI/CD","Git","Jenkins","GitHub Actions","Agile","Scrum",
  ];
  const skillsFromKeywords = keywordSkills.filter((k) => new RegExp(`\\b${k.replace(/\./g, "\\.")}\\b`, "i").test(t));

  const skillSet = new Map<string, string>();
  for (const s of [...skillsFromSection, ...skillsFromKeywords]) {
    const key = s.toLowerCase();
    if (!skillSet.has(key)) skillSet.set(key, s);
  }

  const summary = stripContactNoise(t.slice(0, 800)) || null;

  return {
    full_name: fallbackName || null,
    email: fallbackEmail || null,
    phone: null,
    location: null,
    current_title: titleMatch ? `${titleMatch[1] ? `${titleMatch[1]} ` : ""}${titleMatch[2]}`.trim() : null,
    current_company: companyMatch ? (companyMatch[2] || companyMatch[1])?.trim() : null,
    years_of_experience: typeof years === "number" ? years : null,
    technical_skills: normalizeSkillList(Array.from(skillSet.values()), 60),
    soft_skills: [],
    education: [],
    experience: [],
    summary,
    linkedin_url,
    github_url,
    ats_score: 50,
    ats_feedback: "Heuristic parse (AI not configured). Add an AI key for better extraction.",
  };
}

function extractSectionsByHeadings(text: string) {
  const lines = String(text || "").split("\n");
  const norm = (s: string) => s.trim().toUpperCase();
  const headings = [
    { key: "experience", re: /^(WORK\s+)?EXPERIENCE\b/ },
    { key: "education", re: /^EDUCATION\b/ },
    { key: "skills", re: /^(TECHNICAL\s+)?SKILLS\b/ },
    { key: "certifications", re: /^CERTIFICATIONS?\b/ },
    { key: "projects", re: /^PROJECTS?\b/ },
  ] as const;

  const idx: Record<string, number> = {};
  for (let i = 0; i < lines.length; i++) {
    const l = norm(lines[i] || "");
    if (!l) continue;
    for (const h of headings) {
      if (idx[h.key] != null) continue;
      if (h.re.test(l)) {
        idx[h.key] = i;
      }
    }
  }

  const cut = (start?: number, end?: number) => {
    if (start == null) return "";
    const s = Math.max(0, start + 1);
    const e = end == null ? lines.length : Math.max(s, end);
    return lines.slice(s, e).join("\n").trim();
  };

  const nextIndex = (from: number) => {
    const candidates = Object.values(idx).filter((n) => typeof n === "number" && n > from);
    return candidates.length ? Math.min(...candidates) : undefined;
  };

  const exp = cut(idx.experience, idx.experience != null ? nextIndex(idx.experience) : undefined);
  const edu = cut(idx.education, idx.education != null ? nextIndex(idx.education) : undefined);
  return { experienceText: exp, educationText: edu, index: idx };
}

function extractExperienceFromText(text: string) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const month =
    "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
  const dateRe = new RegExp(
    `\\b(?:${month}\\s+)?(19|20)\\d{2}\\s*(?:[-–—→to]{1,3})\\s*(?:present|current|(?:${month}\\s+)?(19|20)\\d{2}|\\b(19|20)\\d{2}\\b)`,
    "i",
  );

  const entries: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!dateRe.test(l)) continue;

    const prev1 = lines[i - 1] || "";
    const prev2 = lines[i - 2] || "";
    const header = prev1 || prev2;
    const header2 = prev1 && prev2 ? prev2 : "";

    // Heuristic: "Title — Company" or "Company — Title" or separate lines.
    let title: string | null = null;
    let company: string | null = null;
    const parts = header.split(/—|–|-|@|\|/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      // Prefer title then company if title-ish
      title = parts[0];
      company = parts.slice(1).join(" ");
    } else {
      // Try using two-line header
      const p2 = header2.split(/—|–|-|@|\|/).map((x) => x.trim()).filter(Boolean);
      if (p2.length >= 2) {
        title = p2[0];
        company = p2.slice(1).join(" ");
      } else {
        // Worst-case: treat header as title and leave company null
        title = header || null;
        company = null;
      }
    }

    entries.push({
      company: company || null,
      title: title || null,
      start: null,
      end: null,
      location: null,
      bullets: [],
      _source_line: l,
    });
  }

  // De-dupe by title/company
  const seen = new Set<string>();
  const out: any[] = [];
  for (const e of entries) {
    const k = `${String(e.title || "").toLowerCase()}|${String(e.company || "").toLowerCase()}|${String(e._source_line || "").toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function extractEducationFromText(text: string) {
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const out: any[] = [];
  for (const l of lines) {
    if (/\b(university|college|institute|mba|bachelor|master|phd|b\.s\.|m\.s\.)\b/i.test(l)) {
      out.push({ school: l, degree: null, field: null, start: null, end: null });
    }
  }
  // De-dupe
  const seen = new Set<string>();
  const uniq: any[] = [];
  for (const e of out) {
    const k = String(e.school || "").toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(e);
  }
  return uniq;
}

function mergeIfAiDrops(parsed: any, hints: { exp: any[]; edu: any[] }) {
  if (!parsed) return parsed;
  const pExp = Array.isArray(parsed?.experience) ? parsed.experience : [];
  const pEdu = Array.isArray(parsed?.education) ? parsed.education : [];

  // If AI dropped entries but we have structural hints, merge them in.
  if (hints.exp.length >= 2 && pExp.length < hints.exp.length) {
    parsed.experience = [...pExp, ...hints.exp.slice(pExp.length)];
  }
  if (hints.edu.length >= 2 && pEdu.length < hints.edu.length) {
    parsed.education = [...pEdu, ...hints.edu.slice(pEdu.length)];
  }
  return parsed;
}

function pdfItemsToText(items: any[]): string {
  // Reconstruct readable lines from PDF text items using x/y positions.
  // This dramatically improves section/bullet extraction vs. naïvely joining with spaces.
  const rows: Array<{ x: number; y: number; str: string }> = [];
  for (const it of items || []) {
    const s = typeof it?.str === "string" ? it.str : "";
    if (!s || !s.trim()) continue;
    const tr = Array.isArray(it?.transform) ? it.transform : null;
    const x = typeof tr?.[4] === "number" ? tr[4] : 0;
    const y = typeof tr?.[5] === "number" ? tr[5] : 0;
    rows.push({ x, y, str: s });
  }
  if (!rows.length) return "";

  // Bucket by y (rounded) to form lines, then sort lines top->bottom and tokens left->right.
  const bucket = (y: number) => Math.round(y * 2) / 2; // 0.5pt buckets
  const byLine = new Map<number, Array<{ x: number; str: string }>>();
  for (const r of rows) {
    const k = bucket(r.y);
    const line = byLine.get(k) || [];
    line.push({ x: r.x, str: r.str });
    byLine.set(k, line);
  }

  const ys = Array.from(byLine.keys()).sort((a, b) => b - a);
  const lines: string[] = [];

  for (const y of ys) {
    const toks = (byLine.get(y) || []).sort((a, b) => a.x - b.x).map((t) => t.str);
    // Join tokens, avoiding adding spaces before punctuation.
    let out = "";
    for (const tok of toks) {
      const t = String(tok || "");
      if (!t) continue;
      if (!out) {
        out = t;
        continue;
      }
      if (/^[,.:;)\]]/.test(t)) out += t;
      else if (/[([$]$/.test(out)) out += t;
      else out += " " + t;
    }
    const cleaned = out.replace(/[ \u00A0]{2,}/g, " ").trim();
    if (cleaned) lines.push(cleaned);
  }

  return lines.join("\n");
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

    // Input validation
    const validatedFileName = sanitizeString(fileName, 255);
    const validatedFileType = sanitizeString(fileType, 100);

    // Reject legacy .doc files - they produce unreliable extraction results
    if (fileBase64 && (validatedFileType === "application/msword" || validatedFileName?.toLowerCase().endsWith('.doc'))) {
      return new Response(JSON.stringify({
        error: "Legacy .doc files are not supported",
        details: "Please convert your resume to .docx or PDF format using Microsoft Word, Google Docs, or an online converter, then upload again."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file type
    if (fileBase64 && !validateFileType(validatedFileType, validatedFileName)) {
      return new Response(JSON.stringify({ error: "Invalid file type. Supported formats: PDF, DOCX, TXT" }), {
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
    let extractionMeta: any = {};
    let extractedLinkUrls: string[] = [];

    // If we received a base64 file, we need to extract text
    if (fileBase64 && !textContent) {
      console.log("Processing file:", validatedFileName, "Type:", validatedFileType);

      // Decode base64 to get file content
      const binaryContent = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));

      // NOTE: Legacy .doc files will fall back to AI vision parsing if text extraction fails.
      // The AI can handle various document formats including legacy .doc files.

      if (validatedFileType === "application/pdf" || validatedFileName?.toLowerCase().endsWith('.pdf')) {
        // PDF text extraction using a serverless PDF.js build that works in Deno/edge runtimes
        try {
          const { getDocument } = await import("https://esm.sh/pdfjs-serverless@0.3.2?deno");

          const loadingTask = (getDocument as any)({
            data: binaryContent,
            useSystemFonts: true,
          });

          const pdf = await loadingTask.promise;

          const partsLayout: string[] = [];
          const partsEol: string[] = [];
          const linkUrls: string[] = [];
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const items = (content as any)?.items || [];

            // Best-effort link extraction from annotations (captures "LinkedIn" text linked to a URL)
            try {
              const ann = await page.getAnnotations?.();
              const list = Array.isArray(ann) ? ann : [];
              for (const a of list) {
                const u = (a as any)?.url || (a as any)?.unsafeUrl || null;
                if (typeof u === "string" && u.trim()) linkUrls.push(u.trim().slice(0, 500));
              }
            } catch (_e) {
              // ignore annotation extraction errors
            }

            const layout = normalizeExtractedText(pdfItemsToText(items));
            const eol = normalizeExtractedText(itemsWithEOLToText(items));
            if (layout.trim()) partsLayout.push(layout);
            if (eol.trim()) partsEol.push(eol);
          }

          const textLayout = normalizeExtractedText(partsLayout.join("\n\n"));
          const textEol = normalizeExtractedText(partsEol.join("\n\n"));

          const scoreLayout = scoreExtractedText(textLayout);
          const scoreEol = scoreExtractedText(textEol);

          // Pick the best extraction, but avoid flapping by requiring a margin.
          let chosen: "eol" | "layout" = "layout";
          if (scoreEol.score > scoreLayout.score + 5) chosen = "eol";
          else if (scoreLayout.score > scoreEol.score + 5) chosen = "layout";
          else {
            // Tie-breakers: bullets, then length.
            const bE = scoreEol.bullet_markers || 0;
            const bL = scoreLayout.bullet_markers || 0;
            if (bE > bL) chosen = "eol";
            else if (bL > bE) chosen = "layout";
            else chosen = (scoreEol.extracted_text_length || 0) > (scoreLayout.extracted_text_length || 0) ? "eol" : "layout";
          }
          textContent = chosen === "eol" ? textEol : textLayout;

          extractionMeta = {
            pdf_extraction: {
              chosen,
              layout: { score: scoreLayout.score, diagnostics: scoreLayout },
              eol: { score: scoreEol.score, diagnostics: scoreEol },
            },
          };
          // Persist discovered link URLs for downstream contact extraction.
          if (linkUrls.length) {
            const m = new Map<string, string>();
            for (const u0 of linkUrls) {
              const u = String(u0 || "").trim();
              if (!u) continue;
              const key = u.toLowerCase();
              if (!m.has(key)) m.set(key, u);
            }
            const uniq = Array.from(m.values()).slice(0, 50);
            extractedLinkUrls = uniq;
            extractionMeta.pdf_links = uniq;
          }

          const diag = computeExtractionDiagnostics(textContent);
          console.log(
            "PDF extracted text length:",
            diag.extracted_text_length,
            "lines:",
            diag.extracted_lines,
            "bullets:",
            diag.bullet_markers,
            "chosen:",
            chosen,
          );
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
          const { text, urls } = await extractDocxTextAndUrls(binaryContent);
          textContent = normalizeExtractedText(text);
          if (Array.isArray(urls) && urls.length) {
            extractedLinkUrls = urls;
            extractionMeta.docx_links = urls;
          }
          const diag = computeExtractionDiagnostics(textContent);
          console.log(
            "DOCX extracted text length:",
            diag.extracted_text_length,
            "lines:",
            diag.extracted_lines,
            "bullets:",
            diag.bullet_markers,
          );
        } catch (e) {
          console.error("DOCX extraction failed, falling back to utf-8 decode:", e);
          const decoder = new TextDecoder("utf-8", { fatal: false });
          textContent = normalizeExtractedText(decoder.decode(binaryContent));
        }
      } else {
        // For text-based files, just decode as text
        const decoder = new TextDecoder("utf-8");
        textContent = normalizeExtractedText(decoder.decode(binaryContent));
      }
    }

    if (!textContent || textContent.trim().length < 30) {
      console.log("Insufficient text extracted, attempting AI vision parsing");
      
      // If we couldn't extract enough text, use AI with base64 image/document
      // The AI can understand document structure from the raw content
      textContent = `[Document uploaded: ${validatedFileName}. File type: ${validatedFileType}. Please analyze and extract candidate information from this resume document.]`;
    }

    const extractionDiag = computeExtractionDiagnostics(textContent || "");
    const sections = extractSectionsByHeadings(textContent || "");
    const expHints = extractExperienceFromText(sections.experienceText || textContent || "");
    const eduHints = extractEducationFromText(sections.educationText || textContent || "");
    console.log(
      "Parsing resume, text length:",
      extractionDiag.extracted_text_length,
      "lines:",
      extractionDiag.extracted_lines,
      "bullets:",
      extractionDiag.bullet_markers,
    );

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
      /\d{3}\.\d{3}\.\d{4}/g,  // xxx.xxx.xxxx
      /\d{3}\s+\d{3}\s+\d{4}/g, // xxx xxx xxxx
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
    
    // LinkedIn URL extraction (supports with or without protocol).
    // IMPORTANT: normalizeWrappedUrls() first because extraction can wrap slugs across lines.
    // Examples: linkedin.com/in/xyz, https://www.linkedin.com/in/xyz
    const textForUrlExtraction = normalizeWrappedUrls(textContent);
    const linkedinMatch =
      textForUrlExtraction.match(/\bhttps?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?\b/i) ||
      textForUrlExtraction.match(/\blinkedin\.com\/in\/[A-Za-z0-9_-]+\/?\b/i);
    let extractedLinkedinUrl = linkedinMatch
      ? (linkedinMatch[0].toLowerCase().startsWith('http') ? linkedinMatch[0] : `https://${linkedinMatch[0]}`)
          .trim()
          .slice(0, 500)
      : undefined;

    // Best-effort GitHub URL extraction (helps fill Contact Info)
    const githubMatch = textForUrlExtraction.match(/\bhttps?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+/i);
    let extractedGithubUrl = githubMatch ? githubMatch[0].trim().slice(0, 500) : undefined;

    // If URLs are embedded as hyperlinks (DOCX/PDF), fall back to extracted link URLs.
    if ((!extractedLinkedinUrl || !extractedGithubUrl) && Array.isArray(extractedLinkUrls) && extractedLinkUrls.length) {
      const pick = (re: RegExp) => extractedLinkUrls.find((u) => re.test(String(u || ""))) || undefined;
      if (!extractedLinkedinUrl) {
        extractedLinkedinUrl =
          pick(/\blinkedin\.com\/in\/[a-z0-9_-]+\/?/i) ||
          pick(/\blinkedin\.com\//i);
      }
      if (!extractedGithubUrl) extractedGithubUrl = pick(/\bgithub\.com\/[a-z0-9_.-]+/i);
    }

    console.log(
      "Regex extracted - Email:",
      extractedEmail,
      "Phone:",
      extractedPhone,
      "LinkedIn:",
      extractedLinkedinUrl,
      "GitHub:",
      extractedGithubUrl,
    );

    const systemPrompt = `You are an expert resume parser and ATS analyst.

Primary goal: Extract structured, ATS-friendly resume data from the provided resume text.
Secondary goal: Provide an ATS score (0-100) for the resume as written (not for a specific job).

Hard rules:
- Do NOT fabricate facts. Only extract what is present in the resume text.
- If something is missing (dates, locations, degrees), use null or empty arrays.
- Avoid dumping header/contact noise into summary.
- Keep skills as a list of atomic items (no mega-strings that contain many skills).

CRITICAL INSTRUCTIONS FOR CONTACT INFO:
- For email: Look carefully for patterns like name@gmail.com, name@domain.com. The email is usually near the top of the resume near the name.
- For phone: Look for phone number patterns like +1 (xxx) xxx-xxxx or xxx-xxx-xxxx. Usually near email.
- If you see hints provided with regex-detected values, USE THEM - they are reliable.

CRITICAL INSTRUCTIONS FOR EXPERIENCE:
- Extract the candidate's work history into experience[].
- For each role, include:
  - company, title
  - start/end (year-month if available; otherwise year; otherwise null)
-  - bullets: Extract ALL bullet points you can find for the role from the resume text (preserve meaning; keep any metrics like "$25M", "50%", scale, team size).
-    Do NOT arbitrarily cap bullets per role; the product needs to preserve full base-resume detail for reliable 2–3+ page output.
- Never generate generic bullets not supported by the resume. If you can't find bullets for a role, leave bullets empty.

CRITICAL INSTRUCTIONS FOR SUMMARY / COMPANY / SKILLS:
- "summary" must be 3-6 sentences written in your own words, describing the candidate's background, strengths, and target roles.
- Do NOT copy the resume header/contact block into summary (no email/phone/URLs/LinkedIn, no "local to ... contact ...").
- "current_company" must be the company name ONLY (no sentences, no achievements text).
- Return two lists of skills:
  - technical_skills: ONLY concrete technologies/tools/methods/domains (e.g., React, TypeScript, AWS, Microservices, CI/CD, API Design).
  - soft_skills: ONLY interpersonal/leadership/communication skills (e.g., Leadership, Communication, Stakeholder management).
- Do NOT include filler phrases (e.g., "and experience in", "such as ...").
- Do NOT include duplicates or near-duplicates (React vs React JS).

ATS SCORING CRITERIA (score 0-100) — for a generic ATS:
- Keyword optimization for their target role (25 points)
- Clear structure and formatting (20 points)
- Quantifiable achievements (20 points)
- Skills section completeness (15 points)
- Contact info completeness (10 points)
- Professional summary quality (10 points)`;

    const userPrompt = `Parse this resume and extract the candidate's information. Also calculate an ATS score based on how well the resume is structured and optimized for ATS screening in general.

IMPORTANT - USE THESE CONTACT DETAILS IF DETECTED:
- Detected Email: ${extractedEmail ?? ""}
- Detected Phone: ${extractedPhone ?? ""}
- Detected LinkedIn: ${extractedLinkedinUrl ?? ""}

STRUCTURE HINTS (do not invent; these come from deterministic scanning of the extracted text):
- Experience entries detected: ${expHints.length}
- Education entries detected: ${eduHints.length}
- Experience hints (titles/companies/dates may be partial): ${JSON.stringify(expHints.slice(0, 12))}
- Education hints (may be partial): ${JSON.stringify(eduHints.slice(0, 12))}

RESUME CONTENT:
${textContent.substring(0, 200000)}

IMPORTANT:
- The email "${extractedEmail || ''}" and phone "${extractedPhone || ''}" shown above were extracted via regex. If they look valid, USE THEM in your response.
- The LinkedIn "${extractedLinkedinUrl || ''}" shown above was extracted via regex. If it looks valid, USE IT in your response.
- Do NOT include email/phone/URLs inside "summary". Summary must be clean text.
- Ensure "current_title" and "current_company" are not empty if they exist in the resume.
`;

    let parsed: any | null = null;
    let parseMode: "ai" | "heuristic" = "ai";
    let parseWarning: string | null = null;
    let parseRetried = false;
    let parseRetryReason: string | null = null;

    try {
      const { res: response } = await callChatCompletions({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        tools: [
          {
            type: "function",
            function: {
              name: "parse_resume",
              description:
                "Extract structured information from a resume and calculate ATS score",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  full_name: { type: "string", description: "The candidate's full name" },
                  email: { type: "string", description: "The candidate's email address" },
                  phone: { type: "string", description: "The candidate's phone number" },
                  location: { type: "string", description: "The candidate's location/city" },
                  current_title: { type: "string", description: "Current or most recent job title" },
                  current_company: { type: "string", description: "Current or most recent company" },
                  years_of_experience: { type: "number", description: "Estimated total years of experience" },
                  technical_skills: { type: "array", items: { type: "string" }, description: "Technical skills only (tools/tech/methods)" },
                  soft_skills: { type: "array", items: { type: "string" }, description: "Soft skills only (communication/leadership/etc)" },
                  education: {
                    type: "array",
                    description: "Education entries (can be empty)",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        school: { type: ["string", "null"] },
                        degree: { type: ["string", "null"] },
                        field: { type: ["string", "null"] },
                        start: { type: ["string", "null"], description: "Start year or year-month if available" },
                        end: { type: ["string", "null"], description: "End/graduation year or year-month if available" },
                      },
                    },
                  },
                  experience: {
                    type: "array",
                    description: "Work experience entries (can be empty)",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        company: { type: ["string", "null"] },
                        title: { type: ["string", "null"] },
                        start: { type: ["string", "null"], description: "Start year or year-month if available" },
                        end: { type: ["string", "null"], description: "End year or year-month; use null if current" },
                        location: { type: ["string", "null"] },
                        bullets: { type: "array", items: { type: "string" }, description: "All bullet points for the role extracted from the resume (do not cap for brevity)" },
                      },
                    },
                  },
                  certifications: { type: "array", items: { type: "string" }, description: "Certifications (can be empty)" },
                  summary: { type: "string", description: "Brief professional summary or headline" },
                  linkedin_url: { type: "string", description: "LinkedIn profile URL if found" },
                  github_url: { type: "string", description: "GitHub profile URL if found" },
                  ats_score: { type: "number", description: "ATS compatibility score from 0-100" },
                  ats_feedback: { type: "string", description: "Brief feedback on resume quality" },
                },
                required: [
                  "full_name",
                  "technical_skills",
                  "soft_skills",
                  "experience",
                  "education",
                  "certifications",
                  "summary",
                  "ats_score"
                ],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "parse_resume" } },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI parse failed (${response.status}): ${errorText.slice(0, 300)}`);
    }

    const data = await response.json();
    console.log("AI response received");
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No parsed data returned from AI");
      parsed = JSON.parse(toolCall.function.arguments);
      parsed = mergeIfAiDrops(parsed, { exp: expHints, edu: eduHints });

      // Sanity-check completeness; if it looks truncated (common), retry once with stronger constraints.
      const retryCheck = shouldRetryAiParse(parsed, textContent || "");
      if (retryCheck.retry) {
        parseRetried = true;
        parseRetryReason = retryCheck.reason;
        console.log("AI parse looked incomplete, retrying:", retryCheck.reason);

        const retrySystem = systemPrompt + `\n\nIMPORTANT RETRY MODE:\nYou previously returned an incomplete extraction.\n- You MUST extract ALL experience roles and ALL education entries present in the resume.\n- You MUST extract ALL bullet points for each role (do not cap bullets per role).\n- If a role has no explicit bullets, include bullets as an empty array rather than omitting the role.\n- Do not invent anything.`;

        const retryUser = userPrompt + `\n\nRETRY FEEDBACK:\nThe previous extraction was incomplete: ${retryCheck.reason}\nReturn a complete extraction now.`;

        const { res: response2 } = await callChatCompletions({
          messages: [
            { role: "system", content: retrySystem },
            { role: "user", content: retryUser },
          ],
          temperature: 0,
          tools: [
            {
              type: "function",
              function: {
                name: "parse_resume",
                description:
                  "Extract structured information from a resume and calculate ATS score",
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    full_name: { type: "string", description: "The candidate's full name" },
                    email: { type: "string", description: "The candidate's email address" },
                    phone: { type: "string", description: "The candidate's phone number" },
                    location: { type: "string", description: "The candidate's location/city" },
                    current_title: { type: "string", description: "Current or most recent job title" },
                    current_company: { type: "string", description: "Current or most recent company" },
                    years_of_experience: { type: "number", description: "Estimated total years of experience" },
                    technical_skills: { type: "array", items: { type: "string" }, description: "Technical skills only (tools/tech/methods)" },
                    soft_skills: { type: "array", items: { type: "string" }, description: "Soft skills only (communication/leadership/etc)" },
                    education: {
                      type: "array",
                      description: "Education entries (can be empty)",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          school: { type: ["string", "null"] },
                          degree: { type: ["string", "null"] },
                          field: { type: ["string", "null"] },
                          start: { type: ["string", "null"], description: "Start year or year-month if available" },
                          end: { type: ["string", "null"], description: "End/graduation year or year-month if available" },
                        },
                      },
                    },
                    experience: {
                      type: "array",
                      description: "Work experience entries (can be empty)",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          company: { type: ["string", "null"] },
                          title: { type: ["string", "null"] },
                          start: { type: ["string", "null"], description: "Start year or year-month if available" },
                          end: { type: ["string", "null"], description: "End year or year-month; use null if current" },
                          location: { type: ["string", "null"] },
                          bullets: { type: "array", items: { type: "string" }, description: "All bullet points for the role extracted from the resume (do not cap for brevity)" },
                        },
                      },
                    },
                    certifications: { type: "array", items: { type: "string" }, description: "Certifications (can be empty)" },
                    summary: { type: "string", description: "Brief professional summary or headline" },
                    linkedin_url: { type: "string", description: "LinkedIn profile URL if found" },
                    github_url: { type: "string", description: "GitHub profile URL if found" },
                    ats_score: { type: "number", description: "ATS compatibility score from 0-100" },
                    ats_feedback: { type: "string", description: "Brief feedback on resume quality" },
                  },
                  required: [
                    "full_name",
                    "technical_skills",
                    "soft_skills",
                    "experience",
                    "education",
                    "certifications",
                    "summary",
                    "ats_score"
                  ],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "parse_resume" } },
        });

        if (response2.ok) {
          const data2 = await response2.json();
          const toolCall2 = data2.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall2?.function?.arguments) {
            parsed = JSON.parse(toolCall2.function.arguments);
            parsed = mergeIfAiDrops(parsed, { exp: expHints, edu: eduHints });
          }
        } else {
          console.warn("Retry parse failed:", await response2.text());
        }
      }
    } catch (e: any) {
      parseMode = "heuristic";
      parseWarning = e?.message || "AI unavailable";
      parsed = heuristicParseResume(
        textContent || "",
        null, // Don't use uploader's name as fallback - extract from resume or leave null
        extractedEmail || null, // Use extracted email from resume, not uploader's email
      );
    }

    // Post-process: fill missing contact fields from regex extraction and sanitize output
    if (parsed) {
    if (!parsed.email && extractedEmail) parsed.email = extractedEmail;
    if (!parsed.phone && extractedPhone) parsed.phone = extractedPhone;
    if (!parsed.linkedin_url && extractedLinkedinUrl) parsed.linkedin_url = extractedLinkedinUrl;
    if (!parsed.github_url && extractedGithubUrl) parsed.github_url = extractedGithubUrl;
    }

    // Drop common placeholder strings (models sometimes echo "NOT FOUND" from the prompt).
    const nullIfPlaceholder = (v: any) => {
      if (v == null) return null;
      const s = String(v).trim();
      if (!s) return null;
      const n = s.toLowerCase();
      if (n === "n/a" || n === "na") return null;
      if (n.includes("not found")) return null;
      if (n === "unknown") return null;
      return s;
    };
    if (parsed) {
      parsed.full_name = nullIfPlaceholder(parsed.full_name) || parsed.full_name;
      parsed.email = nullIfPlaceholder(parsed.email);
      parsed.phone = nullIfPlaceholder(parsed.phone);
      parsed.location = nullIfPlaceholder(parsed.location);
      parsed.current_title = nullIfPlaceholder(parsed.current_title);
      parsed.current_company = nullIfPlaceholder(parsed.current_company);
      parsed.linkedin_url = nullIfPlaceholder(parsed.linkedin_url);
      parsed.github_url = nullIfPlaceholder(parsed.github_url);
      parsed.summary = nullIfPlaceholder(parsed.summary) || parsed.summary;
    }

    // Clean + sanitize output before returning (avoid polluting candidate profile fields)
    parsed.full_name = sanitizeString(parsed.full_name, 200);
    parsed.email = sanitizeString(parsed.email, 255);
    parsed.phone = sanitizeString(parsed.phone, 30);
    parsed.location = sanitizeString(parsed.location, 200);
    parsed.current_title = sanitizeString(stripContactNoise(parsed.current_title), 200);
    parsed.current_company = sanitizeString(stripContactNoise(parsed.current_company), 200);
    parsed.summary = sanitizeString(stripContactNoise(parsed.summary), 2000);
    parsed.linkedin_url = sanitizeString(parsed.linkedin_url, 500);
    parsed.github_url = sanitizeString(parsed.github_url, 500);
    parsed.ats_feedback = sanitizeString(parsed.ats_feedback, 1000);
    
    // Validate title/company shape (drop garbage rather than saving junk)
    if (!isLikelyTitle(parsed.current_title)) parsed.current_title = null;
    if (!isLikelyCompany(parsed.current_company)) parsed.current_company = null;

    // Normalize + classify skill lists (auto-move misclassified soft skills)
    const techNorm = normalizeSkillList(parsed.technical_skills, 80);
    const softNorm = normalizeSkillList(parsed.soft_skills, 80);
    const classified = postClassifySkills(techNorm, softNorm);
    parsed.technical_skills = classified.technical_skills.slice(0, 100); // Increased from 60
    parsed.soft_skills = classified.soft_skills.slice(0, 60); // Increased from 40

    // Calibrate ATS score to be stricter and less "same-y".
    // The model-provided ats_score often clusters around the 80s; we blend it with a deterministic
    // resume-quality score (not JD-based) derived from structure/bullets/dates/quantification/contact.
    const aiRawAtsScore = Number(parsed.ats_score);
    const deterministicScore = computeGenericResumeQualityScore({
      extractedText: textContent || "",
      parsed,
    });
    const finalAtsScore = Number.isFinite(aiRawAtsScore)
      ? clampScore(0.4 * aiRawAtsScore + 0.6 * deterministicScore - 3)
      : deterministicScore;
    parsed.ats_score = finalAtsScore;

    // Ensure we always return a usable professional summary (AI sometimes returns header/contact text,
    // which gets stripped; we don't want the UI to end up with an empty summary).
    if (!parsed.summary || String(parsed.summary).trim().length < 40) {
      parsed.summary = buildFallbackSummary(parsed);
    }

    // If extraction still looks incomplete (missing roles), run a chunked recovery pass against the Experience section.
    // This is slower (multiple calls) but dramatically improves reliability for multi-page PDFs.
    try {
      const pExpCount = Array.isArray(parsed?.experience) ? parsed.experience.length : 0;
      const est = estimateStructureFromText(textContent || "");
      const expectedFromHints = Math.max(expHints.length, 0);
      // If the resume has many date ranges / month-year mentions but we extracted few roles, it’s almost certainly truncated.
      const looksShort =
        (expectedFromHints >= 3 && pExpCount < Math.max(2, Math.floor(expectedFromHints * 0.75))) ||
        (est.dateRanges >= 4 && pExpCount < 3) ||
        (est.month_year_mentions >= 6 && pExpCount < 3) ||
        (est.bullet_markers >= 12 && pExpCount < 3);
      if (looksShort) {
        // IMPORTANT: section extraction can miss later pages/roles on some PDFs.
        // Use the full extracted text if the experience section looks too short.
        const expSection = sections.experienceText || "";
        const expSource = expSection.trim().length >= 1200 ? expSection : (textContent || "");
        const recovered = await recoverExperienceChunked(expSource);
        if (Array.isArray(recovered) && recovered.length) {
          parsed.experience = mergeExperienceAppendMissing(parsed.experience || [], recovered);
        }
      }
    } catch (e) {
      console.warn("Chunked experience recovery failed (non-fatal):", e?.message || e);
    }

    const completeness = estimateStructureFromText(textContent || "");
    const parsedCounts = {
      experience_count: Array.isArray(parsed?.experience) ? parsed.experience.length : 0,
      education_count: Array.isArray(parsed?.education) ? parsed.education.length : 0,
    };

    console.log(
      "Parsed resume for:",
      parsed?.full_name,
      "Email:",
      parsed?.email,
      "mode:",
      parseMode,
      "exp:",
      parsedCounts.experience_count,
      "edu:",
      parsedCounts.education_count,
      parseRetried ? `(retried: ${parseRetryReason})` : ""
    );

    // CRITICAL: Name is mandatory - try fallback to filename if AI didn't extract it
    if (!parsed?.full_name || String(parsed.full_name).trim().length === 0) {
      console.warn("AI parsing did not extract name, attempting filename fallback");
      const nameFromFile = extractNameFromFilename(fileName);

      if (nameFromFile) {
        console.log(`Using name from filename: "${nameFromFile}"`);
        parsed.full_name = nameFromFile;
      } else {
        console.error("Resume parsing failed: Could not extract candidate name from resume or filename");
        return new Response(JSON.stringify({
          error: "Could not extract name from resume. Please ensure the resume contains a clear name at the top, or try a different format."
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Include the chosen extracted text so clients can persist it and use it as a canonical source of truth
    // for later tailoring (prevents "missing bullets" when structured extraction is imperfect).
    const extracted_text = textContent || "";

    return new Response(JSON.stringify({
      parsed,
      mode: parseMode,
      warning: parseWarning,
      extracted_text,
      diagnostics: {
        ...extractionDiag,
        ...extractionMeta,
        parser_version: PARSER_VERSION,
        parse_retried: parseRetried,
        parse_retry_reason: parseRetryReason,
        estimated_structure: completeness,
        parsed_counts: parsedCounts,
        deterministic_hints: { experience_detected: expHints.length, education_detected: eduHints.length },
        generic_score_calibration: {
          deterministic_score: deterministicScore,
          ai_raw_score: Number.isFinite(aiRawAtsScore) ? Math.round(aiRawAtsScore) : null,
          final_score: finalAtsScore,
        },
      }
    }), {
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