import { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileText, Plus, Save, Trash2, Clock, Download, Sparkles, X, Search, Briefcase, Copy } from 'lucide-react';
import { getSignedResumeUrl } from '@/lib/resumeLinks';
import { useNavigate } from 'react-router-dom';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  TabStopType,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
} from 'docx';
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import outfitFontUrl from '@/assets/fonts/Outfit.ttf?url';

type TemplateId = 'ats_single';

type ResumeDocContent = {
  contact?: {
    full_name?: string;
    phone?: string;
    email?: string;
    linkedin_url?: string;
    github_url?: string;
    location?: string;
  };
  summary?: string;
  skills?: {
    technical?: string[];
    soft?: string[];
  };
  experience?: Array<{
    company?: string;
    title?: string;
    start?: string;
    end?: string;
    location?: string;
    bullets?: string[];
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    field?: string;
    year?: string;
  }>;
  certifications?: string[];
};

function SkillChipsEditor(props: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const { label, values, onChange, placeholder, max = 80 } = props;
  const [draft, setDraft] = useState('');

  const addFromDraft = () => {
    const raw = draft
      .split(/,|\n/g)
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    if (!raw.length) return;
    const seen = new Set(values.map((v) => String(v || '').trim().toLowerCase()));
    const next = values.slice();
    for (const r of raw) {
      const key = r.toLowerCase();
      if (seen.has(key)) continue;
      next.push(r);
      seen.add(key);
      if (next.length >= max) break;
    }
    onChange(next);
    setDraft('');
  };

  const removeAt = (idx: number) => {
    const next = values.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <Label>{label}</Label>
        <div className="text-xs">
          {values.length}/{max}
        </div>
      </div>

      {values.length ? (
        <div className="flex flex-wrap gap-2">
          {values.map((v, idx) => (
            <Badge key={`${v}-${idx}`} variant="secondary" className="gap-1">
              <span className="max-w-[260px] truncate">{v}</span>
              <button
                type="button"
                className="ml-1 inline-flex items-center rounded hover:opacity-80"
                onClick={() => removeAt(idx)}
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <div className="text-sm">No skills yet.</div>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder || 'Add skills (comma separated)'}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFromDraft();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={addFromDraft} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

type ResumeDocumentRow = {
  id: string;
  candidate_id: string;
  title: string;
  template_id: TemplateId;
  target_role: string | null;
  target_seniority: string | null;
  content_json: ResumeDocContent;
  base_resume_id?: string | null;
  jd_text?: string | null;
  additional_instructions?: string | null;
  linkedin_url?: string | null;
  analysis_json?: any;
  created_at: string;
  updated_at: string;
};

function safeContent(v: any): ResumeDocContent {
  return (v && typeof v === 'object' ? v : {}) as ResumeDocContent;
}

async function getSupabaseFunctionErrorMessage(err: unknown): Promise<string> {
  const anyErr = err as any;
  // Supabase Functions errors often include a Response in err.context
  const ctx = anyErr?.context;
  if (ctx && typeof ctx === 'object' && typeof ctx.status === 'number') {
    try {
      const cloned = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
      if (typeof cloned.json === 'function') {
        const body = await cloned.json();
        const msg = body?.error ? String(body.error) : null;
        return msg ? `${msg} (status ${ctx.status})` : `Edge Function failed (status ${ctx.status})`;
      }
      if (typeof cloned.text === 'function') {
        const t = await cloned.text();
        const msg = t ? String(t) : null;
        return msg ? `${msg.slice(0, 300)} (status ${ctx.status})` : `Edge Function failed (status ${ctx.status})`;
      }
      return `Edge Function failed (status ${ctx.status})`;
    } catch {
      return `Edge Function failed (status ${ctx.status})`;
    }
  }
  return anyErr?.message || 'Edge Function failed';
}

function buildResumeTextFromResumeDoc(doc: ResumeDocContent): string {
  const c = doc.contact || {};
  const tech = doc.skills?.technical || [];
  const soft = doc.skills?.soft || [];
  const exp = doc.experience || [];
  const edu = doc.education || [];
  const certs = doc.certifications || [];

  const isPlaceholder = (v: unknown) => {
    const s = String(v ?? '').trim();
    if (!s) return true;
    const n = s.toLowerCase();
    if (n.includes('not found')) return true;
    if (n === 'n/a' || n === 'na' || n === 'unknown') return true;
    return false;
  };

  const lines: string[] = [];
  if (c.full_name && !isPlaceholder(c.full_name)) lines.push(String(c.full_name));
  const contactLine = [c.location, c.phone, c.email, c.linkedin_url, c.github_url]
    .map((v) => String(v ?? '').trim())
    .filter((v) => v && !isPlaceholder(v))
    .join(' • ');
  if (contactLine) lines.push(contactLine);

  // Avoid Unicode property escapes (\p{L}) for broader browser compatibility (some browsers hard-crash on parse).
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const uniq = (arr: string[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const a of arr.map((x) => String(x || '').trim()).filter(Boolean)) {
      const k = norm(a);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(a.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim());
    }
    return out;
  };

  const buildCoreSkillGroups = (technical: string[], leadership: string[]) => {
    const t = uniq(technical);
    const l = uniq(leadership);
    const groups: Array<{ title: string; items: string[] }> = [];

    const take = (title: string, pred: (s: string) => boolean) => {
      const items = t.filter((s) => pred(s));
      if (items.length) groups.push({ title, items });
      return new Set(items.map((x) => norm(x)));
    };

    const used = new Set<string>();
    const addUsed = (set: Set<string>) => set.forEach((x) => used.add(x));

    addUsed(
      take('Salesforce Platform & CRM', (s) => {
        const n = norm(s);
        return (
          n.includes('salesforce') ||
          n.includes('apex') ||
          n.includes('visualforce') ||
          n.includes('lightning') ||
          n.includes('lwc') ||
          n.includes('soql') ||
          n.includes('sosl') ||
          n.includes('governor') ||
          n.includes('permission') ||
          n.includes('profiles') ||
          n.includes('roles') ||
          n.includes('sfdx') ||
          n.includes('salesforce dx') ||
          n.includes('metadata') ||
          n.includes('bulk api') ||
          n.includes('validation rules') ||
          n.includes('workflows') ||
          n.includes('process flows') ||
          n.includes('administration') ||
          n.includes('crm')
        );
      }),
    );

    addUsed(
      take('Backend & Integration', (s) => {
        const n = norm(s);
        return (
          n.includes('integration') ||
          n.includes('eai') ||
          n.includes('api') ||
          n.includes('rest') ||
          n.includes('soap') ||
          n.includes('oauth') ||
          n.includes('third') ||
          n.includes('web services') ||
          n.includes('batch') ||
          n.includes('asynchronous') ||
          n.includes('event') ||
          n.includes('java') ||
          n.includes('python') ||
          n.includes('node')
        );
      }),
    );

    addUsed(
      take('CI/CD, DevOps & SDLC', (s) => {
        const n = norm(s);
        return (
          n.includes('ci cd') ||
          n.includes('ci/cd') ||
          n.includes('git') ||
          n.includes('jenkins') ||
          n.includes('bitbucket') ||
          n.includes('devops') ||
          n.includes('sdlc') ||
          n.includes('agile') ||
          n.includes('scrum') ||
          n.includes('unit test') ||
          n.includes('integration test') ||
          n.includes('test coverage') ||
          n.includes('code review') ||
          n.includes('defect') ||
          n.includes('documentation')
        );
      }),
    );

    addUsed(
      take('Frontend & UI', (s) => {
        const n = norm(s);
        return (
          n.includes('html') ||
          n.includes('css') ||
          n.includes('javascript') ||
          n.includes('typescript') ||
          n.includes('ui') ||
          n.includes('framework') ||
          n.includes('angular') ||
          n.includes('react')
        );
      }),
    );

    const other = t.filter((s) => !used.has(norm(s)));
    if (other.length) groups.push({ title: 'Other', items: other });

    // Leadership skills are still valuable, but the example formats this as a separate block.
    if (l.length) groups.push({ title: 'Leadership & Execution', items: l });
    return groups;
  };

  if (doc.summary) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push(String(doc.summary));
  }

  if (tech.length || soft.length) {
    lines.push('');
    lines.push('CORE TECHNICAL SKILLS');
    const groups = buildCoreSkillGroups(tech, soft);
    for (const g of groups) {
      lines.push(g.title);
      for (const item of g.items) lines.push(`- ${item}`);
      lines.push('');
    }
  }

  if (exp.length) {
    lines.push('');
    lines.push('EXPERIENCE');
    for (const e of exp) {
      const header = [e.title, e.company].filter(Boolean).join(' — ');
      const meta = [e.start && e.end ? `${e.start} → ${e.end}` : e.start || e.end, e.location].filter(Boolean).join(' • ');
      if (header) lines.push(header);
      if (meta) lines.push(meta);
      const bullets = (e.bullets || []).filter(Boolean);
      for (const b of bullets) {
        lines.push(`- ${String(b)}`);
      }
      lines.push('');
    }
  }

  if (certs.length) {
    lines.push('');
    lines.push('CERTIFICATIONS');
    for (const c of certs.slice(0, 30)) {
      lines.push(`- ${String(c)}`);
    }
  }

  if (edu.length) {
    lines.push('');
    lines.push('EDUCATION');
    for (const e of edu.slice(0, 12)) {
      const row = [e.school, e.degree, e.field, e.year].filter(Boolean).join(' • ');
      if (row) lines.push(`- ${row}`);
    }
  }

  return lines.join('\n').trim();
}

function formatUrlForHeaderDisplay(url: string): string {
  let u = String(url || '').trim();
  if (!u) return '';
  u = u.replace(/^https?:\/\//i, '');
  u = u.replace(/^www\./i, '');
  u = u.replace(/\/$/, '');
  return u.trim();
}

const HEADER_SEP = '  •  ';
const HEADER_PIPE = '   |   ';

function formatPhoneForHeaderDisplay(phone: string): string {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^\d]+/g, '');
  // Handle US-like numbers (10 digits, optionally leading 1)
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw;
}

function ensureHttpUrl(url: string): string {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  // common: linkedin.com/... or github.com/...
  return `https://${u.replace(/^www\./i, '')}`;
}

function normalizeBulletForDedupe(s: string) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/^[•\-\*\u2022]+\s*/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bulletsNearDuplicate(a: string, b: string) {
  const na = normalizeBulletForDedupe(a);
  const nb = normalizeBulletForDedupe(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // substring heuristic catches "same bullet but with a few extra words"
  if (na.length >= 40 && nb.length >= 40) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  const trigrams = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim();
    const out = new Set<string>();
    if (t.length < 12) return out;
    // Character trigrams over a compacted string reduce sensitivity to minor tokenization differences
    const c = t.replace(/\s+/g, '');
    for (let i = 0; i < c.length - 2; i++) out.add(c.slice(i, i + 3));
    return out;
  };
  const triJacc = (sa: Set<string>, sb: Set<string>) => {
    if (!sa.size || !sb.size) return 0;
    let inter = 0;
    for (const x of sa) if (sb.has(x)) inter++;
    return inter / (sa.size + sb.size - inter);
  };
  const ta = new Set(na.split(' ').filter(Boolean));
  const tb = new Set(nb.split(' ').filter(Boolean));
  if (ta.size < 5 || tb.size < 5) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const j = inter / (ta.size + tb.size - inter);
  const tj = triJacc(trigrams(na), trigrams(nb));
  // Word-level catches same semantics; trigram-level catches minor tokenization differences (microservices vs micro services).
  return j >= 0.66 || tj >= 0.86;
}

function normalizeBulletsForExport(bullets: string[]): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const v = String(s || '').trim();
    if (!v) return;
    // Drop label-only lines
    if (/^responsibilities\s*:?$/i.test(v)) return;
    out.push(v);
  };

  for (const raw of Array.isArray(bullets) ? bullets : []) {
    let b = String(raw || '').trim();
    if (!b) continue;
    // Remove common label prefix
    b = b.replace(/^responsibilities\s*:\s*/i, '').trim();
    // Normalize bullets inside a bullet
    b = b.replace(/[•\u2022]/g, '\n• ');

    // If the bullet contains multiple lines, split it.
    const lines = b
      .split(/\n+/g)
      .map((l) => l.replace(/^[•\-\*]+\s*/g, '').trim())
      .filter(Boolean);
    const longEnoughLines = lines.filter((l) => l.length >= 24);
    if (longEnoughLines.length >= 2) {
      for (const l of longEnoughLines) push(l);
      continue;
    }

    // If it's a huge paragraph with many sentences, split into sentence-like bullets.
    if (b.length > 240) {
      const parts = b
        .split(/(?<=[.!?])\s+/g)
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => p.length >= 30);
      if (parts.length >= 2) {
        for (const p of parts.slice(0, 12)) push(p.replace(/[.]+$/g, '').trim());
        continue;
      }
    }

    push(b);
  }

  return out;
}

function sanitizeExperienceForExport(exp: Array<{ company?: any; title?: any; start?: any; end?: any; location?: any; bullets?: any[] }>) {
  const looksLikeSectionLeak = (s: string) => {
    const n = String(s || '').toLowerCase();
    return (
      n.includes('professional experience') ||
      n.includes('core technical skills') ||
      n.includes('professional summary') ||
      n.includes('education') ||
      n.includes('certifications') ||
      n.includes('responsibilities:')
    );
  };

  const cleanField = (v: any, max = 120) =>
    String(v ?? '')
      .replace(/\s+/g, ' ')
      .replace(/[•\u2022]/g, ' ')
      .trim()
      .slice(0, max);

  const out: any[] = [];
  const seen = new Set<string>();
  for (const e0 of Array.isArray(exp) ? exp : []) {
    const rawTitle = String(e0?.title ?? '');
    const rawCompany = String(e0?.company ?? '');

    const title = cleanField(rawTitle, 120);
    const company = cleanField(rawCompany, 120);
    const start = cleanField(e0?.start, 40);
    const end = cleanField(e0?.end, 40);
    const location = cleanField(e0?.location, 80);

    // Drop obvious "section leakage" rows (e.g., company/title contains an entire section blob).
    const headerBlob = `${rawTitle} ${rawCompany}`.trim();
    const tooLong = rawTitle.length > 140 || rawCompany.length > 140 || headerBlob.length > 220;
    if (tooLong && looksLikeSectionLeak(headerBlob)) continue;

    // Normalize + split mega-bullets; then near-dedupe.
    const normalizedBullets = normalizeBulletsForExport(Array.isArray(e0?.bullets) ? e0.bullets : []);
    const bullets: string[] = [];
    for (const b of normalizedBullets) {
      if (!b) continue;
      if (looksLikeSectionLeak(b) && b.length > 80) continue;
      if (bullets.some((eb) => bulletsNearDuplicate(String(eb || ''), b))) continue;
      bullets.push(b);
    }

    if (!title && !company && !bullets.length) continue;

    const key = [title.toLowerCase(), company.toLowerCase(), start.toLowerCase(), end.toLowerCase()].join('|');
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ...e0,
      title: title || undefined,
      company: company || undefined,
      start: start || undefined,
      end: end || undefined,
      location: location || undefined,
      bullets,
    });
  }

  return out;
}

function buildResumeTextFromParsedFacts(parsed: any): string {
  const p: any = parsed && typeof parsed === 'object' ? parsed : {};
  const contact = p.contact && typeof p.contact === 'object' ? p.contact : {};
  const exp = Array.isArray(p.experience) ? p.experience : [];
  const edu = Array.isArray(p.education) ? p.education : [];
  const certs = Array.isArray(p.certifications) ? p.certifications : [];
  const tech = Array.isArray(p.skills?.technical) ? p.skills.technical : Array.isArray(p.technical_skills) ? p.technical_skills : [];
  const soft = Array.isArray(p.skills?.soft) ? p.skills.soft : Array.isArray(p.soft_skills) ? p.soft_skills : [];
  const summary = p.summary || p.professional_summary || '';

  const lines: string[] = [];
  const fullName = String(contact.full_name || p.full_name || '').trim();
  if (fullName) lines.push(fullName);
  const contactLine = [contact.location || p.location, contact.phone || p.phone, contact.email || p.email]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' • ');
  if (contactLine) lines.push(contactLine);

  if (String(summary || '').trim()) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push(String(summary).trim());
  }

  if (tech.length || soft.length) {
    lines.push('');
    lines.push('CORE TECHNICAL SKILLS');
    if (tech.length) lines.push(`Technical: ${tech.map((s: any) => String(s || '').trim()).filter(Boolean).join(', ')}`);
    if (soft.length) lines.push(`Leadership: ${soft.map((s: any) => String(s || '').trim()).filter(Boolean).join(', ')}`);
  }

  if (exp.length) {
    lines.push('');
    lines.push('EXPERIENCE');
    for (const e of exp) {
      const header = [e?.title, e?.company].filter(Boolean).join(' — ');
      const meta = [e?.start && e?.end ? `${e.start} → ${e.end}` : e?.start || e?.end, e?.location].filter(Boolean).join(' • ');
      if (header) lines.push(header);
      if (meta) lines.push(meta);
      const bullets = Array.isArray(e?.bullets) ? e.bullets : [];
      for (const b of bullets.map((x: any) => String(x || '').trim()).filter(Boolean)) {
        lines.push(`- ${b}`);
      }
      lines.push('');
    }
  }

  if (certs.length) {
    lines.push('');
    lines.push('CERTIFICATIONS');
    for (const c of certs.map((x: any) => String(x || '').trim()).filter(Boolean)) lines.push(`- ${c}`);
  }

  if (edu.length) {
    lines.push('');
    lines.push('EDUCATION');
    for (const e of edu) {
      const row = [e?.school, e?.degree, e?.field, e?.year].filter(Boolean).join(' • ');
      if (row) lines.push(`- ${row}`);
    }
  }

  return lines.join('\n').trim();
}

