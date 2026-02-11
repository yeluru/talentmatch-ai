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
import { FileText, Plus, Save, Trash2, Clock, Download, Sparkles, X, Search, Briefcase, Copy, Zap, Target, BrainCircuit, BarChart3, ChevronRight, Settings2, Minimize2, Maximize2, Loader2, AlertTriangle, Terminal, User, GraduationCap, Award, GitCompare } from 'lucide-react';
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
    <div className="space-y-3 font-sans">
      <div className="flex items-end justify-between gap-3">
        <Label className="font-display font-semibold text-foreground">{label}</Label>
        <div className="text-xs text-muted-foreground tabular-nums">
          {values.length}/{max}
        </div>
      </div>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-blue-500/10 bg-blue-500/5">
          {values.map((v, idx) => (
            <Badge key={`${v}-${idx}`} variant="secondary" className="gap-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/20 font-sans">
              <span className="max-w-[260px] truncate">{v}</span>
              <button
                type="button"
                className="ml-1 inline-flex items-center justify-center rounded-full w-4 h-4 hover:bg-blue-500/30 transition-colors"
                onClick={() => removeAt(idx)}
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {values.length === 0 && (
        <div className="text-sm text-muted-foreground font-sans p-2 italic">No skills added yet.</div>
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
          className="bg-background border border-border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 rounded-lg font-sans transition-all"
        />
        <Button type="button" variant="secondary" onClick={addFromDraft} disabled={!draft.trim()} className="rounded-lg font-sans font-medium hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/20">
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
        <div className="flex flex-col items-center justify-center min-h-[360px] gap-5 font-sans">
          <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" strokeWidth={1.5} />
          </div>
          <div className="text-center space-y-1">
            <h2 className="font-display text-xl font-bold text-foreground">Resume Workspace</h2>
            <p className="text-sm text-muted-foreground">Loading your workspace…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="flex flex-col flex-1 min-h-0 max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full font-sans overflow-hidden animate-in fade-in duration-500">

          {/* Header — fixed */}
          <div className="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
                  <BarChart3 className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground">Resume <span className="text-gradient-candidate">Workspace</span></h1>
              </div>
              <p className="text-lg text-muted-foreground font-sans leading-relaxed max-w-xl">
                Craft and optimize target resumes. Tailor to job descriptions, then use live ATS insights to improve match.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Button variant="outline" onClick={createNewDoc} className="rounded-lg px-5 h-11 border border-blue-500/20 hover:bg-blue-500/10 transition-all font-sans font-semibold">
                <Plus className="mr-2 h-4 w-4" strokeWidth={1.5} />
                New Doc
              </Button>
              <Button onClick={saveDoc} disabled={isSaving || !selected} className="rounded-lg px-6 h-11 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-sans font-semibold shadow-lg transition-all">
                <Save className="mr-2 h-4 w-4" strokeWidth={1.5} />
                {isSaving ? 'Saving…' : 'Save Resume'}
              </Button>
            </div>
          </div>

          {/* Tailoring — fixed */}
          <Accordion type="single" collapsible className="w-full shrink-0">
            <AccordionItem value="tailoring" className="border-none">
              <div className="rounded-xl border border-border bg-card overflow-hidden transition-all duration-300 hover:border-blue-500/20">
                <AccordionTrigger className="px-6 py-4 hover:bg-blue-500/5 transition-colors no-underline group hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Settings2 className="h-4 w-4 text-blue-500 group-hover:rotate-90 transition-transform duration-300" strokeWidth={1.5} />
                    <span className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
                      Tailoring Configuration
                    </span>
                    {(!selectedJobId || !selectedBaseResumeId) && (
                      <Badge variant="outline" className="ml-2 text-[10px] font-sans bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400 animate-pulse">
                        Setup Required
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-6 border-t border-blue-500/10">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* JD Source */}
                    <div className="lg:col-span-12 space-y-4">
                      {resumes.length === 0 ? (
                        <div className="p-12 text-center rounded-2xl border-2 border-dashed border-blue-500/25 bg-gradient-to-b from-blue-500/5 to-transparent transition-all hover:border-blue-500/40 hover:bg-blue-500/10">
                          <div className="w-16 h-16 rounded-2xl bg-blue-500/15 flex items-center justify-center mx-auto mb-4">
                            <FileText className="h-8 w-8 text-blue-500" strokeWidth={1.5} />
                          </div>
                          <h4 className="text-xl font-display font-bold text-foreground mb-2">No Base Resumes Found</h4>
                          <p className="text-muted-foreground font-sans max-w-sm mx-auto mb-6 leading-relaxed">
                            Upload a baseline resume in My Resumes to start tailoring versions for target jobs.
                          </p>
                          <Button onClick={() => navigate('/candidate/resumes')} className="rounded-lg h-11 px-6 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-sans font-semibold">
                            Go to My Resumes
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-4">
                            <Label className="text-xs font-display font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">1. Target Job Description</Label>
                            <Tabs value={jobInputMode} onValueChange={(v) => setJobInputMode(v as 'existing' | 'custom')}>
                              <TabsList className="bg-muted/30 border border-blue-500/10 p-1 h-10 mb-4 rounded-lg">
                                <TabsTrigger value="existing" className="text-xs font-sans data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 rounded-md flex-1">Select Job</TabsTrigger>
                                <TabsTrigger value="custom" className="text-xs font-sans data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 rounded-md flex-1">Paste JD</TabsTrigger>
                              </TabsList>
                              <TabsContent value="existing" className="space-y-3">
                                <div className="relative group">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-blue-500 transition-colors" strokeWidth={1.5} />
                                  <Input
                                    placeholder="Search active jobs..."
                                    value={jobSearchQuery}
                                    onChange={(e) => setJobSearchQuery(e.target.value)}
                                    className="pl-9 bg-background border border-border focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 text-sm h-11 font-sans rounded-lg"
                                  />
                                </div>
                                <div className="max-h-[160px] overflow-y-auto space-y-1 bg-muted/30 border border-border rounded-xl p-1.5">
                                  {filteredJobs.length === 0 ? (
                                    <p className="text-xs text-center py-6 text-muted-foreground font-sans">No matching jobs found.</p>
                                  ) : (
                                    filteredJobs.slice(0, 50).map((job) => (
                                      <button
                                        key={job.id}
                                        onClick={() => handleJobSelect(job.id)}
                                        className={`w-full text-left p-2.5 rounded-lg transition-all text-sm font-sans ${selectedJobId === job.id
                                          ? 'bg-blue-500/20 border border-blue-500/30 text-blue-600 dark:text-blue-400'
                                          : 'hover:bg-blue-500/10 border border-transparent text-foreground'
                                          }`}
                                      >
                                        <div className="font-semibold">{job.title}</div>
                                        <div className="text-[10px] text-muted-foreground uppercase tracking-tighter mt-0.5">{job.organization_name}</div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </TabsContent>
                              <TabsContent value="custom">
                                <Textarea
                                  className="min-h-[220px] bg-background border border-border focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 text-sm leading-relaxed font-sans rounded-lg"
                                  placeholder="Paste the target JD text here..."
                                  value={jdText}
                                  onChange={(e) => setJdText(e.target.value)}
                                />
                              </TabsContent>
                            </Tabs>
                          </div>

                          <div className="space-y-6">
                            <div className="space-y-4">
                              <Label className="text-xs font-display font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">2. Base Profile & Preferences</Label>
                              <div className="space-y-4">
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] font-sans text-muted-foreground uppercase tracking-wider">Baseline Resume</Label>
                                  <Select value={selectedBaseResumeId} onValueChange={setSelectedBaseResumeId}>
                                    <SelectTrigger className="bg-background border border-border focus:ring-2 focus:ring-blue-500/20 h-11 rounded-lg font-sans">
                                      <SelectValue placeholder="Choose profile..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {resumes.map(r => (
                                        <SelectItem key={r.id} value={r.id}>
                                          <span className="font-medium">{r.file_name}</span>
                                          {r.is_primary && <span className="ml-2 text-[10px] text-blue-600 dark:text-blue-400">(Primary)</span>}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] font-sans text-muted-foreground uppercase tracking-wider">Target Role Title</Label>
                                  <Input
                                    value={targetTitle}
                                    onChange={(e) => setTargetTitle(e.target.value)}
                                    placeholder="e.g., Sr. Software Engineer"
                                    className="bg-background border border-border focus:ring-2 focus:ring-blue-500/20 h-11 rounded-lg font-sans"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] font-sans text-muted-foreground uppercase tracking-wider">Guidance (AI Prompt)</Label>
                                  <Input
                                    value={additionalNotes}
                                    onChange={(e) => setAdditionalNotes(e.target.value)}
                                    placeholder="e.g., focus on leadership and cloud scale..."
                                    className="bg-background border border-border focus:ring-2 focus:ring-blue-500/20 h-11 rounded-lg font-sans"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="pt-2 flex flex-col gap-3">
                              <Button
                                onClick={generateTailoredResume}
                                disabled={isGenerating || !selectedBaseResumeId}
                                className="w-full h-12 text-base font-display font-bold shadow-xl btn-candidate-primary rounded-full animate-in slide-in-from-bottom-2"
                              >
                                {isGenerating ? (
                                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" strokeWidth={1.5} /> Tailoring...</>
                                ) : (
                                  <><Sparkles className="mr-2 h-5 w-5" /> Generate Tailored Resume</>
                                )}
                              </Button>
                              {generateError && <p className="text-xs text-destructive text-center font-sans">{generateError}</p>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>
          </Accordion>

          {/* Main content — scrolls inside this area */}
          <div className="flex-1 min-h-0 overflow-y-auto pb-12">
          <div className="space-y-6">
            {/* Row 1: My Resumes + Editor — height fits Contact form with no scroll; longer tabs scroll inside */}
            <div className="grid gap-6 lg:grid-cols-12 items-stretch h-[864px]">
            {/* My Resumes — fixed height column, list scrolls */}
            <div className="rounded-xl border border-border bg-card lg:col-span-3 flex flex-col p-0 overflow-hidden h-full min-h-0 lg:sticky lg:top-6 transition-all duration-300 hover:border-blue-500/20">
              <div className="shrink-0 p-4 border-b border-blue-500/10 bg-blue-500/5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">My Resumes</h3>
                  <Badge variant="outline" className="text-[10px] font-sans py-0 h-5 px-1.5 border-blue-500/20 text-blue-600 dark:text-blue-400">{docs.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-sans">Drafts & versions</p>
              </div>
              <div className="flex-1 min-h-0 p-2 flex flex-col">
                <ScrollArea className="h-full min-h-0 flex-1 pr-2">
                  <div className="space-y-2">
                    {docs.map((d) => (
                      <div
                        key={d.id}
                        className={`group w-full rounded-lg border p-2.5 transition-all duration-200 ${d.id === selectedDocId
                          ? 'bg-blue-500/10 border-blue-500/20 ring-1 ring-blue-500/10 shadow-sm'
                          : 'border-blue-500/5 bg-transparent hover:bg-blue-500/5'
                          }`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedDocId(d.id)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedDocId(d.id)}
                      >
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold leading-tight line-clamp-1 transition-colors ${d.id === selectedDocId ? 'text-blue-600 dark:text-blue-400' : 'text-foreground/80'}`}>
                            {d.title}
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-1">
                            <div className="text-[9px] text-muted-foreground flex items-center gap-1 min-w-0 opacity-60 group-hover:opacity-100 transition-opacity">
                              <Clock className="h-2.5 w-2.5" strokeWidth={1.5} />
                              <span className="truncate">{new Date(d.updated_at).toLocaleDateString()}</span>
                            </div>
                            <div
                              className={`flex items-center gap-0.5 transition-all duration-300 ${d.id === selectedDocId ? 'opacity-100 scale-100' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                                }`}
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="p-1 rounded-md hover:bg-blue-500/20 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void saveWorkspaceDocToMyResumes(d);
                                    }}
                                  >
                                    <Save className="h-3 w-3" strokeWidth={1.5} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[10px]">Save to My Resumes</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="p-1 rounded-md hover:bg-blue-500/20 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void downloadWorkspaceDocPdf(d);
                                    }}
                                  >
                                    <Download className="h-3 w-3" strokeWidth={1.5} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[10px]">PDF</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    className="p-1 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void deleteWorkspaceDoc(d);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-[10px]">Delete</TooltipContent>
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
              </div>
            </div>

            {/* Editor — same row, fixed height, content scrolls */}
            <div className="lg:col-span-9 min-w-0 flex flex-col h-full min-h-0">
            <div className="rounded-xl border border-border bg-card flex flex-col flex-1 h-full min-h-0 p-6 overflow-hidden transition-all duration-300 hover:border-blue-500/20">
              <div className="shrink-0 mb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-display text-xl font-bold text-foreground">Editor</h3>
                    <p className="text-muted-foreground font-sans mt-1 text-sm line-clamp-1">
                      {selected ? 'Edit sections below. Changes autosave.' : 'Select a resume document from the left.'}
                    </p>
                  </div>
                  {selected && (
                    <p className="text-xs text-muted-foreground font-sans shrink-0">
                      {isAutoSaving ? 'Saving…' : autoSaveError ? `Error: ${autoSaveError}` : lastAutoSavedAt ? 'Autosaved' : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden pr-1 -mr-1">
                {!selected ? (
                  <div className="rounded-xl border border-border bg-card p-8 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" strokeWidth={1.5} />
                    <p className="text-base font-sans text-muted-foreground">Select a document from the left to edit.</p>
                  </div>
                ) : (
                  <>
                    <div className="shrink-0 mb-6 text-sm font-sans">
                      <span className="font-semibold text-foreground">{selected.title}</span>
                    </div>

                    <Tabs defaultValue="contact" className="w-full flex flex-col flex-1 min-h-0">
                      <div className="shrink-0 overflow-x-auto no-scrollbar -mx-1 px-1 pb-4">
                        <TabsList className="bg-muted/30 border border-blue-500/10 p-1 flex w-full sm:w-fit h-auto gap-1 rounded-xl">
                          <TabsTrigger value="contact" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 transition-all flex-1 sm:flex-none">Contact</TabsTrigger>
                          <TabsTrigger value="summary" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 transition-all flex-1 sm:flex-none">Summary</TabsTrigger>
                          <TabsTrigger value="skills" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 transition-all flex-1 sm:flex-none">Skills</TabsTrigger>
                          <TabsTrigger value="experience" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 transition-all flex-1 sm:flex-none">Experience</TabsTrigger>
                          <TabsTrigger value="education" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 transition-all flex-1 sm:flex-none">Education</TabsTrigger>
                          <TabsTrigger value="certs" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 transition-all flex-1 sm:flex-none">Certs</TabsTrigger>
                          <TabsTrigger value="changes" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 transition-all flex-1 sm:flex-none">Changes</TabsTrigger>
                        </TabsList>
                      </div>

                      <TabsContent value="contact" className="mt-6 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
                        <section className="flex flex-col flex-1 min-h-0">
                          <div className="shrink-0 flex items-center gap-2 mb-2">
                            <User className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                            <h4 className="text-lg font-display font-bold text-foreground">Document name & contact</h4>
                          </div>
                          <p className="shrink-0 text-base text-muted-foreground font-sans mb-4">This name is used for the file when you export. Contact details appear at the top of your resume.</p>
                          <div className="rounded-xl border border-border bg-card p-6 space-y-5 font-sans flex-1 min-h-0 overflow-y-auto">
                            <div>
                              <Label htmlFor="resume-title" className="text-sm font-sans font-medium text-muted-foreground">Resume name (export filename)</Label>
                              <Input
                                id="resume-title"
                                value={selected.title}
                                onChange={(e) => updateSelected({ title: e.target.value })}
                                placeholder="e.g., Senior Data Scientist"
                                className="mt-1.5 h-11 border-border bg-background rounded-lg font-sans text-base focus:ring-2 focus:ring-blue-500/20"
                              />
                            </div>
                            <div className="grid gap-5 sm:grid-cols-2">
                              <div>
                                <Label className="text-sm font-sans font-medium text-muted-foreground">Full name</Label>
                                <Input
                                  value={String(selected.content_json?.contact?.full_name || '')}
                                  onChange={(e) => updateContactField('full_name', e.target.value)}
                                  placeholder="Full name"
                                  className="mt-1.5 h-11 border-border bg-background rounded-lg font-sans focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-sans font-medium text-muted-foreground">Location</Label>
                                <Input
                                  value={String(selected.content_json?.contact?.location || '')}
                                  onChange={(e) => updateContactField('location', e.target.value)}
                                  placeholder="City, State"
                                  className="mt-1.5 h-11 border-border bg-background rounded-lg font-sans focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-sans font-medium text-muted-foreground">Phone</Label>
                                <Input
                                  value={String(selected.content_json?.contact?.phone || '')}
                                  onChange={(e) => updateContactField('phone', e.target.value)}
                                  placeholder="+1 (555) 000-0000"
                                  className="mt-1.5 h-11 border-border bg-background rounded-lg font-sans focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-sans font-medium text-muted-foreground">Email</Label>
                                <Input
                                  value={String(selected.content_json?.contact?.email || '')}
                                  onChange={(e) => updateContactField('email', e.target.value)}
                                  placeholder="you@example.com"
                                  className="mt-1.5 h-11 border-border bg-background rounded-lg font-sans focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <Label className="text-sm font-medium text-muted-foreground">LinkedIn</Label>
                                <Input
                                  value={String(selected.content_json?.contact?.linkedin_url || '')}
                                  onChange={(e) => updateContactField('linkedin_url', e.target.value)}
                                  placeholder="linkedin.com/in/…"
                                  className="mt-1.5 h-11 border-border bg-background rounded-lg font-sans focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <Label className="text-sm font-sans font-medium text-muted-foreground">GitHub (optional)</Label>
                                <Input
                                  value={String(selected.content_json?.contact?.github_url || '')}
                                  onChange={(e) => updateContactField('github_url', e.target.value)}
                                  placeholder="github.com/…"
                                  className="mt-1.5 h-11 border-border bg-background rounded-lg font-sans focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground pt-1">Tailoring overwrites contact from the base resume; you can edit here after.</p>
                          </div>
                        </section>
                      </TabsContent>

                      <TabsContent value="summary" className="mt-6 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
                        <section className="flex flex-col flex-1 min-h-0">
                          <div className="shrink-0 flex items-center gap-2 mb-2">
                            <Briefcase className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                            <h4 className="text-lg font-display font-bold text-foreground">Professional summary</h4>
                          </div>
                          <p className="shrink-0 text-base text-muted-foreground font-sans mb-4">2–3 sentences that highlight your background and fit for the role. Recruiters read this first.</p>
                          <div className="rounded-xl border border-border bg-card p-6 flex-1 min-h-0 flex flex-col">
                            <Textarea
                              className="min-h-[280px] flex-1 w-full bg-background border-border focus:ring-2 focus:ring-blue-500/20 rounded-lg font-sans text-base leading-relaxed resize-none"
                              value={selected.content_json.summary || ''}
                              onChange={(e) => updateContent({ summary: e.target.value })}
                              placeholder="Write a concise summary of your background and strengths. Aim for 2–4 sentences."
                            />
                          </div>
                        </section>
                      </TabsContent>

                      <TabsContent value="skills" className="mt-6 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
                        <section className="flex flex-col flex-1 min-h-0">
                          <div className="shrink-0 flex items-center gap-2 mb-2">
                            <Sparkles className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                            <h4 className="text-lg font-display font-bold text-foreground">Technical skills</h4>
                          </div>
                          <p className="shrink-0 text-base text-muted-foreground font-sans mb-4">ATS and recruiters match on these. Use exact phrases from the job description when honest.</p>
                          <div className="rounded-xl border border-border bg-card p-6 flex-1 min-h-0 overflow-y-auto">
                            <SkillChipsEditor
                              label="Technical skills (ATS keywords)"
                              values={selected.content_json.skills?.technical || []}
                              max={80}
                              placeholder="e.g. React, Python, AWS (comma separated)"
                              onChange={(next) =>
                                updateContent({
                                  skills: {
                                    ...(selected.content_json.skills || {}),
                                    technical: next.slice(0, 80),
                                  },
                                })
                              }
                            />
                          </div>
                        </section>
                        <section className="flex flex-col flex-1 min-h-0 mt-8">
                          <div className="shrink-0 flex items-center gap-2 mb-2">
                            <Target className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                            <h4 className="text-lg font-display font-bold text-foreground">Leadership & execution</h4>
                          </div>
                          <p className="shrink-0 text-base text-muted-foreground font-sans mb-4">Soft skills and leadership phrases that appear in many job descriptions.</p>
                          <div className="rounded-xl border border-border bg-card p-6 flex-1 min-h-0 overflow-y-auto">
                            <SkillChipsEditor
                              label="Leadership & execution skills"
                              values={selected.content_json.skills?.soft || []}
                              max={60}
                              placeholder="e.g. Cross-functional, Agile, Stakeholder (comma separated)"
                              onChange={(next) =>
                                updateContent({
                                  skills: {
                                    ...(selected.content_json.skills || {}),
                                    soft: next.slice(0, 60),
                                  },
                                })
                              }
                            />
                            <p className="text-xs text-muted-foreground font-sans mt-4 pt-4 border-t border-border">If a JD keyword can’t go in Experience bullets, keep it here so ATS still matches.</p>
                          </div>
                        </section>
                      </TabsContent>

                      <TabsContent value="experience" className="mt-6 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
                        <section className="flex flex-col flex-1 min-h-0">
                          <div className="shrink-0 flex items-center gap-2 mb-2">
                            <Briefcase className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                            <h4 className="text-lg font-display font-bold text-foreground">Experience</h4>
                          </div>
                          <p className="shrink-0 text-base text-muted-foreground font-sans mb-4">One role per block. First line = title — company. Following lines = bullets. Separate blocks with a blank line.</p>
                          <div className="rounded-xl border border-border bg-card p-6 flex-1 min-h-0 flex flex-col">
                        <Textarea
                          className="min-h-0 flex-1 bg-background border-border focus:ring-2 focus:ring-blue-500/20 rounded-lg font-mono text-sm leading-relaxed font-sans resize-none"
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
                          </div>
                        </section>
                      </TabsContent>

                      <TabsContent value="education" className="mt-6 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
                        <section className="flex flex-col flex-1 min-h-0">
                          <div className="shrink-0 flex items-center gap-2 mb-2">
                            <GraduationCap className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                            <h4 className="text-lg font-display font-bold text-foreground">Education</h4>
                          </div>
                          <p className="shrink-0 text-base text-muted-foreground font-sans mb-4">One entry per line (e.g. degree • school • year).</p>
                          <div className="rounded-xl border border-border bg-card p-6 flex-1 min-h-0 flex flex-col">
                        <Textarea
                          className="min-h-0 flex-1 bg-background border-border focus:ring-2 focus:ring-blue-500/20 rounded-lg font-sans text-base resize-none"
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
                          </div>
                        </section>
                      </TabsContent>

                      <TabsContent value="certs" className="mt-6 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
                        <section className="flex flex-col flex-1 min-h-0">
                          <div className="shrink-0 flex items-center gap-2 mb-2">
                            <Award className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                            <h4 className="text-lg font-display font-bold text-foreground">Certifications</h4>
                          </div>
                          <p className="shrink-0 text-base text-muted-foreground font-sans mb-4">One certification per line.</p>
                          <div className="rounded-xl border border-border bg-card p-6 flex-1 min-h-0 flex flex-col">
                        <Textarea
                          className="min-h-0 flex-1 bg-background border-border focus:ring-2 focus:ring-blue-500/20 rounded-lg font-sans text-base resize-none"
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
                          </div>
                        </section>
                      </TabsContent>

                      <TabsContent value="changes" className="mt-6 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
                        <section className="flex flex-col flex-1 min-h-0">
                          <div className="shrink-0 flex items-center gap-2 mb-2">
                            <GitCompare className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                            <h4 className="text-lg font-display font-bold text-foreground">Changes & diff</h4>
                          </div>
                          <p className="shrink-0 text-base text-muted-foreground font-sans mb-4">Compare this document to your base resume. Set a base in Tailoring Configuration first.</p>
                        {!diffBaseResumeId ? (
                          <div className="rounded-xl border border-border bg-card p-6 flex-1 min-h-0 flex items-center justify-center text-center">
                          <p className="text-base font-sans text-muted-foreground">
                            Select a <span className="font-semibold text-foreground">base resume</span> in Tailoring Configuration to compare changes.
                          </p>
                          </div>
                        ) : diffBaseLoading ? (
                          <div className="rounded-xl border border-border bg-card p-6 flex-1 min-h-0 flex items-center justify-center text-center text-base font-sans text-muted-foreground">Loading base resume…</div>
                        ) : !diff ? (
                          <div className="rounded-xl border border-border bg-card p-6 flex-1 min-h-0 flex items-center justify-center text-center text-base font-sans text-muted-foreground">
                            Could not compute changes (base resume text unavailable).
                          </div>
                        ) : (
                          <div className="space-y-6 flex-1 min-h-0 overflow-y-auto rounded-xl border border-border bg-card p-6">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between font-sans">
                              <p className="text-base text-muted-foreground">
                                Comparing <span className="font-semibold text-foreground">{diffBaseLabel || 'Base resume'}</span> → <span className="font-semibold text-foreground">{selected?.title || 'Current document'}</span>
                              </p>
                              <Button
                                variant="outline"
                                className="rounded-lg font-sans font-medium border-blue-500/30 hover:bg-blue-500/10"
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

                            <div className="grid gap-6 sm:grid-cols-2">
                              <div className="rounded-xl border border-border bg-card overflow-hidden">
                                <div className="flex flex-col space-y-1.5 p-4 border-b border-border">
                                  <h3 className="font-display font-semibold leading-none tracking-tight text-foreground">Added</h3>
                                  <p className="text-sm text-muted-foreground font-sans">{diff.added.length} lines</p>
                                </div>
                                <div className="p-4">
                                  <ScrollArea className="h-[240px]">
                                    <div className="space-y-2">
                                      {(diff.added.length ? diff.added : ['No additions detected.']).slice(0, 120).map((l, i) => (
                                        <div key={i} className="text-sm font-sans border-l-2 border-emerald-500/50 pl-2 py-0.5">
                                          <span className="text-emerald-500 font-medium">+ </span>
                                          <span className="text-foreground">{l}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                </div>
                              </div>

                              <div className="rounded-xl border border-border bg-card overflow-hidden">
                                <div className="flex flex-col space-y-1.5 p-4 border-b border-border">
                                  <h3 className="font-display font-semibold leading-none tracking-tight text-foreground">Removed</h3>
                                  <p className="text-sm text-muted-foreground font-sans">{diff.removed.length} lines</p>
                                </div>
                                <div className="p-4">
                                  <ScrollArea className="h-[240px]">
                                    <div className="space-y-2">
                                      {(diff.removed.length ? diff.removed : ['No removals detected.']).slice(0, 120).map((l, i) => (
                                        <div key={i} className="text-sm font-sans border-l-2 border-destructive/50 pl-2 py-0.5">
                                          <span className="text-destructive font-medium">- </span>
                                          <span className="text-muted-foreground">{l}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </ScrollArea>
                                </div>
                              </div>
                            </div>

                            <p className="text-xs text-muted-foreground font-sans">
                              Note: text comparison only, not a PDF pixel diff.  It’s not a PDF-to-PDF pixel diff.
                            </p>
                          </div>
                        )}
                        </section>
                      </TabsContent>
                    </Tabs>
                  </>
                )}
              </div>
            </div>
            </div>
            </div>

            {/* Row 2: ATS & insights + JD Deconstruction (own row, full width) */}
            <div className="grid gap-6 lg:grid-cols-12 items-start">
              {/* ATS & insights — left column of row 2 */}
              <div className="lg:col-span-4 space-y-5">
              {(analysisScore != null || atsEstimate != null) ? (
                <div className="animate-in fade-in duration-500 space-y-5">
                  <div className="rounded-xl bg-gradient-to-r from-blue-500/15 to-cyan-500/10 border border-blue-500/20 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
                      <h3 className="text-xl font-display font-bold text-foreground">ATS & insights</h3>
                    </div>
                    <p className="mt-1 text-sm font-sans text-muted-foreground">Live match and keyword gaps</p>
                  </div>
                  <div className="space-y-5">
                  {/* Score Card */}
                  <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-500/15 to-blue-500/5 overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:border-blue-500/30">
                    <div className="px-5 pt-5 pb-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-display font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
                          <Target className="h-4 w-4" strokeWidth={1.5} /> ATS Match
                        </span>
                        <Badge variant="outline" className="text-xs font-sans bg-blue-500/20 border-blue-500/30 text-blue-700 dark:text-blue-300">Live</Badge>
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-5xl font-display font-bold tracking-tight text-gradient-candidate">{analysisScore != null ? Math.round(analysisScore) : 0}</span>
                        <span className="text-lg font-sans font-medium text-muted-foreground">%</span>
                      </div>
                      <Progress value={analysisScore != null ? Math.round(analysisScore) : 0} className="h-2 rounded-full bg-blue-500/10 my-4" />
                      <div className="grid grid-cols-2 gap-4 pt-4 pb-5 border-t border-blue-500/15">
                        <div>
                          <div className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wider">Keywords</div>
                          <div className="text-lg font-display font-bold text-foreground tabular-nums">{derivedKeywordPct ?? 0}%</div>
                        </div>
                        <div>
                          <div className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wider">Model rank</div>
                          <div className="text-lg font-display font-bold text-foreground tabular-nums">{atsEstimate ?? 0}%</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Critical Keyword Gaps */}
                  <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/10 to-transparent p-5 shadow-sm transition-all duration-300 hover:border-amber-500/30 min-h-[160px] flex flex-col">
                    <h4 className="text-sm font-display font-bold text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4" strokeWidth={1.5} /> Critical gaps
                    </h4>
                    <p className="text-xs font-sans text-muted-foreground mb-3">JD keywords missing from your resume</p>
                    <div className="space-y-3 flex-1">
                      {filteredMissingVerbatim.length > 0 ? (
                        <>
                          <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto pr-1">
                            {filteredMissingVerbatim.slice(0, 10).map((p) => (
                              <Badge key={p} variant="secondary" className="bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/25 text-xs font-sans font-medium py-1 px-2 truncate max-w-full">
                                {p}
                              </Badge>
                            ))}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-sm font-sans text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 group rounded-lg"
                            onClick={() => copyToClipboard(filteredMissingVerbatim.slice(0, 15).join('\n'))}
                          >
                            Copy top 15 gaps
                            <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
                          </Button>
                        </>
                      ) : (
                        <div className="text-center py-6 text-sm font-sans text-muted-foreground">
                          Verbatim matching looks good.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recommendations / AI Advice */}
                  <div className="rounded-2xl border border-blue-500/20 bg-card p-5 shadow-sm transition-all duration-300 hover:border-blue-500/30 min-h-[160px] flex flex-col">
                    <h4 className="text-sm font-display font-bold text-blue-700 dark:text-blue-300 mb-3 flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4" strokeWidth={1.5} /> AI advice
                    </h4>
                    <div className="space-y-4 flex-1">
                      <div className="rounded-xl bg-blue-500/10 border-l-4 border-l-blue-500 p-4">
                        <p className="text-sm font-sans leading-relaxed text-foreground italic">
                          Place critical keywords in your Skills section first to boost ATS visibility, then weave them into experience bullets.
                        </p>
                      </div>
                      {prepFocus.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">Focus areas</div>
                          <p className="text-sm font-sans text-foreground leading-snug">{prepFocus.slice(0, 3).join(' • ')}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-dashed border-blue-500/25 bg-gradient-to-b from-blue-500/5 to-transparent p-8 text-center transition-all duration-300 hover:border-blue-500/40">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/15 flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                    <Sparkles className="h-8 w-8 text-blue-500" strokeWidth={1.5} />
                  </div>
                  <h4 className="text-base font-display font-semibold text-foreground mb-2">Real-time analysis</h4>
                  <p className="text-sm font-sans text-muted-foreground leading-relaxed max-w-xs mx-auto">
                    Generate a tailored version or select a baseline to see live ATS insights here.
                  </p>
                </div>
              )}
              </div>

              {/* JD Deconstruction + Interview Readiness — right column of row 2 */}
              <div className="lg:col-span-8">
            {(analysisScore != null ||
              atsEstimate != null ||
              (Array.isArray(analysisMissing) && analysisMissing.length > 0) ||
              (Array.isArray(keywordsMissing) && keywordsMissing.length > 0) ||
              (Array.isArray(defendWithLearning) && defendWithLearning.length > 0) ||
              (Array.isArray(visibleImprovements) && visibleImprovements.length > 0) ||
              Boolean(jdSkillExtraction) ||
              (Array.isArray(notesAddedPhrases) && notesAddedPhrases.length > 0)) && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    {/* JD Deconstruction + Interview Readiness */}
                    <div className="rounded-2xl border border-blue-500/20 bg-card overflow-hidden shadow-sm transition-all duration-300 hover:border-blue-500/30 hover:shadow-md">
                      <div className="bg-gradient-to-r from-blue-500/15 to-cyan-500/10 border-b border-blue-500/20 px-6 py-5">
                        <h3 className="font-display font-bold text-xl text-foreground flex items-center gap-2">
                          <BrainCircuit className="h-5 w-5 text-blue-600 dark:text-blue-400" strokeWidth={1.5} />
                          JD Deconstruction + Interview Readiness
                        </h3>
                        <p className="mt-1 text-sm font-sans text-muted-foreground">Strategic insights from the JD and your tailored resume.</p>
                      </div>
                      <div className="p-6">
                        <Tabs defaultValue="deconstruct">
                          <TabsList className="bg-muted/40 border border-blue-500/15 p-1.5 mb-6 w-full sm:w-fit flex flex-wrap gap-1 rounded-xl">
                            <TabsTrigger value="deconstruct" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300 data-[state=active]:font-semibold">1) JD Analysis</TabsTrigger>
                            <TabsTrigger value="ats" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300 data-[state=active]:font-semibold">2) ATS Alignment</TabsTrigger>
                            <TabsTrigger value="delta" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300 data-[state=active]:font-semibold">3) Delta Skills</TabsTrigger>
                            <TabsTrigger value="metrics" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300 data-[state=active]:font-semibold">4) Red Flags</TabsTrigger>
                            <TabsTrigger value="prep" className="text-sm font-sans px-4 py-2.5 rounded-lg data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300 data-[state=active]:font-semibold">5) Interview Prep</TabsTrigger>
                          </TabsList>

                          <TabsContent value="deconstruct" className="mt-0 space-y-6">
                            <div className="grid gap-6 md:grid-cols-2">
                              <div className="rounded-xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-transparent p-5">
                                <div className="text-sm font-display font-bold text-blue-700 dark:text-blue-300 mb-3">Hard skills (matched vs potential)</div>
                                <div className="space-y-4">
                                  {jdSkillExtraction?.core_technical_skills?.length > 0 && (
                                    <div className="space-y-2">
                                      <div className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wider">Must-have keywords</div>
                                      <div className="flex flex-wrap gap-2">
                                        {jdSkillExtraction.core_technical_skills.slice(0, 15).map((k: string) => (
                                          <Badge key={k} variant="outline" className="text-xs font-sans bg-blue-500/15 border-blue-500/25 text-foreground py-1 px-2">{k}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {jdSkillExtraction?.platform_cloud_tooling?.length > 0 && (
                                    <div className="space-y-2">
                                      <div className="text-xs font-sans font-medium text-muted-foreground uppercase tracking-wider">Infrastructure & platform</div>
                                      <div className="flex flex-wrap gap-2">
                                        {jdSkillExtraction.platform_cloud_tooling.slice(0, 15).map((k: string) => (
                                          <Badge key={k} variant="outline" className="text-xs font-sans bg-blue-500/15 border-blue-500/25 text-foreground py-1 px-2">{k}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-b from-cyan-500/10 to-transparent p-5">
                                <div className="text-sm font-display font-bold text-cyan-800 dark:text-cyan-200 mb-3">Seniority & strategy</div>
                                <div className="space-y-4">
                                  <div className="p-4 rounded-xl bg-card border border-border text-sm font-sans leading-relaxed">
                                    {targetTitle?.toLowerCase().includes('senior') || targetTitle?.toLowerCase().includes('lead') || targetTitle?.toLowerCase().includes('director') ? (
                                      "Strategy focus: prioritize scope, cross-functional leadership, and P&L/metric ownership in your Summary and most recent role bullets."
                                    ) : (
                                      "Execution focus: emphasize specific technical contributions, problem-solving speed, and tool proficiency."
                                    )}
                                  </div>
                                  <ul className="text-sm font-sans text-muted-foreground space-y-2 list-disc pl-4">
                                    <li>Dial up domain-specific jargon from the JD</li>
                                    <li>Ensure top 3 bullets in most recent role use JD verbs</li>
                                    <li>Match the implicit level of the JD (strategic vs tactical)</li>
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="ats" className="mt-0">
                            <div className="rounded-xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-transparent p-6">
                              <div className="flex items-center justify-between mb-4">
                                <div className="text-base font-display font-semibold text-foreground">Keyword coverage</div>
                                <div className="text-2xl font-display font-bold text-blue-600 dark:text-blue-400 tabular-nums">{derivedKeywordPct ?? 0}%</div>
                              </div>
                              <Progress value={derivedKeywordPct ?? 0} className="h-2 rounded-full bg-blue-500/10 mb-6" />
                              <div className="grid gap-6 md:grid-cols-3">
                                <div className="space-y-2">
                                  <div className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">Top placement</div>
                                  <p className="text-sm font-sans text-foreground leading-relaxed">Skills first, Summary second, latest role third.</p>
                                </div>
                                <div className="space-y-2">
                                  <div className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">Exact phrases</div>
                                  <p className="text-sm font-sans text-foreground leading-relaxed">Use verbatim JD wording; replace synonyms with their terms.</p>
                                </div>
                                <div className="space-y-2">
                                  <div className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">Recency bias</div>
                                  <p className="text-sm font-sans text-foreground leading-relaxed">ATS and humans weight recent roles 2× for core keywords.</p>
                                </div>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="delta" className="mt-0">
                            <div className="rounded-xl border border-blue-500/20 bg-card overflow-hidden">
                              <table className="w-full text-sm font-sans">
                                <thead className="bg-muted/60 border-b border-border">
                                  <tr>
                                    <th className="text-left p-4 font-display font-semibold text-foreground">Delta skill / missing phrase</th>
                                    <th className="text-left p-4 font-display font-semibold text-foreground">Suggested placement</th>
                                    <th className="text-left p-4 font-display font-semibold text-foreground">Interview story</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {Array.isArray(notesAddedPhrases) && notesAddedPhrases.slice(0, 10).map((p, i) => (
                                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                                      <td className="p-4 font-medium text-emerald-600 dark:text-emerald-400">{p}</td>
                                      <td className="p-4 text-muted-foreground">Skills or Summary</td>
                                      <td className="p-4 text-muted-foreground italic">Required if used as primary skill</td>
                                    </tr>
                                  ))}
                                  {(!Array.isArray(notesAddedPhrases) || notesAddedPhrases.length === 0) && (
                                    <tr>
                                      <td colSpan={3} className="p-8 text-center text-muted-foreground italic text-sm">No JD-specific delta phrases found yet.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </TabsContent>

                          <TabsContent value="metrics" className="mt-0">
                            <div className="grid gap-6 md:grid-cols-2">
                              <div className="rounded-xl border border-orange-500/20 bg-gradient-to-b from-orange-500/10 to-transparent p-5">
                                <div className="flex items-center gap-2 mb-4">
                                  <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" strokeWidth={1.5} />
                                  <div className="text-sm font-display font-bold text-foreground">Metrics & quantifiability</div>
                                </div>
                                <div className="space-y-4">
                                  <div className="p-4 rounded-xl bg-card border border-border text-sm font-sans leading-relaxed">
                                    {metricsStrength.pct < 30 ? "Your resume is metric-lite. Add 3–5 concrete numbers (%, $, volume, scale) to your latest role to improve response rates." : "Good metric density. Ensure they relate to the ROI expected in the JD."}
                                  </div>
                                  <div className="flex items-center justify-between text-sm font-sans">
                                    <span className="text-muted-foreground">Metric density</span>
                                    <span className="font-display font-bold text-foreground tabular-nums">{metricsStrength.pct}%</span>
                                  </div>
                                  <Progress value={metricsStrength.pct} className="h-2 rounded-full bg-orange-500/10" />
                                </div>
                              </div>
                              <div className="rounded-xl border border-red-500/20 bg-gradient-to-b from-red-500/10 to-transparent p-5">
                                <div className="flex items-center gap-2 mb-4">
                                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" strokeWidth={1.5} />
                                  <div className="text-sm font-display font-bold text-foreground">Potential red flags</div>
                                </div>
                                <ul className="space-y-2">
                                  {Array.isArray(redFlags) && redFlags.length > 0 ? redFlags.slice(0, 5).map((r, i) => (
                                    <li key={i} className="flex gap-2 text-sm font-sans text-muted-foreground">
                                      <span className="text-red-500 font-bold">•</span>
                                      <span>{r}</span>
                                    </li>
                                  )) : (
                                    <li className="text-sm font-sans text-muted-foreground italic">No critical structural red flags detected.</li>
                                  )}
                                </ul>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="prep" className="mt-0">
                            <div className="rounded-xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-transparent p-6">
                              <div className="text-sm font-display font-bold text-blue-700 dark:text-blue-300 mb-4">Top 5 interview prep areas</div>
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {Array.isArray(prepFocus) && prepFocus.slice(0, 6).map((item, i) => (
                                  <div key={i} className="p-4 rounded-xl bg-card border border-border">
                                    <div className="text-blue-600 dark:text-blue-400 mb-2 font-display font-bold text-sm">Focus {i + 1}</div>
                                    <p className="text-sm font-sans text-foreground leading-snug">{item}</p>
                                  </div>
                                ))}
                                {(!Array.isArray(prepFocus) || prepFocus.length === 0) && (
                                  <p className="col-span-full py-8 text-center text-muted-foreground text-sm font-sans italic">Generate a tailored resume to see interview focus areas.</p>
                                )}
                              </div>
                            </div>
                          </TabsContent>
                        </Tabs>
                      </div>
                    </div>

                    {/* Diagnostics Accordion */}
                    <div>
                      <Accordion type="single" collapsible defaultValue="diagnostics" className="w-full">
                        <AccordionItem value="diagnostics" className="border-none">
                          <div className="rounded-2xl border border-blue-500/20 bg-card overflow-hidden shadow-sm transition-all duration-300 hover:border-blue-500/30">
                            <AccordionTrigger className="px-6 py-4 hover:bg-blue-500/5 transition-colors no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border">
                              <div className="flex items-center gap-2 text-sm font-display font-bold text-muted-foreground">
                                <Terminal className="h-4 w-4" strokeWidth={1.5} /> System diagnostics
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-6 pb-6 pt-2 border-t border-border">
                              <div className="grid gap-6 md:grid-cols-2">
                                <div className="space-y-3">
                                  <div className="text-sm font-display font-semibold text-foreground">Improvement queue</div>
                                  <div className="space-y-2">
                                    {Array.isArray(visibleImprovements) && visibleImprovements.map((t, i) => (
                                      <div key={i} className="text-sm font-sans text-muted-foreground flex gap-2">
                                        <span className="text-blue-500">•</span> {typeof t === 'string' ? t.replace(/['"\[\]]/g, '') : JSON.stringify(t)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="text-sm font-display font-semibold text-foreground">Model confidence</div>
                                  <div className="text-3xl font-display font-bold text-foreground tabular-nums">{atsEstimate ?? '—'} <span className="text-sm font-normal text-muted-foreground">/ 100</span></div>
                                  <p className="text-sm font-sans text-muted-foreground leading-relaxed">
                                    Based on semantic alignment and structural validity of the generated content.
                                  </p>
                                </div>
                              </div>
                            </AccordionContent>
                          </div>
                        </AccordionItem>
                      </Accordion>
                    </div>
                </div>
              )}

              </div>
            </div>
          </div>
          </div>
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
