# Team Activity - Final Architecture

## Design Decision: Platform Admins Don't Have Team Activity

### Why Platform Admins Don't Need Team Activity

Platform admins (super admins) are **platform-level** users who:
- ✅ Create and manage organizations (tenants)
- ✅ Manage org admins across all tenants
- ✅ Have platform-wide oversight via Audit Logs
- ❌ **Don't belong to any specific organization**
- ❌ **Don't manage day-to-day team activities**

**Team Activity is an organization-level feature** designed for:
- Org admins managing their organization's team
- Account managers overseeing recruiters in their org
- Tracking activity of team members within a single organization

### Platform Admin's Equivalent: Audit Logs

Platform admins use **Audit Logs** instead of Team Activity:
- View activity across ALL organizations
- Filter by organization, user, action type
- See detailed logs with full context
- Platform-wide visibility instead of org-scoped

## Final Navigation Structure

### ✅ Platform Admin (No Team Activity)
```
1. Overview
2. Tenants              ← Manage organizations
3. Users                ← Manage all users
4. Candidates           ← View all candidates
5. Role Management      ← Grant/revoke roles
6. Audit logs          ← Platform-wide activity
7. Profile
```

### ✅ Org Admin (Has Team Activity)
```
1. Overview
2. Team Activity       ← View org team activity
3. Account Managers
4. Recruiters
5. Candidates
6. All Users
7. Role Management
8. Audit Logs         ← Org-scoped logs
9. Profile
```

### ✅ Account Manager (Has Team Activity)
```
1. Dashboard
2. Team                ← Team member list
3. Team Activity       ← Team member activity
4. Candidates
5. Clients
6. Jobs
7. Organization
8. Audit Logs         ← Org-scoped logs
9. Help & How-to
```

## Role Comparison

| Feature | Platform Admin | Org Admin | Account Manager |
|---------|---------------|-----------|-----------------|
| **Scope** | All organizations | Single organization | Single organization |
| **Team Activity** | ❌ No (platform-level) | ✅ Yes (org team) | ✅ Yes (org team) |
| **Audit Logs** | ✅ All orgs | ✅ Own org | ✅ Own org |
| **Manages Orgs** | ✅ Yes | ❌ No | ❌ No |
| **Org Membership** | ❌ No org | ✅ Their org | ✅ Their org |

## Use Cases

### Platform Admin Monitoring Team Activity
**Question:** "How do I see what teams are doing across all organizations?"

**Answer:** Use **Audit Logs** at `/admin?tab=audit`
- Filter by organization to see specific tenant activity
- Filter by user to see individual activity
- Filter by time period (now shows last 7 days by default)
- View detailed changes with the new AuditLogDetailViewer

### Org Admin Monitoring Team Activity
**Question:** "How do I see what my team is doing?"

**Answer:** Use **Team Activity** at `/org-admin/team-activity`
- View AI-generated summaries of team activity
- See specific client names, job titles, roles granted
- Select time periods (Today, Yesterday, Last 7 Days, Last 30 Days)
- Refresh to regenerate summaries

### Account Manager Monitoring Team Activity
**Question:** "How do I see what my recruiters are doing?"

**Answer:** Use **Team Activity** at `/manager/team-activity`
- Same features as Org Admin
- Focused on your organization's team
- Detailed insights from audit logs

## Architecture Principles

### 1. **Separation of Concerns**
- Platform admins = Platform-level management
- Org admins = Organization-level management
- Account managers = Team-level management

### 2. **Single Source of Truth**
- All activity tracked in `audit_logs` table
- Team Activity queries audit logs for summaries
- Platform admins query audit logs directly

### 3. **Appropriate Abstractions**
- Team Activity = Friendly, summarized view for org-level users
- Audit Logs = Detailed, technical view for all roles
- Each role sees appropriate level of detail

### 4. **No Feature Duplication**
- Platform admins don't need Team Activity (have Audit Logs)
- Org admins get both Team Activity (friendly) and Audit Logs (detailed)
- Each feature serves its purpose

## Files Modified (Final State)

### Removed Team Activity from Platform Admin:
1. **`src/components/layouts/SuperAdminLayout.tsx`**
   - Removed "Team Activity" nav item
   - Removed Activity icon import

2. **`src/App.tsx`**
   - Removed `/admin/team-activity` route
   - Platform admins can't access this route

### Kept Team Activity for Org-Level Roles:
1. **`src/components/layouts/OrgAdminLayout.tsx`**
   - Team Activity at position 2 ✅

2. **`src/components/layouts/DashboardLayout.tsx`**
   - Team Activity at position 3 (after Team) ✅

3. **`src/App.tsx`**
   - `/org-admin/team-activity` route ✅
   - `/manager/team-activity` route ✅

## Enhanced Team Activity Features (For Org-Level Roles)

Both Org Admins and Account Managers get these features:

### 1. **Detailed Insights from Audit Logs**
- Client names: "worked on clients: IT Vision 360, Acme Corp"
- Job titles: "managed job postings: 'Senior Java Developer'"
- Role details: "granted 2 recruiter roles, 1 account manager role"
- Field changes: "updated candidate email, phone across 5 profiles"

### 2. **Time Period Selection**
- Today
- Yesterday
- Last 7 Days
- Last 30 Days

### 3. **AI-Generated Summaries**
- Natural language descriptions
- Contextual insights
- Activity patterns
- Time-based analysis

## Migration Notes

If your platform admin user previously had access to Team Activity:
1. The nav item has been removed
2. The route will return 403 Forbidden
3. This is expected and correct behavior
4. Use Audit Logs instead for platform-wide activity monitoring

## Summary

**Team Activity = Organization-scoped feature**
- ✅ Org Admin
- ✅ Account Manager
- ❌ Platform Admin (use Audit Logs instead)

**Audit Logs = Multi-scope feature**
- ✅ Platform Admin (all orgs)
- ✅ Org Admin (own org)
- ✅ Account Manager (own org)

This architecture correctly separates platform-level and organization-level concerns, giving each role the appropriate tools for their scope of responsibility.