type LineDiffOp = { type: 'equal' | 'add' | 'del'; line: string };

function diffLines(beforeText: string, afterText: string): { ops: LineDiffOp[]; added: string[]; removed: string[] } {
  const toLines = (t: string) =>
    String(t || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => l.replace(/\s+$/g, ''))
      .filter((l) => l.trim().length > 0);

  const a = toLines(beforeText);
  const b = toLines(afterText);

  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops: LineDiffOp[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', line: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add', line: b[j - 1] });
      j -= 1;
    } else if (i > 0) {
      ops.push({ type: 'del', line: a[i - 1] });
      i -= 1;
    }
  }
  ops.reverse();

  const added = ops.filter((o) => o.type === 'add').map((o) => o.line);
  const removed = ops.filter((o) => o.type === 'del').map((o) => o.line);
  return { ops, added, removed };
}

async function generateDiffPdfBlob(opts: { title: string; beforeText: string; afterText: string }): Promise<Blob> {
  const { title, beforeText, afterText } = opts;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [612, 792];
  const margin = 54;
  const contentWidth = pageSize[0] - margin * 2;

  const winAnsiSafe = (s: string) => String(s || '').replace(/→/g, '-').replace(/•/g, '*');

  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed >= margin) return;
    page = pdf.addPage(pageSize);
    y = pageSize[1] - margin;
  };

  const wrap = (t: string, size: number) => {
    const words = winAnsiSafe(t).split(/\s+/g).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= contentWidth) cur = test;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const draw = (t: string, size: number, bold = false, color = rgb(0, 0, 0)) => {
    for (const line of wrap(t, size)) {
      ensureSpace(size + 6);
      page.drawText(line, { x: margin, y, size, font: bold ? fontBold : font, color });
      y -= size + 4;
    }
  };

  const { added, removed } = diffLines(beforeText, afterText);

  draw(`${title || 'Resume'} — Change Report`, 18, true);
  draw(`Added lines: ${added.length}  •  Removed lines: ${removed.length}`, 11, false, rgb(0.2, 0.2, 0.2));
  y -= 8;

  draw('ADDED', 12, true);
  for (const l of added.slice(0, 200)) draw(`+ ${l}`, 10, false);
  y -= 10;

  draw('REMOVED', 12, true);
  for (const l of removed.slice(0, 200)) draw(`- ${l}`, 10, false);

  const pdfBytes = await pdf.save();
  // Force a concrete ArrayBuffer-backed Uint8Array (avoids SharedArrayBuffer typing).
  const safeBytes = new Uint8Array(pdfBytes);
  return new Blob([safeBytes], { type: 'application/pdf' });
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizeSkillItemsForExport(items: string[], limit: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const s = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

function splitExposureSkills(items: string[]) {
  const core: string[] = [];
  const exposure: string[] = [];
  for (const raw of items || []) {
    const s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) continue;
    if (/\(\s*exposure\s*\)\s*$/i.test(s)) exposure.push(s.replace(/\(\s*exposure\s*\)\s*$/i, '').trim());
    else core.push(s);
  }
  return { core, exposure };
}

function skillsToWrappedLines(items: string[], limit: number, opts?: { maxItemsPerLine?: number; maxCharsPerLine?: number }) {
  const maxItemsPerLine = Math.max(3, Math.min(14, opts?.maxItemsPerLine ?? 8));
  const maxCharsPerLine = Math.max(40, Math.min(140, opts?.maxCharsPerLine ?? 88));

  const cleaned = normalizeSkillItemsForExport(items, limit);
  const lines: string[] = [];
  let cur: string[] = [];
  let curLen = 0;

  const flush = () => {
    if (!cur.length) return;
    lines.push(cur.join(' • '));
    cur = [];
    curLen = 0;
  };

  for (const item of cleaned) {
    const addLen = (cur.length ? 3 : 0) + item.length; // " • "
    const tooMany = cur.length >= maxItemsPerLine;
    const tooLong = curLen + addLen > maxCharsPerLine;
    if ((tooMany || tooLong) && cur.length) flush();
    cur.push(item);
    curLen += addLen;
    if (lines.length >= 6) break; // avoid huge skill blocks
  }
  flush();
  return lines;
}

function formatSkillsInline(items: string[], limit: number) {
  // Back-compat helper (used elsewhere). Prefer skillsToWrappedLines for exports.
  return normalizeSkillItemsForExport(items, limit).join(' • ');
}

function looksJuniorOrNonLeadershipTitle(t: string) {
  const s = String(t || '').toLowerCase();
  if (!s.trim()) return false;
  return (
    /\b(junior|jr\.?|entry|intern|associate)\b/.test(s) ||
    /\b(data scientist|data analyst|analyst|engineer|developer)\b/.test(s) && !/\b(lead|manager|director|principal|staff|head)\b/.test(s)
  );
}

function groupTechnicalSkills(items: string[]) {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9+.#/ -]+/g, ' ').replace(/\s+/g, ' ').trim();
  const cleaned = normalizeSkillItemsForExport(items, 200);

  const groups: Array<{ title: string; items: string[] }> = [];
  const used = new Set<string>();
  const pushGroup = (title: string, pred: (s: string) => boolean) => {
    const picked = cleaned.filter((s) => !used.has(norm(s)) && pred(s));
    if (!picked.length) return;
    for (const p of picked) used.add(norm(p));
    groups.push({ title, items: picked });
  };

  pushGroup('Languages', (s) => {
    const n = norm(s);
    return ['python', 'r', 'sql', 'scala', 'java', 'c++', 'c#', 'javascript', 'typescript'].some((k) => n === k || n.includes(`${k} `) || n.includes(` ${k}`));
  });
  pushGroup('Data Manipulation', (s) => {
    const n = norm(s);
    return n.includes('pandas') || n.includes('numpy') || n.includes('data cleaning') || n.includes('preprocess') || n.includes('data manipulation');
  });
  pushGroup('Machine Learning & Statistics', (s) => {
    const n = norm(s);
    return (
      n.includes('machine learning') ||
      n.includes('ml') ||
      n.includes('predictive') ||
      n.includes('model') ||
      n.includes('hypothesis') ||
      n.includes('statistical') ||
      n.includes('scikit') ||
      n.includes('sklearn') ||
      n.includes('tensorflow') ||
      n.includes('pytorch') ||
      n.includes('xgboost') ||
      n.includes('lightgbm')
    );
  });
  pushGroup('Data Engineering', (s) => {
    const n = norm(s);
    return (
      n.includes('etl') ||
      n.includes('data pipeline') ||
      n.includes('data pipelines') ||
      n.includes('data processing') ||
      n.includes('spark') ||
      n.includes('hadoop') ||
      n.includes('kafka') ||
      n.includes('airflow') ||
      n.includes('dbt') ||
      n.includes('warehouse') ||
      n.includes('lake')
    );
  });
  pushGroup('Cloud & Platforms', (s) => {
    const n = norm(s);
    return (
      n.includes('aws') ||
      n.includes('azure') ||
      n.includes('gcp') ||
      n.includes('lambda') ||
      n.includes('s3') ||
      n.includes('emr') ||
      n.includes('iam') ||
      n.includes('cloudwatch') ||
      n.includes('step functions') ||
      n.includes('secrets manager') ||
      n.includes('serverless')
    );
  });
  pushGroup('Visualization & BI', (s) => {
    const n = norm(s);
    return n.includes('dashboard') || n.includes('visual') || n.includes('power bi') || n.includes('tableau') || n.includes('matplotlib') || n.includes('seaborn') || n.includes('plotly');
  });
  pushGroup('Governance, Security & Compliance', (s) => {
    const n = norm(s);
    return n.includes('governance') || n.includes('compliance') || n.includes('data integrity') || n.includes('data security') || n.includes('privacy') || n.includes('risk');
  });
  pushGroup('DevOps / MLOps', (s) => {
    const n = norm(s);
    return n.includes('mlops') || n.includes('ci/cd') || n.includes('ci cd') || n.includes('git') || n.includes('docker') || n.includes('kubernetes');
  });

  const other = cleaned.filter((s) => !used.has(norm(s)));
  if (other.length) groups.push({ title: 'Other', items: other });
  return groups;
}

function buildDocxParagraphsForResume(doc: ResumeDocContent, opts?: { targetTitle?: string }) {
  // DOCX spacing (twips). Keep consistent visual rhythm across skills + bullets.
  // 30 twips ≈ 1.5pt. We use this as our “line gap” standard.
  // Increase bullet gap by +3pt (60 twips) vs prior.
  const DOCX_LINE_GAP = 90;
  const normalizeName = (raw: string) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    // If the name is spaced letter-by-letter, collapse *within words* while preserving word boundaries.
    // Example: "R a v i  Y e l u r u" -> "Ravi Yeluru" (note the preserved space).
    const parts = s.split(/\s+/g).filter(Boolean);
    const singleLetters = parts.filter((p) => /^[A-Za-z]$/.test(p)).length;
    const looksLetterSpaced = parts.length >= 6 && singleLetters / parts.length >= 0.9;
    if (!looksLetterSpaced) return s.replace(/\s+/g, ' ').trim();

    const marker = '\u0000';
    let out = s.replace(/\s{2,}/g, marker); // preserve “real” word breaks
    out = out.replace(/([A-Za-z])\s+(?=[A-Za-z])/g, '$1'); // remove spaces between letters
    out = out.split(marker).join(' ');
    return out.replace(/\s+/g, ' ').trim();
  };

  const cleanContact = (cIn: any) => {
    const c0 = (cIn && typeof cIn === 'object' ? cIn : {}) as any;
    const out: any = { ...c0 };
    out.full_name = normalizeName(out.full_name || '');
    const email = String(out.email || '').trim();
    out.email = email.includes('@') ? email : '';
    const phone = String(out.phone || '').trim();
    out.phone = /[0-9]{7,}/.test(phone.replace(/[^\d]+/g, '')) ? phone : '';
    const li = String(out.linkedin_url || '').trim();
    out.linkedin_url = li.includes('linkedin.com') ? li : '';
    const gh = String(out.github_url || '').trim();
    out.github_url = gh.includes('github.com') ? gh : '';
    const loc = String(out.location || '').trim();
    out.location = loc.length >= 2 && loc.length <= 80 ? loc : '';
    return out as ResumeDocContent['contact'];
  };

  const c = cleanContact(doc.contact || {});
  const tech = doc.skills?.technical || [];
  const soft = doc.skills?.soft || [];
  const dedupeBullets = (bullets: string[]) => {
    const out: string[] = [];
    for (const b of normalizeBulletsForExport(bullets)) {
      if (!b) continue;
      if (out.some((eb) => bulletsNearDuplicate(String(eb || ''), b))) continue;
      out.push(b);
    }
    return out;
  };

  const exp = sanitizeExperienceForExport(doc.experience || []).map((e: any) => ({
    ...e,
    bullets: dedupeBullets(Array.isArray(e?.bullets) ? e.bullets : []),
  }));
  const edu = doc.education || [];
  const certs = doc.certifications || [];

  const isPlaceholder = (v: unknown) => {
    const s = String(v ?? '').trim();
    if (!s) return true;
    const n = s.toLowerCase();
    if (n.includes('not found')) return true;
    if (n === 'n/a' || n === 'na' || n === 'unknown') return true;
    return false;
  };

  const run = (text: string, opts?: { bold?: boolean; size?: number; color?: string }) =>
    new TextRun({
      text,
      bold: opts?.bold,
      size: opts?.size, // half-points (e.g. 22 = 11pt)
      color: opts?.color,
      font: 'Outfit',
    });

  const headerName = String(c.full_name || '').trim() || 'Resume';
  const roleTopRight = String(opts?.targetTitle || '').trim() ? String(opts?.targetTitle || '').trim().toUpperCase() : '';
  const header: Paragraph[] = [
    new Paragraph({
      children: roleTopRight
        ? [
            run(headerName, { bold: true, size: 36, color: '000000' }),
            new TextRun({ text: '\t', font: 'Outfit' }),
            // +1pt (2 half-points)
            run(roleTopRight, { bold: true, size: 20, color: '000000' }),
          ]
        : [run(headerName, { bold: true, size: 36, color: '000000' })],
      tabStops: roleTopRight ? [{ type: TabStopType.RIGHT, position: convertInchesToTwip(7.0) }] : undefined,
      spacing: { after: 60 },
    }),
  ];

  const phoneDisp = c.phone ? formatPhoneForHeaderDisplay(c.phone) : '';
  const emailDisp = String(c.email || '').trim();
  const liUrl = c.linkedin_url ? ensureHttpUrl(String(c.linkedin_url || '').trim()) : '';
  const ghUrl = c.github_url ? ensureHttpUrl(String(c.github_url || '').trim()) : '';

  // Single-line contact row: phone | email | LinkedIn | GitHub (only show links if present).
  const contactChildren: any[] = [];
  const pushSep = () => contactChildren.push(run(HEADER_PIPE, { size: 20, color: '000000' }));
  const linkRun = (t: string) =>
    new TextRun({
      text: t,
      size: 20,
      color: '000000',
      underline: {},
      font: 'Outfit',
      style: 'Hyperlink',
    });

  if (phoneDisp && !isPlaceholder(phoneDisp)) contactChildren.push(run(phoneDisp, { size: 20, color: '000000' }));
  if (emailDisp && !isPlaceholder(emailDisp)) {
    if (contactChildren.length) pushSep();
    contactChildren.push(run(emailDisp, { size: 20, color: '000000' }));
  }
  if (liUrl) {
    if (contactChildren.length) pushSep();
    contactChildren.push(new ExternalHyperlink({ link: liUrl, children: [linkRun('LinkedIn')] }));
  }
  if (ghUrl) {
    if (contactChildren.length) pushSep();
    contactChildren.push(new ExternalHyperlink({ link: ghUrl, children: [linkRun('GitHub')] }));
  }

  if (contactChildren.length) header.push(new Paragraph({ children: contactChildren, spacing: { after: 120 } }));

  const sectionHeading = (t: string) =>
    new Paragraph({
      // Match PDF look: thin rule ABOVE the heading + comfortable spacing after.
      // +1pt
      children: [run(String(t || '').toUpperCase(), { bold: true, size: 21, color: '000000' })],
      spacing: { before: 180, after: 120 },
      border: {
        top: { style: BorderStyle.SINGLE, size: 6, color: 'E6E6E6', space: 1 },
      },
    });

  const body: Paragraph[] = [];

  // Avoid Unicode property escapes (\p{L}) for broader browser compatibility (some browsers hard-crash on parse).
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const uniq = (arr: string[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const a of arr.map((x) => String(x || '').trim()).filter(Boolean)) {
      const k = norm(a);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(a.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim());
    }
    return out;
  };
  const buildCoreSkillGroups = (technical: string[], leadership: string[]) => {
    const t = uniq(technical);
    const l = uniq(leadership);
    const groups: Array<{ title: string; items: string[] }> = [];
    const take = (title: string, pred: (s: string) => boolean) => {
      const items = t.filter((s) => pred(s));
      if (items.length) groups.push({ title, items });
      return new Set(items.map((x) => norm(x)));
    };
    const used = new Set<string>();
    const addUsed = (set: Set<string>) => set.forEach((x) => used.add(x));

    addUsed(
      take('Salesforce Platform & CRM', (s) => {
        const n = norm(s);
        return (
          n.includes('salesforce') ||
          n.includes('apex') ||
          n.includes('visualforce') ||
          n.includes('lightning') ||
          n.includes('lwc') ||
          n.includes('soql') ||
          n.includes('sosl') ||
          n.includes('governor') ||
          n.includes('permission') ||
          n.includes('profiles') ||
          n.includes('roles') ||
          n.includes('sfdx') ||
          n.includes('salesforce dx') ||
          n.includes('metadata') ||
          n.includes('bulk api') ||
          n.includes('validation rules') ||
          n.includes('workflows') ||
          n.includes('process flows') ||
          n.includes('administration') ||
          n.includes('crm')
        );
      }),
    );
    addUsed(
      take('Backend & Integration', (s) => {
        const n = norm(s);
        return (
          n.includes('integration') ||
          n.includes('eai') ||
          n.includes('api') ||
          n.includes('rest') ||
          n.includes('soap') ||
          n.includes('oauth') ||
          n.includes('third') ||
          n.includes('web services') ||
          n.includes('batch') ||
          n.includes('asynchronous') ||
          n.includes('event') ||
          n.includes('java') ||
          n.includes('python') ||
          n.includes('node')
        );
      }),
    );
    addUsed(
      take('CI/CD, DevOps & SDLC', (s) => {
        const n = norm(s);
        return (
          n.includes('ci cd') ||
          n.includes('ci/cd') ||
          n.includes('git') ||
          n.includes('jenkins') ||
          n.includes('bitbucket') ||
          n.includes('devops') ||
          n.includes('sdlc') ||
          n.includes('agile') ||
          n.includes('scrum') ||
          n.includes('unit test') ||
          n.includes('integration test') ||
          n.includes('test coverage') ||
          n.includes('code review') ||
          n.includes('defect') ||
          n.includes('documentation')
        );
      }),
    );
    addUsed(
      take('Frontend & UI', (s) => {
        const n = norm(s);
        return (
          n.includes('html') ||
          n.includes('css') ||
          n.includes('javascript') ||
          n.includes('typescript') ||
          n.includes('ui') ||
          n.includes('framework') ||
          n.includes('angular') ||
          n.includes('react')
        );
      }),
    );
    const other = t.filter((s) => !used.has(norm(s)));
    if (other.length) groups.push({ title: 'Other', items: other });
    if (l.length) groups.push({ title: 'Leadership & Execution', items: l });
    return groups;
  };

  if (doc.summary && String(doc.summary).trim()) {
    body.push(sectionHeading('Professional Summary'));
    for (const line of String(doc.summary).split(/\n+/g).map((l) => l.trim()).filter(Boolean)) {
      body.push(
        new Paragraph({
          children: [run(line, { size: 22, color: '000000' })],
          spacing: { after: 90, line: 276 },
        }),
      );
    }
  }

  if (tech.length || soft.length) {
    body.push(sectionHeading('Core Technical Skills'));
    // Logical grouping (avoids AI-looking blob).
    for (const g of groupTechnicalSkills(tech).slice(0, 8)) {
      body.push(
        new Paragraph({
          children: [run(g.title, { bold: true, size: 24, color: '000000' })], // +1pt
          spacing: { after: 20 },
        }),
      );
      const lines = skillsToWrappedLines(g.items, 60, { maxItemsPerLine: 6, maxCharsPerLine: 72 });
      for (const l of lines) {
        body.push(
          new Paragraph({
            children: [run(l, { size: 21, color: '000000' })],
            spacing: { after: 30, line: 252 },
          }),
        );
      }
      body.push(new Paragraph({ text: '', spacing: { after: 40 } }));
    }

    const hideSoft =
      looksJuniorOrNonLeadershipTitle(String(opts?.targetTitle || '')) ||
      normalizeSkillItemsForExport(soft, 50).length < 4;

    if (!hideSoft && soft.length) {
      body.push(
        new Paragraph({
          children: [run('Professional Strengths', { bold: true, size: 24, color: '000000' })], // +1pt
          spacing: { after: 20 },
        }),
      );
      for (const l of skillsToWrappedLines(soft, 40, { maxItemsPerLine: 6, maxCharsPerLine: 72 })) {
        body.push(
          new Paragraph({
            children: [run(l, { size: 21, color: '000000' })],
            spacing: { after: 30, line: 252 },
          }),
        );
      }
      body.push(new Paragraph({ text: '', spacing: { after: 40 } }));
    }
  }

  if (exp.length) {
    body.push(sectionHeading('Professional Experience'));
    for (const e of exp) {
      const line = [e.title, e.company].filter(Boolean).join(' — ');
      const dates = [e.start, e.end].filter(Boolean).join(' - ');
      const meta = [dates, e.location].filter(Boolean).join(' • ');

      if (line)
        body.push(
          new Paragraph({
            children: [run(line, { bold: true, size: 24, color: '000000' })], // +1pt
            spacing: { after: 60 }, // extra line break after company/role line
          }),
        );
      if (meta)
        body.push(
          new Paragraph({
            children: [run(meta, { size: 22, color: '000000' })], // +1pt
            spacing: { after: 120 }, // extra line break after timeline/meta line
          }),
        );

      const bullets = Array.isArray(e.bullets) ? e.bullets : [];
      for (const b of bullets) {
        body.push(
          new Paragraph({
            children: [run(b, { size: 21, color: '000000' })],
            bullet: { level: 0 },
            indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.15) },
            spacing: { after: DOCX_LINE_GAP, line: 252 }, // match skills line spacing
          }),
        );
      }

      body.push(new Paragraph({ text: '', spacing: { after: 90 } })); // spacing
    }
  }

  if (certs.length) {
    body.push(sectionHeading('Certifications'));
    for (const c of certs.map((x) => String(x || '').trim()).filter(Boolean)) {
      body.push(
        new Paragraph({
          children: [run(c, { size: 21, color: '000000' })],
          bullet: { level: 0 },
          indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.15) },
          spacing: { after: DOCX_LINE_GAP, line: 252 }, // match skills line spacing
        }),
      );
    }
  }

  if (edu.length) {
    body.push(sectionHeading('Education'));
    for (const e of edu) {
      const line = [e.degree, e.field].filter(Boolean).join(', ');
      const meta = [e.school, e.year].filter(Boolean).join(' • ');
      if (meta)
        body.push(
          new Paragraph({
            children: [run(meta, { bold: true, size: 21, color: '000000' })],
            spacing: { after: 30 },
          }),
        );
      if (line)
        body.push(
          new Paragraph({
            children: [run(line, { size: 21, color: '000000' })],
            spacing: { after: 90 },
          }),
        );
    }
  }

  return { header, body };
}

