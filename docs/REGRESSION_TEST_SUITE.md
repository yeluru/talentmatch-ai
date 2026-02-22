# TalentMatch AI - Regression Test Suite

**Version:** 1.0
**Last Updated:** 2026-02-22
**Purpose:** Comprehensive test suite for major releases

---

## 🎯 Testing Instructions

1. **Before Major Release:** Run ALL test cases in order
2. **Mark Results:** ✅ Pass | ❌ Fail | ⏭️ Skip (if not applicable)
3. **Report Issues:** Note any failures with details
4. **Sign Off:** All critical tests must pass before release

---

## Test Environment Setup

- [ ] Fresh browser session (clear cache/cookies)
- [ ] Test with Recruiter role account
- [ ] Test with Account Manager role account
- [ ] Have at least 2 organizations set up for multi-org testing
- [ ] Have sample resume files ready (.pdf, .docx, .doc)

---

## 1️⃣ CANDIDATE MANAGEMENT - Upload & Duplicate Detection

### TC-001: Upload New Resume (PDF)
**Priority:** Critical
**Steps:**
1. Go to Talent Pool
2. Click "Upload" button
3. Select a .pdf resume file
4. Wait for upload to complete

**Expected Result:**
- ✅ Resume uploads successfully
- ✅ Candidate appears in Talent Pool immediately
- ✅ ATS score is displayed
- ✅ Success message shows "Import complete: 1 added to Talent Pool"

**Status:** [ ] Pass | [ ] Fail

---

### TC-002: Upload New Resume (DOCX)
**Priority:** Critical
**Steps:**
1. Go to Talent Pool
2. Click "Upload" button
3. Select a .docx resume file
4. Wait for upload to complete

**Expected Result:**
- ✅ Resume uploads successfully
- ✅ Candidate appears in Talent Pool immediately
- ✅ Success message shows "Import complete: 1 added to Talent Pool"

**Status:** [ ] Pass | [ ] Fail

---

### TC-003: Reject Legacy .DOC Files
**Priority:** High
**Steps:**
1. Go to Talent Pool
2. Click "Upload" button
3. Select a legacy .doc file (not .docx)
4. Attempt to upload

**Expected Result:**
- ✅ Upload fails with error message
- ✅ Error says: "Legacy .doc files are not supported. Please convert to .docx or PDF"
- ✅ Candidate is NOT created

**Status:** [ ] Pass | [ ] Fail

---

### TC-004: Duplicate Detection - Existing Resume
**Priority:** Critical
**Steps:**
1. Upload a resume (note the candidate name)
2. Upload the EXACT same resume file again
3. Check the upload result

**Expected Result:**
- ✅ Shows message: "Duplicate detected: existing profile re-linked to Talent Pool"
- ✅ Does NOT create a second candidate
- ✅ Original candidate remains in Talent Pool

**Status:** [ ] Pass | [ ] Fail

---

### TC-005: Bulk Upload Multiple Resumes
**Priority:** High
**Steps:**
1. Go to Talent Pool
2. Click "Upload" button
3. Select 5-10 different resume files at once
4. Wait for all to process

**Expected Result:**
- ✅ All resumes upload successfully
- ✅ Progress indicator shows upload status
- ✅ Success message shows correct count (e.g., "Import complete: 7 added to Talent Pool")
- ✅ All candidates appear in Talent Pool

**Status:** [ ] Pass | [ ] Fail

---

## 2️⃣ CANDIDATE MANAGEMENT - Delete & Unlink

### TC-006: Delete Candidate (Not Shared, Outreach Status)
**Priority:** Critical
**Steps:**
1. Find a candidate with status "New" or "Outreach"
2. Verify candidate is NOT shared with other orgs (no multi-org icon)
3. Click the delete/trash icon
4. Confirm deletion in dialog

