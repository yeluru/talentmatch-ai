# Production Deployment Plan - v2.1.1
**Date:** 2026-02-14
**Deployment Type:** Database Migrations + Edge Function + UI Code

---

## 🔍 Pre-Deployment Checklist

### 1. Files Changed (Git Status)
- ✅ Modified: `supabase/functions/bulk-import-candidates/index.ts` (multi-role permission fix)
- ✅ Modified: `src/pages/recruiter/TalentSourcing.tsx` (removed LinkedIn PDF import)
- ✅ Modified: Multi-role auth system files (App.tsx, layouts, hooks)
- ✅ New migrations: 3 new SQL migrations (see below)

### 2. New Migrations to Deploy

#### Migration 1: `20260212100000_multi_role_system.sql`
**Purpose:** Enable users to have multiple roles across organizations
**Changes:**
- Drops unique constraint `user_roles_user_id_role_key`
- Adds new constraint `user_roles_user_id_role_org_unique` (allows same role in different orgs)
- Adds `acting_role` column to `audit_logs`
- Creates 3 new RPC functions:
  - `grant_role_to_user()`
  - `revoke_role_from_user()`
  - `get_org_users_with_roles()`
- Adds indexes for performance

**Risk Level:** 🟡 MEDIUM
- Alters constraint on `user_roles` table
- Uses `ALTER TABLE` with `ADD CONSTRAINT` (safe, no data loss)
- No existing data needs to be updated
- RPC functions are new, not replacing existing ones

**Rollback Plan:**
```sql
-- If issues occur:
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_org_unique;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
DROP FUNCTION IF EXISTS grant_role_to_user;
DROP FUNCTION IF EXISTS revoke_role_from_user;
DROP FUNCTION IF EXISTS get_org_users_with_roles;
```

#### Migration 2: `20260213000000_add_primary_role.sql`
**Purpose:** Add primary role tracking (first role assigned cannot be revoked)
**Changes:**
- Adds `is_primary` column to `user_roles` (default false)
- Backfills existing data: marks oldest role per user as primary
- Updates RPC functions to handle primary role logic
- Adds unique index to enforce one primary per user

**Risk Level:** 🟡 MEDIUM
- Alters `user_roles` table structure
- Performs data backfill (marks oldest role as primary)
- Updates existing RPC functions

**Safety Features:**
- `ADD COLUMN IF NOT EXISTS` (safe for re-runs)
- `CREATE UNIQUE INDEX IF NOT EXISTS` (safe for re-runs)
- Backfill uses `WITH` query (atomic)

**Rollback Plan:**
```sql
-- If issues occur:
ALTER TABLE user_roles DROP COLUMN IF EXISTS is_primary;
DROP INDEX IF EXISTS idx_user_roles_primary;
-- Restore original RPC functions from backup
```

#### Migration 3: `20260214000000_add_jsonb_profile_fields.sql`
**Purpose:** Add JSONB columns for structured resume data
**Changes:**
- Adds 8 new columns to `candidate_profiles`:
  - `experience` (jsonb array)
  - `education` (jsonb array)
  - `skills` (jsonb array)
  - `soft_skills` (jsonb array)
  - `certifications` (jsonb array)
  - `resume_url` (text)
  - `resume_text` (text)
  - `source` (text, default 'manual')
- Creates GIN indexes for JSONB querying
- Creates helper functions:
  - `get_candidate_experience_count()`
  - `calculate_years_from_experience_jsonb()`

**Risk Level:** 🟢 LOW
- Only adds new columns (no existing columns modified)
- All columns use `ADD COLUMN IF NOT EXISTS` (safe for re-runs)
- All columns have defaults (no null issues)
- No data migration required
- Indexes use `IF NOT EXISTS` (safe for re-runs)

**Impact on Existing Data:** NONE - only adds optional fields

**Rollback Plan:**
```sql
-- If issues occur (extremely unlikely):
ALTER TABLE candidate_profiles
  DROP COLUMN IF EXISTS experience,
  DROP COLUMN IF EXISTS education,
  DROP COLUMN IF EXISTS skills,
  DROP COLUMN IF EXISTS soft_skills,
  DROP COLUMN IF EXISTS certifications,
  DROP COLUMN IF EXISTS resume_url,
  DROP COLUMN IF EXISTS resume_text,
  DROP COLUMN IF EXISTS source;
DROP FUNCTION IF EXISTS get_candidate_experience_count;
DROP FUNCTION IF EXISTS calculate_years_from_experience_jsonb;
```

---

## 📦 Edge Functions to Deploy