async function generateDocxBlob(title: string, tpl: TemplateId, content: ResumeDocContent): Promise<Blob> {
  const { header, body } = buildDocxParagraphsForResume(content, { targetTitle: title });
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Outfit', size: 22, color: '000000' },
          // Match PDF density a bit closer.
          paragraph: { spacing: { line: 252 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
            },
          },
        },
        children: [...header, ...body],
      },
    ],
  });
  return await Packer.toBlob(doc);
}

async function generatePdfBlob(title: string, doc: ResumeDocContent): Promise<Blob> {
  const pdf = await PDFDocument.create();
  // Enable embedding custom fonts with full Unicode support.
  pdf.registerFontkit(fontkit as any);

  const normalizeName = (raw: string) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    const parts = s.split(/\s+/g).filter(Boolean);
    const singleLetters = parts.filter((p) => /^[A-Za-z]$/.test(p)).length;
    const looksLetterSpaced = parts.length >= 6 && singleLetters / parts.length >= 0.9;
    if (!looksLetterSpaced) return s.replace(/\s+/g, ' ').trim();

    const marker = '\u0000';
    let out = s.replace(/\s{2,}/g, marker);
    out = out.replace(/([A-Za-z])\s+(?=[A-Za-z])/g, '$1');
    out = out.split(marker).join(' ');
    return out.replace(/\s+/g, ' ').trim();
  };

  const cleanContact = (cIn: any) => {
    const c0 = (cIn && typeof cIn === 'object' ? cIn : {}) as any;
    const out: any = { ...c0 };
    out.full_name = normalizeName(out.full_name || '');
    const email = String(out.email || '').trim();
    out.email = email.includes('@') ? email : '';
    const phone = String(out.phone || '').trim();
    out.phone = /[0-9]{7,}/.test(phone.replace(/[^\d]+/g, '')) ? phone : '';
    const li = String(out.linkedin_url || '').trim();
    out.linkedin_url = li.includes('linkedin.com') ? li : '';
    const gh = String(out.github_url || '').trim();
    out.github_url = gh.includes('github.com') ? gh : '';
    const loc = String(out.location || '').trim();
    out.location = loc.length >= 2 && loc.length <= 80 ? loc : '';
    return out as ResumeDocContent['contact'];
  };

  const dedupeBullets = (bullets: string[]) => {
    const out: string[] = [];
    for (const b of normalizeBulletsForExport(bullets)) {
      if (!b) continue;
      if (out.some((eb) => bulletsNearDuplicate(String(eb || ''), b))) continue;
      out.push(b);
    }
    return out;
  };

  // Font strategy:
  // - Body text uses standard Helvetica for darker/crisper appearance across PDF renderers.
  // - Headings + name use embedded Outfit for brand/style consistency.
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const bodyFontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let displayFont = bodyFontBold;
  let displayFontBold = bodyFontBold;
  let usingWinAnsiFallback = true;
  try {
    const bytes = new Uint8Array(await (await fetch(outfitFontUrl)).arrayBuffer());
    const outfit = await pdf.embedFont(bytes, { subset: true });
    displayFont = outfit;
    // pdf-lib doesn't provide variable weight selection; we simulate bold by drawing twice in drawParagraph().
    displayFontBold = outfit;
    usingWinAnsiFallback = false;
  } catch {
    // keep Helvetica fallbacks
  }

  const pageSize: [number, number] = [612, 792]; // US Letter
  const margin = 54; // 0.75"
  const contentWidth = pageSize[0] - margin * 2;

  // Darker palette (prints crisper; avoids “light gray glossy” look).
  const PDF_COLOR = {
    text: rgb(0, 0, 0),
    muted: rgb(0, 0, 0),
    meta: rgb(0, 0, 0),
    rule: rgb(0.82, 0.82, 0.82),
  };

  // Keep consistent spacing between lines/bullets (matches the Skills group rhythm).
  // Increase bullet gap by +3pt vs prior.
  const PDF_LINE_GAP = 5; // points

  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed >= margin) return;
    page = pdf.addPage(pageSize);
    y = pageSize[1] - margin;
  };

  const drawLine = () => {
    ensureSpace(14);
    page.drawLine({
      start: { x: margin, y: y - 4 },
      end: { x: pageSize[0] - margin, y: y - 4 },
      thickness: 0.7,
      color: PDF_COLOR.rule,
    });
    y -= 14;
  };

  const winAnsiSafe = (s: string) => {
    // Body text uses StandardFonts.Helvetica which is WinAnsi encoded, so we must never
    // pass characters like U+2192 (→) through to pdf-lib drawText() or it will throw.
    // Keep output readable with ASCII fallbacks.
    const out = String(s || '').replace(/→/g, '-');
    // Only force bullet fallback when we're fully in WinAnsi fallback mode.
    return usingWinAnsiFallback ? out.replace(/•/g, '*') : out;
  };

  const wrapLines = (text: string, size: number, bold = false) => {
    const f = bold ? displayFontBold : bodyFont;
    const words = winAnsiSafe(String(text || '')).split(/\s+/g).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      const width = f.widthOfTextAtSize(test, size);
      if (width <= contentWidth) cur = test;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const drawTextInkBoost = (t: string, x: number, y0: number, size: number, usedFont: any, color: any, isBold: boolean) => {
    const text = winAnsiSafe(t);
    page.drawText(text, { x, y: y0, size, font: usedFont, color });

    // When using embedded Unicode fonts (Outfit), text can look “gray” due to thin glyphs + AA.
    // Force visual weight by overdrawing with tiny offsets.
    if (!usingWinAnsiFallback) {
      if (isBold) {
        // Subtle boost only (avoid “inky” look).
        page.drawText(text, { x: x + 0.24, y: y0, size, font: usedFont, color });
        page.drawText(text, { x: x + 0.48, y: y0, size, font: usedFont, color });
      }
      return;
    }

    // Standard fonts (Helvetica) are usually fine; add a subtle overdraw for bold lines.
    if (isBold) page.drawText(text, { x: x + 0.22, y: y0, size, font: usedFont, color });
  };

  const drawParagraph = (text: string, size = 10.5, bold = false, color = PDF_COLOR.text) => {
    const lines = wrapLines(text, size, bold);
    for (const line of lines) {
      ensureSpace(size + 4);
      const usedFont = bold ? displayFontBold : bodyFont;
      drawTextInkBoost(line, margin, y, size, usedFont, color, bold);
      y -= size + 3;
    }
  };

  const sectionHeading = (t: string) => {
    y -= 6;
    drawLine();
    ensureSpace(18);
    // +1pt
    drawTextInkBoost(String(t || '').toUpperCase(), margin, y, 10.5, displayFontBold, PDF_COLOR.meta, true);
    // Extra line break after section heading (readability).
    y -= 22;
  };

  const c = cleanContact(doc.contact || {});
  const name = String(c.full_name || title || 'Resume').trim();
  ensureSpace(40);
  drawTextInkBoost(name, margin, y, 20, displayFontBold, PDF_COLOR.text, true);

  // Target role/title (ALL CAPS) on the top-right, aligned with the name line.
  const roleUpper = String(title || '').trim() ? String(title || '').trim().toUpperCase() : '';
  if (roleUpper) {
    const maxWidth = contentWidth * 0.55;
    let size = 11; // +1pt
    let text = roleUpper;
    const measure = (t: string, s: number) => displayFontBold.widthOfTextAtSize(winAnsiSafe(t), s);
    while (measure(text, size) > maxWidth && size > 8) size -= 0.5;
    if (measure(text, size) > maxWidth) {
      let t = text;
      while (t.length > 10 && measure(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
      text = `${t}...`;
    }
    const w = measure(text, size);
    drawTextInkBoost(text, margin + contentWidth - w, y, size, displayFontBold, PDF_COLOR.text, true);
  }
  y -= 26;

  // Single-line contact row: phone | email | LinkedIn | GitHub (only show links if present)
  ensureSpace(16);
  const contactSize = 10;
  let xCursor = margin;

  const drawInlineSep = () => {
    const sepText = winAnsiSafe(HEADER_PIPE);
    page.drawText(sepText, { x: xCursor, y, size: contactSize, font: bodyFont, color: PDF_COLOR.meta });
    xCursor += bodyFont.widthOfTextAtSize(sepText, contactSize);
  };

  const drawInlineText = (txt: string) => {
    const s = winAnsiSafe(String(txt || '').trim());
    if (!s) return;
    page.drawText(s, { x: xCursor, y, size: contactSize, font: bodyFont, color: PDF_COLOR.meta });
    xCursor += bodyFont.widthOfTextAtSize(s, contactSize);
  };

  const drawLink = (label: string, url: string, size = 10) => {
    const text = winAnsiSafe(label);
    const usedFont = bodyFont;
    const uri = ensureHttpUrl(String(url || '').trim());
    page.drawText(text, { x: xCursor, y, size, font: usedFont, color: PDF_COLOR.meta });
    // underline
    const w = usedFont.widthOfTextAtSize(text, size);
    page.drawLine({ start: { x: xCursor, y: y - 1 }, end: { x: xCursor + w, y: y - 1 }, thickness: 0.6, color: PDF_COLOR.meta });
    // Real link annotation (clickable)
    try {
      if (uri) {
        const ctx = (pdf as any).context;
        const rect = ctx.obj([xCursor, y - 2, xCursor + w, y + size]);
        const annot = ctx.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Link'),
          Rect: rect,
          Border: ctx.obj([0, 0, 0]),
          A: ctx.obj({ S: PDFName.of('URI'), URI: PDFString.of(uri) }),
        });
        const ref = ctx.register(annot);
        // @ts-ignore
        page.node.addAnnot(ref);
      }
    } catch {
      // non-fatal
    }

    xCursor += w;
  };

  const phoneDisp = c.phone ? formatPhoneForHeaderDisplay(String(c.phone)) : '';
  const emailDisp = String(c.email || '').trim();
  const liUrl = c.linkedin_url ? ensureHttpUrl(String(c.linkedin_url)) : '';
  const ghUrl = c.github_url ? ensureHttpUrl(String(c.github_url)) : '';

  let any = false;
  if (phoneDisp) {
    drawInlineText(phoneDisp);
    any = true;
  }
  if (emailDisp) {
    if (any) drawInlineSep();
    drawInlineText(emailDisp);
    any = true;
  }
  if (liUrl) {
    if (any) drawInlineSep();
    drawLink('LinkedIn', liUrl, contactSize);
    any = true;
  }
  if (ghUrl) {
    if (any) drawInlineSep();
    drawLink('GitHub', ghUrl, contactSize);
    any = true;
  }

  y -= 13;

  const summary = String(doc.summary || '').trim();
  if (summary) {
    sectionHeading('Professional Summary');
    for (const block of summary.split(/\n+/g).map((s) => s.trim()).filter(Boolean)) {
      drawParagraph(block, 10.6, false, PDF_COLOR.text);
      y -= 2;
    }
  }

  const tech = doc.skills?.technical || [];
  const soft = doc.skills?.soft || [];
  if (tech.length || soft.length) {
    sectionHeading('Core Technical Skills');
    for (const g of groupTechnicalSkills(tech).slice(0, 8)) {
      drawParagraph(g.title, 11.6, true, PDF_COLOR.text); // +1pt
      y -= 2;
      for (const l of skillsToWrappedLines(g.items, 60, { maxItemsPerLine: 6, maxCharsPerLine: 72 })) {
        drawParagraph(l, 10.4, false, PDF_COLOR.muted);
        y -= 2;
      }
      y -= 6;
    }

    const hideSoft =
      looksJuniorOrNonLeadershipTitle(String(title || '')) ||
      normalizeSkillItemsForExport(soft, 50).length < 4;

    if (!hideSoft && soft.length) {
      drawParagraph('Professional Strengths', 11.6, true, PDF_COLOR.text); // +1pt
      y -= 2;
      for (const l of skillsToWrappedLines(soft, 40, { maxItemsPerLine: 6, maxCharsPerLine: 72 })) {
        drawParagraph(l, 10.4, false, PDF_COLOR.muted);
        y -= 2;
      }
      y -= 6;
    }
  }

  const exp = sanitizeExperienceForExport(doc.experience || []).map((e: any) => ({
    ...e,
    bullets: dedupeBullets(Array.isArray(e?.bullets) ? e.bullets : []),
  }));
  if (exp.length) {
    sectionHeading('Professional Experience');
    for (const e of exp) {
      const role = [e.title, e.company].filter(Boolean).join(' — ');
      const dates = [e.start, e.end].filter(Boolean).join(' - ');
      const meta = [dates, e.location].filter(Boolean).join(' • ');
      if (role) drawParagraph(role, 11.9, true, PDF_COLOR.text); // +1pt
      // Line break after company/role line.
      if (role) y -= 3;
      if (meta) drawParagraph(meta, 10.8, false, PDF_COLOR.meta); // +1pt
      // Line break after timeline/meta line (before bullets).
      if (meta) y -= 6;
      const bullets = Array.isArray(e.bullets) ? e.bullets : [];
      for (const b of bullets.map((x) => String(x || '').trim()).filter(Boolean)) {
        drawParagraph(`• ${b}`, 10.4, false, PDF_COLOR.muted);
        // ~3pt gap between bullets.
        y -= PDF_LINE_GAP;
      }
      y -= 6;
    }
  }

  const certs = doc.certifications || [];
  if (certs.length) {
    sectionHeading('Certifications');
    for (const c0 of certs.map((x) => String(x || '').trim()).filter(Boolean)) {
      drawParagraph(`• ${c0}`, 10.4, false, PDF_COLOR.muted);
      y -= PDF_LINE_GAP;
    }
  }

  const edu = doc.education || [];
  if (edu.length) {
    sectionHeading('Education');
    for (const e of edu) {
      const row = [e.school, e.degree, e.field, e.year].filter(Boolean).join(' • ');
      if (row) {
        drawParagraph(`• ${row}`, 10.4, false, PDF_COLOR.muted);
        y -= PDF_LINE_GAP;
      }
    }
  }

  const bytes = await pdf.save();
  const safeBytes = new Uint8Array(bytes);
  return new Blob([safeBytes], { type: 'application/pdf' });
}

