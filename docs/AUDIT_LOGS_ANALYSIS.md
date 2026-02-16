# Audit Logs Analysis & Best Practices

## Current Implementation Review

### Schema
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,  -- Made nullable in later migration
  user_id UUID NOT NULL,
  action TEXT NOT NULL,           -- e.g., 'insert', 'update', 'delete', 'grant_role'
  entity_type TEXT NOT NULL,      -- e.g., 'clients', 'candidates', 'jobs'
  entity_id UUID,                 -- ID of the affected entity
  details JSONB DEFAULT '{}',     -- Full context of what changed
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  acting_role TEXT                -- May not exist in all schemas
)
```

### Current Problems

1. **Details Column Underutilization**
   - Currently shows raw JSON dump: `{"old":{"name":"..."},"new":{"name":"..."}}`
   - Truncated display makes it hard to read
   - No structured rendering for common patterns
   - Not searchable or filterable effectively

2. **Missing acting_role in base schema**
   - Column referenced in code but may not exist in database
   - Needs migration to add it properly

3. **Display Issues**
   - Details shown as single-line code block
   - No expand/collapse functionality
   - No diffing view for updates
   - No deep-linking to entities

4. **Limited Troubleshooting Value**
   - Can't easily answer: "What changed on this candidate?"
   - Can't filter by specific field changes
   - No before/after comparison view
   - No timeline view for entity history

---

## Production SaaS Best Practices

### 1. **Stripe's Approach** (Gold Standard)
```typescript
// Stripe shows human-readable descriptions
"Updated customer cus_123"
"Created subscription sub_456"
"Refunded charge ch_789 ($50.00)"

// Details provide context:
{
  "object": "customer",
  "id": "cus_123",
  "changes": {
    "email": {
      "old": "old@example.com",
      "new": "new@example.com"
    }
  }
}
```

**Key Features:**
- Human-readable action descriptions
- Structured change diff
- Direct links to affected entities
- Export/download capabilities
- Real-time updates

### 2. **GitHub's Approach**
- Timeline view of all changes
- Rich diff visualization (before/after)
- Actor + timestamp + action
- Context-aware descriptions
- Filterable by action type, actor, date range

### 3. **Auth0's Approach**
```typescript
{
  "type": "sapi",    // API operation
  "description": "Update user",
  "details": {
    "request": { "method": "PATCH", "path": "/api/v2/users/xxx" },
    "response": { "statusCode": 200 }
  },
  "user_name": "john@example.com",
  "ip": "192.168.1.1",
  "date": "2024-02-15T10:30:00.000Z"
}
```

**Key Features:**
- Categorized event types
- IP + User Agent tracking
- Request/Response details
- Security-focused (failed logins, MFA, etc.)
- Retention policies (90 days, 1 year, etc.)

### 4. **Datadog's Approach**
- Log everything, query anything
- Full-text search across all fields
- Faceted filtering (by user, action, entity, time)
- Saved views/queries
- Alerting on specific patterns

---

## How Audit Logs Help Troubleshoot User Problems

### Real-World Scenarios

#### Scenario 1: "My candidate disappeared!"
**Without good audit logs:**
- Search code for delete logic
- Check database directly
- Ask user for more context
- Take 30+ minutes

**With good audit logs:**
```sql
SELECT * FROM audit_logs
WHERE entity_type = 'candidate_profiles'
  AND entity_id = 'xxx'
  AND action = 'delete'
ORDER BY created_at DESC;
```
**Result:** See who deleted it, when, and what the candidate data was

#### Scenario 2: "Client contact info is wrong"
**Without good audit logs:**
- Check current data
- No idea when it changed
- No idea who changed it
- No way to restore

**With good audit logs:**
```sql
SELECT * FROM audit_logs
WHERE entity_id = 'client_id'
  AND details->>'new' ? 'contact_email'  -- Email was modified
ORDER BY created_at DESC;
```
**Result:** See all email changes, who made them, and previous values

#### Scenario 3: "Pipeline status not updating"
**With good audit logs:**
- Check if status change events are being logged
- Compare timestamps with user report
- See if error occurred during update
- Identify if it's a UI bug or data bug

#### Scenario 4: Security Audit
**Questions to answer:**
- Who accessed what data?
- Who made privilege escalations?
- What happened before the data breach?
- Timeline of all actions by suspicious user

---

## Recommended Improvements

### 1. **Schema Enhancement**
```sql
-- Add acting_role if missing
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS acting_role TEXT;

-- Add user_agent for debugging
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Add indexes for common queries
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_action_date ON audit_logs(action, created_at DESC);

-- Add GIN index for details searching
CREATE INDEX idx_audit_logs_details ON audit_logs USING gin(details jsonb_path_ops);
```

### 2. **Improve Details Column Usage**

**Current State:**
```json
{
  "old": { "name": "John", "email": "john@old.com", ...50 more fields },
  "new": { "name": "John", "email": "john@new.com", ...50 more fields }
}
```

**Better Approach - Store Only Diffs:**
```json
{
  "changed_fields": ["email", "phone"],
  "changes": {
    "email": { "from": "john@old.com", "to": "john@new.com" },
    "phone": { "from": "555-0100", "to": "555-0200" }
  },
  "metadata": {
    "reason": "User requested update",
    "ticket_id": "TICKET-123"
  }
}
```

**Benefits:**
- Smaller storage footprint
- Instantly see what changed
- Easier to query specific field changes
- Can add business context (reason, ticket)

### 3. **Enhanced UI Component**

Create an `AuditLogDetailViewer` component:

```typescript
interface AuditLogDetailViewerProps {
  log: AuditLog;
}

