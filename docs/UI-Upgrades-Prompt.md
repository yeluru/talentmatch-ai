# UI Upgrades Prompt

Use this prompt when applying the same UI upgrades to a page. Replace **[page name]** or the URL with the target page.

---

## Full Prompt

Apply these UI upgrades to **[page name / URL]**:

### Layout & height
- Inner content areas should match the height of their outer container. Use `flex-1`, `h-full`, and `min-h-0` so flex/grid children fill and can shrink for scrolling.
- Put scrolling inside the main content area (e.g. `overflow-y-auto` or `ScrollArea` on the content box), not on the whole page. Use `overflow-hidden` on the outer wrapper and `flex flex-col flex-1 min-h-0` so the scrollable area gets a defined height.
- For side-by-side columns, give the row a clear height (e.g. `h-[864px]`) and `items-stretch` so both columns share the same height; use `h-full` on the inner cards so they fill the row.

### Typography
- Headings and section titles: `font-display` (Outfit), e.g. `text-lg font-display font-bold` for section titles, `text-xl font-display font-bold` for card titles.
- Body text, labels, and form fields: `font-sans` (Plus Jakarta Sans), e.g. `text-base font-sans` for body, `text-sm font-sans` for labels.

### Page title and layout (match across candidate pages)
- **Compare with reference pages** (e.g. ATS Checkpoint `/candidate/ai-analysis`, Job Alerts `/candidate/job-alerts`, Resume Workspace) so the page title and overall layout look the same.
- **Outer wrapper:** Use `flex flex-col flex-1 min-h-0 overflow-hidden max-w-[1600px] mx-auto` so content width is consistent (use `max-w-[1700px]` only where the layout needs more room, e.g. Resume Workspace).
- **Header:** `shrink-0 flex flex-col gap-6`; inner row: `flex flex-col md:flex-row md:items-center justify-between gap-4` (title block left, primary action button right).
- **Title block:** Icon box next to the title on one row. Icon box: `p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20` with the page icon (e.g. Bell, Sparkles). Title row: `flex items-center gap-3 mb-1` wrapping the icon box and the h1. Main title: `text-3xl sm:text-4xl font-display font-bold tracking-tight text-foreground` with the key word in `<span className="text-gradient-candidate">KeyWord</span>` (e.g. "Job **Alerts**", "ATS **Checkpoint**").
- **Subtitle:** Directly below the title row: `text-lg text-muted-foreground font-sans` (no extra top margin if the title row already has `mb-1`).
- **Content area:** Full width within the outer container (no inner `max-w-4xl` unless the page is a simple list that should stay narrower). Use `flex-1 min-h-0 overflow-y-auto` for the scrollable content and `space-y-6 pt-6 pb-6` (or similar) for the inner content wrapper.

### Visual design
- Primary UI: blue tints (`blue-500/10`, `blue-500/20`, `blue-500/5`) for backgrounds, borders, and hover; subtle gradients where it helps hierarchy.
- Borders: `border-border` for neutral, `border-blue-500/20` for emphasis; `rounded-xl` for cards and panels.
- Cards/panels: `rounded-xl border border-border bg-card p-6`; optional header strip with `border-b border-blue-500/10 bg-blue-500/5`.
- Section headers: icon + title (`font-display font-bold`) + short description (`text-muted-foreground font-sans`).

### Forms & controls
- Inputs and selects: `h-11`, `rounded-lg`, `border-border`, `focus:ring-2 focus:ring-blue-500/20`.
- Textareas: `rounded-lg`, `border-border`, same focus ring; use `resize-none` when the area should scroll instead of resize.
- Buttons: `rounded-lg`, borders like `border-blue-500/20`, hover like `hover:bg-blue-500/10` where appropriate.
- Fixed headers/sidebars: `shrink-0` so flex content below can use `flex-1 min-h-0` and scroll.