export default function ResumeWorkspace() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [candidateProfileRow, setCandidateProfileRow] = useState<any | null>(null);
  const [docs, setDocs] = useState<ResumeDocumentRow[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState<string>('');
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);

  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedBaseResumeId, setSelectedBaseResumeId] = useState<string>('');
  const [targetTitle, setTargetTitle] = useState<string>('');
  const [jdText, setJdText] = useState<string>(''); // used when pasting a custom JD

  // --- Change diff (base resume vs current workspace doc) ---
  const [diffBaseText, setDiffBaseText] = useState<string>('');
  const [diffBaseLabel, setDiffBaseLabel] = useState<string>('');
  const [diffBaseLoading, setDiffBaseLoading] = useState<boolean>(false);

  const contactFallback = useMemo(() => {
    const cp = candidateProfileRow && typeof candidateProfileRow === 'object' ? candidateProfileRow : {};
    const pr = profile && typeof profile === 'object' ? profile : ({} as any);
    const pick = (...vals: any[]) => vals.map((v) => String(v ?? '').trim()).find((s) => s.length > 0) || '';
    return {
      full_name: pick(cp.full_name, pr.full_name),
      email: pick(cp.email, pr.email),
      phone: pick(cp.phone, pr.phone),
      location: pick(cp.location, pr.location),
      linkedin_url: pick(cp.linkedin_url, pr.linkedin_url),
      github_url: pick(cp.github_url),
    } as NonNullable<ResumeDocContent['contact']>;
  }, [candidateProfileRow, profile]);

  const applyContactFallback = (doc: ResumeDocContent): ResumeDocContent => {
    const isPlaceholder = (v: unknown) => {
      const s = String(v ?? '').trim();
      if (!s) return true;
      const n = s.toLowerCase();
      return n.includes('not found') || n === 'n/a' || n === 'na' || n === 'unknown';
    };
    const sanitizeEmail = (v: string) => (v.includes('@') ? v : '');
    const sanitizePhone = (v: string) => (/[0-9]{7,}/.test(v.replace(/[^\d]+/g, '')) ? v : '');
    const sanitizeLinkedIn = (v: string) => (v.includes('linkedin.com') ? v : '');
    const sanitizeGitHub = (v: string) => (v.includes('github.com') ? v : '');

    const cur = (doc.contact && typeof doc.contact === 'object' ? doc.contact : {}) as any;
    const next: any = { ...cur };

    if (isPlaceholder(next.full_name)) next.full_name = contactFallback.full_name || '';
    if (isPlaceholder(next.email)) next.email = sanitizeEmail(contactFallback.email || '');
    if (isPlaceholder(next.phone)) next.phone = sanitizePhone(contactFallback.phone || '');
    if (isPlaceholder(next.location)) next.location = contactFallback.location || '';
    if (isPlaceholder(next.linkedin_url)) next.linkedin_url = sanitizeLinkedIn(contactFallback.linkedin_url || '');
    if (isPlaceholder(next.github_url)) next.github_url = sanitizeGitHub(contactFallback.github_url || '');

    return { ...doc, contact: next };
  };
  const [jobInputMode, setJobInputMode] = useState<'existing' | 'custom'>('existing');
  const [jobs, setJobs] = useState<Array<{ id: string; title: string; description: string; organization_name: string; location: string | null }>>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [jobSearchQuery, setJobSearchQuery] = useState<string>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [missingFacts, setMissingFacts] = useState<string[]>([]);
  const [atsEstimate, setAtsEstimate] = useState<number | null>(null);
  const [atsImprovements, setAtsImprovements] = useState<string[]>([]);
  const [keywordsMatched, setKeywordsMatched] = useState<string[]>([]);
  const [jdSkillExtraction, setJdSkillExtraction] = useState<any | null>(null);
  const [keywordsFullyMatched, setKeywordsFullyMatched] = useState<string[]>([]);
  const [keywordsPartiallyMatched, setKeywordsPartiallyMatched] = useState<string[]>([]);
  const [keywordsMissing, setKeywordsMissing] = useState<Array<{ keyword: string; reason: string }>>([]);
  const [highRiskClaims, setHighRiskClaims] = useState<string[]>([]);
  const [defendWithLearning, setDefendWithLearning] = useState<Array<{ claim_or_gap: string; what_to_study: string }>>([]);
  const [analysisScore, setAnalysisScore] = useState<number | null>(null);
  const [analysisMissing, setAnalysisMissing] = useState<string[]>([]);
  const [analysisMatched, setAnalysisMatched] = useState<string[]>([]);
  const [notesAddedPhrases, setNotesAddedPhrases] = useState<string[]>([]);
  const [notesBaseAnalyzerScore, setNotesBaseAnalyzerScore] = useState<number | null>(null);
  const [notesBaseMatchedCount, setNotesBaseMatchedCount] = useState<number | null>(null);
  const [notesTailoredMatchedCount, setNotesTailoredMatchedCount] = useState<number | null>(null);
  const [notesKeywordTotal, setNotesKeywordTotal] = useState<number | null>(null);
  const [generateError, setGenerateError] = useState<string>('');
  const [lastGeneratedDocId, setLastGeneratedDocId] = useState<string | null>(null);
  const [lastGeneratedTitle, setLastGeneratedTitle] = useState<string>('');
  const [missingPhraseQuery, setMissingPhraseQuery] = useState<string>('');

  // Draft text for tabs that use freeform textareas. This prevents cursor jumps from immediate normalization/parsing.
  const [experienceDraft, setExperienceDraft] = useState<string>('');
  const [educationDraft, setEducationDraft] = useState<string>('');
  const [certsDraft, setCertsDraft] = useState<string>('');
  const expDraftTimerRef = useRef<number | null>(null);
  const eduDraftTimerRef = useRef<number | null>(null);
  const certDraftTimerRef = useRef<number | null>(null);

  const selected = useMemo(() => docs.find((d) => d.id === selectedDocId) || null, [docs, selectedDocId]);

  const diffBaseResumeId = selected?.base_resume_id || selectedBaseResumeId || '';
  const diffAfterText = useMemo(() => (selected ? buildResumeTextFromResumeDoc(selected.content_json) : ''), [selected?.id, selected?.content_json]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selected || !diffBaseResumeId) {
        setDiffBaseText('');
        setDiffBaseLabel('');
        return;
      }
      const base = (resumes || []).find((r: any) => r.id === diffBaseResumeId);
      if (!base) {
        setDiffBaseText('');
        setDiffBaseLabel('');
        return;
      }
      setDiffBaseLoading(true);
      try {
        const { parsed } = await ensureResumeParsed(base);
        if (cancelled) return;
        setDiffBaseLabel(String(base.file_name || 'Base resume'));
        setDiffBaseText(buildResumeTextFromParsedFacts(parsed));
      } catch {
        if (cancelled) return;
        setDiffBaseLabel(String(base.file_name || 'Base resume'));
        setDiffBaseText('');
      } finally {
        if (!cancelled) setDiffBaseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, diffBaseResumeId, resumes]);

  const diff = useMemo(() => {
    if (!diffBaseText || !diffAfterText) return null;
    return diffLines(diffBaseText, diffAfterText);
  }, [diffBaseText, diffAfterText]);

  // --- Autosave (debounced) ---
  const autosaveTimerRef = useRef<number | null>(null);
  const lastSavedSigRef = useRef<string>('');
  const inFlightAutoSaveRef = useRef<AbortController | null>(null);

  const selectedSavePayloadSig = useMemo(() => {
    if (!selected) return '';
    // Only include fields we persist in resume_documents updates.
    const payload = {
      title: selected.title,
      template_id: selected.template_id,
      target_role: selected.target_role,
      target_seniority: selected.target_seniority,
      content_json: selected.content_json,
    };
    try {
      return JSON.stringify(payload);
    } catch {
      // Worst-case: still allow autosave attempts (signature changes each time).
      return String(Date.now());
    }
  }, [selected]);

  async function autoSaveSelected() {
    if (!selected) return;
    setAutoSaveError('');
    setIsAutoSaving(true);
    // Cancel any previous in-flight autosave (we only care about the latest).
    try {
      inFlightAutoSaveRef.current?.abort();
    } catch {
      // ignore
    }
    const ac = new AbortController();
    inFlightAutoSaveRef.current = ac;

    try {
      const { error } = await supabase
        .from('resume_documents' as any)
        .update({
          title: selected.title,
          template_id: selected.template_id,
          target_role: selected.target_role,
          target_seniority: selected.target_seniority,
          content_json: selected.content_json,
        })
        .eq('id', selected.id)
        // @ts-ignore - supabase-js supports abortSignal in options
        .abortSignal(ac.signal);
      if (error) throw error;
      setLastAutoSavedAt(new Date().toISOString());
      lastSavedSigRef.current = selectedSavePayloadSig;
    } catch (e: any) {
      // Don't spam toast on every keystroke; show a small inline error instead.
      const msg = e?.message || 'Autosave failed';
      setAutoSaveError(msg);
    } finally {
      setIsAutoSaving(false);
    }
  }

  // Debounced autosave when selected doc changes.
  useEffect(() => {
    if (!selected) return;
    // Initialize signature when switching docs to avoid an immediate autosave.
    lastSavedSigRef.current = selectedSavePayloadSig;
    setAutoSaveError('');
    setIsAutoSaving(false);

    // Initialize draft text from the selected doc.
    setExperienceDraft(
      (selected.content_json.experience || [])
        .map((e) => {
          const header = [e.title, e.company].filter(Boolean).join(' — ');
          const bullets = (e.bullets || []).map((b) => `- ${b}`).join('\n');
          return `${header}\n${bullets}`.trim();
        })
        .join('\n\n'),
    );
    setEducationDraft(
      (selected.content_json.education || []).map((e) => [e.degree, e.field, e.school, e.year].filter(Boolean).join(' • ')).join('\n'),
    );
    setCertsDraft((selected.content_json.certifications || []).join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    // Skip autosave if nothing changed since last save.
    if (!selectedSavePayloadSig || selectedSavePayloadSig === lastSavedSigRef.current) return;
    // Debounce typing.
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      void autoSaveSelected();
    }, 800);
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSavePayloadSig, selected?.id]);

  const cleanPhrase = (s: unknown) =>
    String(s || '')
      .replace(/\s+/g, ' ')
      .replace(/^•\s*/g, '')
      .trim();

  const isProbablyTruncatedFragment = (p: string) => {
    const v = cleanPhrase(p);
    const words = v.split(' ').filter(Boolean);
    if (words.length >= 5 && /^[a-z]{1,3}$/.test(words[0] || '') && v.length > 30) return true; // mid-word slice like "vel ..."
    if (v.length > 90) return true; // sentence fragment, not a keyword/phrase
    if (/(^|\s)(ensuring|ensure)\s+reliable($|\s)/i.test(v)) return true; // low-signal fragment we see often
    return false;
  };

  const isOrgSpecificPhrase = (p: string) => {
    const v = cleanPhrase(p);
    const n = v.toLowerCase();
    if (/\b(dit|cio|irs)\b/.test(n)) return true;
    return (
      n.includes('department of') ||
      n.includes('reporting directly') ||
      n.includes('chief information officer') ||
      n.includes('branch managers') ||
      n.includes('county leadership') ||
      n.includes('division-wide') ||
      n.includes('internal revenue service')
    );
  };

  const isGenericResponsibilityPhrase = (p: string) => {
    const n = cleanPhrase(p).toLowerCase();
    // These aren't “skills” a candidate should paste into Skills; they're leadership responsibilities.
    return (
      n.includes('supervis') ||
      n.includes('staff') ||
      n.includes('performance management') ||
      n.includes('performance planning') ||
      n.includes('staff development') ||
      n.includes('competency planning') ||
      n.includes('establishes priorities') ||
      n.includes('oversees daily operations') ||
      n.includes('execute technology initiatives') ||
      n.includes('assists with') ||
      n.includes('collaborates with')
    );
  };

  const isTechnicalSkillLike = (p: string) => {
    const v = cleanPhrase(p);
    const n = v.toLowerCase();
    if (!v) return false;
    // Acronyms / tools / platforms / languages
    if (/^[A-Z0-9]{2,10}$/.test(v)) return true;
    if (/[+/]|\.|\/|\d/.test(v)) return true;
    return (
      n.includes('python') ||
      n.includes('sql') ||
      n.includes('aws') ||
      n.includes('azure') ||
      n.includes('gcp') ||
      n.includes('spark') ||
      n.includes('hadoop') ||
      n.includes('kubernetes') ||
      n.includes('docker') ||
      n.includes('terraform') ||
      n.includes('mlops') ||
      n === 'ai' ||
      n === 'ml' ||
      n.includes('ai/ml')
    );
  };

  const uniquePhrases = (arr: unknown[]) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of arr || []) {
      const v = cleanPhrase(raw);
      if (!v) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
    return out;
  };

  const visibleImprovements = useMemo(
    () => (atsImprovements || []).filter((t) => !/^tailor engine version:/i.test(String(t || ''))),
    [atsImprovements],
  );
  const debugImprovements = useMemo(
    () => (atsImprovements || []).filter((t) => /^tailor engine version:/i.test(String(t || ''))),
    [atsImprovements],
  );

  const missingVerbatimPhrases = useMemo(
    () => uniquePhrases(analysisMissing || []).filter((p) => !isProbablyTruncatedFragment(p)).slice(0, 60),
    [analysisMissing],
  );
  const filteredMissingVerbatim = useMemo(() => {
    const q = cleanPhrase(missingPhraseQuery).toLowerCase();
    if (!q) return missingVerbatimPhrases;
    return missingVerbatimPhrases.filter((p) => p.toLowerCase().includes(q));
  }, [missingPhraseQuery, missingVerbatimPhrases]);

  const derivedKeywordTotal =
    notesKeywordTotal ??
    (analysisMatched.length + analysisMissing.length > 0 ? analysisMatched.length + analysisMissing.length : null);
  const derivedKeywordMatched =
    notesTailoredMatchedCount ?? (analysisMatched.length > 0 ? analysisMatched.length : null);
  const derivedKeywordPct =
    derivedKeywordTotal && derivedKeywordMatched != null ? Math.round((derivedKeywordMatched / derivedKeywordTotal) * 100) : null;

  // Interview-prep should focus on what we actually changed (candidate-facing), not raw JD fragments.
  const addedPhrasesClean = useMemo(() => uniquePhrases(notesAddedPhrases || []).filter((p) => !isProbablyTruncatedFragment(p)).slice(0, 20), [
    notesAddedPhrases,
  ]);
  const prepFocus = useMemo(() => {
    const src = uniquePhrases(notesAddedPhrases || []).filter((p) => !isProbablyTruncatedFragment(p) && !isOrgSpecificPhrase(p));
    const prefer = src.filter((p) => isTechnicalSkillLike(p)).slice(0, 6);
    if (prefer.length) return prefer;
    return src.slice(0, 6);
  }, [notesAddedPhrases]);

  const resumeTextForEvidence = useMemo(() => {
    const doc = selected?.content_json || {};
    const parts: string[] = [];
    if (doc.summary) parts.push(String(doc.summary));
    const tech = (doc.skills?.technical || []).join(', ');
    const soft = (doc.skills?.soft || []).join(', ');
    if (tech) parts.push(`Skills: ${tech}`);
    if (soft) parts.push(`Strengths: ${soft}`);
    for (const e of doc.experience || []) {
      parts.push([e.title, e.company, e.start, e.end, e.location].filter(Boolean).join(' • '));
      for (const b of e.bullets || []) parts.push(String(b));
    }
    return parts.join('\n').trim();
  }, [selected]);

  const tokenize = (s: string) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9+.#/ -]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .filter((w) => w.length > 2 && !['and', 'the', 'with', 'for', 'from', 'this', 'that', 'your', 'you', 'our', 'are'].includes(w));

  const jdTextForAnalysis = useMemo(() => String((selected as any)?.jd_text || jdText || ''), [selected, jdText]);

  const jdSections = useMemo(() => {
    const raw = jdTextForAnalysis || '';
    const n = raw.replace(/\r/g, '');
    const lower = n.toLowerCase();
    const pick = (re: RegExp) => {
      const m = lower.match(re);
      return m?.index ?? -1;
    };
    const idxReq = pick(/\b(required qualifications|requirements|required)\b/);
    const idxPref = pick(/\b(preferred qualifications|preferred|nice to have)\b/);
    const idxResp = pick(/\b(responsibilities|key responsibilities|what you'll do|job responsibilities)\b/);
    const idxSoft = pick(/\b(soft skills|what we look for|who you are)\b/);
    const sections: Array<{ key: 'resp' | 'req' | 'pref' | 'soft' | 'other'; start: number; end: number }> = [];
    const points = [
      { key: 'resp' as const, idx: idxResp },
      { key: 'req' as const, idx: idxReq },
      { key: 'pref' as const, idx: idxPref },
      { key: 'soft' as const, idx: idxSoft },
    ]
      .filter((p) => p.idx >= 0)
      .sort((a, b) => a.idx - b.idx);
    if (!points.length) return { resp: n, req: '', pref: '', soft: '' };
    for (let i = 0; i < points.length; i++) {
      const cur = points[i];
      const next = points[i + 1];
      sections.push({ key: cur.key, start: cur.idx, end: next ? next.idx : lower.length });
    }
    const out: any = { resp: '', req: '', pref: '', soft: '' };
    for (const s of sections) out[s.key] = n.slice(s.start, s.end).trim();
    return out as { resp: string; req: string; pref: string; soft: string };
  }, [jdTextForAnalysis]);

  const keywordInventory = useMemo(() => {
    const all = uniquePhrases([...(analysisMatched || []), ...(analysisMissing || [])])
      .filter((p) => !isProbablyTruncatedFragment(p))
      .slice(0, 80);
    const reqLower = (jdSections.req || '').toLowerCase();
    const prefLower = (jdSections.pref || '').toLowerCase();
    const inv = all.map((k) => {
      const n = k.toLowerCase();
      const must = reqLower.includes(n);
      const nice = !must && prefLower.includes(n);
      return { keyword: k, priority: must ? 'Must-have' : nice ? 'Nice-to-have' : 'Other' };
    });
    return {
      must: inv.filter((x) => x.priority === 'Must-have').slice(0, 40),
      nice: inv.filter((x) => x.priority === 'Nice-to-have').slice(0, 40),
      other: inv.filter((x) => x.priority === 'Other').slice(0, 40),
    };
  }, [analysisMatched, analysisMissing, jdSections, isProbablyTruncatedFragment]);

  const extractResponsibilities = (text: string) => {
    const raw = String(text || '').replace(/\r/g, '');
    if (!raw.trim()) return [];

    // Normalize inline bullets into lines so we can reliably extract responsibilities.
    const normalized = raw.replace(/[•\u2022]/g, '\n• ').replace(/\n{3,}/g, '\n\n');
    const lines = normalized
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const bulletish = lines
      .filter((l) => /^[-•*]\s+/.test(l))
      .map((l) => l.replace(/^[-•*]\s+/, '').trim())
      .filter(Boolean);

    // If JD is pasted as paragraphs, split into sentence-like chunks and take early clauses.
    const sentenceish = normalized
      .replace(/\. +/g, '.\n')
      .replace(/; +/g, ';\n')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => l.length >= 25)
      .map((l) => l.replace(/\s+/g, ' '))
      .map((l) => (l.length > 140 ? `${l.slice(0, 140).replace(/\s+\S+$/, '')}` : l));

    const plain = sentenceish
      .filter((l) => !/^(required|preferred|qualifications|responsibilities)\b/i.test(l))
      .slice(0, 40);

    // Merge and keep only meaningful, non-fragment responsibilities.
    const merged = uniquePhrases([...bulletish, ...plain])
      .filter((p) => !isProbablyTruncatedFragment(p))
      .filter((p) => p.split(' ').length >= 4)
      .slice(0, 14);

    // Last resort: if nothing extracted, create a few generic responsibility shells from top must-have keywords.
    if (!merged.length) {
      const fallback = uniquePhrases(keywordInventory.must.map((k) => k.keyword))
        .filter((p) => p && p.length >= 3)
        .slice(0, 8)
        .map((k) => `Demonstrate experience with ${k}`);
      return fallback;
    }
    return merged;
  };

  const responsibilityMap = useMemo(() => {
    const jdResp = extractResponsibilities(jdSections.resp || jdTextForAnalysis);
    const bullets: string[] = [];
    for (const e of selected?.content_json?.experience || []) for (const b of e.bullets || []) bullets.push(String(b));
    const resumeTokens = new Set(tokenize(resumeTextForEvidence));
    const scoreLine = (line: string) => {
      const toks = tokenize(line);
      let hit = 0;
      for (const t of toks) if (resumeTokens.has(t)) hit++;
      const denom = Math.max(6, toks.length);
      return hit / denom;
    };
    const bestEvidence = (line: string) => {
      let best = '';
      let bestScore = 0;
      for (const b of bullets) {
        const s = scoreLine(`${line} ${b}`);
        if (s > bestScore) {
          bestScore = s;
          best = b;
        }
      }
      return { evidence: best ? best.slice(0, 180) : '', score: bestScore };
    };
    return jdResp.map((r) => {
      const s = scoreLine(r);
      const ev = bestEvidence(r);
      const status = s >= 0.55 ? 'Yes' : s >= 0.25 ? 'Partial' : 'Missing';
      return { responsibility: r, status, evidence: ev.evidence };
    });
  }, [jdSections, jdTextForAnalysis, resumeTextForEvidence, selected]);

  const deltaSkills = useMemo(() => {
    const missing = uniquePhrases(analysisMissing || [])
      .filter((p) => !isProbablyTruncatedFragment(p))
      .filter((p) => p.split(' ').length <= 8)
      .slice(0, 80);
    const resumeLower = resumeTextForEvidence.toLowerCase();
    const classify = (p: string) => {
      const n = p.toLowerCase();
      const tok = tokenize(p);
      const tokenHits = tok.filter((t) => resumeLower.includes(t)).length;
      if (resumeLower.includes(n)) return 'Direct'; // rarely true because it's missing, but keep for safety
      if (tokenHits >= Math.max(2, Math.min(4, tok.length))) return 'Adjacent';
      return 'Missing';
    };
    const items = missing.map((p) => ({ skill: p, closeness: classify(p), suggestedPlacement: isTechnicalSkillLike(p) ? 'Skills' : 'Summary/Bullets' }));
    return items.slice(0, 25);
  }, [analysisMissing, resumeTextForEvidence]);

  const metricsStrength = useMemo(() => {
    const bullets: string[] = [];
    const exps = selected?.content_json?.experience || [];
    for (const e of exps) for (const b of e.bullets || []) bullets.push(String(b));
    const hasMetric = (b: string) => /(\b\d+(\.\d+)?\b|%|\$|k\b|m\b|bn\b)/i.test(String(b || ''));
    const total = bullets.length || 0;
    const withM = bullets.filter(hasMetric).length;
    const pct = total ? Math.round((withM / total) * 100) : 0;
    const recent = exps[0]?.bullets || [];
    const weakRecent = recent.filter((b) => !hasMetric(String(b))).slice(0, 5);
    return { total, withM, pct, weakRecent };
  }, [selected]);

  const redFlags = useMemo(() => {
    const summary = String(selected?.content_json?.summary || '');
    const skillsCount = (selected?.content_json?.skills?.technical || []).length;
    const vagueLeadership = summary.toLowerCase().includes('proven track record') || summary.toLowerCase().includes('seeking to leverage');
    const buzzwordy = skillsCount > 70;
    const noMetrics = metricsStrength.total > 0 && metricsStrength.pct < 25;
    const recs: string[] = [];
    if (buzzwordy) recs.push('Skills list is very long; group and prioritize top keywords for this JD (keep ~50–70).');
    if (vagueLeadership) recs.push('Summary reads generic; replace with 2–3 concrete scope/impact statements that match the JD.');
    if (noMetrics) recs.push('Few quantified outcomes; add metrics to the most recent role bullets (scale, SLA, cost, time saved, defects).');
    return recs.slice(0, 6);
  }, [selected, metricsStrength]);

  async function copyToClipboard(text: string) {
    const t = String(text || '').trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      toast.success('Copied');
    } catch {
      try {
        // Fallback for environments where clipboard API is blocked
        window.prompt('Copy to clipboard:', t);
      } catch {
        toast.error('Copy failed');
      }
    }
  }

  // Hydrate ATS/Risk report + analysis from the selected saved document (so it persists per resume and survives refresh).
  useEffect(() => {
    if (!selected) return;
    const aj: any = (selected as any)?.analysis_json || null;
    if (!aj || typeof aj !== 'object') return;

    // These are persisted in resume_documents.analysis_json on generation.
    if (typeof aj?.ats_estimate === 'number') setAtsEstimate(aj.ats_estimate);
    if (Array.isArray(aj?.ats_improvements)) setAtsImprovements(aj.ats_improvements);
    if (aj?.jd_skill_extraction) setJdSkillExtraction(aj.jd_skill_extraction);
    if (Array.isArray(aj?.keywords_fully_matched)) setKeywordsFullyMatched(aj.keywords_fully_matched);
    if (Array.isArray(aj?.keywords_partially_matched)) setKeywordsPartiallyMatched(aj.keywords_partially_matched);
    if (Array.isArray(aj?.keywords_intentionally_missing)) setKeywordsMissing(aj.keywords_intentionally_missing);
    if (Array.isArray(aj?.high_risk_claims)) setHighRiskClaims(aj.high_risk_claims);
    if (Array.isArray(aj?.defend_with_learning)) setDefendWithLearning(aj.defend_with_learning);
    if (Array.isArray(aj?.missing_facts_questions)) setMissingFacts(aj.missing_facts_questions);

    if (typeof aj?.analyzer_match_score === 'number') setAnalysisScore(aj.analyzer_match_score);
    if (Array.isArray(aj?.analyzer_missing)) setAnalysisMissing(aj.analyzer_missing);
    if (Array.isArray(aj?.analyzer_matched)) setAnalysisMatched(aj.analyzer_matched);
    if (Array.isArray(aj?.candidate_notes?.added_jd_phrases)) setNotesAddedPhrases(aj.candidate_notes.added_jd_phrases);
    if (typeof aj?.candidate_notes?.base_match_score === 'number') setNotesBaseAnalyzerScore(aj.candidate_notes.base_match_score);
    if (typeof aj?.candidate_notes?.base_matched_count === 'number') setNotesBaseMatchedCount(aj.candidate_notes.base_matched_count);
    if (typeof aj?.candidate_notes?.tailored_matched_count === 'number') setNotesTailoredMatchedCount(aj.candidate_notes.tailored_matched_count);
    if (typeof aj?.candidate_notes?.keyword_total === 'number') setNotesKeywordTotal(aj.candidate_notes.keyword_total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId]);

  // Draft persistence (prevents losing pasted JD text if the app remounts).
  const draftKey = useMemo(() => {
    const uid = user?.id || 'anon';
    return `resume_workspace_draft:${uid}`;
  }, [user?.id]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d?.jdText === 'string' && !jdText) setJdText(d.jdText);
      if (typeof d?.jobInputMode === 'string') setJobInputMode(d.jobInputMode === 'custom' ? 'custom' : 'existing');
      if (typeof d?.selectedJobId === 'string') setSelectedJobId(d.selectedJobId);
      if (typeof d?.jobSearchQuery === 'string') setJobSearchQuery(d.jobSearchQuery);
      if (typeof d?.additionalNotes === 'string' && !additionalNotes) setAdditionalNotes(d.additionalNotes);
      if (typeof d?.targetTitle === 'string' && !targetTitle) setTargetTitle(d.targetTitle);
      if (typeof d?.lastGeneratedDocId === 'string' && !lastGeneratedDocId) setLastGeneratedDocId(d.lastGeneratedDocId);
      if (typeof d?.lastGeneratedTitle === 'string' && !lastGeneratedTitle) setLastGeneratedTitle(d.lastGeneratedTitle);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          jdText,
          jobInputMode,
          selectedJobId,
          jobSearchQuery,
          additionalNotes,
          targetTitle,
          lastGeneratedDocId,
          lastGeneratedTitle,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // ignore
    }
  }, [draftKey, jdText, jobInputMode, selectedJobId, jobSearchQuery, additionalNotes, targetTitle, lastGeneratedDocId, lastGeneratedTitle]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        setIsLoading(true);
        // Defensive: some environments may have duplicate candidate_profiles rows for a user.
        // Avoid maybeSingle() coercion errors by selecting the most recently updated row.
        const { data: cpRows, error: cpErr } = await supabase
          .from('candidate_profiles')
          .select('id, updated_at, full_name, email, phone, location, linkedin_url, github_url')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (cpErr) throw cpErr;
        const cp = (cpRows || [])[0] as any;
        if (!cp?.id) throw new Error('Candidate profile not found');
        setCandidateId(cp.id);
        setCandidateProfileRow(cp);
        await fetchDocs(cp.id);
        await fetchResumes(cp.id);
        await fetchJobs();
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || 'Failed to load resume workspace');
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function fetchDocs(cpId: string) {
    const { data, error } = await supabase
      .from('resume_documents' as any)
      .select('*')
      .eq('candidate_id', cpId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    const rows = (data || []).map((r: any) => ({ ...r, content_json: safeContent(r.content_json) })) as ResumeDocumentRow[];
    // UI de-dupe: hide older duplicates with the same title (keep most-recent by updated_at).
    const normTitle = (s: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      const k = normTitle(String(r.title || ''));
      if (!k) return true;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    setDocs(unique);
    if (!selectedDocId && unique[0]?.id) setSelectedDocId(unique[0].id);
  }

  async function fetchResumes(cpId: string) {
    const { data, error } = await supabase
      .from('resumes')
      .select('id, file_name, file_url, file_type, is_primary, created_at, parsed_content')
      .eq('candidate_id', cpId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const list = (data || []) as any[];
    setResumes(list);
  }

  async function fetchJobs() {
    try {
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('id, title, description, location, organization_id')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(100);

      if (jobsData) {
        const orgIds = [...new Set(jobsData.map((j: any) => j.organization_id))];
        const { data: orgsData } = await supabase.from('organizations').select('id, name').in('id', orgIds);
        const orgMap = new Map((orgsData || []).map((o: any) => [o.id, o.name]));
        setJobs(
          jobsData.map((j: any) => ({
            id: j.id,
            title: j.title,
            description: j.description,
            location: j.location,
            organization_name: orgMap.get(j.organization_id) || 'Unknown Company',
          })),
        );
      }
    } catch (e) {
      console.warn('Failed to load published jobs (non-blocking)', e);
    }
  }

  const filteredJobs = jobs.filter(
    (job) =>
      job.title.toLowerCase().includes(jobSearchQuery.toLowerCase()) ||
      job.organization_name.toLowerCase().includes(jobSearchQuery.toLowerCase()),
  );

  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      // Keep JD editable even when starting from existing job
      setJdText(job.description || '');
      // Prepopulate Target role/title from the selected job title (also used as the resume title).
      if (job.title) setTargetTitle(job.title);
    }
  };

  // Version checkpoints UI removed for now (and we skip fetching versions).

  async function ensureResumeParsed(resumeRow: any): Promise<{ parsed: any; extractedText: string | null }> {
    const existing = resumeRow?.parsed_content?.parsed;
    const existingDiagnostics = resumeRow?.parsed_content?.diagnostics || null;
    const parserVersion = (existingDiagnostics as any)?.parser_version || null;
    const CURRENT_PARSER_VERSION = '2026-01-15-parse-resume-v3-links';
    const hasNewDiagnostics =
      existingDiagnostics &&
      typeof existingDiagnostics === 'object' &&
      (typeof (existingDiagnostics as any)?.parsed_counts?.experience_count === 'number' ||
        typeof (existingDiagnostics as any)?.deterministic_hints?.experience_detected === 'number' ||
        typeof (existingDiagnostics as any)?.pdf_extraction?.chosen === 'string');

    const existingExtracted = typeof resumeRow?.parsed_content?.extracted_text === 'string' ? resumeRow.parsed_content.extracted_text : null;
    if (existing && typeof existing === 'object' && hasNewDiagnostics && parserVersion === CURRENT_PARSER_VERSION) {
      return { parsed: existing, extractedText: existingExtracted };
    }

    const signedUrl = await getSignedResumeUrl(resumeRow?.file_url, { expiresInSeconds: 900 });

    const resp = await fetch(signedUrl);
    if (!resp.ok) throw new Error(`Failed to download base resume (${resp.status})`);
    const buf = await resp.arrayBuffer();
    const fileBase64 = arrayBufferToBase64(buf);

    const { data: parsedResp, error: parseErr } = await supabase.functions.invoke('parse-resume', {
      body: {
        fileBase64,
        fileName: resumeRow?.file_name,
        fileType: resumeRow?.file_type || 'application/octet-stream',
      },
    });
    if (parseErr) throw parseErr;
    const parsed = (parsedResp as any)?.parsed;
    const mode = (parsedResp as any)?.mode || null;
    const warning = (parsedResp as any)?.warning || null;
    const extractedText = (parsedResp as any)?.extracted_text || null;
    const diagnostics = (parsedResp as any)?.diagnostics || null;
    if (!parsed) throw new Error('Base resume parse failed');

    if (mode === 'heuristic') {
      toast.message('Resume parsed in fallback mode', {
        description: 'AI parsing is not active, so tailoring quality will be limited. Ensure `supabase functions serve --env-file supabase/.env.local` has OPENAI_API_KEY.',
      });
    }

    // Best-effort: persist for next time
    try {
      await supabase
        .from('resumes')
        .update(
          {
            parsed_content: {
              parsed,
              mode,
              warning,
              diagnostics,
              extracted_text: extractedText,
              parsed_at: new Date().toISOString(),
            },
          } as any,
        )
        .eq('id', resumeRow.id);
      setResumes((prev) =>
        prev.map((r) =>
          r.id === resumeRow.id
            ? { ...r, parsed_content: { parsed, mode, warning, diagnostics, extracted_text: extractedText } }
            : r,
        ),
      );
    } catch (e) {
      console.warn('Failed to persist base resume parsed_content (non-blocking)', e);
    }

    return { parsed, extractedText: typeof extractedText === 'string' ? extractedText : null };
  }

  async function generateTailoredResume() {
    if (!candidateId) return;
    setGenerateError('');
    if (!selectedBaseResumeId) {
      const msg = 'Please choose a base resume';
      setGenerateError(msg);
      toast.error(msg);
      return;
    }
    if (!targetTitle.trim()) {
      const msg = 'Target role/title is required';
      setGenerateError(msg);
      toast.error(msg);
      return;
    }
    // Same behavior as AI Resume Check: use the current JD textarea value (editable even after selecting a job).
    const effectiveJdText = jdText.trim();
    if (!effectiveJdText) {
      const msg = 'Please provide a job description';
      setGenerateError(msg);
      toast.error(msg);
      return;
    }
    const base = resumes.find((r) => r.id === selectedBaseResumeId);
    if (!base) {
      toast.error('Base resume not found');
      return;
    }

    setIsGenerating(true);
    setMissingFacts([]);
    setAtsEstimate(null);
    setAtsImprovements([]);
    setKeywordsMatched([]);
    setJdSkillExtraction(null);
    setKeywordsFullyMatched([]);
    setKeywordsPartiallyMatched([]);
    setKeywordsMissing([]);
    setHighRiskClaims([]);
    setDefendWithLearning([]);
    setAnalysisScore(null);
    setAnalysisMissing([]);
    setAnalysisMatched([]);
    try {
      const { parsed: baseParsed, extractedText: baseResumeText } = await ensureResumeParsed(base);
      const mergedFacts = baseParsed;

      // Candidate notes: compute how much keyword coverage improved from base -> tailored for the SAME JD.
      let baseAnalyzerScore: number | null = null;
      let baseMatchedCount: number | null = null;
      let keywordTotal: number | null = null;
      let baseMatchedPhrases: string[] = [];
      try {
        const baseTextForAnalysis = buildResumeTextFromParsedFacts(baseParsed);
        const { data: analyzedBase, error: baseAnalyzeErr } = await supabase.functions.invoke('analyze-resume', {
          body: { resumeText: baseTextForAnalysis, jobDescription: effectiveJdText },
        });
        if (baseAnalyzeErr) throw baseAnalyzeErr;
        const s = (analyzedBase as any)?.analysis?.match_score;
        if (typeof s === 'number') baseAnalyzerScore = s;
        const kw = (analyzedBase as any)?.diagnostics?.keyword_coverage || null;
        if (kw && typeof kw === 'object') {
          if (typeof kw?.matched_count === 'number') baseMatchedCount = kw.matched_count;
          if (typeof kw?.total === 'number') keywordTotal = kw.total;
          if (Array.isArray(kw?.matched)) baseMatchedPhrases = kw.matched.map((x: any) => String(x));
        }
      } catch (e) {
        console.warn('Failed to compute base analyzer notes (non-blocking)', e);
      }

      const { data, error } = await supabase.functions.invoke('tailor-resume', {
        body: {
          baseParsed: mergedFacts,
          baseResumeText: baseResumeText || null,
          jdText: effectiveJdText,
          additionalNotes: additionalNotes || null,
          targetTitle: targetTitle || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const resumeDocRaw = (data as any)?.resume_doc as ResumeDocContent | undefined;
      const suggestedTitle = String((data as any)?.suggested_title || '').trim();
      const mf = Array.isArray((data as any)?.missing_facts_questions) ? (data as any).missing_facts_questions : [];
      setMissingFacts(mf.slice(0, 8));
      const ats = typeof (data as any)?.ats_estimate === 'number' ? (data as any).ats_estimate : null;
      setAtsEstimate(ats);
      const imps = Array.isArray((data as any)?.ats_improvements) ? (data as any).ats_improvements : [];
      setAtsImprovements(imps.slice(0, 6));
      const km = Array.isArray((data as any)?.keywords_matched) ? (data as any).keywords_matched : [];
      setKeywordsMatched(km.slice(0, 24));
      const jse = (data as any)?.jd_skill_extraction || null;
      setJdSkillExtraction(jse);
      const kFull = Array.isArray((data as any)?.keywords_fully_matched) ? (data as any).keywords_fully_matched : [];
      setKeywordsFullyMatched(kFull.slice(0, 60));
      const kPartial = Array.isArray((data as any)?.keywords_partially_matched) ? (data as any).keywords_partially_matched : [];
      setKeywordsPartiallyMatched(kPartial.slice(0, 60));
      const kMissing = Array.isArray((data as any)?.keywords_intentionally_missing) ? (data as any).keywords_intentionally_missing : [];
      setKeywordsMissing(kMissing.slice(0, 50));
      const risks = Array.isArray((data as any)?.high_risk_claims) ? (data as any).high_risk_claims : [];
      setHighRiskClaims(risks.slice(0, 20));
      const defend = Array.isArray((data as any)?.defend_with_learning) ? (data as any).defend_with_learning : [];
      setDefendWithLearning(defend.slice(0, 20));

      if (!resumeDocRaw) throw new Error('Tailor-resume returned no resume_doc');
      // If parser didn't find contact info, pull it from candidate profile / user profile.
      const resumeDoc = applyContactFallback(resumeDocRaw);

      // Compute a consistent match score using the SAME analyzer used in "AI Resume Check".
      let analyzerScore: number | null = null;
      let tailoredMatchedCount: number | null = null;
      let tailoredKeywordTotal: number | null = null;
      let tailoredMatchedPhrases: string[] = [];
      let addedPhrases: string[] = [];
      let missingList: string[] = [];
      let matchedList: string[] = [];
      try {
        const resumeText = buildResumeTextFromResumeDoc(resumeDoc);
        const { data: analyzed, error: analyzeErr } = await supabase.functions.invoke('analyze-resume', {
          body: { resumeText, jobDescription: effectiveJdText },
        });
        if (analyzeErr) throw analyzeErr;
        const score = (analyzed as any)?.analysis?.match_score;
        if (typeof score === 'number') analyzerScore = score;
        const missingPhrases = (analyzed as any)?.diagnostics?.keyword_coverage?.missing;
        const matchedPhrases = (analyzed as any)?.diagnostics?.keyword_coverage?.matched;
        missingList = Array.isArray(missingPhrases) ? missingPhrases.slice(0, 60).map((s: any) => String(s)) : [];
        matchedList = Array.isArray(matchedPhrases) ? matchedPhrases.slice(0, 60).map((s: any) => String(s)) : [];
        setAnalysisMissing(missingList);
        setAnalysisMatched(matchedList);
        const kw = (analyzed as any)?.diagnostics?.keyword_coverage || null;
        if (kw && typeof kw === 'object') {
          if (typeof kw?.matched_count === 'number') tailoredMatchedCount = kw.matched_count;
          if (typeof kw?.total === 'number') tailoredKeywordTotal = kw.total;
          if (Array.isArray(kw?.matched)) tailoredMatchedPhrases = kw.matched.map((x: any) => String(x));
        }
        // Delta: phrases newly present in tailored resume vs base resume for this JD
        const norm = (s: string) =>
          String(s || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const baseSet = new Set(baseMatchedPhrases.map((x) => norm(String(x))));
        addedPhrases = tailoredMatchedPhrases.filter((p: string) => {
          const k = norm(p);
          return k && !baseSet.has(k);
        });
      } catch (e) {
        console.warn('Failed to compute analyzer score (non-blocking)', e);
      }
      setAnalysisScore(analyzerScore);
      setNotesBaseAnalyzerScore(baseAnalyzerScore);
      setNotesBaseMatchedCount(baseMatchedCount);
      setNotesKeywordTotal(keywordTotal ?? tailoredKeywordTotal);
      setNotesTailoredMatchedCount(tailoredMatchedCount);
      setNotesAddedPhrases(addedPhrases.slice(0, 40));

      // Title is the target role/title (required)
      const title = targetTitle.trim();
      const normalizeTitle = (s: string) =>
        String(s || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const nTitle = normalizeTitle(title);

      const payload: any = {
        candidate_id: candidateId,
        title,
        template_id: 'ats_single',
        target_role: targetTitle || suggestedTitle || null,
        content_json: resumeDoc,
        analysis_json: {
          ats_estimate: ats,
          ats_improvements: imps,
          jd_skill_extraction: jse,
          keywords_fully_matched: kFull,
          keywords_partially_matched: kPartial,
          keywords_intentionally_missing: kMissing,
          high_risk_claims: risks,
          defend_with_learning: defend,
          missing_facts_questions: mf,
          analyzer_match_score: analyzerScore,
          analyzer_missing: missingList, // JD phrases missing (verbatim) per analyzer
          analyzer_matched: matchedList, // JD phrases matched (verbatim) per analyzer
          candidate_notes: {
            base_match_score: baseAnalyzerScore,
            base_matched_count: baseMatchedCount,
            tailored_matched_count: tailoredMatchedCount,
            keyword_total: keywordTotal ?? tailoredKeywordTotal,
            added_jd_phrases: addedPhrases.slice(0, 60),
          },
          ats_structural: (data as any)?.ats_structural || null,
        },
        base_resume_id: selectedBaseResumeId,
        jd_text: effectiveJdText,
        additional_instructions: additionalNotes || null,
      };

      // Overwrite instead of creating duplicates:
      // 1) If the last generated doc has the same title, always overwrite it (even if docs state is stale).
      // 2) Else, find an existing doc by normalized title.
      const lastMatches = lastGeneratedDocId && normalizeTitle(lastGeneratedTitle) === nTitle ? lastGeneratedDocId : null;
      const byTitle = docs.find((d) => normalizeTitle(String(d.title || '')) === nTitle)?.id || null;
      const overwriteId = lastMatches || byTitle;

      if (overwriteId) {
        const { data: updatedRows, error: upErr } = await supabase
          .from('resume_documents' as any)
          .update(payload)
          .eq('id', overwriteId)
          .select('*');
        if (upErr) throw upErr;
        const updated = (updatedRows || [])[0] as any;
        if (updated?.id) {
          const row = { ...updated, content_json: safeContent(updated.content_json) } as ResumeDocumentRow;
          setDocs((prev) => prev.map((d) => (d.id === row.id ? row : d)));
          setSelectedDocId(row.id);
          setLastGeneratedDocId(row.id);
          setLastGeneratedTitle(title);
        } else {
          // If the doc was deleted/stale (0 rows updated), fall back to insert instead of crashing.
          const { data: insertedRows, error: insErr } = await supabase
            .from('resume_documents' as any)
            .insert(payload)
            .select('*');
          if (insErr) throw insErr;
          const inserted = (insertedRows || [])[0] as any;
          if (!inserted?.id) throw new Error('Failed to save generated resume (no row returned)');
          const row = { ...inserted, content_json: safeContent(inserted.content_json) } as ResumeDocumentRow;
          setDocs((prev) => [row, ...prev]);
          setSelectedDocId(row.id);
          setLastGeneratedDocId(row.id);
          setLastGeneratedTitle(title);
        }
      } else {
        const { data: insertedRows, error: insErr } = await supabase
          .from('resume_documents' as any)
          .insert(payload)
          .select('*');
        if (insErr) throw insErr;
        const inserted = (insertedRows || [])[0] as any;
        if (!inserted?.id) throw new Error('Failed to save generated resume (no row returned)');
        const row = { ...inserted, content_json: safeContent(inserted.content_json) } as ResumeDocumentRow;
        setDocs((prev) => [row, ...prev]);
        setSelectedDocId(row.id);
        setLastGeneratedDocId(row.id);
        setLastGeneratedTitle(title);
      }
      toast.success('Tailored resume generated');
    } catch (e: any) {
      console.error(e);
      const msg = await getSupabaseFunctionErrorMessage(e);
      setGenerateError(msg);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  }

  async function createNewDoc() {
    if (!candidateId) return;
    const initial: ResumeDocContent = {
      contact: {
        full_name: contactFallback.full_name || '',
        email: contactFallback.email || '',
        phone: contactFallback.phone || '',
        location: contactFallback.location || '',
        linkedin_url: contactFallback.linkedin_url || '',
        github_url: contactFallback.github_url || '',
      },
      summary: '',
      skills: { technical: [], soft: [] },
      experience: [],
      education: [],
      certifications: [],
    };
    const { data, error } = await supabase
      .from('resume_documents' as any)
        .insert({ candidate_id: candidateId, title: 'Untitled Resume', template_id: 'ats_single', content_json: initial })
      .select('*');
    if (error) throw error;
    const created = ((data as any) || [])[0] as any;
    if (!created?.id) throw new Error('Failed to create resume (no row returned)');
    const row = { ...created, content_json: safeContent(created.content_json) } as ResumeDocumentRow;
    setDocs((prev) => [row, ...prev]);
    setSelectedDocId(row.id);
    toast.success('Created new resume');
  }

  async function saveDoc() {
    if (!selected) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('resume_documents' as any)
        .update({
          title: selected.title,
          template_id: selected.template_id,
          target_role: selected.target_role,
          target_seniority: selected.target_seniority,
          content_json: selected.content_json,
        })
        .eq('id', selected.id);
      if (error) throw error;
      toast.success('Saved');
      if (candidateId) await fetchDocs(candidateId);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteDoc() {
    if (!selected) return;
    if (!confirm('Delete this resume document? This cannot be undone.')) return;
    try {
      const { error } = await (supabase as any).from('resume_documents').delete().eq('id', selected.id);
      if (error) throw error;
      setDocs((prev) => prev.filter((d) => d.id !== selected.id));
      setSelectedDocId((prev) => {
        const next = docs.find((d) => d.id !== selected.id)?.id || null;
        return next;
      });
      toast.success('Deleted');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to delete');
    }
  }

  async function deleteWorkspaceDoc(doc: ResumeDocumentRow) {
    if (!doc?.id) return;
    if (!confirm('Delete this resume document? This cannot be undone.')) return;
    try {
      const { error } = await (supabase as any).from('resume_documents').delete().eq('id', doc.id);
      if (error) throw error;
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setSelectedDocId((prev) => {
        if (prev !== doc.id) return prev;
        const next = docs.find((d) => d.id !== doc.id)?.id || null;
        return next;
      });
      toast.success('Deleted');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to delete');
    }
  }

  function updateSelected(patch: Partial<ResumeDocumentRow>) {
    if (!selected) return;
    setDocs((prev) => prev.map((d) => (d.id === selected.id ? { ...d, ...patch } : d)));
  }

  function updateContent(patch: Partial<ResumeDocContent>) {
    if (!selected) return;
    updateSelected({ content_json: { ...(selected.content_json || {}), ...patch } });
  }

  function updateContactField<K extends keyof NonNullable<ResumeDocContent['contact']>>(key: K, value: string) {
    if (!selected) return;
    const cur = (selected.content_json?.contact || {}) as NonNullable<ResumeDocContent['contact']>;
    updateContent({
      contact: {
        ...cur,
        [key]: value,
      },
    });
  }

  async function saveWorkspaceDocToMyResumes(doc: ResumeDocumentRow) {
    if (!candidateId || !user?.id) return;
    try {
      const blob = await generateDocxBlob(doc.title, 'ats_single', doc.content_json);
      const filePath = `${user.id}/${Date.now()}-tailored.docx`;

      const { error: upErr } = await supabase.storage.from('resumes').upload(filePath, blob, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      if (upErr) throw upErr;

      const storedFileUrl = `resumes/${filePath}`;
      const { error: insErr } = await supabase.from('resumes').insert({
        candidate_id: candidateId,
        file_name: `${doc.title || 'Tailored Resume'}.docx`,
        file_url: storedFileUrl,
        file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        is_primary: false,
        parsed_content: {
          source: 'resume_workspace',
          resume_doc: doc.content_json,
          generated_at: new Date().toISOString(),
        },
      } as any);
      if (insErr) throw insErr;

      toast.success('Saved to My Resumes');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save to My Resumes');
    }
  }

  async function downloadWorkspaceDocPdf(doc: ResumeDocumentRow) {
    try {
      const blob = await generatePdfBlob(doc.title, doc.content_json);
      downloadBlob(`${doc.title || 'resume'}.pdf`, blob);
      toast.success('Downloaded PDF');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to generate PDF');
    }
  }

  async function downloadWorkspaceDocDocx(doc: ResumeDocumentRow) {
    try {
      const blob = await generateDocxBlob(doc.title, 'ats_single', doc.content_json);
      downloadBlob(`${doc.title || 'resume'}.docx`, blob);
      toast.success('Downloaded DOCX');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to generate DOCX');
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-accent" />
                Resume Workspace
              </CardTitle>
              <CardDescription>Loading…</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Resume Workspace</h1>
            <p className="mt-1">
              Tailor a resume for a specific job description with minimal friction. Your generated resume can be saved back into “My Resumes”.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={createNewDoc}>
              <Plus className="mr-2 h-4 w-4" />
              New
            </Button>
            <Button onClick={saveDoc} disabled={isSaving || !selected}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Tailoring wizard */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              Tailor your resume
            </CardTitle>
              <CardDescription>Choose a base resume + a JD, generate a version you can edit and save.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {resumes.length === 0 ? (
              <div className="text-sm">
                You don’t have any uploaded resumes yet. Upload one first, then come back here to tailor it for a job.
                <div className="mt-3">
                  <Button onClick={() => navigate('/candidate/resumes')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Upload a resume
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Card className="card-elevated">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Briefcase className="h-4 w-4" />
                      Job Description
                    </CardTitle>
                    <CardDescription>Select an existing job or paste a custom description</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs value={jobInputMode} onValueChange={(v) => setJobInputMode(v as 'existing' | 'custom')}>
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="existing">Select Job</TabsTrigger>
                        <TabsTrigger value="custom">Paste JD</TabsTrigger>
                      </TabsList>

                      <TabsContent value="existing" className="space-y-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                          <Input
                            placeholder="Search jobs by title or company..."
                            value={jobSearchQuery}
                            onChange={(e) => setJobSearchQuery(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <div className="max-h-[200px] overflow-y-auto space-y-2 border rounded-md p-2">
                          {filteredJobs.length === 0 ? (
                            <p className="text-sm text-center py-4">
                              {jobs.length === 0 ? 'No published jobs available' : 'No jobs match your search'}
                            </p>
                          ) : (
                            filteredJobs.slice(0, 20).map((job) => (
                              <div
                                key={job.id}
                                className={`p-3 rounded-md cursor-pointer transition-colors ${
                                  selectedJobId === job.id ? 'bg-primary/10 border border-primary' : 'bg-muted/50 hover:bg-muted'
                                }`}
                                onClick={() => handleJobSelect(job.id)}
                              >
                                <p className="font-medium text-sm">{job.title}</p>
                                <p className="text-xs">
                                  {job.organization_name} {job.location && `• ${job.location}`}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="text-xs">Tip: you can edit the JD in “Paste JD” after selecting a job.</div>
                      </TabsContent>

                      <TabsContent value="custom">
                        <Textarea
                          placeholder="Paste the job description here..."
                          rows={10}
                          value={jdText}
                          onChange={(e) => setJdText(e.target.value)}
                        />
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Base resume</Label>
                    <Select value={selectedBaseResumeId} onValueChange={(v) => setSelectedBaseResumeId(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a base resume" />
                      </SelectTrigger>
                      <SelectContent>
                        {resumes.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {(r.is_primary ? '★ ' : '') + String(r.file_name || 'Resume')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="link" className="px-0" onClick={() => navigate('/candidate/resumes')}>
                      Manage uploads in My Resumes →
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Target role/title (required)</Label>
                    <Input
                      value={targetTitle}
                      onChange={(e) => setTargetTitle(e.target.value)}
                      placeholder="e.g., Senior Director of Engineering"
                    />
                    <div className="text-xs">This becomes the saved resume name.</div>
                  </div>
                  <div className="space-y-2">
                    <Label>Additional preferences (optional)</Label>
                    <Input
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      placeholder="e.g., emphasize platform scaling, people leadership, cloud architecture…"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={generateTailoredResume} disabled={isGenerating}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isGenerating ? 'Generating…' : 'Generate tailored resume'}
                  </Button>
                </div>
                {generateError ? <div className="text-sm text-destructive">{generateError}</div> : null}
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-12 lg:min-h-[calc(100vh-360px)]">
          {/* Left: docs list */}
          <Card className="lg:col-span-4 card-elevated flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">My Resumes</CardTitle>
              <CardDescription>Saved, editable resumes from this workspace</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <ScrollArea className="h-full pr-2">
                <div className="space-y-2">
                  {docs.map((d) => (
                    <div
                      key={d.id}
                      className={`group w-full rounded-md border p-3 transition ${
                        d.id === selectedDocId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDocId(d.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedDocId(d.id)}
                    >
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold leading-5 line-clamp-1">{d.title}</div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="text-xsflex items-center gap-2 min-w-0">
                            <Clock className="h-3 w-3" />
                            <span className="truncate">{new Date(d.updated_at).toLocaleString()}</span>
                          </div>
                          <div
                            className={`flex items-center gap-0.5 transition-opacity ${
                              d.id === selectedDocId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                            }`}
                          >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void saveWorkspaceDocToMyResumes(d);
                                }}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Save to My Resumes</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void downloadWorkspaceDocPdf(d);
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download PDF</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void downloadWorkspaceDocDocx(d);
                                }}
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Download DOCX</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void deleteWorkspaceDoc(d);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {docs.length === 0 && (
                    <div className="text-sm">
                      No resume documents yet. Click “New” to create your first one.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Center: editor */}
          <Card className="lg:col-span-8 card-elevated flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="text-base">Editor</CardTitle>
                  <CardDescription className="line-clamp-1">
                    {selected ? 'Edit sections and save. Use checkpoints for version history.' : 'Select a resume document'}
                  </CardDescription>
                </div>
                {/* Delete moved to My Resumes list row actions */}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              {!selected ? (
                <div className="text-sm">Select a document from the left.</div>
              ) : (
                <>
                  <div className="mb-2 text-sm">
                    <span className="">Document:</span>{' '}
                    <span className="font-medium text-foreground">{selected.title}</span>
                    <span className="ml-3 text-xs">
                      {isAutoSaving ? 'Saving…' : autoSaveError ? `Autosave failed: ${autoSaveError}` : lastAutoSavedAt ? 'Autosaved' : ''}
                    </span>
                  </div>

                  <Separator className="my-4" />

                  <Tabs defaultValue="summary">
                    <TabsList className="flex flex-wrap justify-start">
                      <TabsTrigger value="contact">Contact</TabsTrigger>
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                      <TabsTrigger value="skills">Skills</TabsTrigger>
                      <TabsTrigger value="experience">Experience</TabsTrigger>
                      <TabsTrigger value="education">Education</TabsTrigger>
                      <TabsTrigger value="certs">Certifications</TabsTrigger>
                      <TabsTrigger value="changes">Changes</TabsTrigger>
                    </TabsList>

                    <TabsContent value="contact" className="space-y-4 mt-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <Label>Applying title (saved resume name)</Label>
                          <Input
                            value={selected.title}
                            onChange={(e) => updateSelected({ title: e.target.value })}
                            placeholder="e.g., Senior Data Scientist"
                          />
                          <div className="text-xs">
                            This is the workspace resume name and the export file name.
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Full name</Label>
                          <Input
                            value={String(selected.content_json?.contact?.full_name || '')}
                            onChange={(e) => updateContactField('full_name', e.target.value)}
                            placeholder="Full name"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Location</Label>
                          <Input
                            value={String(selected.content_json?.contact?.location || '')}
                            onChange={(e) => updateContactField('location', e.target.value)}
                            placeholder="City, State"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input
                            value={String(selected.content_json?.contact?.phone || '')}
                            onChange={(e) => updateContactField('phone', e.target.value)}
                            placeholder="Phone"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            value={String(selected.content_json?.contact?.email || '')}
                            onChange={(e) => updateContactField('email', e.target.value)}
                            placeholder="Email"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>LinkedIn URL</Label>
                          <Input
                            value={String(selected.content_json?.contact?.linkedin_url || '')}
                            onChange={(e) => updateContactField('linkedin_url', e.target.value)}
                            placeholder="linkedin.com/in/…"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>GitHub URL</Label>
                          <Input
                            value={String(selected.content_json?.contact?.github_url || '')}
                            onChange={(e) => updateContactField('github_url', e.target.value)}
                            placeholder="github.com/…"
                          />
                        </div>
                      </div>

                      <div className="text-xs">
                        Note: generating a new tailored resume overwrites contact info from the base resume facts. You can always edit here after
                        generating.
                      </div>
                    </TabsContent>

                    <TabsContent value="summary" className="space-y-3 mt-4">
                      <Label>Professional Summary</Label>
                      <Textarea
                        className="min-h-[280px] lg:min-h-[360px]"
                        value={selected.content_json.summary || ''}
                        onChange={(e) => updateContent({ summary: e.target.value })}
                        placeholder="Write a concise summary of your background and strengths…"
                      />
                    </TabsContent>

                    <TabsContent value="skills" className="space-y-4 mt-4">
                      <SkillChipsEditor
                        label="Technical Skills (ATS keywords)"
                        values={selected.content_json.skills?.technical || []}
                        max={80}
                        placeholder="Add technical/platform skills (comma separated)…"
                        onChange={(next) =>
                          updateContent({
                            skills: {
                              ...(selected.content_json.skills || {}),
                              technical: next.slice(0, 80),
                            },
                          })
                        }
                      />
                      <Separator />
                      <SkillChipsEditor
                        label="Leadership & Execution Skills (ATS keywords)"
                        values={selected.content_json.skills?.soft || []}
                        max={60}
                        placeholder="Add leadership/soft skills (comma separated)…"
                        onChange={(next) =>
                          updateContent({
                            skills: {
                              ...(selected.content_json.skills || {}),
                              soft: next.slice(0, 60),
                            },
                          })
                        }
                      />
                      <CardDescription>
                        Tip: if a JD keyword can’t be honestly shown in Experience bullets, keep it in Skills so ATS still matches it.
                      </CardDescription>
                    </TabsContent>

                    <TabsContent value="experience" className="space-y-3 mt-4">
                      <Textarea
                        className="min-h-[360px] lg:min-h-[520px]"
                        value={experienceDraft}
                        onChange={(e) => {
                          const next = e.target.value;
                          setExperienceDraft(next);
                          if (expDraftTimerRef.current) window.clearTimeout(expDraftTimerRef.current);
                          expDraftTimerRef.current = window.setTimeout(() => {
                            // Minimal parser: split blocks by blank line, treat first line as header, rest as bullets.
                            // We only update bullets; header edits are ignored to avoid accidental company/title rewrites.
                            const blocks = String(next)
                              .split(/\n\s*\n/g)
                              .map((b) => b.trim())
                              .filter(Boolean);
                            const parsedBullets = blocks.map((b) => {
                              const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
                              const bullets = lines
                                .slice(1)
                                .map((l) => l.replace(/^[•\-\*]+\s*/, '').trim())
                                .filter(Boolean);
                              return bullets;
                            });
                            const current = Array.isArray(selected.content_json.experience) ? selected.content_json.experience : [];
                            const merged = current.map((role, idx) => ({
                              ...role,
                              bullets: parsedBullets[idx] || role.bullets || [],
                            }));
                            updateContent({ experience: merged });
                          }, 500);
                        }}
                        placeholder={`Director of Engineering — Walmart\n- Led ...\n- Built ...\n\nEngineering Manager — Fannie Mae\n- ...`}
                      />
                    </TabsContent>

                    <TabsContent value="education" className="space-y-2 mt-4">
                      <Textarea
                        className="min-h-[200px] lg:min-h-[260px]"
                        value={educationDraft}
                        onChange={(e) => {
                          const next = e.target.value;
                          setEducationDraft(next);
                          if (eduDraftTimerRef.current) window.clearTimeout(eduDraftTimerRef.current);
                          eduDraftTimerRef.current = window.setTimeout(() => {
                            const rows = String(next)
                              .split('\n')
                              .map((r) => r.trim())
                              // Keep empty lines out of stored structure, but allow typing freely in the draft.
                              .filter(Boolean)
                              .slice(0, 30)
                              .map((r) => ({ school: r }));
                            updateContent({ education: rows });
                          }, 500);
                        }}
                        placeholder="Executive MBA • George Mason University • 2020"
                      />
                      <CardDescription>Paste each education line on a new line.</CardDescription>
                    </TabsContent>

                    <TabsContent value="certs" className="space-y-2 mt-4">
                      <Textarea
                        className="min-h-[200px] lg:min-h-[260px]"
                        value={certsDraft}
                        onChange={(e) => {
                          const next = e.target.value;
                          setCertsDraft(next);
                          if (certDraftTimerRef.current) window.clearTimeout(certDraftTimerRef.current);
                          certDraftTimerRef.current = window.setTimeout(() => {
                            updateContent({
                              certifications: String(next)
                                .split('\n')
                                .map((r) => r.trim())
                                .filter(Boolean)
                                .slice(0, 50),
                            });
                          }, 500);
                        }}
                        placeholder="AWS Certified Solutions Architect\n…"
                      />
                    </TabsContent>

                    <TabsContent value="changes" className="space-y-4 mt-4">
                      {!diffBaseResumeId ? (
                        <div className="text-sm">
                          Select a <span className="font-medium text-foreground">base resume</span> in the tailor section to compare changes.
                        </div>
                      ) : diffBaseLoading ? (
                        <div className="text-sm">Loading base resume…</div>
                      ) : !diff ? (
                        <div className="text-sm">
                          Could not compute changes (base resume text unavailable).
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-sm">
                              Comparing <span className="font-medium text-foreground">{diffBaseLabel || 'Base resume'}</span> →{' '}
                              <span className="font-medium text-foreground">{selected?.title || 'Current document'}</span>
                            </div>
                            <Button
                              variant="outline"
                              onClick={async () => {
                                if (!selected) return;
                                const blob = await generateDiffPdfBlob({
                                  title: selected.title || 'Resume',
                                  beforeText: diffBaseText,
                                  afterText: diffAfterText,
                                });
                                downloadBlob(`${selected.title || 'resume'}-change-report.pdf`, blob);
                                toast.success('Downloaded change report');
                              }}
                            >
                              Download Change Report (PDF)
                            </Button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <Card className="dash-card">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">Added</CardTitle>
                                <CardDescription>{diff.added.length} lines</CardDescription>
                              </CardHeader>
                              <CardContent>
                                <ScrollArea className="h-[240px]">
                                  <div className="space-y-2">
                                    {(diff.added.length ? diff.added : ['No additions detected.']).slice(0, 120).map((l, i) => (
                                      <div key={i} className="text-sm">
                                        <span className="text-success font-medium">+ </span>
                                        <span className="">{l}</span>
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                              </CardContent>
                            </Card>

                            <Card className="dash-card">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base">Removed</CardTitle>
                                <CardDescription>{diff.removed.length} lines</CardDescription>
                              </CardHeader>
                              <CardContent>
                                <ScrollArea className="h-[240px]">
                                  <div className="space-y-2">
                                    {(diff.removed.length ? diff.removed : ['No removals detected.']).slice(0, 120).map((l, i) => (
                                      <div key={i} className="text-sm">
                                        <span className="text-destructive font-medium">- </span>
                                        <span className="">{l}</span>
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                              </CardContent>
                            </Card>
                          </div>

                          <div className="text-xs">
                            Note: this compares your current workspace document against the selected base resume. It’s not a PDF-to-PDF pixel diff.
                          </div>
                        </>
                      )}
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {(analysisScore != null ||
          atsEstimate != null ||
          missingVerbatimPhrases.length > 0 ||
          keywordsMissing.length > 0 ||
          defendWithLearning.length > 0 ||
          visibleImprovements.length > 0 ||
          Boolean(jdSkillExtraction) ||
          notesAddedPhrases.length > 0) && (
          <div className="space-y-6">
            {/* Keep both panels the same compact height; list expands to fill whitespace but still scrolls */}
            <div className="grid gap-6 lg:grid-cols-12 lg:items-stretch">
              <Card className="card-elevated lg:col-span-5 lg:h-[520px] flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base">ATS outcomes</CardTitle>
                  <CardDescription>What to change next to raise the canonical score.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 flex-1 min-h-0 overflow-auto">
                  <div>
                    <div className="text-sm">Canonical score</div>
                    <div className="text-4xl font-bold tracking-tight">{analysisScore != null ? `${Math.round(analysisScore)}%` : '—'}</div>
                    <div className="mt-2">
                      <Progress value={analysisScore != null ? Math.round(analysisScore) : 0} className="h-2" />
                    </div>
                  </div>

                  <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="">Keyword coverage</div>
                      <div className="font-medium text-foreground">
                        {derivedKeywordPct != null ? `${derivedKeywordPct}%` : '—'}{' '}
                        {derivedKeywordMatched != null && derivedKeywordTotal != null ? `· ${derivedKeywordMatched}/${derivedKeywordTotal}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="">Model estimate</div>
                      <div className="font-medium text-foreground">{atsEstimate != null ? `${Math.round(atsEstimate)}%` : '—'}</div>
                    </div>
                  </div>

                  {(notesBaseMatchedCount != null || notesTailoredMatchedCount != null) && (
                    <div className="text-sm">
                      <span className="font-medium text-foreground">Coverage change:</span>{' '}
                      Base {notesBaseMatchedCount ?? '—'}/{notesKeywordTotal ?? derivedKeywordTotal ?? '—'} → Tailored{' '}
                      {notesTailoredMatchedCount ?? derivedKeywordMatched ?? '—'}/{notesKeywordTotal ?? derivedKeywordTotal ?? '—'}
                    </div>
                  )}

                  <div className="text-sm">
                    <div className="font-medium">3-step boost plan</div>
                    <ol className="mt-2 list-decimal pl-5space-y-1">
                      <li>Copy missing JD phrases (right panel) and paste them verbatim.</li>
                      <li>Place them in Skills first; Summary second; bullets only if you can defend them.</li>
                      <li>Regenerate (or run ATS Checkpoint) and repeat until you’re happy with coverage.</li>
                    </ol>
                  </div>

                  <div className="rounded-md border bg-background p-3 text-sm">
                    <div className="font-medium">Quick tips (high impact)</div>
                    <ul className="mt-2 space-y-1">
                      <li>
                        <span className="text-foreground font-medium">Don’t add unverifiable claims.</span> If you can’t explain it in 60
                        seconds with proof, skip it.
                      </li>
                      <li>
                        <span className="text-foreground font-medium">Put phrases where recruiters expect them.</span> Skills first, Summary
                        second, only then add to your most recent role bullets.
                      </li>
                      <li>
                        <span className="text-foreground font-medium">Turn 1–2 phrases into evidence.</span> Add one concrete bullet with a
                        metric (latency, cost, accuracy, volume, revenue).
                      </li>
                      <li>
                        <span className="text-foreground font-medium">Re-run after edits.</span> Iterate until coverage is “good enough” for
                        the jobs you’re targeting.
                      </li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-elevated lg:col-span-7 lg:h-[520px] flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base">Do this first: copy/paste missing JD phrases</CardTitle>
                  <CardDescription>
                    These phrases were not found verbatim in the resume text used for analysis. Add them naturally (best place: Skills).
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 flex-1 min-h-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:max-w-[420px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                      <Input
                        value={missingPhraseQuery}
                        onChange={(e) => setMissingPhraseQuery(e.target.value)}
                        placeholder="Search missing phrases..."
                        className="pl-9"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => copyToClipboard(filteredMissingVerbatim.slice(0, 15).join('\n'))}
                      disabled={filteredMissingVerbatim.length === 0}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy top 15
                    </Button>
                  </div>

                  {filteredMissingVerbatim.length > 0 ? (
                    <div className="flex flex-col flex-1 min-h-0 rounded-md border bg-background overflow-hidden">
                      <ScrollArea className="flex-1 min-h-0 p-2">
                        <div className="space-y-1">
                          {filteredMissingVerbatim.slice(0, 60).map((p) => (
                            <div key={p} className="flex items-start justify-between gap-3">
                              <div className="text-[13px] leading-5">{p}</div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToClipboard(p)}
                                title="Copy"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                      <div className="border-t p-3 text-xs">
                        Tip: add to Skills first; only add to bullets if you can defend it in interview.
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm">No missing phrases found.</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {(addedPhrasesClean.length > 0 ||
              highRiskClaims.length > 0 ||
              (analysisMatched.length + analysisMissing.length > 0) ||
              responsibilityMap.length > 0) && (
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle className="text-base">JD deconstruction + interview readiness</CardTitle>
                  <CardDescription>
                    Built from the JD + your tailored resume. Use this to improve ATS and prep stories before interviews.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="deconstruct">
                    <TabsList className="flex flex-wrap justify-start">
                      <TabsTrigger value="deconstruct">1) JD deconstruction</TabsTrigger>
                      <TabsTrigger value="ats">2) ATS gaps</TabsTrigger>
                      <TabsTrigger value="resp">3) Responsibilities</TabsTrigger>
                      <TabsTrigger value="delta">4) Delta skills</TabsTrigger>
                      <TabsTrigger value="metrics">5) Metrics & red flags</TabsTrigger>
                      <TabsTrigger value="prep">6) Interview prep</TabsTrigger>
                    </TabsList>

                    <TabsContent value="deconstruct" className="mt-4 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-md border bg-background p-3">
                          <div className="text-sm font-medium">Hard skills (ATS keywords)</div>
                          <div className="mt-2 space-y-2">
                            {keywordInventory.must.length > 0 && (
                              <div className="text-sm">
                                <div className="font-medium text-foreground">Must-have</div>
                                <div className="">{keywordInventory.must.slice(0, 18).map((k) => k.keyword).join(' • ')}</div>
                              </div>
                            )}
                            {keywordInventory.nice.length > 0 && (
                              <div className="text-sm">
                                <div className="font-medium text-foreground">Nice-to-have</div>
                                <div className="">{keywordInventory.nice.slice(0, 18).map((k) => k.keyword).join(' • ')}</div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                          <div className="text-sm font-medium">Seniority signals (what the JD implies)</div>
                          <div className="mt-2 text-smspace-y-1">
                            <div>Dial up: scope, decision-making, cross-functional leadership, scale/ownership.</div>
                            <div>Dial down: vague buzzwords and org-specific claims that aren’t yours.</div>
                            <div>Ensure Summary + most recent role reflect the JD’s level (strategy vs hands-on).</div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="ats" className="mt-4 space-y-3">
                      <div className="rounded-md border bg-background p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">Keyword coverage</div>
                            <div className="text-xs">Use exact JD wording; replace synonyms where possible.</div>
                          </div>
                          <div className="text-sm font-medium text-foreground">
                            {derivedKeywordPct != null ? `${derivedKeywordPct}%` : '—'}{' '}
                            {derivedKeywordMatched != null && derivedKeywordTotal != null ? `· ${derivedKeywordMatched}/${derivedKeywordTotal}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-md border bg-background p-3 text-sm">
                        <div className="font-medium">Keyword placement guidance</div>
                        <ul className="mt-2 list-disc pl-5space-y-1">
                          <li>Skills: tools/platforms/acronyms (verbatim)</li>
                          <li>Summary: role-level responsibilities + domain</li>
                          <li>Recent bullets: keywords tied to outcomes/metrics (recency bias)</li>
                        </ul>
                      </div>
                    </TabsContent>

                    <TabsContent value="resp" className="mt-4 space-y-3">
                      <div className="text-sm font-medium">Responsibility coverage map</div>
                      {responsibilityMap.length > 0 ? (
                        <div className="rounded-md border bg-background overflow-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b bg-muted/30">
                              <tr>
                                <th className="text-left font-medium p-3 w-[45%]">JD responsibility</th>
                                <th className="text-left font-medium p-3 w-[12%]">Coverage</th>
                                <th className="text-left font-medium p-3">Resume evidence (best match)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {responsibilityMap.slice(0, 10).map((r) => (
                                <tr key={r.responsibility} className="border-b last:border-b-0">
                                  <td className="p-3 align-top">{r.responsibility}</td>
                                  <td className="p-3 align-top">
                                    <Badge
                                      variant={r.status === 'Yes' ? 'default' : r.status === 'Partial' ? 'secondary' : 'outline'}
                                    >
                                      {r.status}
                                    </Badge>
                                  </td>
                                  <td className="p-3 align-top">{r.evidence || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="rounded-md border bg-muted/20 p-3 text-sm">
                          No responsibilities could be extracted yet. Paste a fuller JD (with responsibilities) and regenerate the tailored resume.
                        </div>
                      )}
                      <div className="text-xs">
                        Use this table to decide what to expand in the most recent role, and which “Missing” items need an interview story (or should be
                        removed).
                      </div>
                    </TabsContent>

                    <TabsContent value="delta" className="mt-4 space-y-3">
                      <div className="text-sm font-medium">Delta skills (what the JD emphasizes that isn’t verbatim in your resume)</div>
                      <div className="rounded-md border bg-background overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b bg-muted/30">
                            <tr>
                              <th className="text-left font-medium p-3">Delta skill/phrase</th>
                              <th className="text-left font-medium p-3 w-[16%]">Closeness</th>
                              <th className="text-left font-medium p-3 w-[20%]">Placement</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deltaSkills.slice(0, 12).map((d) => (
                              <tr key={d.skill} className="border-b last:border-b-0">
                                <td className="p-3">{d.skill}</td>
                                <td className="p-3">
                                  <Badge variant={d.closeness === 'Direct' ? 'default' : d.closeness === 'Adjacent' ? 'secondary' : 'outline'}>
                                    {d.closeness}
                                  </Badge>
                                </td>
                                <td className="p-3">{d.suggestedPlacement}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>

                    <TabsContent value="metrics" className="mt-4 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-md border bg-background p-3">
                          <div className="text-sm font-medium">Metrics strength</div>
                          <div className="mt-2 text-sm">
                            Metrics present: <span className="font-medium text-foreground">{metricsStrength.withM}</span>/
                            <span className="font-medium text-foreground">{metricsStrength.total}</span> bullets (
                            <span className="font-medium text-foreground">{metricsStrength.pct}%</span>)
                          </div>
                          {metricsStrength.weakRecent.length > 0 && (
                            <div className="mt-3 text-sm">
                              <div className="font-medium">Add metrics to these recent bullets</div>
                              <ul className="mt-2 list-disc pl-5space-y-1">
                                {metricsStrength.weakRecent.map((b, i) => (
                                  <li key={i}>{String(b).slice(0, 180)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        <div className="rounded-md border bg-background p-3">
                          <div className="text-sm font-medium">Red flags (ATS + human)</div>
                          {redFlags.length > 0 ? (
                            <ul className="mt-2 list-disc pl-5 text-smspace-y-1">
                              {redFlags.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-2 text-sm">No obvious red flags detected.</div>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="prep" className="mt-4 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-md border bg-background p-3">
                          <div className="text-sm font-medium">Responsibility-to-story map (what to prep)</div>
                          <div className="text-xsmt-1">Prep STAR stories for Partial/Missing responsibilities you keep in the resume.</div>
                          <ul className="mt-2 list-disc pl-5 text-smspace-y-1">
                            {responsibilityMap
                              .filter((r) => r.status !== 'Yes')
                              .slice(0, 8)
                              .map((r) => (
                                <li key={r.responsibility}>
                                  <span className="font-medium text-foreground">{r.status}:</span> {r.responsibility}
                                </li>
                              ))}
                          </ul>
                        </div>
                        <div className="rounded-md border bg-background p-3">
                          <div className="text-sm font-medium">Edits you must be able to defend (added vs base)</div>
                          <div className="text-xsmt-1">If anything below isn’t true, remove it before exporting.</div>
                          {addedPhrasesClean.length > 0 ? (
                            <div className="mt-2 space-y-2">
                              {addedPhrasesClean.slice(0, 10).map((p) => (
                                <div key={p} className="flex items-start justify-between gap-3">
                                  <div className="text-sm leading-6">{p}</div>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 p-0" onClick={() => copyToClipboard(p)} title="Copy">
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-sm">No tracked edits yet.</div>
                          )}
                          {prepFocus.length > 0 && (
                            <div className="mt-4 text-sm">
                              <div className="font-medium">Top interview focus areas (pick 5)</div>
                              <div className="text-xsmt-1">For each: one STAR story + one metric + one trade-off.</div>
                              <div className="mt-2">{prepFocus.slice(0, 5).join(' • ')}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {jdSkillExtraction && (
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle className="text-base">JD skill extraction (quick map)</CardTitle>
                  <CardDescription>Use this as a checklist for your Summary + Skills ordering.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  {[
                    ['Core Technical Skills', jdSkillExtraction.core_technical_skills],
                    ['Platform / Cloud / Tooling', jdSkillExtraction.platform_cloud_tooling],
                    ['Architecture & Systems', jdSkillExtraction.architecture_systems],
                    ['Leadership & Org Design', jdSkillExtraction.leadership_org_design],
                    ['Business & Strategy', jdSkillExtraction.business_strategy],
                  ]
                    .filter(([, arr]: any) => Array.isArray(arr) && arr.length)
                    .map(([label, arr]: any) => (
                      <div key={label} className="space-y-2">
                        <div className="text-sm font-medium">{label}</div>
                        <div className="flex flex-wrap gap-2">
                          {(arr as any[]).slice(0, 18).map((t, i) => (
                            <Badge key={`${label}-${i}`} variant="secondary">
                              {cleanPhrase(t)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  {[
                    jdSkillExtraction.core_technical_skills,
                    jdSkillExtraction.platform_cloud_tooling,
                    jdSkillExtraction.architecture_systems,
                    jdSkillExtraction.leadership_org_design,
                    jdSkillExtraction.business_strategy,
                  ].every((a: any) => !Array.isArray(a) || a.length === 0) && (
                    <div className="text-sm">No skill groups extracted.</div>
                  )}
                </CardContent>
              </Card>
            )}

            {(visibleImprovements.length > 0 || debugImprovements.length > 0) && (
              <Card className="card-elevated">
                <CardHeader>
                  <CardTitle className="text-base">Advanced</CardTitle>
                  <CardDescription>Optional details for debugging and deep review.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible>
                    <AccordionItem value="diagnostics">
                      <AccordionTrigger>Diagnostics</AccordionTrigger>
                      <AccordionContent>
                        {visibleImprovements.length > 0 && (
                          <div className="text-sm">
                            <div className="font-medium">Improvement ideas</div>
                            <ul className="mt-2 list-disc pl-5space-y-1">
                              {visibleImprovements.slice(0, 10).map((t, i) => (
                                <li key={i}>{cleanPhrase(t)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {debugImprovements.length > 0 && (
                          <div className="mt-4 text-xs">
                            {debugImprovements.map((t, i) => (
                              <div key={i}>{cleanPhrase(t)}</div>
                            ))}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}

