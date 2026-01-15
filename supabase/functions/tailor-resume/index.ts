import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { callChatCompletions } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeString(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return String(value).trim().slice(0, maxLength);
}

function dedupeExactRepeat(s: string | null) {
  const v = String(s ?? "").trim();
  if (!v) return null;
  // Handle "Fannie MaeFannie Mae" (exact repetition with no separator)
  if (v.length % 2 === 0) {
    const half = v.slice(0, v.length / 2);
    if (half && half === v.slice(v.length / 2)) return half.trim();
  }
  // Handle "Fannie Mae Fannie Mae" (repeated phrase)
  const compact = v.replace(/\s+/g, " ").trim();
  const parts = compact.split(" ");
  // Remove consecutive duplicate tokens (e.g., "Tech Tech")
  const out: string[] = [];
  for (const p of parts) {
    if (!out.length || out[out.length - 1].toLowerCase() !== p.toLowerCase()) out.push(p);
  }
  return out.join(" ").trim() || null;
}

function nullIfNA(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "n/a" || lower === "na" || lower === "-" || lower === "none" || lower === "null") return null;
  return s;
}

function nullIfPlaceholder(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = s.toLowerCase();
  if (n === "n/a" || n === "na" || n === "-" || n === "none" || n === "null") return null;
  if (n.includes("not found")) return null;
  if (n === "unknown") return null;
  return s;
}

function normalizeSkillArray(items: unknown, limit: number): string[] {
  const raw = Array.isArray(items) ? items : [];
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (s: string) => {
    const cleaned = s
      .replace(/^[•\-\*\u2022]+\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return;
    // Allow meaningful JD phrases in Skills (e.g., "managing globally distributed teams").
    // Still avoid full sentences.
    if (cleaned.length > 90) return;
    if (/[.!?]/.test(cleaned)) return;
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 8) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(cleaned);
  };

  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s) continue;
    // If the model accidentally returns a mega-skill string, split it.
    const parts = s.includes(",") || s.includes("•") || s.includes("|")
      ? s.split(/[,•|]/g)
      : s.length > 60
        ? s.split(/\s{2,}|\s*,\s*/g)
        : [s];
    for (const p of parts) {
      push(p);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeFactExperience(items: any[]): any[] {
  const raw = Array.isArray(items) ? items : [];
  return raw.map((e) => ({
    company: nullIfNA(e?.company),
    title: nullIfNA(e?.title),
    start: nullIfNA(e?.start),
    end: nullIfNA(e?.end),
    location: nullIfNA(e?.location),
    bullets: Array.isArray(e?.bullets)
      ? e.bullets.map((b: any) => String(b ?? "").trim()).filter((b: string) => b && b.toLowerCase() !== "n/a").slice(0, 60)
      : [],
  }));
}

function normalizeFactEducation(items: any[]): any[] {
  const raw = Array.isArray(items) ? items : [];
  return raw.map((e) => ({
    school: nullIfNA(e?.school),
    degree: nullIfNA(e?.degree),
    field: nullIfNA(e?.field),
    year: nullIfNA(e?.year ?? e?.end ?? e?.start),
  }));
}

function expKey(e: any) {
  return [e?.company, e?.title, e?.start, e?.end].map((v) => String(v ?? "").trim().toLowerCase()).join("|");
}

function expLooseKey(e: any) {
  const company = String(e?.company ?? "").trim().toLowerCase();
  const title = String(e?.title ?? "").trim().toLowerCase();
  return [company, title].join("|");
}

function tokenSetFrom(s: string) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean),
  );
}

function tokenJaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function rolesProbablySame(a: any, b: any) {
  const cSim = tokenJaccard(tokenSetFrom(String(a?.company ?? "")), tokenSetFrom(String(b?.company ?? "")));
  const tSim = tokenJaccard(tokenSetFrom(String(a?.title ?? "")), tokenSetFrom(String(b?.title ?? "")));
  return cSim >= 0.67 && tSim >= 0.67;
}

function normalizeBullet(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bulletsNearDuplicate(a: string, b: string) {
  const na = normalizeBullet(a);
  const nb = normalizeBullet(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  if (ta.size < 5 || tb.size < 5) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jacc = inter / (ta.size + tb.size - inter);
  return jacc >= 0.82;
}

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null)) as T;
}

function enforceImmutableFields(resumeDoc: any, facts: any) {
  if (!resumeDoc) throw new Error("Missing resume_doc");
  if (!facts) throw new Error("Missing facts");

  // 1) Contact info must be taken as-is from BASE_FACTS (no edits).
  resumeDoc.contact = resumeDoc.contact || {};
  resumeDoc.contact.full_name = facts.full_name ?? null;
  resumeDoc.contact.email = facts.email ?? null;
  resumeDoc.contact.phone = facts.phone ?? null;
  resumeDoc.contact.location = facts.location ?? null;
  resumeDoc.contact.linkedin_url = facts.linkedin_url ?? null;
  resumeDoc.contact.github_url = facts.github_url ?? null;

  // 2) Education + Certifications must be taken as-is from BASE_FACTS (no additions/edits).
  resumeDoc.education = cloneJson(Array.isArray(facts.education) ? facts.education : []);
  resumeDoc.certifications = cloneJson(Array.isArray(facts.certifications) ? facts.certifications : []);

  // 3) Experience role headers are immutable (company/title/dates/location).
  // Only bullets may change.
  const baseExp = normalizeFactExperience(Array.isArray(facts.experience) ? facts.experience : []);
  const outExp = normalizeFactExperience(Array.isArray(resumeDoc.experience) ? resumeDoc.experience : []);

  const pickOutRole = (b: any) =>
    outExp.find((oe) => rolesProbablySame(oe, b) || expKey(oe) === expKey(b) || expLooseKey(oe) === expLooseKey(b)) || null;

  const merged: any[] = [];
  for (const b of baseExp) {
    const oe = pickOutRole(b);
    const outBullets: string[] = Array.isArray(oe?.bullets) ? oe.bullets.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
    const baseBullets: string[] = Array.isArray(b?.bullets) ? b.bullets.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
    const bullets: string[] = [];
    for (const x of outBullets) if (x) bullets.push(x);
    for (const bb of baseBullets) {
      if (!bb) continue;
      if (bullets.some((eb) => bulletsNearDuplicate(String(eb || ""), bb))) continue;
      bullets.push(bb);
    }

    merged.push({
      company: b.company ?? null,
      title: b.title ?? null,
      start: b.start ?? null,
      end: b.end ?? null,
      location: b.location ?? null,
      bullets,
    });
  }
  resumeDoc.experience = merged;
}

function isLowSignalBullet(b: string) {
  const s = String(b ?? "").trim();
  if (!s) return true;
  const n = normalizeBullet(s);
  const words = n.split(" ").filter(Boolean);
  if (words.length < 6) return true;
  // Drop known "topic" fragments often coming from LinkedIn exports
  const bad = ["group discussions", "team performance", "system performance", "coursework"];
  if (bad.some((p) => n.includes(p))) return true;
  return false;
}

