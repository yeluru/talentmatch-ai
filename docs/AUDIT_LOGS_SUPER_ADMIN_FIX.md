# Platform Admin Audit Logs - Missing Policy Fix

## Problem

Platform Admin (Super Admin) audit logs page showed **empty** even though audit logs exist in the database.

**URL:** `http://localhost:8080/admin?tab=audit`

## Root Cause

The `audit_logs` table has Row Level Security (RLS) enabled with the following SELECT policies:

1. ✅ **"Managers can view org audit logs"** - `account_manager` role can view logs for their organization
2. ✅ **"Org admins can view org audit logs"** - `org_admin` role can view logs for their organization
3. ❌ **Missing:** No policy allowing `super_admin` to view ALL audit logs

**Result:** Super admins were blocked by RLS from viewing any audit logs.

## The Fix

Created migration: `supabase/migrations/20260215010000_super_admin_audit_logs_access.sql`

```sql
CREATE POLICY "Super admins can view all audit logs"
ON public.audit_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin')
);
```

This policy allows platform admins to view audit logs **across all organizations** for:
- 🔍 Platform-level troubleshooting
- 📊 Compliance auditing
- 🛡️ Security investigations
- 📈 System-wide analytics

## How to Apply

### Option 1: Migration Command (Recommended)
```bash
supabase migration up
```

### Option 2: Direct SQL (if migrations not working)
Run this SQL in Supabase SQL Editor:

```sql
-- Allow super admins to view all audit logs
DROP POLICY IF EXISTS "Super admins can view all audit logs" ON public.audit_logs;

CREATE POLICY "Super admins can view all audit logs"
ON public.audit_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin')
);
```

## Verification Steps

1. **Apply the migration:**
   ```bash
   supabase migration up
   ```

2. **Navigate to Platform Admin:**
   - Go to `http://localhost:8080/admin?tab=audit`

3. **Verify audit logs appear:**
   - Should see logs from all organizations
   - Should see logs from all users
   - Should see recent activity (last 4 hours by default)

4. **Test functionality:**
   - ✅ Search should work
   - ✅ "Load more" should work
   - ✅ "View Details" button should work
   - ✅ Sorting by columns should work

## Current RLS Policies on audit_logs

After applying the fix:

| Policy Name | Role | Scope | Purpose |
|------------|------|-------|---------|
| Managers can view org audit logs | `account_manager` | Own org only | Team activity monitoring |
| Org admins can view org audit logs | `org_admin` | Own org only | Organizational oversight |
| **Super admins can view all audit logs** | `super_admin` | **All orgs** | Platform-level troubleshooting |
| Actors can insert audit logs | All authenticated | Own actions | Automatic audit logging |

## Why This Matters

Super admins need audit log access for:

1. **Troubleshooting User Issues**
   - "My data disappeared" - see who deleted it
   - "Something changed" - see who modified it
   - "Permission denied" - see who removed access

2. **Security Investigations**
   - Suspicious activity across organizations
   - Unauthorized access attempts
   - Data breach forensics

3. **Compliance & Reporting**
   - Cross-tenant audit reports
   - Regulatory compliance (SOC 2, GDPR, etc.)
   - Executive dashboards

4. **Platform Health**
   - System-wide activity patterns
   - Feature usage analytics
   - Error pattern detection

## Related Files

- **Migration:** `supabase/migrations/20260215010000_super_admin_audit_logs_access.sql`
- **Frontend:** `src/pages/admin/SuperAdminDashboard.tsx` (Audit Logs tab)
- **View:** `audit_logs_enriched` (joins with orgs and profiles)
- **Base Table:** `public.audit_logs`

## Notes

- This policy only grants **SELECT** (read) access, not INSERT/UPDATE/DELETE
- Super admins can see logs across all organizations (by design)
- The enriched view includes org names and user names for context
- Default view shows last 4 hours; "Load more" expands further back
- Search mode searches full history

---

## Summary

**Issue:** Super admin audit logs showed empty
**Cause:** Missing RLS policy for super_admin role
**Fix:** Added policy to allow super_admin to SELECT all audit logs
**Action:** Run `supabase migration up` to apply the fix