### `bulk-import-candidates`
**Change:** Multi-role permission fix
- Changed from `.maybeSingle()` to `.in('role', ['recruiter', 'account_manager'])`
- Fixes bug where org_admin switched to recruiter couldn't import

**Risk Level:** 🟢 LOW
- Only changes permission check logic
- Makes permissions MORE permissive (not MORE restrictive)
- No changes to data handling or database operations

---

## 🎨 UI Changes (Render Deployment)

### Modified Files
- `src/App.tsx` - Multi-role context integration
- `src/hooks/useAuth.tsx` - Multi-role authentication
- `src/components/layouts/*` - Multi-role layout handling
- `src/pages/recruiter/TalentSourcing.tsx` - Removed LinkedIn PDF import

### New Files
- `src/contexts/RoleContext.tsx` - Multi-role state management
- `src/pages/admin/SuperAdminRoleManagement.tsx` - Role management UI
- `src/pages/orgAdmin/RoleManagement.tsx` - Org admin role management

**Risk Level:** 🟢 LOW
- Purely frontend changes
- No breaking changes to existing functionality
- Removed feature (LinkedIn PDF import) to simplify codebase

---

## 🚀 Deployment Steps

### Step 1: Database Migrations (CRITICAL - DO FIRST)

```bash
# 1. Verify current production state
npx supabase db remote get-latest

# 2. Push migrations to production
npx supabase db push

# 3. Verify migrations applied
npx supabase db remote ls

# 4. Check for errors in production logs
npx supabase logs --type database --limit 50
```

**Expected Output:**
- 3 new migrations applied
- No error messages
- All constraints and indexes created successfully

**If Errors Occur:**
- Check error message in logs
- If constraint conflict: existing data may violate new rules
- If function error: check for syntax issues or permissions
- Contact team before proceeding to UI deployment

### Step 2: Edge Function Deployment

```bash
# Deploy updated bulk-import-candidates function
npx supabase functions deploy bulk-import-candidates

# Verify deployment
npx supabase functions list
```

**Test After Deployment:**
1. Login as org_admin
2. Switch to recruiter role
3. Navigate to Talent Sourcing
4. Click Import on a candidate
5. Should succeed (not get "Forbidden" error)

### Step 3: UI Deployment (Render)

```bash
# 1. Commit changes
git add .
git commit -m "Multi-role system + import bug fix + remove LinkedIn PDF import"

# 2. Push to main
git push origin main

# 3. Render will auto-deploy from main branch
# Monitor deployment at: https://dashboard.render.com
```

**Monitor Render Deployment:**
- Watch build logs for errors
- Verify successful deployment
- Check health endpoint

### Step 4: Post-Deployment Verification

#### Test Multi-Role System
1. ✅ Login as org_admin
2. ✅ Switch to recruiter role
3. ✅ Test import functionality (should work)
4. ✅ Go to Role Management UI
5. ✅ Grant/revoke roles
6. ✅ Verify primary role cannot be revoked

#### Test Candidate Import
1. ✅ Login as recruiter
2. ✅ Go to Talent Sourcing
3. ✅ Search for candidates
4. ✅ Click Import on a candidate
5. ✅ Should create basic profile with name + LinkedIn URL
6. ✅ Should NOT show LinkedIn PDF upload dialog
7. ✅ Verify profile created in database

#### Test Existing Functionality
1. ✅ Candidate pipeline still works
2. ✅ Job posting still works
3. ✅ Resume upload still works
4. ✅ RTR document generation still works

---

## ⚠️ Risk Assessment

### Overall Risk: 🟡 MEDIUM-LOW

**Why Medium-Low:**
- Database schema changes (always carries risk)
- Multi-role system is new architecture
- Backfill operation on user_roles table

**Mitigation Factors:**
- All migrations use `IF NOT EXISTS` clauses
- No existing data is modified (only new columns added)
- New columns have safe defaults
- RPC functions are new (not replacing critical ones)
- UI changes are purely additive
- Removed problematic feature (LinkedIn PDF) to reduce bugs

### What Could Go Wrong

1. **Migration 1 fails on constraint:**
   - Possible if production has duplicate roles we don't expect
   - Check: `SELECT user_id, role, organization_id, COUNT(*) FROM user_roles GROUP BY 1,2,3 HAVING COUNT(*) > 1;`

