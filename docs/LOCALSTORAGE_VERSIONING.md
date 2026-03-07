# localStorage Versioning Best Practices

## Problem
localStorage persists across sessions and code deployments. When you change default values or behavior, users with old cached values won't see the new defaults until they manually clear their cache.

## Solution: Version Your localStorage Keys

Always include a version suffix in localStorage keys that store user preferences or settings.

### Pattern
```typescript
const SETTING_KEY_PREFIX = 'feature_setting_v1';  // ← Note the v1 suffix
```

### When to Bump the Version
Increment the version number whenever you:
- Change default values (e.g., page size from 10 to 50)
- Change the data structure stored in localStorage
- Want to force all users to get new defaults

### Example: Page Size Setting

**Before (Wrong - no versioning):**
```typescript
const PAGE_SIZE_KEY = 'talentpool_page_size';  // ❌ No version
```

**After (Correct - with versioning):**
```typescript
const PAGE_SIZE_KEY_PREFIX = 'talentpool_page_size_v1';  // ✅ Version 1

// Later, when changing default from 10 to 50:
const PAGE_SIZE_KEY_PREFIX = 'talentpool_page_size_v2';  // ✅ Bumped to v2
```

### Current Versioned Keys in Codebase

| Key Prefix | Current Version | Location | Purpose |
|------------|-----------------|----------|---------|
| `talentpool_page_size` | v2 | `src/pages/recruiter/TalentPool.tsx` | Page size preference (default changed from 10 to 50) |

### Keys That Don't Need Versioning
Some localStorage usage doesn't need versioning:
- **UI State**: Dialog open/closed, sidebar collapsed, etc. (ephemeral state)
- **Form Drafts**: Auto-saved form data (user expects latest state)
- **Auth Tokens**: Managed by Supabase (has its own versioning)
- **Theme Preferences**: Simple on/off toggles that don't have changing defaults

### When NOT to Use localStorage
Consider using **URL parameters** or **database storage** instead of localStorage for:
- Search filters and queries (URL params = shareable links)
- Team-wide preferences (database = synced across devices)
- Data that needs to be accessible across browsers/devices

## Recent Fixes
- **2026-03-07**: Bumped `talentpool_page_size` from v1 to v2 after changing default from 10 to 50 items per page
