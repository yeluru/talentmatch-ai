import { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileText, Plus, Save, Trash2, Clock, Download, History, Sparkles, X, Search, Briefcase } from 'lucide-react';
import { resumesObjectPath } from '@/lib/storagePaths';
import { useNavigate } from 'react-router-dom';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
} from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
        <div className="text-xs text-muted-foreground">
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
        <div className="text-sm text-muted-foreground">No skills yet.</div>
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

type ResumeVersionRow = {
  id: string;
  resume_document_id: string;
  change_summary: string | null;
  content_json: ResumeDocContent;
  created_at: string;
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
  const DOCX_LINE_GAP = 30;
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
    out = out.replaceAll(marker, ' ');
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
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of bullets.map((x) => String(x || '').trim()).filter(Boolean)) {
      const k = b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
    return out;
  };

  const exp = (doc.experience || []).map((e) => ({
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

  const header: Paragraph[] = [
    new Paragraph({
      children: [run(String(c.full_name || '').trim() || 'Resume', { bold: true, size: 36, color: '000000' })],
      spacing: { after: 60 },
    }),
  ];

  const contactLine = [
    c.location,
    c.phone,
    c.email,
    c.linkedin_url,
    c.github_url,
  ]
    .map((v) => String(v || '').trim())
    .filter((v) => v && !isPlaceholder(v))
    .join(' • ');

  if (contactLine) {
    header.push(
      new Paragraph({
        children: [run(contactLine, { size: 20, color: '000000' })],
        spacing: { after: 120 },
      }),
    );
  }

  const sectionHeading = (t: string) =>
    new Paragraph({
      // Match PDF look: thin rule ABOVE the heading + comfortable spacing after.
      children: [run(String(t || '').toUpperCase(), { bold: true, size: 19, color: '000000' })],
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
          children: [run(g.title, { bold: true, size: 22, color: '000000' })],
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
          children: [run('Professional Strengths', { bold: true, size: 22, color: '000000' })],
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
      const dates = [e.start, e.end].filter(Boolean).join(' → ');
      const meta = [dates, e.location].filter(Boolean).join(' • ');

      if (line)
        body.push(
          new Paragraph({
            children: [run(line, { bold: true, size: 22, color: '000000' })],
            spacing: { after: 60 }, // extra line break after company/role line
          }),
        );
      if (meta)
        body.push(
          new Paragraph({
            children: [run(meta, { size: 20, color: '000000' })],
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
    out = out.replaceAll(marker, ' ');
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
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of bullets.map((x) => String(x || '').trim()).filter(Boolean)) {
      const k = b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
    return out;
  };

  // Embed Outfit so PDFs look identical everywhere (no dependency on local fonts).
  // Fall back to standard fonts if the asset fails to load for any reason.
  let font = await pdf.embedFont(StandardFonts.Helvetica);
  let fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let usingWinAnsiFallback = true;
  try {
    const bytes = new Uint8Array(await (await fetch(outfitFontUrl)).arrayBuffer());
    const outfit = await pdf.embedFont(bytes, { subset: true });
    font = outfit;
    // pdf-lib doesn't provide variable weight selection; we simulate bold by drawing twice in drawParagraph().
    fontBold = outfit;
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
  const PDF_LINE_GAP = 2; // points

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
    if (!usingWinAnsiFallback) return s;
    // Standard PDF fonts are WinAnsi encoded; replace a few common Unicode characters.
    return String(s || '')
      .replaceAll('→', '->')
      .replaceAll('•', '*');
  };

  const wrapLines = (text: string, size: number, bold = false) => {
    const f = bold ? fontBold : font;
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
    // Force visual black by overdrawing with tiny offsets (increases perceived weight).
    if (!usingWinAnsiFallback) {
      // Keep body text clean; only add a subtle weight boost for headings/bold text.
      if (isBold) {
        page.drawText(text, { x: x + 0.24, y: y0, size, font: usedFont, color });
        page.drawText(text, { x: x + 0.48, y: y0, size, font: usedFont, color });
      }
      return;
    }

    // Standard fonts (Helvetica) are usually fine, but keep a subtle overdraw for extra punch.
    if (isBold) page.drawText(text, { x: x + 0.22, y: y0, size, font: usedFont, color });
  };

  const drawParagraph = (text: string, size = 10.5, bold = false, color = PDF_COLOR.text) => {
    const lines = wrapLines(text, size, bold);
    for (const line of lines) {
      ensureSpace(size + 4);
      const usedFont = bold ? fontBold : font;
      drawTextInkBoost(line, margin, y, size, usedFont, color, bold);
      y -= size + 3;
    }
  };

  const sectionHeading = (t: string) => {
    y -= 6;
    drawLine();
    ensureSpace(18);
    drawTextInkBoost(String(t || '').toUpperCase(), margin, y, 9.5, fontBold, PDF_COLOR.meta, true);
    // Extra line break after section heading (readability).
    y -= 22;
  };

  const c = cleanContact(doc.contact || {});
  const name = String(c.full_name || title || 'Resume').trim();
  ensureSpace(40);
  drawTextInkBoost(name, margin, y, 20, fontBold, PDF_COLOR.text, true);
  y -= 26;

  const contactLine = [c.location, c.phone, c.email, c.linkedin_url, c.github_url].map((v) => String(v || '').trim()).filter(Boolean).join(' • ');
  if (contactLine) drawParagraph(contactLine, 10, false, PDF_COLOR.meta);

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
      drawParagraph(g.title, 10.6, true, PDF_COLOR.text);
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
      drawParagraph('Professional Strengths', 10.6, true, PDF_COLOR.text);
      y -= 2;
      for (const l of skillsToWrappedLines(soft, 40, { maxItemsPerLine: 6, maxCharsPerLine: 72 })) {
        drawParagraph(l, 10.4, false, PDF_COLOR.muted);
        y -= 2;
      }
      y -= 6;
    }
  }

  const exp = (doc.experience || []).map((e) => ({
    ...e,
    bullets: dedupeBullets(Array.isArray(e?.bullets) ? e.bullets : []),
  }));
  if (exp.length) {
    sectionHeading('Professional Experience');
    for (const e of exp) {
      const role = [e.title, e.company].filter(Boolean).join(' — ');
      const dates = [e.start, e.end].filter(Boolean).join(' → ');
      const meta = [dates, e.location].filter(Boolean).join(' • ');
      if (role) drawParagraph(role, 10.9, true, PDF_COLOR.text);
      // Line break after company/role line.
      if (role) y -= 3;
      if (meta) drawParagraph(meta, 9.8, false, PDF_COLOR.meta);
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
  return new Blob([bytes], { type: 'application/pdf' });
}

export default function ResumeWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [docs, setDocs] = useState<ResumeDocumentRow[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ResumeVersionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [checkpointNote, setCheckpointNote] = useState('');

  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedBaseResumeId, setSelectedBaseResumeId] = useState<string>('');
  const [targetTitle, setTargetTitle] = useState<string>('');
  const [jdText, setJdText] = useState<string>(''); // used when pasting a custom JD
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

  const selected = useMemo(() => docs.find((d) => d.id === selectedDocId) || null, [docs, selectedDocId]);

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
          .select('id, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (cpErr) throw cpErr;
        const cp = (cpRows || [])[0] as any;
        if (!cp?.id) throw new Error('Candidate profile not found');
        setCandidateId(cp.id);
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
      .from('resume_documents')
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
    }
  };

  async function fetchVersions(docId: string) {
    const { data, error } = await supabase
      .from('resume_document_versions')
      .select('id, resume_document_id, change_summary, content_json, created_at')
      .eq('resume_document_id', docId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    setVersions(((data || []) as any[]).map((v) => ({ ...v, content_json: safeContent(v.content_json) })) as ResumeVersionRow[]);
  }

  useEffect(() => {
    if (!selectedDocId) return;
    fetchVersions(selectedDocId).catch((e) => console.warn(e));
  }, [selectedDocId]);

  async function ensureResumeParsed(resumeRow: any): Promise<{ parsed: any; extractedText: string | null }> {
    const existing = resumeRow?.parsed_content?.parsed;
    const existingDiagnostics = resumeRow?.parsed_content?.diagnostics || null;
    const parserVersion = (existingDiagnostics as any)?.parser_version || null;
    const CURRENT_PARSER_VERSION = '2026-01-12-parse-resume-v2';
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

    const filePath = resumesObjectPath(resumeRow?.file_url);
    if (!filePath) throw new Error('Could not resolve base resume storage path');

    const { data: signed, error: signedErr } = await supabase.storage
      .from('resumes')
      .createSignedUrl(filePath, 900);
    if (signedErr) throw signedErr;
    if (!signed?.signedUrl) throw new Error('Could not create signed URL for base resume');

    const resp = await fetch(signed.signedUrl);
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

      const resumeDoc = (data as any)?.resume_doc as ResumeDocContent | undefined;
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

      if (!resumeDoc) throw new Error('Tailor-resume returned no resume_doc');

      // Compute a consistent match score using the SAME analyzer used in "AI Resume Check".
      let analyzerScore: number | null = null;
      let tailoredMatchedCount: number | null = null;
      let tailoredKeywordTotal: number | null = null;
      let tailoredMatchedPhrases: string[] = [];
      let addedPhrases: string[] = [];
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
        setAnalysisMissing(Array.isArray(missingPhrases) ? missingPhrases.slice(0, 30).map((s: any) => String(s)) : []);
        setAnalysisMatched(Array.isArray(matchedPhrases) ? matchedPhrases.slice(0, 30).map((s: any) => String(s)) : []);
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
          analyzer_missing: analysisMissing, // JD phrases missing (verbatim) per analyzer
          analyzer_matched: analysisMatched, // JD phrases matched (verbatim) per analyzer
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
          .from('resume_documents')
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
            .from('resume_documents')
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
          .from('resume_documents')
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
      contact: {},
      summary: '',
      skills: { technical: [], soft: [] },
      experience: [],
      education: [],
      certifications: [],
    };
    const { data, error } = await supabase
      .from('resume_documents')
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
        .from('resume_documents')
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

  async function saveCheckpoint() {
    if (!selected) return;
    try {
      const { error } = await supabase
        .from('resume_document_versions')
        .insert({
          resume_document_id: selected.id,
          content_json: selected.content_json,
          change_summary: checkpointNote.trim() || null,
          created_by: user?.id || null,
        } as any);
      if (error) throw error;
      setCheckpointNote('');
      toast.success('Checkpoint saved');
      await fetchVersions(selected.id);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save checkpoint');
    }
  }

  async function restoreVersion(v: ResumeVersionRow) {
    if (!selected) return;
    setDocs((prev) => prev.map((d) => (d.id === selected.id ? { ...d, content_json: v.content_json } : d)));
    toast.message('Version loaded', { description: 'Review the document, then click Save Changes to persist.' });
  }

  async function deleteDoc() {
    if (!selected) return;
    if (!confirm('Delete this resume document? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('resume_documents').delete().eq('id', selected.id);
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

  function updateSelected(patch: Partial<ResumeDocumentRow>) {
    if (!selected) return;
    setDocs((prev) => prev.map((d) => (d.id === selected.id ? { ...d, ...patch } : d)));
  }

  function updateContent(patch: Partial<ResumeDocContent>) {
    if (!selected) return;
    updateSelected({ content_json: { ...(selected.content_json || {}), ...patch } });
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Resume Workspace</h1>
            <p className="text-muted-foreground mt-1">
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
              <div className="text-sm text-muted-foreground">
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
                    <div className="text-xs text-muted-foreground">This becomes the saved resume name.</div>
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
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search jobs by title or company..."
                            value={jobSearchQuery}
                            onChange={(e) => setJobSearchQuery(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        <div className="max-h-[200px] overflow-y-auto space-y-2 border rounded-md p-2">
                          {filteredJobs.length === 0 ? (
                            <p className="text-muted-foreground text-sm text-center py-4">
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
                                <p className="text-xs text-muted-foreground">
                                  {job.organization_name} {job.location && `• ${job.location}`}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">Tip: you can edit the JD in “Paste JD” after selecting a job.</div>
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

                <div className="flex items-center gap-2">
                  <Button onClick={generateTailoredResume} disabled={isGenerating}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isGenerating ? 'Generating…' : 'Generate tailored resume'}
                  </Button>
                </div>
                {generateError ? <div className="text-sm text-destructive">{generateError}</div> : null}

                {(analysisScore != null || atsEstimate != null || analysisMissing.length > 0) && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    {analysisScore != null && (
                      <div className="text-sm">
                        <span className="font-medium">JD match score (canonical):</span> {Math.round(analysisScore)}%
                      </div>
                    )}
                    {analysisMissing.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Missing JD phrases (verbatim):</span>{' '}
                        {analysisMissing.slice(0, 12).join(', ')}
                      </div>
                    )}
                    {atsEstimate != null && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Model estimate (not canonical):</span> {Math.round(atsEstimate)}%
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Details moved below: “Scoring details”, “Gap plan”, and “Candidate notes”.
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-12 lg:min-h-[calc(100vh-360px)]">
          {/* Left: docs list */}
          <Card className="lg:col-span-3 card-elevated flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">My Resumes</CardTitle>
              <CardDescription>Saved, editable resumes from this workspace</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <ScrollArea className="h-full pr-2">
                <div className="space-y-2">
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      className={`w-full text-left rounded-md border p-3 transition ${
                        d.id === selectedDocId ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                      }`}
                      onClick={() => setSelectedDocId(d.id)}
                    >
                      <div className="font-medium line-clamp-1">{d.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3" />
                        {new Date(d.updated_at).toLocaleString()}
                      </div>
                    </button>
                  ))}
                  {docs.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      No resume documents yet. Click “New” to create your first one.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Center: editor */}
          <Card className="lg:col-span-6 card-elevated flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle className="text-base">Editor</CardTitle>
                  <CardDescription className="line-clamp-1">
                    {selected ? 'Edit sections and save. Use checkpoints for version history.' : 'Select a resume document'}
                  </CardDescription>
                </div>
                {selected && (
                  <Button variant="ghost" onClick={deleteDoc}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              {!selected ? (
                <div className="text-sm text-muted-foreground">Select a document from the left.</div>
              ) : (
                <>
                  <div className="mb-2 text-sm">
                    <span className="text-muted-foreground">Document:</span>{' '}
                    <span className="font-medium text-foreground">{selected.title}</span>
                  </div>

                  <Separator className="my-4" />

                  <Tabs defaultValue="summary">
                    <TabsList className="flex flex-wrap">
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                      <TabsTrigger value="skills">Skills</TabsTrigger>
                      <TabsTrigger value="experience">Experience</TabsTrigger>
                      <TabsTrigger value="education">Education</TabsTrigger>
                      <TabsTrigger value="certs">Certifications</TabsTrigger>
                    </TabsList>

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
                        value={(selected.content_json.experience || [])
                          .map((e) => {
                            const header = [e.title, e.company].filter(Boolean).join(' — ');
                            const bullets = (e.bullets || []).map((b) => `- ${b}`).join('\n');
                            return `${header}\n${bullets}`.trim();
                          })
                          .join('\n\n')}
                        onChange={(e) => {
                          // Minimal parser: split blocks by blank line, treat first line as header, rest as bullets
                          const blocks = e.target.value.split(/\n\s*\n/g).map((b) => b.trim()).filter(Boolean);
                          const parsed = blocks.map((b) => {
                            const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
                            const header = lines[0] || '';
                            const [title, company] = header.split('—').map((x) => x.trim());
                            const bullets = lines.slice(1).map((l) => l.replace(/^-+\s*/, '').trim()).filter(Boolean);
                            return { title: title || undefined, company: company || undefined, bullets };
                          });
                          updateContent({ experience: parsed });
                        }}
                        placeholder={`Director of Engineering — Walmart\n- Led ...\n- Built ...\n\nEngineering Manager — Fannie Mae\n- ...`}
                      />
                    </TabsContent>

                    <TabsContent value="education" className="space-y-2 mt-4">
                      <Textarea
                        className="min-h-[200px] lg:min-h-[260px]"
                        value={(selected.content_json.education || [])
                          .map((e) => [e.degree, e.field, e.school, e.year].filter(Boolean).join(' • '))
                          .join('\n')}
                        onChange={(e) => {
                          const rows = e.target.value
                            .split('\n')
                            .map((r) => r.trim())
                            .filter(Boolean)
                            .slice(0, 20)
                            .map((r) => ({ school: r }));
                          updateContent({ education: rows });
                        }}
                        placeholder="Executive MBA • George Mason University • 2020"
                      />
                      <CardDescription>Paste each education line on a new line.</CardDescription>
                    </TabsContent>

                    <TabsContent value="certs" className="space-y-2 mt-4">
                      <Textarea
                        className="min-h-[200px] lg:min-h-[260px]"
                        value={(selected.content_json.certifications || []).join('\n')}
                        onChange={(e) =>
                          updateContent({
                            certifications: e.target.value
                              .split('\n')
                              .map((r) => r.trim())
                              .filter(Boolean)
                              .slice(0, 30),
                          })
                        }
                        placeholder="AWS Certified Solutions Architect\n…"
                      />
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </CardContent>
          </Card>

          {/* Right: export + versions */}
          <Card className="lg:col-span-3 card-elevated flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">Export & History</CardTitle>
              <CardDescription>Export and checkpoints</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 min-h-0 overflow-auto">
              {!selected ? (
                <div className="text-sm text-muted-foreground">Select a document to export.</div>
              ) : (
                <>
                  {missingFacts.length > 0 && (
                    <div className="rounded-md border border-border bg-muted/30 p-3">
                      <div className="text-sm font-medium">Missing facts to improve this resume</div>
                      <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5 space-y-1">
                        {missingFacts.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="grid gap-2">
                    <Button
                      onClick={async () => {
                        if (!selected || !candidateId || !user?.id) return;
                        try {
                          const blob = await generateDocxBlob(selected.title, 'ats_single', selected.content_json);
                          const filePath = `${user.id}/${Date.now()}-tailored.docx`;

                          const { error: upErr } = await supabase.storage
                            .from('resumes')
                            .upload(filePath, blob, {
                              contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            });
                          if (upErr) throw upErr;

                          const storedFileUrl = `resumes/${filePath}`;
                          const { error: insErr } = await supabase.from('resumes').insert({
                            candidate_id: candidateId,
                            file_name: `${selected.title || 'Tailored Resume'}.docx`,
                            file_url: storedFileUrl,
                            file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            is_primary: false,
                            parsed_content: {
                              source: 'resume_workspace',
                              resume_doc: selected.content_json,
                              generated_at: new Date().toISOString(),
                            },
                          } as any);
                          if (insErr) throw insErr;

                          toast.success('Saved to My Resumes');
                        } catch (e: any) {
                          console.error(e);
                          toast.error(e?.message || 'Failed to save to My Resumes');
                        }
                      }}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save to My Resumes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const blob = await generatePdfBlob(selected.title, selected.content_json);
                          downloadBlob(`${selected.title || 'resume'}.pdf`, blob);
                          toast.success('Downloaded PDF');
                        } catch (e: any) {
                          console.error(e);
                          toast.error(e?.message || 'Failed to generate PDF');
                        }
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download (PDF)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const blob = await generateDocxBlob(selected.title, 'ats_single', selected.content_json);
                          downloadBlob(`${selected.title || 'resume'}.docx`, blob);
                          toast.success('Downloaded DOCX');
                        } catch (e: any) {
                          console.error(e);
                          toast.error(e?.message || 'Failed to generate DOCX');
                        }
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download (DOCX)
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <History className="h-4 w-4" />
                      Version checkpoints
                    </Label>
                    <Input
                      value={checkpointNote}
                      onChange={(e) => setCheckpointNote(e.target.value)}
                      placeholder="Checkpoint note (optional)"
                    />
                    <Button variant="secondary" onClick={saveCheckpoint}>
                      Save checkpoint
                    </Button>
                    <ScrollArea className="h-[220px] pr-2">
                      <div className="space-y-2">
                        {versions.map((v) => (
                          <button
                            key={v.id}
                            className="w-full text-left rounded-md border border-border p-2 hover:bg-muted"
                            onClick={() => restoreVersion(v)}
                          >
                            <div className="text-sm font-medium line-clamp-1">{v.change_summary || 'Checkpoint'}</div>
                            <div className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
                          </button>
                        ))}
                        {versions.length === 0 && (
                          <div className="text-sm text-muted-foreground">No checkpoints yet.</div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {((analysisScore != null) ||
          atsEstimate != null ||
          keywordsFullyMatched.length > 0 ||
          keywordsPartiallyMatched.length > 0 ||
          atsImprovements.length > 0 ||
          Boolean(jdSkillExtraction)) && (
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Scoring details</CardTitle>
              <CardDescription>Full analyzer + model details for this generated resume.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysisScore != null && (
                <div className="text-sm">
                  <span className="font-medium">JD match score (canonical):</span> {Math.round(analysisScore)}%
                </div>
              )}
              {atsEstimate != null && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Model estimate (not canonical):</span> {Math.round(atsEstimate)}%
                </div>
              )}
              {analysisMissing.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Missing JD phrases (verbatim):</span> {analysisMissing.slice(0, 30).join(', ')}
                </div>
              )}
              {keywordsFullyMatched.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Keywords fully matched:</span> {keywordsFullyMatched.slice(0, 60).join(', ')}
                </div>
              )}
              {keywordsPartiallyMatched.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Keywords partially matched:</span> {keywordsPartiallyMatched.slice(0, 60).join(', ')}
                </div>
              )}
              {atsImprovements.length > 0 && (
                <div className="text-sm">
                  <div className="font-medium">Top improvements</div>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground space-y-1">
                    {atsImprovements.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {jdSkillExtraction && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">JD Skill Extraction</div>
                  {[
                    ['Core Technical Skills', jdSkillExtraction.core_technical_skills],
                    ['Platform / Cloud / Tooling', jdSkillExtraction.platform_cloud_tooling],
                    ['Architecture & Systems', jdSkillExtraction.architecture_systems],
                    ['Leadership & Org Design', jdSkillExtraction.leadership_org_design],
                    ['Business & Strategy', jdSkillExtraction.business_strategy],
                  ].map(([label, arr]: any) => (
                    <div key={label} className="text-sm">
                      <div className="font-medium">{label}</div>
                      <div className="text-muted-foreground">
                        {Array.isArray(arr) && arr.length ? arr.slice(0, 32).join(', ') : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(keywordsMissing.length > 0 || highRiskClaims.length > 0 || defendWithLearning.length > 0) && (
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Gap Plan (Study Plan) + ATS Risk Notes</CardTitle>
              <CardDescription>
                Keywords are woven into the resume with safe framing when needed; use this plan to close gaps before interviews.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {defendWithLearning.length > 0 && (
                <div className="text-sm">
                  <div className="font-medium">Plan to study/practice (to defend gaps)</div>
                  <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    {defendWithLearning.slice(0, 20).map((d, i) => (
                      <li key={i}>
                        <span className="font-medium text-foreground">{d.claim_or_gap}:</span> {d.what_to_study}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {keywordsMissing.length > 0 && (
                <div className="text-sm">
                  <div className="font-medium">Keywords not fully supported by the base resume (and why)</div>
                  <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    {keywordsMissing.slice(0, 30).map((k, idx) => (
                      <li key={idx}>
                        <span className="font-medium text-foreground">{k.keyword}:</span> {k.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {highRiskClaims.length > 0 && (
                <div className="text-sm">
                  <div className="font-medium">High-risk claims to be probed</div>
                  <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    {highRiskClaims.slice(0, 20).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(notesAddedPhrases.length > 0 || notesBaseAnalyzerScore != null || (notesBaseMatchedCount != null && notesTailoredMatchedCount != null)) && (
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Candidate Notes (What changed + how to prepare)</CardTitle>
              <CardDescription>
                This resume was best-fit to the JD for ATS shortlisting. Use these notes to prep defensible examples before interviews.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(notesBaseMatchedCount != null || notesTailoredMatchedCount != null) && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Keyword coverage change:</span>{' '}
                  Base {notesBaseMatchedCount ?? '—'}/{notesKeywordTotal ?? '—'} → Tailored {notesTailoredMatchedCount ?? '—'}/
                  {notesKeywordTotal ?? '—'}
                  {notesBaseAnalyzerScore != null && analysisScore != null ? (
                    <>
                      {' '}
                      • <span className="font-medium text-foreground">Match score change:</span> {Math.round(notesBaseAnalyzerScore)}% →{' '}
                      {Math.round(analysisScore)}%
                    </>
                  ) : null}
                </div>
              )}

              {notesAddedPhrases.length > 0 && (
                <div className="text-sm">
                  <div className="font-medium">JD phrases added vs your base resume</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {notesAddedPhrases.slice(0, 30).map((k, i) => (
                      <Badge key={i} variant="secondary">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {defendWithLearning.length > 0 && (
                <div className="text-sm">
                  <div className="font-medium">Interview prep checklist (based on injected/adjacent claims)</div>
                  <ul className="mt-2 text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    {defendWithLearning.slice(0, 10).map((d, i) => (
                      <li key={i}>
                        <span className="font-medium text-foreground">{d.claim_or_gap}:</span> {d.what_to_study}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