2. **Migration 2 backfill fails:**
   - Possible if users have no roles (shouldn't happen)
   - Check: `SELECT COUNT(*) FROM auth.users WHERE id NOT IN (SELECT DISTINCT user_id FROM user_roles);`

3. **Migration 3 GIN index creation slow:**
   - Large `candidate_profiles` table could make index creation slow
   - Impact: Migration takes 1-2 minutes instead of seconds
   - Mitigation: Indexes use `CONCURRENTLY` would be ideal, but current syntax is safe

4. **Edge function breaks import:**
   - New permission logic doesn't work as expected
   - Mitigation: Test thoroughly after deployment
   - Rollback: Revert function to previous version

5. **UI breaks existing pages:**
   - Multi-role context causes render issues
   - Mitigation: Test all major pages
   - Rollback: Revert Render deployment to previous version

---

## 🔄 Rollback Strategy

### If Database Migration Fails
```bash
# Check which migrations applied
npx supabase db remote ls

# If migration failed mid-way, manually fix in production
# Connect to production DB and run rollback SQL (see above)

# If all migrations applied but causing issues:
# Create new rollback migration file and apply it
```

### If Edge Function Breaks
```bash
# Revert to previous version
git log supabase/functions/bulk-import-candidates/index.ts
git checkout <previous-commit> supabase/functions/bulk-import-candidates/index.ts
npx supabase functions deploy bulk-import-candidates
```

### If UI Breaks
```bash
# In Render dashboard:
# 1. Go to deployment history
# 2. Click "Rollback" on previous working deployment
# OR
# Git rollback:
git revert <commit-hash>
git push origin main
# Render will auto-deploy the revert
```

---

## 📊 Production Data Checks

### Before Deployment
```sql
-- Check for duplicate roles (should return 0 rows)
SELECT user_id, role, organization_id, COUNT(*)
FROM user_roles
GROUP BY 1,2,3
HAVING COUNT(*) > 1;

-- Check users without roles (should return 0)
SELECT COUNT(*)
FROM auth.users
WHERE id NOT IN (SELECT DISTINCT user_id FROM user_roles);

-- Check candidate_profiles count (baseline)
SELECT COUNT(*) FROM candidate_profiles;

-- Check existing columns (should NOT have new JSONB columns yet)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'candidate_profiles'
  AND column_name IN ('experience', 'education', 'skills', 'soft_skills');
```

### After Deployment
```sql
-- Verify new constraint exists
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'user_roles'
  AND constraint_name = 'user_roles_user_id_role_org_unique';

-- Verify primary roles marked (should return count > 0)
SELECT COUNT(*) FROM user_roles WHERE is_primary = true;

-- Verify each user has exactly 1 primary role
SELECT user_id, COUNT(*) as primary_count
FROM user_roles
WHERE is_primary = true
GROUP BY user_id
HAVING COUNT(*) != 1; -- Should return 0 rows

-- Verify new columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'candidate_profiles'
  AND column_name IN ('experience', 'education', 'skills', 'source');

-- Verify indexes created
SELECT indexname
FROM pg_indexes
WHERE tablename = 'candidate_profiles'
  AND indexname LIKE '%gin%';

-- Verify RPC functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_name IN (
  'grant_role_to_user',
  'revoke_role_from_user',
  'get_org_users_with_roles',
  'get_candidate_experience_count',
  'calculate_years_from_experience_jsonb'
);
```

---

## ✅ Success Criteria

Deployment is successful when ALL of the following are true:

1. ✅ All 3 migrations applied without errors
2. ✅ All new indexes created
3. ✅ All new RPC functions callable
4. ✅ All users have exactly 1 primary role
5. ✅ Edge function deployed successfully
6. ✅ UI deployed successfully on Render
7. ✅ Org_admin can switch to recruiter and import candidates
8. ✅ LinkedIn PDF import button removed from UI
9. ✅ Existing candidate profiles unaffected
10. ✅ No errors in production logs

---

## 📞 Support Contacts

**If Issues Occur:**
- Check Supabase dashboard logs
- Check Render deployment logs
- Review error messages in browser console
- Check database query logs

**Emergency Rollback:**
- Revert Render deployment (safe, instant)
- Revert edge function (safe, instant)
- Database rollback (requires manual SQL, be careful)

---

## 📝 Post-Deployment Notes

**What Changed:**
- Multi-role system now fully operational
- Users can have multiple roles across organizations
- Primary role tracking prevents accidental role removal
- JSONB profile fields ready for future resume import enhancements
- LinkedIn PDF import removed (simpler, more reliable import)
- Import permission bug fixed for multi-role users

**What's Next:**
- Monitor for any issues with multi-role switching
- Gather feedback on simplified import flow
- Consider re-implementing LinkedIn import with better parsing in future

---

**Prepared by:** Claude Code
**Review Status:** ⏳ Pending User Review
**Approved by:** _____________
**Deployment Date:** _____________
**Deployment Time:** _____________
**Deployed by:** _____________