**Expected Result:**
- ✅ Candidate is removed from Talent Pool immediately
- ✅ Success message: "Deleted 1 profile"
- ✅ Hard refresh - candidate does NOT reappear

**Status:** [ ] Pass | [ ] Fail

---

### TC-007: Prevent Delete - Advanced Pipeline Status
**Priority:** Critical
**Steps:**
1. Find/create a candidate with status beyond "Outreach" (e.g., "RTR & rate", "Screening")
2. Attempt to delete the candidate

**Expected Result:**
- ✅ Delete fails with error message
- ✅ Error says: "Cannot delete [Name]: In pipeline stage [status]"
- ✅ Candidate remains in Talent Pool

**Status:** [ ] Pass | [ ] Fail

---

### TC-008: Prevent Delete - Has Applications
**Priority:** Critical
**Steps:**
1. Create/find a candidate with an application to a job
2. Set candidate status to "Outreach" (to bypass status check)
3. Attempt to delete the candidate

**Expected Result:**
- ✅ Delete fails with error message
- ✅ Error says: "Cannot delete [Name]: Has applications (remove from jobs first)"
- ✅ Candidate remains in Talent Pool

**Status:** [ ] Pass | [ ] Fail

---

### TC-009: Unlink Candidate - Shared with Multiple Orgs
**Priority:** Critical
**Steps:**
1. Upload same resume in TWO different organizations (creates shared candidate)
2. In Organization A, verify candidate shows in Talent Pool
3. In Organization A, delete the candidate (status must be Outreach/New)
4. Check Organization A's Talent Pool
5. Switch to Organization B and check their Talent Pool

**Expected Result:**
- ✅ Organization A: Candidate is removed from Talent Pool
- ✅ Organization A: Success message: "Deleted 1 profile"
- ✅ Organization B: Candidate STILL appears in Talent Pool (not affected)
- ✅ Candidate profile still exists in database (just unlinked from Org A)

**Status:** [ ] Pass | [ ] Fail

---

### TC-010: Delete After Unlinking (Last Org)
**Priority:** High
**Steps:**
1. Create a shared candidate (in 2 orgs)
2. Delete from Org A (unlinks)
3. Delete from Org B (should fully delete)
4. Try to re-upload the same resume

**Expected Result:**
- ✅ Org A deletion: Unlinks (candidate stays for Org B)
- ✅ Org B deletion: Fully deletes candidate (not shared anymore)
- ✅ Re-upload: Creates NEW candidate (no duplicate message)

**Status:** [ ] Pass | [ ] Fail

---

## 3️⃣ JOB MANAGEMENT

### TC-011: Create New Job
**Priority:** High
**Steps:**
1. Go to Jobs page
2. Click "Create Job" or "Add Job"
3. Fill in required fields (title, description, location)
4. Save job

**Expected Result:**
- ✅ Job is created successfully
- ✅ Success message appears
- ✅ Job appears in jobs list
- ✅ Job can be viewed and edited

**Status:** [ ] Pass | [ ] Fail

---

### TC-012: Link Job to Client
**Priority:** High
**Steps:**
1. Go to Jobs page
2. Create/edit a job
3. Select a client from dropdown
4. Save job
5. View job details

**Expected Result:**
- ✅ Client is linked to job
- ✅ Client name displays on job card/detail
- ✅ Job appears in client's jobs list

**Status:** [ ] Pass | [ ] Fail

---

## 4️⃣ CANDIDATE PIPELINE & APPLICATIONS

### TC-013: Start Engagement (Add to Job)
**Priority:** Critical
**Steps:**
1. Go to Talent Pool
2. Find a candidate with status "New"
3. Click "Engage" or "Add to Job"
4. Select a job from dropdown
5. Confirm engagement

**Expected Result:**
- ✅ Candidate is added to job
- ✅ Candidate status changes from "New" to "Engaged"
- ✅ Application is created in Pipeline
- ✅ Success message appears

**Status:** [ ] Pass | [ ] Fail

