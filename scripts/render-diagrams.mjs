import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const WIDTH = 1920;
const HEIGHT = 1080;
const OUT_DIR = path.resolve(process.cwd(), "src/assets/diagrams");

function svgDoc(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#101a2e"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#90a4b8"/>
    </marker>
    <style>
      .title { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size: 44px; font-weight: 800; fill: #e6edf3; }
      .h2 { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size: 26px; font-weight: 800; fill: #e6edf3; letter-spacing: 0.4px; }
      .text { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size: 22px; font-weight: 600; fill: #e6edf3; }
      .muted { fill: #b9c7d6; font-weight: 500; }
      .box { rx: 18; ry: 18; filter: url(#shadow); }
      .chip { rx: 14; ry: 14; }
      .line { stroke: #90a4b8; stroke-width: 3; opacity: 0.9; }
      .dash { stroke-dasharray: 8 10; opacity: 0.55; }
      .small { font-size: 18px; font-weight: 600; }
    </style>
  </defs>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  ${inner}
</svg>`;
}

function roundedRect(x, y, w, h, fill, stroke = "rgba(255,255,255,0.10)") {
  return `<rect class="box" x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" />`;
}

function chip(x, y, w, h, fill, label) {
  const cx = x + w / 2;
  const cy = y + h / 2 + 7;
  return `
    <rect class="chip" x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="rgba(255,255,255,0.12)" />
    <text class="text" text-anchor="middle" x="${cx}" y="${cy}">${label}</text>
  `;
}

function arrow(x1, y1, x2, y2, dashed = false) {
  return `<line class="line ${dashed ? "dash" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#arrow)" />`;
}

function systemArchitecture() {
  return svgDoc(`
    <text class="title" x="64" y="92">System Architecture</text>

    <text class="h2" x="64" y="170">Client Layer</text>
    ${roundedRect(64, 200, 1180, 120, "#1b84d6")}
    ${chip(120, 232, 260, 58, "rgba(0,0,0,0.22)", "Browser / PWA")}

    <text class="h2" x="64" y="380">Frontend Layer</text>
    ${roundedRect(64, 410, 1180, 190, "#0ea5a8")}
    ${chip(120, 460, 210, 58, "rgba(0,0,0,0.22)", "React")}
    ${chip(360, 470, 260, 52, "rgba(255,255,255,0.12)", "React Router + Auth")}
    ${chip(650, 470, 230, 52, "rgba(255,255,255,0.12)", "React Query")}
    ${chip(910, 470, 250, 52, "rgba(255,255,255,0.12)", "UI Components")}
    ${chip(1180, 470, 150, 52, "rgba(255,255,255,0.12)", "Zustand")}

    <text class="h2" x="64" y="690">Backend Layer</text>
    ${roundedRect(64, 720, 1180, 200, "#6d28d9")}
    ${chip(120, 792, 180, 58, "rgba(0,0,0,0.22)", "Supabase")}
    ${chip(320, 792, 220, 58, "rgba(0,0,0,0.22)", "Auth")}
    ${chip(560, 792, 240, 58, "rgba(0,0,0,0.22)", "PostgreSQL")}
    ${chip(820, 792, 280, 58, "rgba(0,0,0,0.22)", "Database (RLS)")}
    ${chip(1120, 792, 260, 58, "rgba(0,0,0,0.22)", "Edge Functions")}
    ${chip(1400, 792, 210, 58, "rgba(0,0,0,0.22)", "Storage")}

    <text class="h2" x="1390" y="380">External Services</text>
    ${roundedRect(1360, 410, 500, 190, "rgba(255,255,255,0.06)")}
    ${chip(1440, 460, 360, 60, "#f97316", "AI Models")}
    ${chip(1440, 540, 360, 60, "#f97316", "LinkedIn API")}

    ${arrow(650, 320, 650, 410)}
    ${arrow(650, 600, 650, 720)}
    ${arrow(1244, 505, 1360, 505)}
  `);
}

function componentArchitecture() {
  return svgDoc(`
    <text class="title" x="64" y="92">Component Architecture</text>

    ${chip(820, 120, 280, 70, "#a855f7", "App.tsx")}

    <text class="h2" x="820" y="240">Providers</text>
    ${chip(300, 270, 270, 60, "rgba(255,255,255,0.10)", "HelmetProvider")}
    ${chip(590, 270, 270, 60, "rgba(255,255,255,0.10)", "QueryClient")}
    ${chip(880, 270, 270, 60, "rgba(255,255,255,0.10)", "AuthProvider")}
    ${chip(1170, 270, 270, 60, "rgba(255,255,255,0.10)", "TooltipProvider")}
    ${chip(1460, 270, 220, 60, "rgba(255,255,255,0.10)", "Theme")}

    <text class="h2" x="820" y="390">Route Groups</text>
    ${chip(320, 420, 220, 60, "rgba(34,197,94,0.25)", "Public")}
    ${chip(560, 420, 240, 60, "rgba(34,197,94,0.25)", "Candidate")}
    ${chip(820, 420, 240, 60, "rgba(34,197,94,0.25)", "Recruiter")}
    ${chip(1080, 420, 250, 60, "rgba(34,197,94,0.25)", "Account Manager")}
    ${chip(1350, 420, 240, 60, "rgba(34,197,94,0.25)", "Org Admin")}
    ${chip(1610, 420, 240, 60, "rgba(34,197,94,0.25)", "Platform Admin")}

    ${chip(760, 540, 400, 70, "#14b8a6", "Protected Route Wrapper")}
    ${chip(760, 640, 400, 70, "#0ea5a8", "Dashboard Layout")}

    <text class="h2" x="820" y="790">Shared Components</text>
    ${chip(560, 820, 280, 70, "rgba(255,255,255,0.10)", "UI Components")}
    ${chip(860, 820, 220, 70, "rgba(255,255,255,0.10)", "Forms")}
    ${chip(1100, 820, 240, 70, "rgba(255,255,255,0.10)", "Tables")}
    ${chip(1360, 820, 240, 70, "rgba(255,255,255,0.10)", "Cards")}

    ${arrow(960, 190, 960, 270)}
    ${arrow(960, 340, 960, 420)}
    ${arrow(960, 480, 960, 540)}
    ${arrow(960, 610, 960, 640)}
    ${arrow(960, 710, 960, 820)}
  `);
}

function authFlow() {
  return svgDoc(`
    <text class="title" x="64" y="92">Authentication Flow</text>

    ${roundedRect(80, 170, 840, 430, "rgba(59,130,246,0.18)")}
    <text class="h2" x="110" y="225">Sign Up</text>
    ${chip(120, 260, 360, 64, "rgba(255,255,255,0.10)", "Form Submission")}
    ${chip(120, 345, 360, 64, "rgba(255,255,255,0.10)", "User Creation")}
    ${chip(120, 430, 360, 64, "rgba(255,255,255,0.10)", "Email Confirmation")}
    ${chip(120, 515, 360, 64, "rgba(255,255,255,0.10)", "Role Assignment")}

    ${roundedRect(980, 170, 860, 430, "rgba(245,158,11,0.18)")}
    <text class="h2" x="1010" y="225">Sign In</text>
    ${chip(1020, 260, 380, 64, "rgba(255,255,255,0.10)", "Credential Validation")}
    ${chip(1020, 345, 380, 64, "rgba(255,255,255,0.10)", "Session Return")}
    ${chip(1020, 430, 380, 64, "rgba(255,255,255,0.10)", "Role Fetch")}
    ${chip(1020, 515, 380, 64, "rgba(255,255,255,0.10)", "Redirect to Dashboard")}

    ${roundedRect(80, 650, 1760, 320, "rgba(34,197,94,0.16)")}
    <text class="h2" x="110" y="705">Password Reset</text>
    ${chip(120, 740, 420, 70, "rgba(255,255,255,0.10)", "Reset Request")}
    ${chip(580, 740, 520, 70, "rgba(255,255,255,0.10)", "Email Link Click")}
    ${chip(1140, 740, 520, 70, "rgba(255,255,255,0.10)", "Password Update")}

    ${arrow(480, 292, 480, 345)}
    ${arrow(480, 377, 480, 430)}
    ${arrow(480, 462, 480, 515)}

    ${arrow(1400, 292, 1400, 345)}
    ${arrow(1400, 377, 1400, 430)}
    ${arrow(1400, 462, 1400, 515)}

    ${arrow(540, 775, 580, 775)}
    ${arrow(1100, 775, 1140, 775)}
  `);
}

function dataFlow() {
  return svgDoc(`
    <text class="title" x="64" y="92">Data Flow Architecture</text>

    ${roundedRect(140, 190, 1640, 150, "rgba(255,255,255,0.06)")}
    <text class="h2" x="170" y="240">Client Layer</text>
    ${chip(360, 260, 420, 60, "rgba(255,255,255,0.10)", "React Components")}
    ${chip(820, 260, 420, 60, "rgba(255,255,255,0.10)", "Custom Hooks / State")}
    ${chip(1280, 260, 420, 60, "rgba(255,255,255,0.10)", "UI Events")}

    ${roundedRect(140, 390, 1640, 150, "rgba(56,189,248,0.12)")}
    <text class="h2" x="170" y="440">React Query Layer</text>
    ${chip(360, 460, 420, 60, "rgba(255,255,255,0.10)", "useQuery / useMutation")}
    ${chip(820, 460, 420, 60, "rgba(255,255,255,0.10)", "Cache + Invalidations")}
    ${chip(1280, 460, 420, 60, "rgba(255,255,255,0.10)", "Optimistic Updates")}

    ${roundedRect(140, 590, 1640, 150, "rgba(168,85,247,0.12)")}
    <text class="h2" x="170" y="640">API Layer</text>
    ${chip(360, 660, 420, 60, "rgba(255,255,255,0.10)", "Supabase Client")}
    ${chip(820, 660, 420, 60, "rgba(255,255,255,0.10)", "Edge Functions")}
    ${chip(1280, 660, 420, 60, "rgba(255,255,255,0.10)", "Storage")}

    ${roundedRect(140, 790, 1640, 200, "rgba(109,40,217,0.18)")}
    <text class="h2" x="170" y="840">Backend Layer</text>
    ${chip(360, 860, 520, 70, "rgba(0,0,0,0.20)", "PostgreSQL + RLS")}
    ${chip(920, 860, 420, 70, "rgba(0,0,0,0.20)", "Auth")}
    ${chip(1360, 860, 380, 70, "rgba(0,0,0,0.20)", "Audit Logs")}

    ${arrow(960, 340, 960, 390)}
    ${arrow(960, 540, 960, 590)}
    ${arrow(960, 740, 960, 790)}
  `);
}

function databaseErd() {
  return svgDoc(`
    <text class="title" x="64" y="92">Database ERD (High-Level)</text>
    <text class="text muted" x="64" y="140">Central tenant entity connects to users, roles, jobs, candidates, applications, and AI artifacts.</text>

    ${roundedRect(760, 210, 400, 120, "rgba(34,197,94,0.22)")}
    <text class="h2" x="960" y="280" text-anchor="middle">organizations</text>

    ${chip(220, 220, 360, 76, "rgba(255,255,255,0.10)", "profiles")}
    ${chip(220, 320, 360, 76, "rgba(255,255,255,0.10)", "user_roles")}
    ${chip(220, 420, 360, 76, "rgba(255,255,255,0.10)", "audit_logs")}

    ${chip(1340, 220, 360, 76, "rgba(255,255,255,0.10)", "jobs")}
    ${chip(1340, 320, 360, 76, "rgba(255,255,255,0.10)", "applications")}
    ${chip(1340, 420, 360, 76, "rgba(255,255,255,0.10)", "resumes")}

    ${chip(640, 420, 280, 70, "rgba(255,255,255,0.10)", "candidate_profiles")}
    ${chip(980, 420, 300, 70, "rgba(255,255,255,0.10)", "candidate_skills")}
    ${chip(640, 510, 280, 70, "rgba(255,255,255,0.10)", "candidate_experience")}
    ${chip(980, 510, 300, 70, "rgba(255,255,255,0.10)", "candidate_education")}

    ${chip(640, 670, 320, 74, "rgba(255,255,255,0.10)", "shortlists")}
    ${chip(980, 670, 360, 74, "rgba(255,255,255,0.10)", "outreach_campaigns")}
    ${chip(640, 760, 360, 74, "rgba(255,255,255,0.10)", "ai_recruiting_agents")}
    ${chip(1020, 760, 380, 74, "rgba(255,255,255,0.10)", "ai_resume_analyses / insights")}

    ${arrow(760, 270, 580, 258)}
    ${arrow(760, 270, 580, 358)}
    ${arrow(760, 270, 580, 458)}

    ${arrow(1160, 270, 1340, 258)}
    ${arrow(1160, 270, 1340, 358)}
    ${arrow(1160, 270, 1340, 458)}

    ${arrow(960, 330, 780, 420)}
    ${arrow(960, 330, 1130, 420)}
    ${arrow(960, 330, 780, 510)}
    ${arrow(960, 330, 1130, 510)}

    ${arrow(960, 330, 800, 670, true)}
    ${arrow(960, 330, 1160, 670, true)}
    ${arrow(960, 330, 820, 760, true)}
    ${arrow(960, 330, 1220, 760, true)}
  `);
}

function recruiterWorkflow() {
  return svgDoc(`
    <text class="title" x="64" y="92">Recruiter Workflow</text>

    ${chip(120, 210, 240, 70, "rgba(255,255,255,0.10)", "Login")}
    ${chip(420, 210, 300, 70, "rgba(255,255,255,0.10)", "Dashboard")}

    ${chip(780, 170, 300, 64, "rgba(59,130,246,0.20)", "Post Job")}
    ${chip(780, 250, 300, 64, "rgba(59,130,246,0.20)", "Talent Pool")}
    ${chip(1100, 170, 360, 64, "rgba(59,130,246,0.20)", "Manage Shortlists")}
    ${chip(1100, 250, 360, 64, "rgba(59,130,246,0.20)", "Configure AI Agents")}

    ${chip(1520, 210, 320, 70, "rgba(168,85,247,0.22)", "AI Matching")}
    ${chip(1520, 320, 320, 70, "rgba(255,255,255,0.10)", "Review Candidates")}
    ${chip(1520, 430, 320, 70, "rgba(255,255,255,0.10)", "Outreach / Sequences")}
    ${chip(1520, 540, 320, 70, "rgba(255,255,255,0.10)", "Track Responses")}
    ${chip(1520, 650, 320, 70, "rgba(255,255,255,0.10)", "Schedule Interviews")}

    ${arrow(360, 245, 420, 245)}
    ${arrow(720, 245, 780, 245)}
    ${arrow(1080, 245, 1100, 245)}
    ${arrow(1460, 245, 1520, 245)}
    ${arrow(1680, 280, 1680, 320)}
    ${arrow(1680, 390, 1680, 430)}
    ${arrow(1680, 500, 1680, 540)}
    ${arrow(1680, 610, 1680, 650)}

    ${arrow(720, 245, 780, 205, true)}
    ${arrow(720, 245, 780, 285, true)}
    ${arrow(1460, 205, 1520, 245, true)}
    ${arrow(1460, 285, 1520, 245, true)}
  `);
}

function edgeFunctionsArchitecture() {
  return svgDoc(`
    <text class="title" x="64" y="92">Edge Functions Architecture</text>

    ${roundedRect(120, 190, 520, 720, "rgba(255,255,255,0.06)")}
    <text class="h2" x="160" y="250">AI Functions</text>
    ${chip(160, 290, 440, 60, "rgba(255,255,255,0.10)", "analyze-resume")}
    ${chip(160, 365, 440, 60, "rgba(255,255,255,0.10)", "match-candidates")}
    ${chip(160, 440, 440, 60, "rgba(255,255,255,0.10)", "generate-email")}
    ${chip(160, 515, 440, 60, "rgba(255,255,255,0.10)", "generate-insights")}
    ${chip(160, 590, 440, 60, "rgba(255,255,255,0.10)", "recommend-jobs")}

    ${roundedRect(700, 190, 520, 720, "rgba(255,255,255,0.06)")}
    <text class="h2" x="740" y="250">Data Functions</text>
    ${chip(740, 290, 440, 60, "rgba(255,255,255,0.10)", "parse-resume")}
    ${chip(740, 365, 440, 60, "rgba(255,255,255,0.10)", "talent-search")}
    ${chip(740, 440, 440, 60, "rgba(255,255,255,0.10)", "linkedin-search")}
    ${chip(740, 515, 440, 60, "rgba(255,255,255,0.10)", "bulk-import-candidates")}
    ${chip(740, 590, 440, 60, "rgba(255,255,255,0.10)", "notify-application")}

    ${roundedRect(1280, 190, 520, 720, "rgba(255,255,255,0.06)")}
    <text class="h2" x="1320" y="250">Automation</text>
    ${chip(1320, 290, 440, 60, "rgba(255,255,255,0.10)", "run-agent")}
    ${chip(1320, 365, 440, 60, "rgba(255,255,255,0.10)", "send-org-admin-invite")}
    ${chip(1320, 440, 440, 60, "rgba(255,255,255,0.10)", "send-manager-invite")}
    ${chip(1320, 515, 440, 60, "rgba(255,255,255,0.10)", "send-recruiter-invite")}
    ${chip(1320, 590, 440, 60, "rgba(255,255,255,0.10)", "bootstrap-platform-admin")}

    ${roundedRect(520, 930, 880, 110, "rgba(109,40,217,0.22)")}
    <text class="h2" x="960" y="1000" text-anchor="middle">Supabase (Postgres + RLS + Auth + Storage)</text>

    ${roundedRect(1460, 930, 400, 110, "rgba(249,115,22,0.25)")}
    <text class="h2" x="1660" y="1000" text-anchor="middle">External APIs / AI</text>

    ${arrow(380, 650, 820, 930)}
    ${arrow(960, 650, 960, 930)}
    ${arrow(1540, 650, 1200, 930)}
    ${arrow(1540, 440, 1660, 930)}
  `);
}

const DIAGRAMS = [
  { file: "system-architecture.png", svg: systemArchitecture() },
  { file: "component-architecture.png", svg: componentArchitecture() },
  { file: "auth-flow.png", svg: authFlow() },
  { file: "data-flow.png", svg: dataFlow() },
  { file: "database-erd.png", svg: databaseErd() },
  { file: "recruiter-workflow.png", svg: recruiterWorkflow() },
  { file: "edge-functions.png", svg: edgeFunctionsArchitecture() },
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    throw new Error(`Missing output directory: ${OUT_DIR}`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  for (const d of DIAGRAMS) {
    const outPath = path.join(OUT_DIR, d.file);
    const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"/><style>html,body{margin:0;background:#0b1220;}</style></head>
  <body>${d.svg}</body>
</html>`;

    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: outPath, type: "png" });
    // eslint-disable-next-line no-console
    console.log("wrote", path.relative(process.cwd(), outPath));
  }

  await browser.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