function mergeExperienceEnsureAll(baseExp: any[], outExp: any[]) {
  const base = normalizeFactExperience(baseExp);
  const out = normalizeFactExperience(outExp);
  // Consider loose key matches too (date formats often differ)
  const seenStrict = new Set(out.map(expKey));
  const seenLoose = new Set(out.map(expLooseKey));
  for (const e of base) {
    const k = expKey(e);
    if (!k || k === "|||") continue;
    const already =
      seenStrict.has(k) ||
      seenLoose.has(expLooseKey(e)) ||
      out.some((oe) => rolesProbablySame(oe, e));
    if (!already) {
      out.push(e);
      seenStrict.add(k);
      seenLoose.add(expLooseKey(e));
    }
  }
  return out;
}

function mergeEducationEnsureAll(baseEdu: any[], outEdu: any[]) {
  const base = normalizeFactEducation(baseEdu);
  const out = normalizeFactEducation(outEdu);
  const key = (e: any) => [e?.school, e?.degree, e?.field, e?.year].map((v) => String(v ?? "").trim().toLowerCase()).join("|");
  const seen = new Set(out.map(key));
  for (const e of base) {
    const k = key(e);
    if (!k || k === "|||") continue;
    if (!seen.has(k)) {
      out.push(e);
      seen.add(k);
    }
  }
  return out;
}

function mergeBulletsFromBase(baseExp: any[], outExp: any[]) {
  const base = normalizeFactExperience(baseExp);
  const out = normalizeFactExperience(outExp);

  const strictKey = (e: any) => expKey(e);
  const looseKey = (e: any) => expLooseKey(e);
  const baseByStrict = new Map<string, any>();
  const baseByLoose = new Map<string, any>();
  for (const e of base) {
    baseByStrict.set(strictKey(e), e);
    const lk = looseKey(e);
    if (!baseByLoose.has(lk)) baseByLoose.set(lk, e);
  }

  for (const e of out) {
    const b = baseByStrict.get(strictKey(e)) || baseByLoose.get(looseKey(e));
    if (!b) continue;
    const existingBullets: string[] = Array.isArray(e.bullets) ? e.bullets : [];
    const baseBullets = Array.isArray(b.bullets) ? b.bullets : [];
    for (const bb of baseBullets) {
      const s = String(bb || "").trim();
      if (!s) continue;
      // Avoid adding base bullet if the model already wrote the same idea (near-duplicate)
      if (existingBullets.some((eb) => bulletsNearDuplicate(String(eb || ""), s))) continue;
      existingBullets.push(s);
    }
    // No hard cap here: do not drop base resume content.
    // (Downstream exporters/ATS can handle longer resumes; product can add a page control later.)
    e.bullets = existingBullets;
  }
  return out;
}

function summarizeResumeDoc(rd: any) {
  const contact = rd?.contact || {};
  const skills = rd?.skills || {};
  const exp = Array.isArray(rd?.experience) ? rd.experience : [];
  const edu = Array.isArray(rd?.education) ? rd.education : [];
  const certs = Array.isArray(rd?.certifications) ? rd.certifications : [];

  const bullets = exp.reduce((n: number, e: any) => n + (Array.isArray(e?.bullets) ? e.bullets.length : 0), 0);
  const techSkills = Array.isArray(skills?.technical) ? skills.technical.length : 0;
  const softSkills = Array.isArray(skills?.soft) ? skills.soft.length : 0;

  const textParts: string[] = [];
  if (rd?.summary) textParts.push(String(rd.summary));
  for (const e of exp) {
    textParts.push([e?.title, e?.company, e?.start, e?.end, e?.location].filter(Boolean).join(" "));
    for (const b of Array.isArray(e?.bullets) ? e.bullets : []) textParts.push(String(b));
  }
  for (const e of edu) textParts.push([e?.school, e?.degree, e?.field, e?.year].filter(Boolean).join(" "));
  for (const c of certs) textParts.push(String(c));
  for (const s of (Array.isArray(skills?.technical) ? skills.technical : [])) textParts.push(String(s));
  for (const s of (Array.isArray(skills?.soft) ? skills.soft : [])) textParts.push(String(s));

  const charCount = textParts.join("\n").trim().length;

  const hasContact =
    Boolean(contact?.full_name) +
    Boolean(contact?.email) +
    Boolean(contact?.phone) +
    Boolean(contact?.linkedin_url) +
    Boolean(contact?.location);

  return {
    exp_count: exp.length,
    edu_count: edu.length,
    cert_count: certs.length,
    bullets_count: bullets,
    tech_skills_count: techSkills,
    soft_skills_count: softSkills,
    char_count: charCount,
    contact_fields_present: hasContact,
  };
}

function structuralAtsScoreFromResumeDoc(rd: any) {
  const s = summarizeResumeDoc(rd);
  // A conservative, deterministic ATS-quality heuristic:
  // short/partial resumes cannot score high regardless of keyword lists.
  let score = 0;

  // Contact (10)
  score += Math.min(10, s.contact_fields_present * 2);
  // Summary (10)
  score += s.char_count >= 200 ? 10 : s.char_count >= 80 ? 6 : s.char_count >= 30 ? 3 : 0;
  // Skills (15)
  score += Math.min(12, s.tech_skills_count * 1.2);
  score += Math.min(3, s.soft_skills_count >= 3 ? 3 : s.soft_skills_count);
  // Experience structure (45)
  score += Math.min(20, s.exp_count * 6); // roles
  score += Math.min(25, s.bullets_count * 1.5); // bullets
  // Education + certs (10)
  score += s.edu_count >= 1 ? 6 : 0;
  score += s.cert_count >= 1 ? 4 : 0;

  // Length sanity: if the resume is extremely short, cap hard.
  if (s.char_count < 600) score = Math.min(score, 55);
  if (s.char_count < 350) score = Math.min(score, 45);
  if (s.char_count < 200) score = Math.min(score, 35);

  return { score: Math.max(0, Math.min(100, Math.round(score))), stats: s };
}