---

### TC-014: Move Candidate Through Pipeline
**Priority:** High
**Steps:**
1. Find a candidate in Pipeline (Candidate Pipeline page)
2. Change status from "Outreach" → "RTR & rate"
3. Change status to "Document check"
4. Change status to "Screening"

**Expected Result:**
- ✅ Status updates successfully at each step
- ✅ UI reflects current status immediately
- ✅ Status persists after page refresh
- ✅ Candidate cannot be deleted while in advanced stages

**Status:** [ ] Pass | [ ] Fail

---

## 5️⃣ EMAIL FUNCTIONALITY

### TC-015: Send Candidate Submission Email
**Priority:** Critical
**Steps:**
1. Go to Candidate Pipeline
2. Find a candidate in "Submission" stage
3. Click "Submit" or email action
4. Enter recipient email
5. Write submission message
6. Send email

**Expected Result:**
- ✅ Email sends successfully
- ✅ Success message: "Email sent"
- ✅ Email received with candidate resume attached
- ✅ Resume attachment is correct format (.pdf or .docx)
- ✅ Email body contains submission message

**Status:** [ ] Pass | [ ] Fail

---

### TC-016: Send RTR (Right to Represent) Email
**Priority:** High
**Steps:**
1. Go to Candidate Pipeline
2. Find a candidate in "RTR & rate" stage
3. Click RTR action/button
4. Fill in RTR form fields
5. Send RTR email

**Expected Result:**
- ✅ RTR email sends successfully
- ✅ RTR document attached as DOCX
- ✅ RTR fields properly merged (recruiter info, position title)
- ✅ Candidate fields left blank for candidate to fill

**Status:** [ ] Pass | [ ] Fail

---

## 6️⃣ MULTI-ORGANIZATION SCENARIOS

### TC-017: Candidate Visible Only to Linked Orgs
**Priority:** High
**Steps:**
1. Upload resume in Organization A
2. Note candidate name
3. Switch to Organization B (different org)
4. Search for same candidate in Talent Pool

**Expected Result:**
- ✅ Organization A: Candidate appears in Talent Pool
- ✅ Organization B: Candidate does NOT appear (not linked)
- ✅ No cross-organization data leakage

**Status:** [ ] Pass | [ ] Fail

---

### TC-018: Shared Candidate - Independent Status
**Priority:** High
**Steps:**
1. Create shared candidate (upload same resume in Org A and Org B)
2. In Org A: Change candidate status to "RTR & rate"
3. In Org B: Check candidate status

**Expected Result:**
- ✅ Org A: Status shows "RTR & rate"
- ✅ Org B: Status shows "New" or original status (independent)
- ✅ Each org maintains separate pipeline status

**Status:** [ ] Pass | [ ] Fail

---

## 7️⃣ PERMISSIONS & ROLES

### TC-019: Recruiter Can Access Own Organization
**Priority:** Critical
**Steps:**
1. Log in as Recruiter role
2. Access Talent Pool
3. Access Jobs
4. Access Pipeline

**Expected Result:**
- ✅ Can view Talent Pool for own organization
- ✅ Can view and manage jobs
- ✅ Can manage candidate pipeline
- ✅ Can upload resumes

**Status:** [ ] Pass | [ ] Fail

---

### TC-020: Account Manager Can Delete Candidates
**Priority:** High
**Steps:**
1. Log in as Account Manager role
2. Go to Talent Pool
3. Select a candidate (status "Outreach", no applications)
4. Delete candidate

**Expected Result:**
- ✅ Account Manager can delete candidates
- ✅ Same safety checks apply (status, applications)
- ✅ Delete works successfully

**Status:** [ ] Pass | [ ] Fail

---

## 8️⃣ MANAGER DASHBOARD & REPORTING

### TC-021: Manager Dashboard Loads
**Priority:** High
**Steps:**
1. Log in as Account Manager or Manager role
2. Go to Manager Dashboard
3. View metrics and charts

