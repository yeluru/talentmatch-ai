# Team Activity Navigation - Consistency Fix

## Issue

Team Activity navigation item was missing from Platform Admin (Super Admin) view, while it existed for Account Managers and Org Admins.

## Changes Made

### 1. Added Team Activity to Platform Admin Navigation

**File:** `src/components/layouts/SuperAdminLayout.tsx`

**Changes:**
- Added `Activity` icon import
- Added "Team Activity" nav item to `PLATFORM_ADMIN_NAV` array
- Positioned between "Candidates" and "Role Management"

```typescript
const PLATFORM_ADMIN_NAV: AdminNavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, end: true },
  { label: "Tenants", href: "/admin?tab=tenants", icon: Building2, end: true },
  { label: "Users", href: "/admin?tab=users", icon: Users, end: true },
  { label: "Candidates", href: "/admin?tab=candidates", icon: UserCheck, end: true },
  { label: "Team Activity", href: "/admin/team-activity", icon: Activity, end: true }, // ← NEW
  { label: "Role Management", href: "/admin/roles", icon: Shield, end: true },
  { label: "Audit logs", href: "/admin?tab=audit", icon: FileText, end: true },
  { label: "Profile", href: "/admin/profile", icon: User, end: true },
];
```

### 2. Added Team Activity Route for Platform Admin

**File:** `src/App.tsx`

**Changes:**
- Added route `/admin/team-activity` with super_admin role protection
- Uses the same `TeamActivity` component as other roles
- Added after `/admin/roles` route

```typescript
<Route
  path="/admin/team-activity"
  element={
    <ProtectedRoute allowedRoles={["super_admin"]}>
      {withSuspense(<TeamActivity />)}
    </ProtectedRoute>
  }
/>
```

## Current State: All Roles Now Consistent

### ✅ Platform Admin (Super Admin)
- **Nav Item:** "Team Activity"
- **Route:** `/admin/team-activity`
- **Component:** `TeamActivity` from `pages/manager/TeamActivity.tsx`
- **Allowed Roles:** `super_admin`

### ✅ Org Admin
- **Nav Item:** "Team Activity"
- **Route:** `/org-admin/team-activity`
- **Component:** `TeamActivity` from `pages/manager/TeamActivity.tsx`
- **Allowed Roles:** `org_admin`

### ✅ Account Manager
- **Nav Item:** "Team Activity"
- **Route:** `/manager/team-activity`
- **Component:** `TeamActivity` from `pages/manager/TeamActivity.tsx`
- **Allowed Roles:** `account_manager`, `org_admin`, `super_admin`

## Shared Component

All three roles use the **same** `TeamActivity` component:
- **File:** `src/pages/manager/TeamActivity.tsx`
- **Behavior:** Identical across all roles
- **Requirements:** Requires `organizationId` to function
- **Features:**
  - AI-generated activity summaries
  - Detailed insights from audit logs
  - Time period selection (Today, Yesterday, Last 7 Days, Last 30 Days)
  - Shows activity for all team members in the organization

## Important Notes

### Organization Requirement

The TeamActivity component requires an `organizationId` to function. This means:

1. **Platform Admins** who are not assigned to a specific organization will see:
   ```
   "Tenant audit logs are only available when your account manager role
   is linked to an organization."
   ```

2. **Platform Admins in an organization** will see team activity for that organization

3. **Org Admins** always have an organization ID (their tenant)

4. **Account Managers** always have an organization ID

### Current Behavior Check

```typescript
const isManager = currentRole === 'account_manager' ||
                  currentRole === 'org_admin' ||
                  currentRole === 'super_admin';

useEffect(() => {
  if (isManager && organizationId) {
    fetchTeamMembers();
  }
}, [isManager, organizationId]);
```

**This means:**
- Super admins WITH an org → Can see team activity
- Super admins WITHOUT an org → See message about org requirement
- This is expected behavior for platform-level admins

## Future Enhancements (Optional)

If platform admins need to see team activity across ALL organizations, consider:

1. **Organization Selector**
   - Add dropdown to select which organization's team activity to view
   - Platform admin can switch between orgs

2. **Aggregated View**
   - Show activity across all organizations
   - Group by organization
   - Requires significant refactoring

3. **Separate Super Admin Version**
   - Create `src/pages/admin/PlatformTeamActivity.tsx`
   - Different logic for cross-org viewing
   - More complex implementation

**For now**, the current implementation works well for super admins who are part of an organization.

## Testing

### Test Platform Admin Navigation

1. Log in as Platform Admin
2. Navigate to `/admin`
3. Verify "Team Activity" appears in the left sidebar
4. Click "Team Activity"
5. Should navigate to `/admin/team-activity`

### Test with Organization

If platform admin has an `organizationId`:
- Should see team activity summaries
- Can select time periods
- Can refresh to regenerate summaries

### Test without Organization

If platform admin has no `organizationId`:
- Should see message: "Tenant audit logs are only available when your account manager role is linked to an organization."
- Expected behavior for platform-level admins

## Related Files

- `src/components/layouts/SuperAdminLayout.tsx` - Platform admin nav
- `src/components/layouts/OrgAdminLayout.tsx` - Org admin nav
- `src/components/layouts/DashboardLayout.tsx` - Account manager nav
- `src/App.tsx` - All routes
- `src/pages/manager/TeamActivity.tsx` - Shared component
- `docs/TEAM_ACTIVITY_AI_SUMMARY_ENHANCEMENT.md` - AI summary features

---

## Summary

✅ Team Activity is now available and consistent across all admin roles:
- Platform Admin (Super Admin)
- Org Admin
- Account Manager

All use the same component with the same behavior, ensuring a consistent experience.