export function AuditLogDetailViewer({ log }: AuditLogDetailViewerProps) {
  return (
    <Dialog>
      <DialogTrigger>View Details</DialogTrigger>
      <DialogContent className="max-w-4xl">
        <Tabs defaultValue="changes">
          <TabsList>
            <TabsTrigger value="changes">Changes</TabsTrigger>
            <TabsTrigger value="context">Context</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="changes">
            {/* Show before/after diff */}
            <ChangeDiffViewer
              before={log.details.old}
              after={log.details.new}
            />
          </TabsContent>

          <TabsContent value="context">
            {/* Show metadata, IP, user agent, etc. */}
            <AuditContextView log={log} />
          </TabsContent>

          <TabsContent value="raw">
            {/* Pretty-printed JSON */}
            <JSONViewer data={log.details} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. **Add Entity Timeline View**

```typescript
// Show all audit logs for a specific entity
function CandidateAuditTimeline({ candidateId }: { candidateId: string }) {
  const logs = useAuditLogs({
    entity_type: 'candidate_profiles',
    entity_id: candidateId
  });

  return (
    <Timeline>
      {logs.map(log => (
        <TimelineItem
          key={log.id}
          icon={getActionIcon(log.action)}
          timestamp={log.created_at}
          user={log.user_name}
        >
          <AuditLogDescription log={log} />
          <AuditLogDetailViewer log={log} />
        </TimelineItem>
      ))}
    </Timeline>
  );
}
```

### 5. **Add Search & Filter**

```typescript
// Advanced filtering
interface AuditLogFilters {
  date_range: [Date, Date];
  users: string[];
  actions: string[];
  entity_types: string[];
  search_in_details: string; // Full-text search
}

// Example query
SELECT * FROM audit_logs
WHERE
  created_at BETWEEN $1 AND $2
  AND user_id = ANY($3)
  AND action = ANY($4)
  AND entity_type = ANY($5)
  AND details::text ILIKE '%' || $6 || '%'  -- Search in details
ORDER BY created_at DESC;
```

### 6. **Add Human-Readable Descriptions**

```typescript
function getAuditLogDescription(log: AuditLog): string {
  const action = log.action;
  const entity = log.entity_type;

  if (action === 'insert' && entity === 'clients') {
    const name = log.details.new?.name;
    return `Created client "${name}"`;
  }

  if (action === 'update' && entity === 'clients') {
    const changes = Object.keys(log.details.new || {})
      .filter(key => log.details.old?.[key] !== log.details.new?.[key]);
    return `Updated ${changes.length} field(s) on client "${log.details.new?.name}"`;
  }

  if (action === 'grant_role') {
    const role = log.details.granted_role;
    const userName = log.details.target_user_name;
    return `Granted ${role} role to ${userName}`;
  }

  // Fallback
  return `${formatAction(action)} ${entity}`;
}
```

### 7. **Add Export Functionality**

```typescript
// Allow exporting audit logs for compliance
async function exportAuditLogs(filters: AuditLogFilters) {
  const logs = await fetchAuditLogs(filters);

  // Export as CSV
  const csv = convertToCSV(logs);
  downloadFile('audit_logs.csv', csv);

  // Or export as JSON
  const json = JSON.stringify(logs, null, 2);
  downloadFile('audit_logs.json', json);
}
```

---

## Implementation Priority

### Phase 1 (Immediate - This Week)
1. ✅ Fix Team Activity to recognize actual action types
2. Add acting_role column to audit_logs (migration)
3. Create AuditLogDetailViewer component with tabs
4. Add human-readable descriptions

### Phase 2 (Next Sprint)
1. Add entity timeline view (show all changes to one entity)
2. Improve filtering (date range, advanced filters)
3. Add full-text search in details
4. Add indexes for performance

### Phase 3 (Future)
1. Export functionality
2. Retention policies (auto-delete old logs)
3. Real-time log streaming
4. Alerting on specific patterns
5. Compliance reports

---

## Summary: What Makes Great Audit Logs

1. **Complete Context**
   - Who did it (user_id + name + role)
   - What they did (action + human-readable description)
   - When they did it (timestamp + timezone)
   - Where they did it from (IP + user agent)
   - What changed (detailed diff, not full dumps)
   - Why they did it (optional: reason field)

2. **Actionable**
   - Can answer "who changed X?"
   - Can restore previous values
   - Can identify patterns
   - Can debug issues faster

3. **Compliant**
   - Immutable (no edits/deletes except purge policies)
   - Retained for required period
   - Exportable for audits
   - Searchable and filterable

4. **User-Friendly**
   - Human-readable descriptions
   - Visual diffs
   - Direct links to entities
   - Timeline views

Your current implementation has the foundation but needs the UI/UX layer to make it truly useful for troubleshooting.