**Expected Result:**
- ✅ Dashboard loads without errors
- ✅ Metrics show correct counts (jobs, candidates, applications)
- ✅ Charts render properly
- ✅ Data is accurate

**Status:** [ ] Pass | [ ] Fail

---

### TC-022: Team Activity Feed
**Priority:** Medium
**Steps:**
1. Go to Manager Dashboard
2. Navigate to Team Activity
3. View recent activities

**Expected Result:**
- ✅ Activity feed shows recent actions
- ✅ Shows recruiter names and actions
- ✅ Timestamps are accurate
- ✅ Can filter by date/recruiter

**Status:** [ ] Pass | [ ] Fail

---

## 9️⃣ SEARCH & FILTERING

### TC-023: Search Candidates in Talent Pool
**Priority:** High
**Steps:**
1. Go to Talent Pool
2. Enter candidate name in search box
3. Enter candidate skills/keywords
4. Apply filters (status, score, date)

**Expected Result:**
- ✅ Search returns matching candidates
- ✅ Filters apply correctly
- ✅ Results update in real-time
- ✅ Can clear search/filters

**Status:** [ ] Pass | [ ] Fail

---

## 🔟 DATA INTEGRITY & EDGE CASES

### TC-024: Resume Re-upload After Deletion
**Priority:** Critical
**Steps:**
1. Upload a resume (note candidate name)
2. Delete the candidate completely (not shared, no applications)
3. Immediately re-upload the SAME resume file

**Expected Result:**
- ✅ Creates NEW candidate (not treated as duplicate)
- ✅ New candidate appears in Talent Pool
- ✅ No "duplicate detected" error
- ✅ Fresh candidate with new ID

**Status:** [ ] Pass | [ ] Fail

---

### TC-025: Bulk Delete Multiple Candidates
**Priority:** High
**Steps:**
1. Go to Talent Pool
2. Select multiple candidates (checkboxes)
3. All selected candidates must have status "Outreach" or "New"
4. Click bulk delete action
5. Confirm deletion

**Expected Result:**
- ✅ All selected candidates are deleted
- ✅ Success message shows count: "Deleted X profiles"
- ✅ Candidates removed from Talent Pool
- ✅ If any candidate fails safety checks, shows specific error

**Status:** [ ] Pass | [ ] Fail

---

### TC-026: Handle Network Interruption During Upload
**Priority:** Medium
**Steps:**
1. Start uploading a large resume file
2. Disable network mid-upload (turn off WiFi)
3. Re-enable network after 10 seconds

**Expected Result:**
- ✅ Shows error message about upload failure
- ✅ Can retry upload
- ✅ No partial/corrupted candidate created
- ✅ Retry works successfully

**Status:** [ ] Pass | [ ] Fail

---

## 📋 TEST EXECUTION SUMMARY

**Test Date:** _______________
**Tester Name:** _______________
**Release Version:** _______________

### Results Summary
- **Total Tests:** 26
- **Passed:** _____
- **Failed:** _____
- **Skipped:** _____

### Critical Issues Found
_(List any critical bugs that must be fixed before release)_

1.
2.
3.

### Sign-Off
- [ ] All critical tests passed
- [ ] All high priority tests passed
- [ ] Known issues documented
- [ ] Ready for production release

**Signed:** _______________ **Date:** _______________

---

## 📝 Notes for Testers

1. **Run tests in order** - Some tests depend on earlier setup
2. **Use fresh data** - Don't reuse candidates from previous test runs
3. **Document failures** - Include screenshots and exact steps to reproduce
4. **Test on production-like environment** - Use staging with production data copy
5. **Multi-browser testing** - Test on Chrome, Safari, and Firefox
6. **Mobile testing** - At least test critical flows on mobile browsers

---

## 🔄 Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-22 | Initial regression suite | Claude |