### Clickable rows / blocks (hover highlight)
- When a block or row is interactive (e.g. job cards, application cards, list items that link somewhere), make the **whole row one link** so the entire block is clickable.
- Add a clear hover state on the wrapper: `group` class, then `hover:border-blue-500/30 hover:bg-blue-500/5 hover:shadow-md` so the row clearly highlights on mouseover.
- Use `group-hover:` on child elements for feedback (e.g. title `group-hover:text-blue-600 dark:group-hover:text-blue-400`, logo `group-hover:scale-105`).
- Add focus ring for keyboard: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2`.
- Avoid nested links: if the whole card is a `<Link>`, style "View details" / action as a `<span>` with button-like classes instead of a second link.

### Tabs (if the page has tabs)
- Set `defaultValue` to the first logical tab (e.g. Contact or the first step).
- Tabs container: `flex flex-col flex-1 min-h-0`; TabsList wrapper: `shrink-0`.
- Each TabsContent: `flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden`.
- Section inside tab: `flex flex-col flex-1 min-h-0`; inner content box: `flex-1 min-h-0 overflow-y-auto` (or `flex flex-col` with a `flex-1` child) so the inner box fills the tab and scrolls inside itself instead of staying short with empty space below.

### Icons
- Use `strokeWidth={1.5}` on Lucide icons for a consistent weight.

Apply these patterns across the page so layout, typography, colors, and component styling are consistent.

### Recruiter theme variant (/recruiter and subpages)
- Use **recruiter theme** instead of blue: `text-gradient-recruiter` for the title keyword; `bg-recruiter/10`, `border-recruiter/20`, `text-recruiter` for icon boxes, buttons, and accents; `hover:bg-recruiter/5`, `hover:border-recruiter/30` for cards/rows; `focus:ring-recruiter/20` for inputs and focus rings.
- Icon box: `p-2 rounded-xl bg-recruiter/10 text-recruiter border border-recruiter/20`.
- Buttons (primary): `rounded-lg h-11 px-6 border border-recruiter/20 bg-recruiter/10 hover:bg-recruiter/20 text-recruiter font-sans font-semibold`.
- Cards/panels: same structure; use `border-recruiter/20` and `hover:border-recruiter/20` for emphasis; optional header strip `border-b border-recruiter/10 bg-recruiter/5`.
- All other layout, typography, and structure rules stay the same (outer `max-w-[1600px]`, header with icon + title + subtitle, scroll inside content, `strokeWidth={1.5}` on icons).

### Manager theme variant (/manager and subpages)
- Use **manager theme** instead of blue: `text-gradient-manager` for the title keyword; `bg-manager/10`, `border-manager/20`, `text-manager` for icon boxes, buttons, and accents; `hover:bg-manager/5`, `hover:border-manager/30` for cards/rows; `focus:ring-manager/20` for inputs and focus rings.
- Icon box: `p-2 rounded-xl bg-manager/10 text-manager border border-manager/20`.
- Buttons (primary): `rounded-lg h-11 px-6 border border-manager/20 bg-manager/10 hover:bg-manager/20 text-manager font-sans font-semibold`.
- Cards/panels: same structure; use `border-manager/20` and `hover:border-manager/20` for emphasis; optional header strip `border-b border-manager/10 bg-manager/5`.
- All other layout, typography, and structure rules stay the same (outer `max-w-[1600px]`, header with icon + title + subtitle, scroll inside content, `strokeWidth={1.5}` on icons).

---

## Short version

Apply these UI upgrades to **[page name]**:

- **Layout:** Inner areas fill outer height (`flex-1`, `h-full`, `min-h-0`); scrolling only inside content boxes; side-by-side columns use fixed row height and `items-stretch` with `h-full` on inner cards.
- **Typography:** `font-display` for headings, `font-sans` for body and labels.
- **Page title & layout:** Outer `max-w-[1600px] mx-auto`; header `shrink-0 flex flex-col gap-6` with row `justify-between` (title left, action right); title row: icon box (`p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20`) + `text-3xl sm:text-4xl font-display font-bold` with key word in `<span className="text-gradient-candidate">…</span>`; subtitle `text-lg text-muted-foreground font-sans`; content full width in container, `flex-1 min-h-0 overflow-y-auto` + `pt-6 pb-6`.
- **Visuals:** Blue accents, `rounded-xl` cards, section headers with icon + title + description.
- **Forms:** Inputs/selects `h-11` `rounded-lg` `focus:ring-2 focus:ring-blue-500/20`; fixed headers `shrink-0`.
- **Clickable rows:** Whole row as one link; `group` + `hover:border-blue-500/30 hover:bg-blue-500/5 hover:shadow-md`; `group-hover:` on title/logo; `focus-visible:ring-2`; no nested links.
- **Tabs:** Default to first logical tab; TabsContent and inner content box use `flex-1 min-h-0` so content stretches and scrolls inside.
- **Icons:** `strokeWidth={1.5}`.