function flattenJdKeywords(jse: any): string[] {
  if (!jse || typeof jse !== "object") return [];
  const keys = [
    "core_technical_skills",
    "platform_cloud_tooling",
    "architecture_systems",
    "leadership_org_design",
    "business_strategy",
  ];
  const out: string[] = [];
  for (const k of keys) {
    const arr = (jse as any)?.[k];
    if (Array.isArray(arr)) {
      for (const v of arr) {
        const s = String(v ?? "").trim();
        if (s) out.push(s);
      }
    }
  }
  // De-dupe while preserving order
  const seen = new Set<string>();
  return out.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function includesPhrase(haystack: string, needle: string) {
  const h = String(haystack || "").toLowerCase();
  const n = String(needle || "").toLowerCase();
  return h.includes(n);
}

function normForMatch(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeJdForKeywordExtraction(jd: string) {
  let t = String(jd || "");
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/[•\u2022]/g, "\n• ");
  t = t.replace(
    /\b(Key Responsibilities|Responsibilities|Required Qualifications|Preferred Qualifications|Qualifications|Requirements|Soft Skills)\s*:\s*/gi,
    "\n$1:\n",
  );
  t = t.replace(/\. +/g, ".\n");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t;
}

function extractJdKeywordsDeterministic(jd: string) {
  const text = normalizeJdForKeywordExtraction(String(jd || ""));
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const candidates: string[] = [];

  // 1) Parenthetical acronyms: "Lightning Web Components (LWC)" -> both phrases
  const paren = [...text.matchAll(/([A-Za-z][A-Za-z0-9 &\/.-]{2,80})\s*\(\s*([A-Z0-9]{2,10})\s*\)/g)];
  for (const m of paren) {
    const full = String(m[1] || "").trim();
    const abbr = String(m[2] || "").trim();
    if (full) candidates.push(full);
    if (abbr) candidates.push(abbr);
  }

  // 2) Slash terms/acronyms: SOQL/SOSL, REST/SOAP, CI/CD, etc.
  const tokenTerms = [
    ...text.matchAll(/\b[A-Z]{2,}(?:\/[A-Z]{2,})+\b/g),
    ...text.matchAll(/\b[A-Z]{2,}\/[A-Z]{2,}\b/g),
  ].map((m) => String((m as any)[0] || "").trim());
  candidates.push(...tokenTerms);

  // 3) From bullet-like requirement lines, keep short, meaningful fragments.
  const hotHeadings = /(REQUIREMENTS|QUALIFICATIONS|RESPONSIBILITIES|CERTIFICATIONS|SOFT SKILLS|KEY RESPONSIBILITIES|REQUIRED QUALIFICATIONS|PREFERRED QUALIFICATIONS)/i;
  let inHot = false;
  for (const l0 of lines) {
    if (hotHeadings.test(l0)) {
      inHot = true;
      continue;
    }
    const isBullet = /^[•\-\*]/.test(l0);
    if (!inHot && !isBullet) continue;
    const l = l0.replace(/^[•\-\*]+\s*/, "").trim();
    if (!l) continue;

    for (const part of l.split(/[,;]|•|\band\b|\bor\b/gi)) {
      const s = part.trim().replace(/\s+/g, " ");
      if (!s) continue;
      const words = s.split(" ").filter(Boolean);
      if (words.length > 6) continue;
      if (s.length < 2 || s.length > 70) continue;
      candidates.push(s);
    }
  }

  // 4) Filter out boilerplate / low-signal fragments.
  const badStarts = [
    "ability to",
    "excellent",
    "strong",
    "be flexible",
    "adapt to",
    "you",
    "open to",
    "preferred",
    "required",
    "qualifications",
    "responsibilities",
    "requirements",
    "key responsibilities",
  ];

  const out: string[] = [];
  const seen = new Set<string>();
  const allowShort = new Set(["r", "c", "go", "ai", "ml", "qa", "ui", "ux", "pm", "vp", "okrs", "kpi", "kpis", "sre"]);
  const startsWithMidWordFragment = (s: string) => {
    const v = String(s || "").trim();
    const first = v.split(/\s+/)[0] || "";
    if (first.length >= 1 && first.length <= 3 && /^[a-z]+$/.test(first) && !allowShort.has(first)) return true;
    return false;
  };
  for (const raw of candidates) {
    const cleaned = String(raw || "")
      .replace(/^[•\-\*]+\s*/, "")
      .replace(/[.]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (badStarts.some((p) => lower.startsWith(p))) continue;
    if (startsWithMidWordFragment(lower)) continue;
    // Keep certain short, high-signal keywords (e.g., "R", "C", "Go", "AI", "ML").
    if (lower.length < 3 && !allowShort.has(lower)) continue;
    if (["experience", "skills", "requirements", "qualifications", "responsibilities"].includes(lower)) continue;
    const key = normForMatch(cleaned);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  return out.slice(0, 60);
}

function keywordCoverageScore(resumeText: string, jdText: string) {
  const resume = normForMatch(resumeText);
  const kws = extractJdKeywordsDeterministic(jdText);
  const matched: string[] = [];
  const missing: string[] = [];

  const variants = (k: string) => {
    const base = normForMatch(k);
    if (!base) return [];
    const vs = new Set<string>([base]);
    if (k.includes("/")) {
      for (const part of k.split("/")) {
        const p = normForMatch(part);
        if (p) vs.add(p);
      }
    }
    vs.add(base.replace(/\s+/g, ""));
    // common aliases
    if (base === "ci cd" || base === "ci/cd") {
      vs.add("ci cd");
      vs.add("ci/cd");
    }
    if (base === "salesforce dx") vs.add("sfdx");
    if (base === "lightning web components") vs.add("lwc");
    return [...vs].filter(Boolean);
  };

  const has = (k: string) => variants(k).some((v) => resume.includes(v));

  for (const k of kws) {
    if (has(k)) matched.push(k);
    else missing.push(k);
  }

  const total = kws.length || 1;
  const score = Math.round((matched.length / total) * 100);
  return { score: Math.min(100, Math.max(0, score)), total, matched_count: matched.length, matched, missing };
}

function resumeDocTextForPresence(rd: any): string {
  const parts: string[] = [];
  if (rd?.summary) parts.push(String(rd.summary));
  const skills = rd?.skills || {};
  for (const s of Array.isArray(skills?.technical) ? skills.technical : []) parts.push(String(s));
  for (const s of Array.isArray(skills?.soft) ? skills.soft : []) parts.push(String(s));
  for (const e of Array.isArray(rd?.experience) ? rd.experience : []) {
    parts.push([e?.title, e?.company, e?.start, e?.end, e?.location].filter(Boolean).join(" "));
    for (const b of Array.isArray(e?.bullets) ? e.bullets : []) parts.push(String(b));
  }
  for (const e of Array.isArray(rd?.education) ? rd.education : []) {
    parts.push([e?.school, e?.degree, e?.field, e?.year].filter(Boolean).join(" "));
  }
  for (const c of Array.isArray(rd?.certifications) ? rd.certifications : []) parts.push(String(c));
  return parts.join("\n");
}

function factsTextForPresence(facts: any): string {
  const parts: string[] = [];
  if (facts?.summary) parts.push(String(facts.summary));
  for (const s of Array.isArray(facts?.technical_skills) ? facts.technical_skills : []) parts.push(String(s));
  for (const s of Array.isArray(facts?.soft_skills) ? facts.soft_skills : []) parts.push(String(s));
  for (const e of Array.isArray(facts?.experience) ? facts.experience : []) {
    parts.push([e?.title, e?.company, e?.start, e?.end, e?.location].filter(Boolean).join(" "));
    for (const b of Array.isArray(e?.bullets) ? e.bullets : []) parts.push(String(b));
  }
  for (const e of Array.isArray(facts?.education) ? facts.education : []) {
    parts.push([e?.school, e?.degree, e?.field, e?.year].filter(Boolean).join(" "));
  }
  for (const c of Array.isArray(facts?.certifications) ? facts.certifications : []) parts.push(String(c));
  if (facts?.raw_resume_text) parts.push(String(facts.raw_resume_text));
  return parts.join("\n");
}

function experienceTextForPresence(rd: any): string {
  const parts: string[] = [];
  for (const e of Array.isArray(rd?.experience) ? rd.experience : []) {
    parts.push([e?.title, e?.company, e?.start, e?.end, e?.location].filter(Boolean).join(" "));
    for (const b of Array.isArray(e?.bullets) ? e.bullets : []) parts.push(String(b));
  }
  return parts.join("\n");
}

function looksLikeConcreteToolOrSkill(k: string) {
  const s = String(k || "").trim();
  if (!s) return false;
  // Allow a few single-letter / very short, high-signal skills (common in DS JDs).
  const shortAllow = new Set(["R", "C", "Go", "AI", "ML"]);
  if (s.length < 2 && !shortAllow.has(s)) return false;
  const n = s.toLowerCase();
  // Skip ultra-generic terms that don't help ATS or are unsafe to force
  const generic = new Set([
    "communication",
    "collaboration",
    "leadership",
    "mentoring",
    "problem solving",
    "problem-solving",
    "integrity",
    "accountability",
    "delivery",
    "execution",
    "architecture",
    "design",
    "scalable",
    "resilient",
  ]);
  if (generic.has(n)) return false;
  // Prefer things that look like products/tools/tech phrases
  const hasLetters = /[a-z]/i.test(s);
  const hasDigitOrAcronym = /\b[A-Z]{2,}\b/.test(s) || /\d/.test(s);
  const hasParens = s.includes("(") && s.includes(")");
  return hasLetters && (hasDigitOrAcronym || hasParens || s.length >= 4);
}

function learningSuggestionForKeyword(k: string) {
  const s = String(k || "").trim();
  const n = s.toLowerCase();
  // Data / ML
  if (n.includes("pandas") || n.includes("numpy")) {
    return "Build a data cleaning notebook (Pandas/NumPy) with joins, missing values, feature engineering, and unit-tested transforms.";
  }
  if (n.includes("scikit") || n.includes("sklearn")) {
    return "Implement 2–3 supervised ML models in scikit-learn; practice cross-validation, metrics, and model interpretation.";
  }
  if (n.includes("tensorflow") || n.includes("pytorch")) {
    return "Train a small model end-to-end; understand data loaders, training loops, evaluation, and saving/loading artifacts.";
  }
  if (n.includes("spark") || n.includes("hadoop")) {
    return "Process a large dataset with Spark (PySpark): ETL, aggregations, partitioning; understand performance and shuffle costs.";
  }
  if (n.includes("mlops") || n.includes("deploy") || n.includes("production")) {
    return "Learn model packaging + deployment basics: reproducible training, model registry, batch vs realtime, monitoring and drift.";
  }
  if (n.includes("risk modeling") || n.includes("financial")) {
    return "Study baseline risk models (logistic regression, scorecards), backtesting, bias/fairness, and regulatory constraints.";
  }
  // Salesforce-ish examples (common JD mismatch)
  if (n.includes("apex")) {
    return "Trailhead: Apex Basics & Database; build a small Apex service with unit tests; study bulkification + governor limits.";
  }
  if (n.includes("lightning web components") || n.includes("lwc")) {
    return "Trailhead: LWC Basics; build 2–3 components (wire/adapters); practice composition + testing.";
  }
  if (n.includes("soql") || n.includes("sosl")) {
    return "Practice SOQL/SOSL query patterns (filters, relationships); study selectivity; solve 20+ query exercises.";
  }
  if (n.includes("salesforce")) {
    return "Study Salesforce platform architecture + security model; complete integration modules (REST/SOAP/OAuth); build a demo integration.";
  }
  if (n.includes("oauth")) {
    return "Study OAuth 2.0 flows; implement auth code flow; document token refresh + scopes.";
  }
  if (n.includes("rest") || n.includes("soap") || n.includes("bulk api")) {
    return "Build an API integration demo (REST + JSON; SOAP/Bulk API if relevant) with retries, pagination, auth, and error handling.";
  }
  return "Read official docs; complete a focused course/module; build a small end-to-end demo project to validate competency.";
}

function extractExperienceFromRawResumeText(raw: string): any[] {
  const text = String(raw || "");
  if (!text.trim()) return [];

  // Try to isolate an experience section; if not found, use full text.
  const upper = text.toUpperCase();
  const expIdx = upper.indexOf("PROFESSIONAL EXPERIENCE");
  const expIdx2 = upper.indexOf("EXPERIENCE");
  const startIdx = expIdx >= 0 ? expIdx : expIdx2 >= 0 ? expIdx2 : 0;
  const slice = text.slice(startIdx);

  // Stop at education/certs/skills if present (after startIdx).
  const stopTokens = ["EDUCATION", "CERTIFICATIONS", "TECHNICAL SKILLS", "SKILLS"];
  let endIdx = slice.length;
  for (const t of stopTokens) {
    const i = slice.toUpperCase().indexOf(t);
    if (i > 50) endIdx = Math.min(endIdx, i);
  }
  const section = slice.slice(0, endIdx);

  const lines = section
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const month =
    "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
  const dateRangeRe = new RegExp(`\\b${month}\\s+(?:19|20)\\d{2}\\s*(?:[-–—→to]{1,3})\\s*(?:present|current|${month}\\s+(?:19|20)\\d{2}|\\b(?:19|20)\\d{2}\\b)`, "i");
  const yearRangeRe = /\b(?:19|20)\d{2}\s*(?:[-–—→to]{1,3})\s*(?:present|current|\b(?:19|20)\d{2}\b)/i;

  const looksLikeRoleLine = (l: string) => dateRangeRe.test(l) || yearRangeRe.test(l);

  const parsed: any[] = [];
  let cur: any | null = null;
  let expectingTitle = false;

  const flush = () => {
    if (!cur) return;
    cur.company = nullIfNA(cur.company);
    cur.title = nullIfNA(cur.title);
    cur.start = nullIfNA(cur.start);
    cur.end = nullIfNA(cur.end);
    cur.location = nullIfNA(cur.location);
    cur.bullets = Array.isArray(cur.bullets) ? cur.bullets.map((b: any) => String(b || "").trim()).filter(Boolean) : [];
    if (cur.company || cur.title) parsed.push(cur);
    cur = null;
    expectingTitle = false;
  };

  const parseDates = (l: string) => {
    // best-effort: split around dash/arrow/to
    const m = l.match(dateRangeRe) || l.match(yearRangeRe);
    const seg = m ? m[0] : "";
    const parts = seg.split(/[-–—→]|\\bto\\b/i).map((x) => x.trim()).filter(Boolean);
    const start = parts[0] || null;
    const end = parts[1] || null;
    return { start, end };
  };

  for (const line of lines) {
    const l = line.replace(/^Responsibilities:\s*/i, "").trim();
    if (looksLikeRoleLine(l)) {
      flush();
      const { start, end } = parseDates(l);
      // Company is everything before the date segment if possible
      const company = l.replace(dateRangeRe, "").replace(yearRangeRe, "").trim() || null;
      cur = { company, title: null, start, end, location: null, bullets: [] as string[] };
      expectingTitle = true;
      continue;
    }
    if (!cur) continue;

    // If the next line after the company+date line looks like a title, capture it.
    if (expectingTitle) {
      const t = l;
      if (t.length <= 120 && /(developer|engineer|manager|admin|architect|lead|consultant|analyst|specialist)/i.test(t)) {
        cur.title = t;
        expectingTitle = false;
        continue;
      }
      // If not a title, proceed to bullets.
      expectingTitle = false;
    }

    // Bullet detection: leading bullet chars or “•” or dash
    const bullet = l.replace(/^[•\u2022\-*]+\s*/, "").trim();
    if (bullet && bullet !== l) {
      cur.bullets.push(bullet);
    } else if (/^(technologies used|tools used)\s*:/i.test(l)) {
      // ignore tools-used lines as bullets; they belong in skills
      continue;
    } else if (cur.bullets.length) {
      // continuation line of previous bullet
      cur.bullets[cur.bullets.length - 1] = `${cur.bullets[cur.bullets.length - 1]} ${l}`.trim();
    } else if (/(Responsibilities|Projects)/i.test(l)) {
      continue;
    } else {
      // Treat as bullet if it reads like an action line
      if (l.split(" ").length >= 6) cur.bullets.push(l);
    }
  }
  flush();

  return parsed;
}

function mergeExperienceEnsureAllFromRawText(baseExp: any[], rawText: string | null | undefined) {
  const base = normalizeFactExperience(baseExp);
  const recovered = extractExperienceFromRawResumeText(String(rawText || ""));
  if (!recovered.length) return base;
  // Use existing merge logic: recovered are treated like "base facts" candidates.
  return mergeExperienceEnsureAll([...base, ...recovered], base);
}

function ensureRiskStudyPlan(parsed: any) {
  const missing = Array.isArray(parsed?.keywords_intentionally_missing) ? parsed.keywords_intentionally_missing : [];
  const highRisk = Array.isArray(parsed?.high_risk_claims) ? parsed.high_risk_claims : [];
  parsed.defend_with_learning = Array.isArray(parsed?.defend_with_learning) ? parsed.defend_with_learning : [];

  const seen = new Set(
    parsed.defend_with_learning
      .map((d: any) => String(d?.claim_or_gap || "").trim().toLowerCase())
      .filter(Boolean),
  );

  for (const m of missing) {
    const k = String(m?.keyword || "").trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    parsed.defend_with_learning.push({ claim_or_gap: k, what_to_study: learningSuggestionForKeyword(k) });
    seen.add(key);
  }
  for (const r of highRisk) {
    const k = String(r || "").trim();
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    parsed.defend_with_learning.push({ claim_or_gap: k, what_to_study: learningSuggestionForKeyword(k) });
    seen.add(key);
  }

  // Cap for payload size
  parsed.defend_with_learning = parsed.defend_with_learning.slice(0, 25);
}

function enforceContentPreservation(rd: any, facts: any) {
  if (!rd) throw new Error("Missing resume_doc for preservation check");
  const baseExp = Array.isArray(facts?.experience) ? facts.experience : [];
  const baseEdu = Array.isArray(facts?.education) ? facts.education : [];

  rd.experience = Array.isArray(rd.experience) ? rd.experience : [];
  rd.education = Array.isArray(rd.education) ? rd.education : [];

  // Ensure roles/education exist
  rd.experience = mergeExperienceEnsureAll(baseExp, rd.experience);
  rd.education = mergeEducationEnsureAll(baseEdu, rd.education);
  // Ensure bullets are not dropped
  rd.experience = mergeBulletsFromBase(baseExp, rd.experience);

  // Strict verification: every base role must be present after merges (or we append it verbatim).
  const baseNorm = normalizeFactExperience(baseExp);
  const outNorm = normalizeFactExperience(rd.experience);

  const missing: any[] = [];
  for (const b of baseNorm) {
    const present = outNorm.some((oe) => rolesProbablySame(oe, b) || expKey(oe) === expKey(b) || expLooseKey(oe) === expLooseKey(b));
    if (!present) missing.push(b);
  }
  if (missing.length) {
    rd.experience = [...outNorm, ...missing];
  }

  // Final verify; if still missing, hard fail (better than silently shipping a broken resume).
  const out2 = normalizeFactExperience(rd.experience);
  const stillMissing: any[] = [];
  for (const b of baseNorm) {
    const present = out2.some((oe) => rolesProbablySame(oe, b) || expKey(oe) === expKey(b) || expLooseKey(oe) === expLooseKey(b));
    if (!present) stillMissing.push(b);
  }
  if (stillMissing.length) {
    const names = stillMissing
      .map((e) => [e?.title, e?.company].filter(Boolean).join(" — "))
      .filter(Boolean)
      .slice(0, 8)
      .join("; ");
    throw new Error(`Resume preservation check failed: missing base experience roles: ${names}`);
  }
}

function computeJdAtsMatchEstimate(rd: any, jse: any) {
  const buckets = [
    { key: "core_technical_skills", w: 30 },
    { key: "platform_cloud_tooling", w: 25 },
    { key: "architecture_systems", w: 20 },
    { key: "leadership_org_design", w: 15 },
    { key: "business_strategy", w: 10 },
  ] as const;
  const text = resumeDocTextForPresence(rd);
  let score = 0;
  const stats: any = { buckets: {} };
  for (const b of buckets) {
    const arr = Array.isArray(jse?.[b.key]) ? (jse[b.key] as any[]) : [];
    const kws = arr.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (!kws.length) {
      stats.buckets[b.key] = { weight: b.w, total: 0, matched: 0 };
      continue;
    }
    let matched = 0;
    for (const k of kws) {
      if (includesPhrase(text, k)) matched++;
    }
    const ratio = matched / kws.length;
    score += b.w * ratio;
    stats.buckets[b.key] = { weight: b.w, total: kws.length, matched };
  }
  return { score: Math.round(Math.max(0, Math.min(100, score))), stats };
}

function ensureJdKeywordsInSkills(parsed: any, facts: any) {
  const rd = parsed?.resume_doc;
  if (!rd) return;

  rd.skills = rd.skills || { technical: [], soft: [] };
  rd.skills.technical = Array.isArray(rd.skills.technical) ? rd.skills.technical : [];
  rd.skills.soft = Array.isArray(rd.skills.soft) ? rd.skills.soft : [];

  const expText = experienceTextForPresence(rd);
  const baseText = factsTextForPresence(facts);

  const addSkill = (bucket: "technical" | "soft", s: string) => {
    const cleaned = String(s ?? "").trim();
    if (!cleaned) return;
    const list: string[] = bucket === "technical" ? rd.skills.technical : rd.skills.soft;
    const has = list.some((x) => String(x || "").trim().toLowerCase() === cleaned.toLowerCase());
    if (has) return;
    list.push(cleaned);
  };

  // Deterministic: use JD keyword extraction so we don't depend on the model's jd_skill_extraction quality.
  const jdText = String(parsed?.jd_text || "").trim();
  const kws = jdText ? extractJdKeywordsDeterministic(jdText) : [];

  const supportedByAdjacentEvidence = (kw: string) => {
    const k = String(kw || "").toLowerCase();
    const base = baseText.toLowerCase();
    // Data/ML: allow common ecosystem terms when Python/ML/SQL/etc are already evidenced.
    const hasPython = base.includes("python");
    const hasSql = base.includes("sql");
    const hasMl = base.includes("machine learning") || base.includes("ml") || base.includes("model");
    const hasCloud = base.includes("aws") || base.includes("azure") || base.includes("gcp") || base.includes("cloud");
    const hasBigData = base.includes("spark") || base.includes("hadoop") || base.includes("big data") || base.includes("etl");

    if ((k.includes("pandas") || k.includes("numpy")) && hasPython) return true;
    if ((k.includes("scikit") || k.includes("sklearn")) && (hasPython || hasMl)) return true;
    if ((k.includes("tensorflow") || k.includes("pytorch")) && hasPython && hasMl) return true;
    if ((k.includes("spark") || k.includes("hadoop")) && (hasBigData || hasCloud)) return true;
    if ((k.includes("mlops") || k.includes("deploy")) && (hasMl || hasCloud)) return true;
    if (k === "r" && (hasPython || hasSql || hasMl)) return true;

    // Generic: if the keyword is a core tool and we have adjacent evidence in the same family, allow it.
    return false;
  };

  for (const k of kws) {
    if (!k) continue;
    if (!looksLikeConcreteToolOrSkill(k)) continue;
    // Evidence-aware injection:
    // - If the keyword is already evidenced in the base resume text, add verbatim.
    // - If not evidenced but adjacent evidence exists (e.g., Python -> Pandas), allow adding verbatim.
    // - Otherwise, do NOT add to the resume (avoid fabrication). It can still appear in Section 2.
    if (includesPhrase(expText, k)) continue;
    const evidenced = includesPhrase(baseText, k);
    if (evidenced || supportedByAdjacentEvidence(k)) {
      addSkill("technical", k);
    } else {
      parsed.keywords_intentionally_missing = Array.isArray(parsed?.keywords_intentionally_missing) ? parsed.keywords_intentionally_missing : [];
      parsed.keywords_intentionally_missing.push({
        keyword: k,
        reason: "Not evidenced in the base resume; omitted from Skills to avoid an indefensible claim.",
      });
    }
  }

  // Normalize and cap
  rd.skills.technical = normalizeSkillArray(rd.skills.technical, 60);
  rd.skills.soft = normalizeSkillArray(rd.skills.soft, 40);
}

// NOTE: We intentionally do NOT inject JD phrases into Experience/Summary.
// If a JD keyword is not supported by BASE_FACTS as hands-on, it should only live in Skills
// (or in the ATS & Risk report), otherwise we risk fabricating claims.

function clampAtsIfIncomplete(parsed: any, facts: any) {
  const rd = parsed?.resume_doc;
  if (!rd) return;

  const exp = Array.isArray(rd?.experience) ? rd.experience : [];
  const edu = Array.isArray(rd?.education) ? rd.education : [];
  const bullets = exp.reduce((n: number, e: any) => n + (Array.isArray(e?.bullets) ? e.bullets.length : 0), 0);
  const baseExpCount = Array.isArray(facts?.experience) ? facts.experience.length : 0;
  const baseEduCount = Array.isArray(facts?.education) ? facts.education.length : 0;

  const missingStructure =
    (baseExpCount >= 2 && exp.length < 2) ||
    (baseExpCount >= 3 && exp.length < 3) ||
    (baseEduCount >= 2 && edu.length < 2) ||
    bullets < 6;

  if (!missingStructure) return;

  const current = typeof parsed?.ats_estimate === "number" && Number.isFinite(parsed.ats_estimate) ? parsed.ats_estimate : 0;
  // If the resume is structurally incomplete, it cannot be high ATS.
  parsed.ats_estimate = Math.min(current, 55);

  const improvements = Array.isArray(parsed?.ats_improvements) ? parsed.ats_improvements : [];
  improvements.unshift(
    "Resume output is structurally incomplete (missing roles/education/bullets). Re-run parsing with a text-based resume (DOCX preferred) or paste resume text to improve extraction fidelity.",
  );
  parsed.ats_improvements = improvements.slice(0, 10);

  const mf = Array.isArray(parsed?.missing_facts_questions) ? parsed.missing_facts_questions : [];
  mf.unshift("Your resume extraction appears incomplete. If you have a DOCX version of your resume, upload that as the base resume (or paste plain text) so all roles and education are captured.");
  parsed.missing_facts_questions = mf.slice(0, 12);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const baseParsed = body?.baseParsed;
    const jdText = sanitizeString(body?.jdText, 20000) || "";
    const baseResumeText = sanitizeString(body?.baseResumeText, 80000);
    const linkedinUrl = sanitizeString(body?.linkedinUrl, 500);
    const additionalNotes = sanitizeString(body?.additionalNotes, 2000);
    const targetTitle = sanitizeString(body?.targetTitle, 120);

    if (!baseParsed || typeof baseParsed !== "object") {
      return new Response(JSON.stringify({ error: "Missing baseParsed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!jdText.trim()) {
      return new Response(JSON.stringify({ error: "Missing jdText" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a “facts only” envelope so the model doesn’t hallucinate.
    // The UI may supply additionalNotes to clarify scope, but it must not introduce fake facts.
    const facts = {
      full_name: baseParsed?.full_name ?? null,
      email: baseParsed?.email ?? null,
      phone: baseParsed?.phone ?? null,
      location: baseParsed?.location ?? null,
      linkedin_url: linkedinUrl || baseParsed?.linkedin_url || null,
      github_url: baseParsed?.github_url ?? null,
      current_title: baseParsed?.current_title ?? null,
      current_company: baseParsed?.current_company ?? null,
      years_of_experience: baseParsed?.years_of_experience ?? null,
      summary: baseParsed?.summary ?? null,
      technical_skills: normalizeSkillArray(baseParsed?.technical_skills, 60),
      soft_skills: normalizeSkillArray(baseParsed?.soft_skills, 40),
      experience: Array.isArray(baseParsed?.experience) ? baseParsed.experience : [],
      education: Array.isArray(baseParsed?.education) ? baseParsed.education : [],
      certifications: Array.isArray(baseParsed?.certifications) ? baseParsed.certifications : [],
      raw_resume_text: baseResumeText || null,
    };

    // Deterministic backstop: ensure we don't miss roles by supplementing experience from raw extracted text.
    facts.experience = mergeExperienceEnsureAllFromRawText(facts.experience, facts.raw_resume_text);

    const systemPrompt = `
You are an ATS-optimization and enterprise resume-rewriting engine.

GOAL
Given:
1) A base resume (factual, real experience)
2) A target Job Description (JD)

Your task is to produce an ATS-optimized resume that maximizes keyword match
(aim ~70–80%), while remaining fully defensible in interviews.

NON-NEGOTIABLE CONSTRAINTS
- DO NOT fabricate employers, job titles, dates, degrees, or certifications.
- DO NOT claim years of experience that do not exist.
- DO NOT invent tools or platforms the candidate could not reasonably defend.
- DO NOT remove seniority or leadership scope unless explicitly required.
- The candidate must be able to explain and defend every bullet in interview.

WHAT YOU MAY MODIFY
- Rewrite the PROFESSIONAL SUMMARY to align tightly with the JD.
- Expand, re-order, and re-label the SKILLS section for ATS weighting.
- Rewrite EXPERIENCE BULLETS to:
  • Mirror JD language
  • Highlight relevant responsibilities
  • Emphasize integrations, architecture, scale, governance, and delivery
- Add clarifying parentheticals such as:
  • \"working knowledge\"
  • \"hands-on exposure\"
  • \"enterprise integration experience\"
- Add “In Progress” or “Planned” certifications ONLY if realistic.

WHAT MUST REMAIN FACTUAL (DO NOT EDIT, DO NOT REWRITE, DO NOT REORDER)
- Contact information (Name, Location, Phone, Email, LinkedIn, GitHub)
- Employer names
- Job titles
- Employment dates
- Education (copy exactly from BASE_FACTS.education)
- Certifications (copy exactly from BASE_FACTS.certifications)

OUTPUT REQUIREMENTS (RESUME FORMAT)
Produce a FULL resume with the following sections, in this order:
1. Header (Name, Location, Phone, Email, LinkedIn if provided)
2. Professional Summary (JD-aligned, keyword-dense)
3. Core Technical Skills (grouped and ordered by JD relevance)
4. Professional Experience (keep all roles; rewrite bullets for ATS alignment)
5. Certifications
6. Education

ATS OPTIMIZATION RULES
- Repeat critical JD keywords naturally across Summary, Skills, and multiple Experience bullets.
- Prefer JD phrasing over synonyms where reasonable.
- For higher ATS keyword coverage, ensure important JD phrases appear verbatim in **Core Technical Skills** and (when defensible) in the **most recent role bullets**.
- Use concrete verbs (designed, implemented, integrated, governed).
- Avoid buzzwords with no ATS value.
- Assume ATS scoring favors repetition and proximity.

TONE & STYLE
- Senior, technical, credible
- Enterprise and systems-oriented
- No fluff, no marketing language
- Clear, structured, readable

FINAL CHECK
Before output:
- Verify every claimed skill could be defended with real examples.
- Ensure platform/tool claims are accurate and defensible (use qualifiers like "exposure" if needed).
- Target ~70–80% ATS match, not 100%.

IMPORTANT FOR THIS API
- You must populate the function schema fields:
  - jd_skill_extraction (Section 0)
  - resume_doc (Section 1: the resume)
  - keywords_* / high_risk_claims / defend_with_learning / ats_improvements (Section 2)
- SECTION 2 content must NOT appear inside resume_doc (no notes/commentary in the resume).
Output must follow the function schema exactly. No extra text.
`;

    const userPrompt = `
BASE_FACTS (source of truth):
${JSON.stringify(facts)}

IMPORTANT:
- The field BASE_FACTS.raw_resume_text (when present) contains the full extracted resume text. Use it to ensure you do not miss any roles/bullets that might not appear in the structured arrays.
- You MUST preserve ALL experience roles found in BASE_FACTS.experience OR raw_resume_text.

TARGET_JOB_DESCRIPTION:
${jdText}

OPTIONAL_TARGET_TITLE:
${targetTitle || ""}

OPTIONAL_ADDITIONAL_NOTES (preferences/instructions, NOT new facts):
${additionalNotes || ""}
`;

    const tools = [
      {
        type: "function",
        function: {
          name: "generate_tailored_resume",
          description: "Generate an ATS-optimized, defensible resume + JD extraction + ATS/risk report",
          parameters: {
            type: "object",
            additionalProperties: false,
            properties: {
              suggested_title: { type: ["string", "null"] },
              ats_estimate: { type: "number", description: "Estimated ATS match score to the TARGET_JOB_DESCRIPTION (0-100)" },
              jd_skill_extraction: {
                type: "object",
                additionalProperties: false,
                properties: {
                  core_technical_skills: { type: "array", items: { type: "string" } },
                  platform_cloud_tooling: { type: "array", items: { type: "string" } },
                  architecture_systems: { type: "array", items: { type: "string" } },
                  leadership_org_design: { type: "array", items: { type: "string" } },
                  business_strategy: { type: "array", items: { type: "string" } },
                },
                required: [
                  "core_technical_skills",
                  "platform_cloud_tooling",
                  "architecture_systems",
                  "leadership_org_design",
                  "business_strategy"
                ],
              },
              keywords_fully_matched: { type: "array", items: { type: "string" } },
              keywords_partially_matched: { type: "array", items: { type: "string" } },
              keywords_intentionally_missing: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    keyword: { type: "string" },
                    reason: { type: "string" },
                  },
                  required: ["keyword", "reason"],
                },
              },
              high_risk_claims: { type: "array", items: { type: "string" } },
              defend_with_learning: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    claim_or_gap: { type: "string" },
                    what_to_study: { type: "string" },
                  },
                  required: ["claim_or_gap", "what_to_study"],
                },
              },
              ats_improvements: { type: "array", items: { type: "string" }, description: "Concrete fixes to raise ATS score without inventing facts" },
              resume_doc: {
                type: "object",
                additionalProperties: false,
                properties: {
                  contact: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      full_name: { type: ["string", "null"] },
                      phone: { type: ["string", "null"] },
                      email: { type: ["string", "null"] },
                      linkedin_url: { type: ["string", "null"] },
                      github_url: { type: ["string", "null"] },
                      location: { type: ["string", "null"] },
                    },
                  },
                  summary: { type: ["string", "null"] },
                  skills: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      technical: { type: "array", items: { type: "string" } },
                      soft: { type: "array", items: { type: "string" } },
                    },
                  },
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
                  education: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        school: { type: ["string", "null"] },
                        degree: { type: ["string", "null"] },
                        field: { type: ["string", "null"] },
                        year: { type: ["string", "null"] },
                      },
                    },
                  },
                  certifications: { type: "array", items: { type: "string" } },
                },
              },
              missing_facts_questions: { type: "array", items: { type: "string" } },
            },
            required: ["jd_skill_extraction", "resume_doc", "missing_facts_questions"],
          },
        },
      },
    ];

    const TARGET_ATS = 75;
    let finalParsed: any = null;
    let attempt = 0;
    let lastMissingKeywords: string[] = [];

    while (attempt < 2) {
      attempt++;
      const retryNote =
        attempt === 1
          ? ""
          : `\n\nRETRY REQUIRED:\n- Your previous output did not meet the minimum ATS Match % (${TARGET_ATS}).\n- Add the following missing JD keywords/phrases into the RESUME (Section 1) using exact phrasing where possible:\n${lastMissingKeywords.slice(0, 30).join(", ")}\n- Priority order for adding missing phrases:\n  1) Skills\n  2) Summary\n  3) Experience ONLY if the base resume supports it (no invented platform hands-on).\n- Preserve all roles and bullets.\n- No disclaimers and no learning language in the resume.\n`;

      const { res } = await callChatCompletions({
        messages: [
          { role: "system", content: systemPrompt.trim() },
          { role: "user", content: (userPrompt + retryNote).trim() },
        ],
        temperature: 0,
        tools,
        tool_choice: { type: "function", function: { name: "generate_tailored_resume" } },
      });

      if (!res.ok) {
        const t = await res.text();
        return new Response(JSON.stringify({ error: `AI request failed (${res.status})`, details: t.slice(0, 500) }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        return new Response(JSON.stringify({ error: "No tool output returned" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      // Persist JD text for deterministic keyword extraction in post-processing.
      (parsed as any).jd_text = jdText;

      // Post-process to avoid "N/A" litter and mega-skill strings.
      if (parsed?.resume_doc) {
        const rd = parsed.resume_doc;
        rd.summary = nullIfPlaceholder(nullIfNA(rd.summary));
        if (rd.contact) {
          rd.contact.full_name = nullIfPlaceholder(nullIfNA(rd.contact.full_name));
          rd.contact.phone = nullIfPlaceholder(nullIfNA(rd.contact.phone));
          rd.contact.email = nullIfPlaceholder(nullIfNA(rd.contact.email));
          rd.contact.linkedin_url = nullIfPlaceholder(nullIfNA(rd.contact.linkedin_url));
          rd.contact.github_url = nullIfPlaceholder(nullIfNA(rd.contact.github_url));
          rd.contact.location = nullIfPlaceholder(nullIfNA(rd.contact.location));
        }
        if (rd.skills) {
          rd.skills.technical = normalizeSkillArray(rd.skills.technical, 60);
          rd.skills.soft = normalizeSkillArray(rd.skills.soft, 40);
        }
        if (Array.isArray(rd.experience)) {
          rd.experience = rd.experience.map((e: any) => ({
            company: dedupeExactRepeat(nullIfNA(e?.company)),
            title: dedupeExactRepeat(nullIfNA(e?.title)),
            start: nullIfNA(e?.start),
            end: nullIfNA(e?.end),
            location: nullIfNA(e?.location),
            bullets: Array.isArray(e?.bullets)
              ? e.bullets
                  .map((b: any) => String(b ?? "").trim())
                  .filter((b: string) => b && b.toLowerCase() !== "n/a")
                  .filter((b: string) => !isLowSignalBullet(b))
                  .slice(0, 60)
              : [],
          }));
          // Drop obvious education rows that leaked into experience (no title, no dates, no bullets)
          const leakedEdu = rd.experience.filter((e: any) => {
            const company = String(e?.company || "").toLowerCase();
            const noFacts = !e?.title && !e?.start && !e?.end && !e?.location && (!Array.isArray(e?.bullets) || e.bullets.length === 0);
            return noFacts && (company.includes("university") || company.includes("college"));
          });
          rd.experience = rd.experience.filter((e: any) => !leakedEdu.includes(e));
          if (leakedEdu.length) {
            rd.education = Array.isArray(rd.education) ? rd.education : [];
            const existingEdu = new Set(
              rd.education
                .map((x: any) => String(x?.school || "").trim().toLowerCase())
                .filter(Boolean),
            );
            for (const e of leakedEdu) {
              const school = String(e?.company || "").trim();
              if (!school) continue;
              if (existingEdu.has(school.toLowerCase())) continue;
              rd.education.push({ school, degree: null, field: null, year: null });
              existingEdu.add(school.toLowerCase());
            }
          }
        }
        if (Array.isArray(rd.education)) {
          rd.education = rd.education.map((e: any) => ({
            school: dedupeExactRepeat(nullIfNA(e?.school)),
            degree: dedupeExactRepeat(nullIfNA(e?.degree)),
            field: dedupeExactRepeat(nullIfNA(e?.field)),
            year: nullIfNA(e?.year ?? e?.end ?? e?.start),
          }));
        }
        // Deterministic safeguard: ensure we never DROP roles/education/bullets from BASE_FACTS.
        rd.experience = mergeExperienceEnsureAll(facts.experience, rd.experience);
        rd.education = mergeEducationEnsureAll(facts.education, rd.education);
        rd.experience = mergeBulletsFromBase(facts.experience, rd.experience);
        rd.certifications = normalizeSkillArray(
          Array.isArray(rd.certifications) ? rd.certifications : facts.certifications,
          30,
        );
        // Fill contact from facts if missing (no invention).
        rd.contact = rd.contact || {};
        rd.contact.full_name = rd.contact.full_name ?? facts.full_name ?? null;
        rd.contact.email = rd.contact.email ?? facts.email ?? null;
        rd.contact.phone = rd.contact.phone ?? facts.phone ?? null;
        rd.contact.location = rd.contact.location ?? facts.location ?? null;
        rd.contact.linkedin_url = rd.contact.linkedin_url ?? facts.linkedin_url ?? null;
        rd.contact.github_url = rd.contact.github_url ?? facts.github_url ?? null;
      }

      // Ensure keywords surface in Skills (ATS-first)
      ensureJdKeywordsInSkills(parsed, facts);
      // Enforce base content preservation
      enforceContentPreservation(parsed?.resume_doc, facts);
      // Hard lock immutable fields (contact, education, certifications, role headers)
      enforceImmutableFields(parsed?.resume_doc, facts);
      // Ensure Section 2 has a concrete study plan
      ensureRiskStudyPlan(parsed);

      // Compute deterministic ATS (keyword alignment) and cap by structural quality.
      // Use deterministic JD keyword coverage (more stable than model-provided buckets).
      const kw = keywordCoverageScore(resumeDocTextForPresence(parsed?.resume_doc), jdText);
      const structural = structuralAtsScoreFromResumeDoc(parsed?.resume_doc);
      const finalScore = Math.min(kw.score, structural.score);
      parsed.ats_estimate = finalScore;
      (parsed as any).ats_match = { score: kw.score, total: kw.total, matched_count: kw.matched_count };
      (parsed as any).ats_keyword_coverage = { total: kw.total, matched_count: kw.matched_count, missing: kw.missing.slice(0, 60) };
      (parsed as any).ats_structural = structural;
      (parsed as any).ats_target = TARGET_ATS;
      (parsed as any).tailor_version = "2026-01-14-deterministic-jd-keywords-v1";

      // Make the running version visible in the UI (Resume Workspace shows ats_improvements).
      parsed.ats_improvements = Array.isArray(parsed?.ats_improvements) ? parsed.ats_improvements : [];
      parsed.ats_improvements.unshift(`Tailor engine version: ${(parsed as any).tailor_version}`);
      parsed.ats_improvements = parsed.ats_improvements.slice(0, 10);

      // Capture missing keywords for retry prompt.
      lastMissingKeywords = kw.missing.slice(0, 60);

      // Clamp if structurally incomplete
      clampAtsIfIncomplete(parsed, facts);
      (parsed as any).ats_target_met =
        typeof parsed?.ats_estimate === "number" && Number.isFinite(parsed.ats_estimate) && parsed.ats_estimate >= TARGET_ATS;

      finalParsed = parsed;
      if ((parsed as any).ats_target_met) break;
    }

    if (!finalParsed) throw new Error("Tailor failed: no output");
    return new Response(JSON.stringify(finalParsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

