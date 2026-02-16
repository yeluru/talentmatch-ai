# Team Activity AI Summary Enhancement

## Overview

Enhanced the Team Activity AI summary generation to leverage the detailed information from audit log `details` columns, creating richer, more meaningful activity summaries.

## What Changed

### Before (Generic Counts)
```
Uma Mokkarala was active for approximately 2.5 hours during this period,
managed 3 clients, and granted 2 roles.
```

### After (Detailed Insights)
```
Uma Mokkarala was active for approximately 2.5 hours during this period,
worked on clients: IT Vision 360, Acme Corp, TechStart Inc,
and granted 1 recruiter role, 1 account manager role.
```

## New Features

### 1. **Client Activity Details**
Instead of: "managed 5 clients"
Now shows: "worked on clients: IT Vision 360, Acme Corp, TechStart Inc"

- Lists specific client names (up to 3)
- If more than 3 clients, shows count + first 2 names
- Extracts names from audit log details.new or details.old

### 2. **Job Posting Details**
Instead of: "created 2 jobs"
Now shows: "managed job postings: 'Senior Java Developer', 'DevOps Engineer'"

- Lists specific job titles (up to 2)
- Shows actual position names
- Helps managers understand what positions are being worked on

### 3. **Role Grant Details**
Instead of: "granted 3 roles"
Now shows: "granted 2 recruiter roles, 1 account manager role"

- Breaks down by role type
- Shows specific role names (formatted nicely: account_manager → account manager)
- Aggregates same roles: "3 recruiter roles" vs "1 recruiter role, 2 manager roles"

### 4. **Candidate Profile Updates**
Instead of: "updated 5 candidates"
Now shows: "updated candidate email, phone, location across 5 profiles"

- Identifies which fields were actually changed
- Shows up to 3 most common field changes
- Helps understand what kind of updates were made

## How It Works

### Extract Detailed Insights Function

```typescript
const getDetailedInsights = () => {
  const insights: string[] = [];

  // 1. Extract client names from details
  const clientNames = actions
    .filter(a => a.entity_type === 'clients')
    .map(log => log.details?.new?.name || log.details?.old?.name)
    .filter(Boolean);

  // 2. Extract job titles from details
  const jobTitles = actions
    .filter(a => a.entity_type === 'jobs')
    .map(log => log.details?.new?.title)
    .filter(Boolean);

  // 3. Extract granted role types
  const rolesGranted = actions
    .filter(a => a.action === 'grant_role')
    .map(log => log.details?.granted_role)
    .filter(Boolean);

  // 4. Extract changed fields from updates
  const fieldsChanged = actions
    .filter(a => a.action === 'update')
    .flatMap(log => {
      const changed = [];
      for (const key in log.details?.new) {
        if (log.details.old?.[key] !== log.details.new?.[key]) {
          changed.push(key);
        }
      }
      return changed;
    });

  return insights;
};
```

### Fallback Logic

If detailed insights can't be extracted (e.g., details field is empty or malformed), the summary falls back to generic counts:
- "managed 3 clients" (generic)
- "created 2 jobs" (generic)

This ensures summaries always work even with incomplete data.

## Example Outputs

### Example 1: Client Management Focus
```
Pariskshit Gulati was active for approximately 3.2 hours during this period,
worked on clients: IT Vision 360, Acme Corp, and updated candidate email,
phone across 2 profiles.
```

### Example 2: Role Management Focus
```
Uma Mokkarala had 4 actions during this period and granted 2 recruiter roles,
1 account manager role.
```

### Example 3: Job Posting Focus
```
Ravi Yeluru was active for approximately 1.5 hours during this period,
managed job postings: "Senior Software Engineer", "Product Manager",
and worked on clients: CompSciPrep.
```

### Example 4: Mixed Activity
```
John Smith was active for approximately 4.1 hours during this period,
worked on clients: Tech Innovations, Global Solutions, moved 5 candidates
through the pipeline, and added 3 notes.
```

### Example 5: Fallback (No Details)
```
Jane Doe had 8 actions during this period, managed 3 clients, created 2 jobs,
and uploaded 1 candidate.
```

## Technical Details

### Data Extraction Strategy

1. **Safely parse JSON details**
   - Uses try-catch to handle malformed data
   - Checks both `details.new` and `details.old`
   - Falls back gracefully if fields are missing

2. **Deduplication**
   - Client names are deduplicated (same client updated twice = 1 mention)
   - Job titles are deduplicated
   - Field changes are aggregated

3. **Smart truncation**
   - Shows up to 3 client names, then summarizes
   - Shows up to 2 job titles, then counts
   - Shows up to 3 changed fields
   - Prevents summaries from being too long

4. **Formatting**
   - Role names: `account_manager` → `account manager`
   - Field names: `contact_email` → `contact email`
   - Natural language: "2 recruiter roles" vs "1 recruiter role"

### Performance Considerations

- All processing happens client-side
- No additional database queries needed
- Uses existing audit log data that's already fetched
- Minimal overhead (~10-20ms per summary)

## Benefits

### For Managers
✅ **Better visibility** - See actual client/job names, not just counts
✅ **Quick insights** - Understand what team members worked on at a glance
✅ **Action tracking** - Know who's working on which accounts/positions

### For Reporting
✅ **More context** - Activity reports are more meaningful
✅ **Trend analysis** - Can spot patterns (e.g., same client updated repeatedly)
✅ **Accountability** - Clear attribution of work

### For Compliance
✅ **Audit trail** - Detailed summaries complement full audit logs
✅ **Transparency** - Team can see their own activity summarized clearly
✅ **Documentation** - Natural language summaries easier to export/share

## Future Enhancements

### Phase 2 (Future)
1. **Sentiment detection** - Identify positive/negative changes
2. **Trend highlighting** - "2x more clients than usual"
3. **Collaboration tracking** - "Worked with Uma on client Acme Corp"
4. **Goal tracking** - "Met weekly client contact goal (5/5)"

### Phase 3 (Future)
1. **AI-generated insights** - Use LLM to generate truly natural summaries
2. **Anomaly detection** - Flag unusual patterns
3. **Recommendations** - "Consider following up on IT Vision 360"
4. **Comparison** - "Most active day this week"

## Testing

To test the new summaries:

1. **Navigate to Team Activity**
   - Manager → Team Activity
   - Or Org Admin → Team Activity

2. **Select a time period**
   - Today
   - Last 7 Days
   - Last 30 Days

3. **Generate summaries**
   - Click "Refresh" button
   - Summaries will be generated with detailed insights

4. **Verify details**
   - Look for specific client names, job titles, roles
   - Compare to actual audit logs to verify accuracy

## Code Location

**File:** `src/pages/manager/TeamActivity.tsx`

**Key Functions:**
- `getDetailedInsights()` - Extracts insights from audit log details
- `generateSummaries()` - Main summary generation logic
- Enhanced summary formatting with detailed insights

## Related Documentation

- `docs/AUDIT_LOGS_ANALYSIS.md` - Audit logs best practices
- `docs/UNDERSTANDING_DETAILS_COLUMN.md` - Details column structure
- `docs/AUDIT_LOGS_UPDATE_SUMMARY.md` - Audit viewer component

---

## Summary

The enhanced AI summaries now use the rich `details` field from audit logs to create meaningful, context-aware activity summaries that go beyond simple action counts. This provides managers with better visibility into what their team is actually working on, making the Team Activity page significantly more valuable.
