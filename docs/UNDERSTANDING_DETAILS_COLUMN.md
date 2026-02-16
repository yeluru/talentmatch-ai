# Understanding the Audit Logs `details` Column

## What is it?

The `details` column is a **JSONB** field that stores the complete context of what happened in each audit log entry. It's the most important column for troubleshooting because it tells you exactly what changed.

## Current Structure

### For INSERT actions:
```json
{
  "new": {
    "id": "uuid-here",
    "name": "New Client",
    "email": "client@example.com",
    // ... all other fields
  }
}
```

### For UPDATE actions:
```json
{
  "old": {
    "id": "uuid-here",
    "name": "Old Client Name",
    "email": "old@example.com",
    "status": "active"
    // ... all other fields
  },
  "new": {
    "id": "uuid-here",
    "name": "New Client Name",
    "email": "new@example.com",
    "status": "active"
    // ... all other fields
  }
}
```

### For DELETE actions:
```json
{
  "old": {
    "id": "uuid-here",
    "name": "Deleted Client",
    // ... all fields that were deleted
  }
}
```

### For custom RPC actions (like grant_role):
```json
{
  "granted_role": "recruiter",
  "target_user_id": "uuid-here",
  "organization_id": "uuid-here",
  "is_primary": true
}
```

## How to Use It for Troubleshooting

### Problem: "My client's email changed, who did it?"

**Query:**
```sql
SELECT
  created_at,
  user_id,
  details->'old'->>'email' as old_email,
  details->'new'->>'email' as new_email
FROM audit_logs
WHERE entity_type = 'clients'
  AND entity_id = 'your-client-id'
  AND action = 'update'
  AND details->'new'->>'email' != details->'old'->>'email'
ORDER BY created_at DESC;
```

**Result:** See exactly when the email changed, who changed it, and what it was before.

### Problem: "This candidate disappeared!"

**Query:**
```sql
SELECT
  created_at,
  user_id,
  action,
  details->'old' as deleted_data
FROM audit_logs
WHERE entity_type = 'candidate_profiles'
  AND entity_id = 'candidate-id'
  AND action = 'delete';
```

**Result:** See who deleted it, when, and recover the full candidate data from the `deleted_data` field.

### Problem: "What changed in the last hour?"

**Query:**
```sql
SELECT
  created_at,
  user_id,
  action,
  entity_type,
  jsonb_object_keys(details->'new') as changed_fields
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND action = 'update'
ORDER BY created_at DESC;
```

**Result:** See all recent changes across all entities.

## What We Just Improved

### Before:
```
Details column showed:
{"old":{"id":"...","name":"...","email":"..."},"new":{...}}
```
- Hard to read (truncated JSON)
- Can't see what actually changed
- No easy way to compare before/after

### After (with new AuditLogDetailViewer component):
```
Details column shows:
"Updated 2 fields for 'Client Name'" [View Details button]

Clicking "View Details" opens a dialog with 3 tabs:
1. Changes - Shows only what changed, in a before/after view
2. Full Context - Shows complete old/new objects
3. Raw JSON - Shows the raw JSON with copy button
```

## Example Use Cases in Your App

### 1. Client Management
Track all changes to client records:
- Contact information updates
- Status changes
- Who created/modified clients

### 2. Role Management
See who granted roles to whom:
```sql
SELECT
  created_at,
  user_id,
  details->>'granted_role' as role,
  details->>'target_user_id' as granted_to
FROM audit_logs
WHERE action = 'grant_role'
ORDER BY created_at DESC;
```

### 3. Data Recovery
If someone accidentally deletes data, you can recover it:
```sql
SELECT details->'old' as deleted_record
FROM audit_logs
WHERE entity_id = 'deleted-record-id'
  AND action = 'delete';
```

## Best Practices

### 1. Keep Details Lightweight
✅ **Good:** Store only changed fields
```json
{
  "changed_fields": ["email", "phone"],
  "changes": {
    "email": {"from": "old@email.com", "to": "new@email.com"}
  }
}
```

❌ **Bad:** Store entire objects with 50+ fields when only 1 changed

### 2. Add Business Context
```json
{
  "changes": {...},
  "metadata": {
    "reason": "Customer request via ticket #123",
    "reviewed_by": "manager-id"
  }
}
```

### 3. Make it Queryable
Use JSONB operators to query specific fields:
```sql
-- Find all email changes
WHERE details->'changes' ? 'email'

-- Find changes to specific value
WHERE details->'new'->>'status' = 'inactive'

-- Full-text search in details
WHERE details::text ILIKE '%searchterm%'
```

## Troubleshooting Examples

### "User says they didn't change anything, but data is different"

```sql
-- Find all changes to that entity
SELECT
  created_at,
  u.full_name as who_did_it,
  a.action,
  a.details
FROM audit_logs a
JOIN profiles u ON u.user_id = a.user_id
WHERE a.entity_id = 'entity-id'
ORDER BY created_at DESC;
```

### "We need to audit all actions by this user"

```sql
-- Get user activity timeline
SELECT
  created_at,
  action,
  entity_type,
  entity_id,
  CASE
    WHEN action = 'update' THEN jsonb_object_keys(details->'new')
    ELSE NULL
  END as what_changed
FROM audit_logs
WHERE user_id = 'user-id'
  AND created_at > '2024-01-01'
ORDER BY created_at DESC;
```

### "What happened to this client in the last week?"

```sql
-- Entity timeline
SELECT
  created_at,
  u.full_name as who,
  a.action,
  a.details
FROM audit_logs a
JOIN profiles u ON u.user_id = a.user_id
WHERE a.entity_type = 'clients'
  AND a.entity_id = 'client-id'
  AND a.created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at ASC;  -- Chronological order
```

## Summary

The `details` column is your **time machine** - it lets you:
1. ✅ See exactly what changed
2. ✅ Know who changed it
3. ✅ Recover deleted data
4. ✅ Audit user actions
5. ✅ Debug issues faster
6. ✅ Meet compliance requirements

With the new `AuditLogDetailViewer` component, this information is now easily accessible through your UI, not just via SQL queries.
