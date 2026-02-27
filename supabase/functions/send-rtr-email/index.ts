import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { join, fromFileUrl } from "https://deno.land/std@0.190.0/path/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { uploadToDocuSeal } from "./docuseal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  toEmail: string;
  ccEmails?: string[]; // NEW: Editable CC field
  subject: string;
  body: string;
  rate: string;
  rtrFields?: Record<string, string>;
  templateId: string; // NEW: Which RTR template to use
  organizationId?: string;
  candidateId?: string;
  jobId?: string;
  applicationId?: string;
};

/** Candidate PDF form field coords (pdf-lib: origin bottom-left, US Letter 612x792pt).
 *  These are the 5 fields the candidate fills after receiving the RTR PDF.
 *  Coordinates derived from docs/Sneha_Ahi_RTR.pdf reference layout. */
const RTR_CANDIDATE_FIELDS: { key: string; pdfFormName: string; pageIndex: number; x: number; y: number; width: number; height: number }[] = [
  { key: "candidate_address",   pdfFormName: "candidate_address",   pageIndex: 0, x: 255, y: 627, width: 210, height: 15 },
  { key: "candidate_signature", pdfFormName: "candidate_signature", pageIndex: 1, x: 270, y: 78,  width: 200, height: 15 },
  { key: "printed_name",        pdfFormName: "printed_name",        pageIndex: 1, x: 190, y: 64,  width: 150, height: 15 },
  { key: "ssn_last_four",       pdfFormName: "ssn_last_four",       pageIndex: 1, x: 462, y: 64,  width: 45,  height: 15 },
  { key: "date",                pdfFormName: "date",                pageIndex: 1, x: 265, y: 50,  width: 120, height: 15 },
];

/**
 * Ordered placeholder values for the 7 sequential [_______________________] (23-underscore)
 * placeholders in the template. Position #3 (candidate_address) is null = skipped (candidate fills it).
 * The position_title is handled separately (it uses [actual text] brackets, not underscores).
 */
function buildPlaceholderValues(rtrFields: Record<string, string>): (string | null)[] {
  const get = (k: string) => (rtrFields[k] || "").trim();
  const client = get("client");
  const partner = get("client_partner");
  const combinedClient = client && partner
    ? `${client}'s partner client, ${partner}` : partner || client;
  return [
    get("sign_date"),                          // #1 — sign date
    get("candidate_name") ? "[" + get("candidate_name") + "]" : "", // #2 — candidate name (keep brackets)
    null,                                      // #3 — candidate address (SKIP, candidate fills)
    get("subcontractor"),                      // #4 — subcontractor
    combinedClient,                            // #5 — client + partner combined
    get("client_location"),                    // #6 — client location
    get("rate"),                               // #7 — rate
  ];
}

function getEnvInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Decode base64 to Uint8Array. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encode Uint8Array to base64 (no std dependency for Supabase runtime). */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
  }
  return btoa(binary);
}

/** Load RTR template: RTR_TEMPLATE_BASE64 env, then RTR_TEMPLATE_URL, then bundled template_b64.ts, then file paths. */
async function loadRtrTemplate(): Promise<Uint8Array> {
  const b64Env = (Deno.env.get("RTR_TEMPLATE_BASE64") || "").trim();
  if (b64Env) {
    try {
      return base64ToBytes(b64Env);
    } catch (e) {
      console.error("RTR_TEMPLATE_BASE64 decode error:", e);
      throw new Error("Invalid RTR_TEMPLATE_BASE64");
    }
  }
  const url = (Deno.env.get("RTR_TEMPLATE_URL") || "").trim();
  if (url) {
    const templateFetchMs = Math.min(Number(Deno.env.get("RTR_TEMPLATE_FETCH_TIMEOUT_MS")) || 15000, 60000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), templateFetchMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Failed to fetch RTR template: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        throw new Error(`RTR template fetch timed out after ${templateFetchMs / 1000}s`);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  try {
    const { RTR_TEMPLATE_BASE64 } = await import("./template_b64.ts");
    if (RTR_TEMPLATE_BASE64) return base64ToBytes(RTR_TEMPLATE_BASE64);
  } catch (e) {
    console.error("Bundled template_b64 import error:", e);
  }
  const pathEnv = (Deno.env.get("RTR_TEMPLATE_PATH") || "").trim();
  if (pathEnv) {
    try {
      return await Deno.readFile(pathEnv);
    } catch (e) {
      console.error("RTR_TEMPLATE_PATH read error:", e);
    }
  }
  const candidates: string[] = [];
  try {
    const dir = fromFileUrl(new URL(".", import.meta.url));
    candidates.push(join(dir, "RTR_template.pdf"));
  } catch {
    // ignore
  }
  const cwd = Deno.cwd();
  candidates.push(
    "RTR_template.pdf",
    "./RTR_template.pdf",
    join(cwd, "RTR_template.pdf"),
    join(cwd, "send-rtr-email", "RTR_template.pdf"),
    join(cwd, "supabase", "functions", "send-rtr-email", "RTR_template.pdf")
  );
  for (const p of candidates) {
    try {
      return await Deno.readFile(p);
    } catch {
      continue;
    }
  }
  throw new Error(
    "RTR template not found. Use RTR_template.pdf in this directory (bundled as template_b64.ts), or set RTR_TEMPLATE_URL / RTR_TEMPLATE_BASE64."
  );
}

/** Escape for XML text content. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Escape a string for use inside a RegExp (literal match). */
function regexEscape(s: string): string {
  return s.replace(/[\\^$.|?*+()[\]{}]/g, "\\$&");
}

/** Ensure runs that contain replaced (recruiter-filled) values are bold and thus non-editable in the PDF.
 *  Uses a non-backtracking rPr pattern to prevent matching across runs. */
function ensureReplacedRunsBold(docXml: string, replacedValues: string[]): string {
  // Safe rPr content pattern: matches to the FIRST </w:rPr> only (no backtracking past it).
  // (?:[^<]|<(?!\/w:rPr>))* = any char that is not '<', or '<' not followed by '/w:rPr>'.
  const safeRPr = "(?:[^<]|<(?!\\/w:rPr>))*";
  for (const val of replacedValues) {
    if (!val) continue;
    const escaped = xmlEscape(val);
    const re = new RegExp(
      "(<w:r\\s[^>]*>)(\\s*)(?:<w:rPr>(" + safeRPr + ")</w:rPr>)?(\\s*)<w:t(?:\\s[^>]*)?>\\s*" + regexEscape(escaped) + "\\s*</w:t>\\s*</w:r>",
      "g"
    );
    docXml = docXml.replace(re, (_match, open: string, s1: string, rPrContent: string | undefined, s2: string) => {
      const rPr = rPrContent ?? "";
      const hasBold = /<w:b(?:\s|\/|>)/.test(rPr);
      const insert = hasBold ? "" : "<w:b/><w:bCs/>";
      return open + s1 + "<w:rPr>" + rPr + insert + "</w:rPr>" + s2 + "<w:t>" + escaped + "</w:t></w:r>";
    });
  }
  return docXml;
}

const PLACEHOLDER = "[_______________________]";

/**
 * Collapse split bracket runs into single runs.
 *
 * Word often splits [_______________________] across multiple <w:r> runs, e.g.:
 *   Run A: <w:t>[</w:t>   Run B: <w:t>_____</w:t>   Run C: <w:t>]</w:t>
 * It also splits text-in-brackets like [Middle Office Technical Consultant].
 *
 * This function walks runs sequentially. For each "[" run, it collects inner runs
 * until a "]" run is found, then collapses them into a single run.
 * - Underscore-only inner text: preserves original underscore count.
 * - Letter inner text: preserves original text (e.g. position title).
 * Only text-only runs (no drawings, pictures, etc.) are considered. O(n), zero backtracking.
 */
function normalizeSplitPlaceholders(docXml: string): string {
  // Step 1: extract all <w:r>...</w:r> runs with positions and metadata.
  const runRegex = /<w:r[\s>][\s\S]*?<\/w:r>/g;
  type RunInfo = { start: number; end: number; full: string; text: string; isTextOnly: boolean };
  const runs: RunInfo[] = [];
  let rm: RegExpExecArray | null;
  while ((rm = runRegex.exec(docXml)) !== null) {
    const full = rm[0];
    // Runs with drawings / pictures / fields are never part of a placeholder.
    const hasNonText = /<w:drawing[\s>]/.test(full) || /<mc:AlternateContent[\s>]/.test(full)
      || /<w:pict[\s>]/.test(full) || /<w:fldChar[\s>]/.test(full) || /<w:object[\s>]/.test(full);
    const tMatch = full.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
    const text = tMatch ? tMatch[1] : "";
    runs.push({ start: rm.index, end: rm.index + full.length, full, text, isTextOnly: !hasNonText && !!tMatch });
  }

  // Safe rPr extraction from a single (already-bounded) run string.
  const safeRPr = /^(<w:r[\s][^>]*>)(\s*<w:rPr>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?/;

  // Step 2: scan for split bracket sequences: "[" run, then inner runs, then "]" run.
  const replacements: { start: number; end: number; replacement: string }[] = [];
  let i = 0;
  while (i < runs.length) {
    if (!runs[i].isTextOnly || runs[i].text !== "[") { i++; continue; }
    // Collect consecutive text-only inner runs until we hit "]" or a non-text run.
    let j = i + 1;
    let innerText = "";
    while (j < runs.length && runs[j].isTextOnly && runs[j].text !== "]") {
      innerText += runs[j].text;
      j++;
    }
    // Must have inner content and a closing "]" run.
    if (innerText.length > 0 && j < runs.length && runs[j].isTextOnly && runs[j].text === "]") {
      const openMatch = runs[i].full.match(safeRPr);
      if (openMatch) {
        const collapsed = "[" + innerText + "]";
        const replacement = (openMatch[1] || "") + (openMatch[2] || "")
          + "<w:t>" + collapsed + "</w:t></w:r>";
        replacements.push({ start: runs[i].start, end: runs[j].end, replacement });
      }
      i = j + 1;
    } else {
      i++;
    }
  }

  // Step 3: apply replacements in reverse order so positions stay valid.
  let result = docXml;
  for (let k = replacements.length - 1; k >= 0; k--) {
    const r = replacements[k];
    result = result.substring(0, r.start) + r.replacement + result.substring(r.end);
  }
  return result;
}

/** Load DOCX template: bundled base64 first (works in sandbox), then URL, file paths, env base64. */
async function loadRtrDocxTemplate(): Promise<Uint8Array> {
  // Bundled template (same as PDF template_b64): always works in supabase functions serve sandbox
  try {
    const { RTR_DOCX_TEMPLATE_BASE64 } = await import("./docx_template_b64.ts");
    if (RTR_DOCX_TEMPLATE_BASE64) {
      console.info("[send-rtr-email] RTR DOCX template loaded from bundled docx_template_b64.ts");
      return base64ToBytes(RTR_DOCX_TEMPLATE_BASE64);
    }
  } catch (e) {
    console.warn("[send-rtr-email] Bundled DOCX not available:", (e as Error)?.message ?? e);
  }
  const url = (Deno.env.get("RTR_TEMPLATE_DOCX_URL") || "").trim();
  if (url) {
    const timeoutMs = Math.min(Number(Deno.env.get("RTR_TEMPLATE_FETCH_TIMEOUT_MS")) || 15000, 60000);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`RTR DOCX template fetch failed: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } finally {
      clearTimeout(t);
    }
  }
  const pathEnv = (Deno.env.get("RTR_TEMPLATE_DOCX_PATH") || "").trim();
  const cwd = Deno.cwd();
  let functionDir: string;
  try {
    functionDir = fromFileUrl(new URL(".", import.meta.url));
  } catch {
    functionDir = "";
  }
  const candidates: string[] = [
    join(functionDir, "CompSciPrep_RTR_Template.docx"),
    join(functionDir, "..", "..", "..", "docs", "CompSciPrep_RTR_Template.docx"),
    join(cwd, "docs", "CompSciPrep_RTR_Template.docx"),
    join(cwd, "supabase", "functions", "send-rtr-email", "CompSciPrep_RTR_Template.docx"),
    join(cwd, "..", "..", "docs", "CompSciPrep_RTR_Template.docx"),
  ];
  if (pathEnv) {
    candidates.push(pathEnv, join(cwd, pathEnv));
    // Resolve pathEnv relative to function dir (e.g. docs/CompSciPrep... from project root)
    if (functionDir) candidates.push(join(functionDir, "..", "..", "..", pathEnv));
  }
  let lastErr: unknown;
  for (const p of candidates) {
    try {
      const bytes = await Deno.readFile(p);
      console.info("[send-rtr-email] RTR DOCX template loaded from", p);
      return bytes;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  console.warn("[send-rtr-email] DOCX not found. cwd=", cwd, "functionDir=", functionDir, "lastErr=", lastErr);
  const b64 = (Deno.env.get("RTR_TEMPLATE_DOCX_BASE64") || "").trim();
  if (b64) {
    try {
      return base64ToBytes(b64);
    } catch (e) {
      console.error("RTR_TEMPLATE_DOCX_BASE64 decode error:", e);
      throw new Error("Invalid RTR_TEMPLATE_DOCX_BASE64");
    }
  }
  throw new Error(
    "RTR DOCX template not found. Put CompSciPrep_RTR_Template.docx in supabase/functions/send-rtr-email/ or set RTR_TEMPLATE_DOCX_URL / RTR_TEMPLATE_DOCX_PATH / RTR_TEMPLATE_DOCX_BASE64."
  );
}

/** Merge RTR values into DOCX; output is a valid DOCX (JSZip) so Word can open it. */
async function mergeDocxWithFields(
  docxBytes: Uint8Array,
  rtrFields: Record<string, string>,
  orderedValuesOverride?: (string | null)[]
): Promise<Uint8Array> {
  const JSZip = (await import("https://esm.sh/jszip@3.10.1")).default;
  const zip = await JSZip.loadAsync(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("DOCX missing word/document.xml");
  let docXml = await docFile.async("string");

  // Normalize split bracket sequences (both underscore placeholders and position title).
  docXml = normalizeSplitPlaceholders(docXml);

  const replacedTexts: string[] = [];

  // Replace position title FIRST (before underscore placeholders, so the regex
  // doesn't accidentally match a just-replaced value like [Jane Doe]).
  // Finds [text-with-letters] inside a <w:t> element — only the position title matches.
  const positionTitle = (rtrFields.position_title || "").trim();
  if (positionTitle) {
    docXml = docXml.replace(
      /(<w:t[^>]*>)\[([^\]]*[a-zA-Z][^\]]*)\](<\/w:t>)/,
      (_m, open, _inner, close) => {
        const replacement = "[" + xmlEscape(positionTitle) + "]";
        replacedTexts.push(xmlEscape(positionTitle));
        return open + replacement + close;
      }
    );
  }

  // Replace sequential placeholders with ordered values.
  // Use override if provided (for multi-template support), otherwise use legacy function
  const orderedValues = orderedValuesOverride || buildPlaceholderValues(rtrFields);
  let occurrence = 0;
  const escapedPlaceholder = regexEscape(PLACEHOLDER);
  docXml = docXml.replace(new RegExp(escapedPlaceholder, "g"), (match) => {
    if (occurrence >= orderedValues.length) return match;
    const val = orderedValues[occurrence];
    occurrence++;
    if (val === null) return match; // skip — candidate fills this field
    if (!val) return match; // empty value — leave placeholder
    const escaped = xmlEscape(val);
    replacedTexts.push(escaped);
    return escaped;
  });

  // Make replaced values bold.
  docXml = ensureReplacedRunsBold(docXml, replacedTexts);

  zip.file("word/document.xml", docXml);
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/** Convert DOCX bytes to PDF by POSTing to your own service (e.g. a container with LibreOffice). Body: { docx_base64: "..." }. Response: PDF bytes or { pdf_base64: "..." }. */
async function convertDocxToPdfViaService(docxBytes: Uint8Array): Promise<Uint8Array> {
  const baseUrl = (Deno.env.get("RTR_CONVERSION_SERVICE_URL") || "").trim().replace(/\/$/, "");
  if (!baseUrl) throw new Error("RTR_CONVERSION_SERVICE_URL not set");
  const res = await fetch(`${baseUrl}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docx_base64: bytesToBase64(docxBytes) }),
  });
  if (!res.ok) throw new Error(`Conversion service failed: ${res.status} ${await res.text()}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const json = (await res.json()) as { pdf_base64?: string };
    const b64 = json?.pdf_base64;
    if (!b64 || typeof b64 !== "string") throw new Error("Conversion service did not return pdf_base64");
    return base64ToBytes(b64);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Convert DOCX bytes to PDF using LibreOffice headless (local dev only; Supabase prod cannot run soffice). */
async function convertDocxToPdfLocal(docxBytes: Uint8Array): Promise<Uint8Array> {
  const tmpDir = await Deno.makeTempDir({ prefix: "rtr-docx-" });
  const docxPath = join(tmpDir, "rtr.docx");
  const outPdfPath = join(tmpDir, "rtr.pdf");
  try {
    await Deno.writeFile(docxPath, docxBytes);
    const soffice = (Deno.env.get("LIBREOFFICE_PATH") || "").trim() || "soffice";
    const cmd = new Deno.Command(soffice, {
      args: ["--headless", "--convert-to", "pdf", "--outdir", tmpDir, docxPath],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stderr } = await cmd.output();
    if (code !== 0) {
      const err = new TextDecoder().decode(stderr);
      throw new Error(`LibreOffice conversion failed (${code}): ${err || "run soffice --headless --convert-to pdf"}`);
    }
    const pdfBytes = await Deno.readFile(outPdfPath);
    return pdfBytes;
  } finally {
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/** Convert DOCX bytes to PDF via CloudConvert sync API (optional; documents are sent to CloudConvert). */
async function convertDocxToPdfWithCloudConvert(docxBytes: Uint8Array): Promise<Uint8Array> {
  const apiKey = (Deno.env.get("CLOUDCONVERT_API_KEY") || "").trim();
  if (!apiKey) throw new Error("CLOUDCONVERT_API_KEY not set");
  const docxB64 = bytesToBase64(docxBytes);

  const jobRes = await fetch("https://sync.api.cloudconvert.com/v2/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      tasks: {
        "import-docx": {
          operation: "import/base64",
          file: docxB64,
          filename: "rtr.docx",
        },
        convert: {
          operation: "convert",
          input: "import-docx",
          output_format: "pdf",
        },
        export: {
          operation: "export/url",
          input: "convert",
        },
      },
    }),
  });
  if (!jobRes.ok) {
    const errText = await jobRes.text();
    throw new Error(`CloudConvert job failed: ${jobRes.status} ${errText}`);
  }
  const job = (await jobRes.json()) as {
    data?: {
      tasks?: Record<string, { result?: { files?: { url?: string }[] } }> | { result?: { files?: { url?: string }[] }; operation?: string }[];
    };
  };
  let url: string | undefined;
  const tasks = job.data?.tasks;
  if (Array.isArray(tasks)) {
    const exportTask = tasks.find((t: { operation?: string }) => t.operation === "export/url");
    const files = exportTask?.result?.files;
    url = Array.isArray(files) && files[0]?.url ? files[0].url : undefined;
  } else if (tasks && typeof tasks === "object") {
    const tasksArr = Object.values(tasks) as { operation?: string; result?: { files?: { url?: string }[] } }[];
    const exportTask = tasksArr.find((t) => t.operation === "export/url");
    url = exportTask?.result?.files?.[0]?.url;
  }
  if (!url) throw new Error("CloudConvert did not return export URL");
  const pdfRes = await fetch(url);
  if (!pdfRes.ok) throw new Error(`Failed to download converted PDF: ${pdfRes.status}`);
  return new Uint8Array(await pdfRes.arrayBuffer());
}

/** Convert merged DOCX to PDF. Tries CloudConvert → custom service → LibreOffice (local dev). */
async function convertDocxToPdf(docxBytes: Uint8Array): Promise<Uint8Array> {
  const errors: string[] = [];
  // 1. CloudConvert (works in Supabase prod and locally)
  const ccKey = (Deno.env.get("CLOUDCONVERT_API_KEY") || "").trim();
  if (ccKey) {
    try {
      return await convertDocxToPdfWithCloudConvert(docxBytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[send-rtr-email] CloudConvert failed:", msg);
      errors.push("CloudConvert: " + msg);
    }
  }
  // 2. Custom conversion service
  const svcUrl = (Deno.env.get("RTR_CONVERSION_SERVICE_URL") || "").trim();
  if (svcUrl) {
    try {
      return await convertDocxToPdfViaService(docxBytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[send-rtr-email] Conversion service failed:", msg);
      errors.push("Service: " + msg);
    }
  }
  // 3. LibreOffice headless (local dev only)
  try {
    return await convertDocxToPdfLocal(docxBytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[send-rtr-email] LibreOffice failed:", msg);
    errors.push("LibreOffice: " + msg);
  }
  throw new Error(
    "DOCX→PDF conversion failed. Set CLOUDCONVERT_API_KEY, RTR_CONVERSION_SERVICE_URL, or install LibreOffice. Errors: " + errors.join("; ")
  );
}

/** Add fillable text fields only for candidate fields (not on popup). Recruiter-filled values are plain bold text, not editable. */
async function addFillableFieldsToPdf(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  for (const cf of RTR_CANDIDATE_FIELDS) {
    if (cf.pageIndex >= pages.length) continue;
    const page = pages[cf.pageIndex];
    const form = pdfDoc.getForm();
    try {
      const textField = form.createTextField(cf.pdfFormName);
      textField.addToPage(page, { x: cf.x, y: cf.y, width: cf.width, height: cf.height });
    } catch (e) {
      console.warn("[send-rtr-email] Could not add field", cf.pdfFormName, e);
    }
  }
  return pdfDoc.save();
}

/** Fill the rate field in the PDF form and return the filled PDF bytes. */
async function fillRtrPdf(templateBytes: Uint8Array, rate: string, rateFieldName: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const fieldNames = fields.map((f) => f.getName());
  const toTry = [rateFieldName, "rate_per_hour", "Rate", "rate", "Pay Rate", "pay_rate", ...fieldNames];
  const seen = new Set<string>();
  let filled = false;
  for (const name of toTry) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    try {
      const field = form.getTextField(name);
      field.setText(String(rate).trim());
      filled = true;
      break;
    } catch {
      continue;
    }
  }
  if (!filled) {
    throw new Error(
      `Could not find a text field to set rate. Template has fields: ${fieldNames.join(", ") || "none"}. Set RTR_RATE_FIELD_NAME to match your PDF field name.`
    );
  }
  form.flatten();
  return pdfDoc.save();
}

// ============================================================================
// NEW: Multi-Template Support Functions
// ============================================================================

interface RTRTemplate {
  id: string;
  name: string;
  docx_filename: string;
  docuseal_template_id: string | null;
  field_config: {
    fields: Array<{
      key: string;
      label: string;
      type: string;
      recruiterFillable: boolean;
      order: number;
      placeholder: string;
    }>;
    hardcodedFields?: Record<string, string>;
  };
}

/**
 * Load RTR template configuration from database
 */
async function loadTemplateConfig(supabase: any, templateId: string): Promise<RTRTemplate> {
  const { data, error } = await supabase
    .from('rtr_templates')
    .select('*')
    .eq('id', templateId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error(`Template not found: ${templateId}. Error: ${error?.message || 'Not found'}`);
  }

  return data as RTRTemplate;
}

/**
 * Load DOCX template file by filename
 * Tries: env var, bundled templates, file paths
 */
async function loadDocxByFilename(filename: string): Promise<Uint8Array> {
  // Try environment variable for this specific template
  const envKey = `RTR_TEMPLATE_${filename.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const b64Env = (Deno.env.get(envKey) || "").trim();
  if (b64Env) {
    try {
      return base64ToBytes(b64Env);
    } catch (e) {
      console.error(`${envKey} decode error:`, e);
    }
  }

  // Try bundled templates (if they exist)
  // For now, we'll try file paths in docs/RTR Templates/
  const candidates: string[] = [];

  try {
    const dir = fromFileUrl(new URL(".", import.meta.url));
    candidates.push(join(dir, filename));
  } catch {
    // ignore
  }

  const cwd = Deno.cwd();
  candidates.push(
    join(cwd, "docs", "RTR Templates", filename),
    join(cwd, "..", "..", "docs", "RTR Templates", filename),
    join(cwd, "supabase", "functions", "send-rtr-email", filename),
    filename
  );

  for (const p of candidates) {
    try {
      return await Deno.readFile(p);
    } catch {
      continue;
    }
  }

  throw new Error(
    `RTR template file not found: ${filename}. Tried paths: ${candidates.join(", ")}`
  );
}

/**
 * Build placeholder values dynamically from field config
 * Returns ordered array of values for sequential placeholder replacement
 */
function buildPlaceholderValuesDynamic(
  rtrFields: Record<string, string>,
  fieldConfig: RTRTemplate['field_config']
): (string | null)[] {
  const get = (k: string) => (rtrFields[k] || "").trim();

  // Sort fields by order
  const orderedFields = [...fieldConfig.fields].sort((a, b) => a.order - b.order);

  return orderedFields.map((field) => {
    // Skip candidate-fillable fields (they stay as placeholders)
    if (!field.recruiterFillable) {
      return null;
    }

    // Special handling for specific fields
    if (field.key === 'client_partner' || field.key === 'client') {
      // Combine client and partner if both exist
      const client = get('client');
      const partner = get('client_partner');
      if (client && partner) {
        return `${client}'s partner client, ${partner}`;
      }
      return partner || client;
    }

    if (field.key === 'candidate_name' && field.placeholder.includes('[')) {
      // Keep brackets for candidate name if placeholder has them
      const name = get('candidate_name');
      return name ? `[${name}]` : "";
    }

    return get(field.key);
  });
}

/**
 * Get recruiter and account manager emails for BCC
 */
async function getRecruiterAndAccountManager(
  supabase: any,
  organizationId: string,
  jobId: string | null,
  userId: string
): Promise<{ recruiterEmail: string | null; accountManagerEmail: string | null }> {
  // Get recruiter email (user who is sending the RTR)
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('email')
    .eq('id', userId)
    .single();

  const recruiterEmail = userProfile?.email || null;

  // Get account manager for this recruiter
  const { data: amAssignment } = await supabase
    .from('account_manager_recruiter_assignments')
    .select('account_manager_user_id')
    .eq('organization_id', organizationId)
    .eq('recruiter_user_id', userId)
    .single();

  let accountManagerEmail: string | null = null;
  if (amAssignment?.account_manager_user_id) {
    const { data: amProfile } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', amAssignment.account_manager_user_id)
      .single();

    accountManagerEmail = amProfile?.email || null;
  }

  return { recruiterEmail, accountManagerEmail };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").trim();
    const supabaseAnonKey = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
    const supabaseServiceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          error: "Edge function env missing",
          details: "SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY not set. Run supabase functions serve after supabase start (CLI injects these), or set them in your --env-file.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const toEmail = String(body?.toEmail || "").trim().toLowerCase();
    const subject = String(body?.subject || "").trim();
    const bodyText = String(body?.body || "").trim();
    const rate = String(body?.rate ?? "").trim();
    const organizationId = body?.organizationId ? String(body.organizationId).trim() : null;

    if (!toEmail) {
      return new Response(JSON.stringify({ error: "Missing toEmail" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!subject) {
      return new Response(JSON.stringify({ error: "Missing subject" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!bodyText) {
      return new Response(JSON.stringify({ error: "Missing body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!rate) {
      return new Response(JSON.stringify({ error: "Missing rate" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate templateId
    const templateId = body?.templateId ? String(body.templateId).trim() : null;
    if (!templateId) {
      return new Response(JSON.stringify({ error: "Missing templateId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[send-rtr-email] Auth check:", {
      userId: user.id,
      userEmail: user.email,
      organizationId,
    });

    if (organizationId) {
      const { data: roles, error: roleError } = await svc
        .from("user_roles")
        .select("id, role, organization_id")
        .eq("user_id", user.id)
        .eq("organization_id", organizationId)
        .in("role", ["recruiter", "account_manager", "org_admin", "super_admin"]);

      console.log("[send-rtr-email] Role check result:", { roles, roleError, count: roles?.length });

      if (!roles || roles.length === 0) {
        console.error("[send-rtr-email] No matching role found for user:", user.id, "org:", organizationId);
        return new Response(JSON.stringify({
          error: "Forbidden",
          details: `No role found for user ${user.id} in org ${organizationId}`
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const rateFieldName = (Deno.env.get("RTR_RATE_FIELD_NAME") || "").trim() || "rate";
    const rtrFields = body.rtrFields && typeof body.rtrFields === "object" ? body.rtrFields : {};
    const candidateId = body.candidateId ? String(body.candidateId).trim() : null;
    const jobId = body.jobId ? String(body.jobId).trim() : null;
    const applicationId = body.applicationId ? String(body.applicationId).trim() : null;

    // Pipeline: Load template config → Load DOCX → Merge recruiter values → Convert to PDF → Upload to DocuSeal
    let attachmentBytes: Uint8Array;
    const attachmentFilename = "RTR.pdf";
    let docusealSubmission: { submissionId: string; signingUrl: string; templateId: string } | null = null;
    let template: RTRTemplate;

    try {
      // Load template configuration from database
      console.info("[send-rtr-email] Loading template config:", templateId);
      template = await loadTemplateConfig(svc, templateId);
      console.info("[send-rtr-email] Template loaded:", template.name, "File:", template.docx_filename);

      // Load DOCX file by filename
      const rawDocx = await loadDocxByFilename(template.docx_filename);

      // Build placeholder values dynamically from template config
      const dynamicValues = buildPlaceholderValuesDynamic(rtrFields, template.field_config);
      console.info("[send-rtr-email] Dynamic values:", dynamicValues.map(v => v ? v.substring(0, 20) + '...' : 'null'));

      // Merge values into DOCX
      const mergedDocx = await mergeDocxWithFields(rawDocx, rtrFields, dynamicValues);

      // Convert to PDF
      const pdfBytes = await convertDocxToPdf(mergedDocx);

      // Add fillable fields for candidate (skip for now if using DocuSeal templates with fields)
      attachmentBytes = await addFillableFieldsToPdf(pdfBytes);

      // Upload to DocuSeal if API key is configured
      const useDocuSeal = !!(Deno.env.get("DOCUSEAL_API_KEY") || "").trim();
      if (useDocuSeal) {
        const candidateName = rtrFields.candidate_name || "Candidate";
        console.info("[send-rtr-email] Uploading to DocuSeal with template:", template.docuseal_template_id);
        docusealSubmission = await uploadToDocuSeal(
          attachmentBytes,
          toEmail,
          candidateName,
          template.docuseal_template_id
        );
        console.info("[send-rtr-email] DocuSeal submission created:", docusealSubmission.submissionId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(
        JSON.stringify({
          error: "RTR generation failed",
          details: msg,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get BCC emails (recruiter + account manager)
    let bccEmails: string[] = [];
    if (organizationId) {
      try {
        const { recruiterEmail, accountManagerEmail } = await getRecruiterAndAccountManager(
          svc,
          organizationId,
          jobId,
          user.id
        );
        if (recruiterEmail) bccEmails.push(recruiterEmail);
        if (accountManagerEmail) bccEmails.push(accountManagerEmail);
        console.info("[send-rtr-email] BCC emails:", bccEmails);
      } catch (e) {
        console.warn("[send-rtr-email] Could not get BCC emails:", e);
        // Continue without BCC - not critical
      }
    }

    // Parse CC emails from request
    const ccEmails = body.ccEmails && Array.isArray(body.ccEmails)
      ? body.ccEmails.filter(e => e && typeof e === 'string').map(e => e.trim().toLowerCase())
      : [];

    // Store RTR document record in database if DocuSeal was used
    if (docusealSubmission && organizationId && candidateId) {
      try {
        const { error: insertError } = await svc.from("rtr_documents").insert({
          organization_id: organizationId,
          candidate_id: candidateId,
          job_id: jobId,
          application_id: applicationId,
          docuseal_submission_id: docusealSubmission.submissionId,
          docuseal_template_id: docusealSubmission.templateId,
          signing_url: docusealSubmission.signingUrl,
          rtr_fields: rtrFields,
          status: "sent",
          created_by: user.id,
          template_id: templateId,
          template_name: template.name,
          to_email: toEmail,
          cc_emails: ccEmails.length > 0 ? ccEmails : null,
          bcc_emails: bccEmails.length > 0 ? bccEmails : null,
        });

        if (insertError) {
          console.error("[send-rtr-email] Failed to store RTR document:", insertError);
          // Don't fail the request, just log the error
        }
      } catch (dbError) {
        console.error("[send-rtr-email] Database error:", dbError);
      }
    }

    // Build email HTML with DocuSeal signing link if available
    const signingButton = docusealSubmission
      ? `
        <div style="margin: 24px 0;">
          <a href="${docusealSubmission.signingUrl}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;font-weight:500;">
            Sign RTR Document
          </a>
        </div>
        <p style="color:#6b7280;font-size:14px;">
          Click the button above to review and electronically sign your Right to Represent agreement.
        </p>
      `
      : "";

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5;">
        <p>${bodyText.replaceAll("\n", "<br/>")}</p>
        ${signingButton}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        <p style="color:#6b7280;font-size:12px;">UltraHire</p>
      </div>
    `;

    const smtpHost = (Deno.env.get("SMTP_HOST") || Deno.env.get("MAILPIT_SMTP_HOST") || "127.0.0.1").trim();
    const smtpPort = getEnvInt("SMTP_PORT", getEnvInt("MAILPIT_SMTP_PORT", 1025));
    const smtpUser = (Deno.env.get("SMTP_USER") || "").trim();
    const smtpPass = (Deno.env.get("SMTP_PASS") || "").trim();
    const fromRaw = (Deno.env.get("SMTP_FROM") || Deno.env.get("RESEND_FROM") || "UltraHire <no-reply@talentmatch.local>").trim();
    const fromEmail = fromRaw.includes("<") && fromRaw.includes(">") ? fromRaw : `UltraHire <${fromRaw}>`;

    // Supabase Edge Functions block outbound SMTP (ports 25, 465, 587). Use Resend HTTP API when key is set.
    const resendApiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
    if (resendApiKey) {
      // Only attach PDF if NOT using DocuSeal (DocuSeal provides signing link instead)
      const emailPayload: any = {
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
      };

      // Add CC emails if provided
      if (ccEmails.length > 0) {
        emailPayload.cc = ccEmails;
      }

      // Add BCC emails (recruiter + account manager)
      if (bccEmails.length > 0) {
        emailPayload.bcc = bccEmails;
      }

      if (!docusealSubmission) {
        emailPayload.attachments = [{ filename: attachmentFilename, content: bytesToBase64(attachmentBytes) }];
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify(emailPayload),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("[send-rtr-email] Resend API error:", res.status, errText);
        return new Response(
          JSON.stringify({ error: "Failed to send email", details: errText || `Resend ${res.status}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const responseData: any = { ok: true, to: toEmail };
      if (docusealSubmission) {
        responseData.signing_url = docusealSubmission.signingUrl;
        responseData.submission_id = docusealSubmission.submissionId;
      }

      return new Response(
        JSON.stringify(responseData),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fallback: SMTP (e.g. Mailpit locally). Supabase prod blocks ports 465/587 so use RESEND_API_KEY there.
    const smtpTls =
      smtpPort === 587 ? false : smtpPort === 465 ? true : (Deno.env.get("SMTP_TLS") || "").trim().toLowerCase() === "true";

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: smtpTls,
        ...(smtpUser && smtpPass ? { auth: { username: smtpUser, password: smtpPass } } : {}),
      },
    });

    const attachmentContentType =
      attachmentFilename.toLowerCase().endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
    const attachment = {
      contentType: attachmentContentType,
      filename: attachmentFilename,
      content: attachmentBytes,
      encoding: "binary" as const,
    };

    const rawTimeout = Number(Deno.env.get("SMTP_TIMEOUT_MS"));
    const smtpTimeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.min(rawTimeout, 120000) : 45000;

    try {
      const emailOptions: any = {
        from: fromEmail,
        to: toEmail,
        subject,
        content: bodyText,
        html,
        attachments: [attachment],
      };

      // Add CC emails if provided
      if (ccEmails.length > 0) {
        emailOptions.cc = ccEmails.join(', ');
      }

      // Add BCC emails (recruiter + account manager)
      if (bccEmails.length > 0) {
        emailOptions.bcc = bccEmails.join(', ');
      }

      const sendPromise = client.send(emailOptions);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`SMTP timeout after ${smtpTimeoutMs / 1000}s`)), smtpTimeoutMs)
      );
      await Promise.race([sendPromise, timeoutPromise]);
    } catch (smtpErr: unknown) {
      const msg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
      console.error("[send-rtr-email] SMTP error:", msg);
      const isConnectionRefused =
        msg.includes("ECONNREFUSED") || msg.toLowerCase().includes("connection refused") || msg.includes("os error 111");
      const isTimeout = msg.includes("timeout");
      // Skip when: env says so, or we're hitting default localhost SMTP (no Mailpit) so local dev still returns 200.
      const skipSmtpDev = (Deno.env.get("SKIP_SMTP_DEV") || "").trim().toLowerCase() === "true";
      const allowSkipSmtp = (Deno.env.get("ALLOW_SKIP_SMTP") || "").trim().toLowerCase() === "true";
      const defaultLocalSmtp = smtpHost === "127.0.0.1" || smtpHost === "localhost";
      if (isConnectionRefused && (skipSmtpDev || allowSkipSmtp || defaultLocalSmtp)) {
        console.log("[send-rtr-email] Skipping send (no SMTP). Would have sent RTR to", toEmail);
        return new Response(
          JSON.stringify({ ok: true, to: toEmail, skipped: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          details: isTimeout
            ? `SMTP timed out (${smtpTimeoutMs / 1000}s). Check SMTP_HOST (e.g. smtp.resend.com), SMTP_PORT (465 or 587), and Resend domain/API key.`
            : isConnectionRefused
            ? "SMTP not reachable. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in Edge Function secrets (or ALLOW_SKIP_SMTP=true to skip sending)."
            : msg,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } finally {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }

    return new Response(
      JSON.stringify({ ok: true, to: toEmail }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
