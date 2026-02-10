# RTR Production Deployment Checklist

Use this checklist when deploying the RTR (Right to Represent) feature to production.

## Pre-Deployment

### 1. Code Review
- [ ] All RTR code committed and pushed to main branch
- [ ] No test files or backup files in the codebase
- [ ] Template file (`docx_template_b64.ts`) contains valid base64

### 2. Local Testing
- [ ] RTR form opens in candidate pipeline
- [ ] All 7 form fields validate correctly
- [ ] DOCX merge produces correct output (check /tmp/rtr-test-output.docx if testing)
- [ ] Email sends locally via Mailpit
- [ ] Placeholders are replaced correctly (position title, candidate name, etc.)
- [ ] Candidate address placeholder remains unfilled
- [ ] Merged text is bold in the output

## Supabase Backend Deployment

### 3. Deploy Edge Function
```bash
# From project root
cd /Users/raviyeluru/ultrahire/talentmatch-ai
npx supabase functions deploy send-rtr-email
```

- [ ] Function deployed successfully
- [ ] No deployment errors in output

### 4. Verify Edge Function Secrets

Check that these secrets are set in **Supabase Dashboard → Edge Functions → Secrets**:

**Required:**
- [ ] `RESEND_API_KEY` - Your Resend API key
- [ ] `RESEND_FROM` - Sender email (e.g., `noreply@yourdomain.com`)
- [ ] `SUPABASE_URL` - (auto-set by Supabase)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - (auto-set by Supabase)

**Optional but recommended:**
- [ ] `SMTP_HOST` - SMTP server (e.g., `smtp.resend.com`)
- [ ] `SMTP_PORT` - SMTP port (e.g., `465` or `587`)
- [ ] `SMTP_USER` - SMTP username (often `resend`)
- [ ] `SMTP_PASS` - SMTP password (your Resend API key)
- [ ] `SMTP_TLS` - Set to `true` for TLS
- [ ] `SMTP_FROM` - From address for SMTP emails

```bash
# Verify secrets (won't show values, just names)
npx supabase secrets list
```

### 5. Test Edge Function

```bash
# Test the function directly (optional)
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-rtr-email \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "toEmail": "test@example.com",
    "subject": "Test RTR",
    "body": "Test email body",
    "rate": "$100/hour",
    "rtrFields": {
      "sign_date": "10th day of February 2026",
      "candidate_name": "Test Candidate",
      "subcontractor": "Test Subcontractor",
      "client": "Test Client",
      "client_partner": "Test Partner",
      "client_location": "New York, NY",
      "rate": "$100 per hour",
      "position_title": "Software Engineer"
    }
  }'
```

- [ ] Function returns 200 OK
- [ ] Email received at test address
- [ ] DOCX attachment present and properly formatted

## Render Frontend Deployment

### 6. Frontend Environment Variables

Verify these are set in **Render Dashboard → Your Static Site → Environment**:

- [ ] `VITE_SUPABASE_URL` - Your Supabase project URL
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` - Supabase anon key
- [ ] `VITE_SUPABASE_PROJECT_ID` - (optional) Project ref

### 7. Deploy Frontend

**Option A: Auto-deploy (if enabled)**
```bash
# Just push to main
git push origin main
```

**Option B: Manual deploy**
- [ ] Go to Render Dashboard → Your Static Site
- [ ] Click "Manual Deploy" → "Deploy latest commit"
- [ ] Wait for build to complete

### 8. Verify Frontend Build
- [ ] Build completes successfully
- [ ] No TypeScript errors
- [ ] No missing dependencies
- [ ] Site is live at production URL

## Post-Deployment Testing

### 9. End-to-End RTR Flow

**As a Recruiter:**
- [ ] Log in to production app
- [ ] Navigate to Candidate Pipeline
- [ ] Select a candidate
- [ ] Move candidate to "RTR" stage
- [ ] RTR form modal opens
- [ ] Fill in all 7 fields:
  - [ ] Sign date
  - [ ] Candidate name
  - [ ] Subcontractor
  - [ ] Client
  - [ ] Client partner (optional)
  - [ ] Client location
  - [ ] Rate
  - [ ] Position title
- [ ] Submit form
- [ ] Success message appears
- [ ] No console errors

**As the Candidate (receiving email):**
- [ ] Check candidate's email inbox
- [ ] RTR email received
- [ ] Subject line correct
- [ ] Email body renders properly
- [ ] DOCX attachment present
- [ ] Open DOCX attachment
- [ ] Recruiter fields are filled and bold
- [ ] Position title in brackets is correct (e.g., `[Software Engineer]`)
- [ ] Candidate name in brackets (e.g., `[Jane Doe]`)
- [ ] Client and partner combined correctly (e.g., "IBM's partner client, APOLLO GLOBAL")
- [ ] Candidate address placeholder is BLANK (for candidate to fill)
- [ ] Other candidate fields (signature, SSN, date) are BLANK

### 10. Error Handling

Test error scenarios:
- [ ] Submit RTR form with missing required fields → validation error
- [ ] Submit with invalid email → error message
- [ ] Network failure during submit → graceful error handling
- [ ] Edge function returns error → user sees meaningful message

## Monitoring

### 11. Check Logs

**Supabase Edge Function Logs:**
- [ ] No errors in `send-rtr-email` function logs
- [ ] Check for any SMTP connection issues
- [ ] Verify DOCX merge completes without errors

**Frontend Console:**
- [ ] No JavaScript errors in browser console
- [ ] No network errors (check Network tab)

### 12. Email Deliverability

**Resend Dashboard:**
- [ ] Check that RTR emails are being sent
- [ ] Verify no bounce or delivery failures
- [ ] Check email reputation score

**DNS Records:**
- [ ] SPF record configured for your domain
- [ ] DKIM records added (from Resend)
- [ ] DMARC policy set (optional but recommended)

## Rollback Plan

If issues occur after deployment:

### Frontend Rollback
```bash
# Render Dashboard → Deploys → Select previous successful deploy → "Rollback to this version"
```

### Backend Rollback
```bash
# Redeploy previous version of send-rtr-email function
git checkout <previous-commit>
npx supabase functions deploy send-rtr-email
git checkout main
```

## Documentation

- [ ] Update internal team documentation
- [ ] Train recruiters on RTR feature
- [ ] Document any production-specific settings
- [ ] Update runbook with RTR troubleshooting steps

## Support Preparation

- [ ] Add RTR to support knowledge base
- [ ] Create FAQ for common RTR questions
- [ ] Document escalation path for RTR issues
- [ ] Set up monitoring alerts for RTR function failures

---

## Quick Reference

**Frontend:**
- Deploy method: Git push to main → Render auto-deploys
- Build command: `npm run build`
- Publish directory: `dist`
- Production URL: https://ultra-hire.com (or your domain)

**Backend:**
- Deploy command: `npx supabase functions deploy send-rtr-email`
- Function URL: `https://<project-ref>.supabase.co/functions/v1/send-rtr-email`
- Logs: Supabase Dashboard → Edge Functions → send-rtr-email → Logs

**Template:**
- Bundled file: `supabase/functions/send-rtr-email/docx_template_b64.ts`
- Source template: `docs/CompSciPrep_RTR_Template.docx`
- To update: Re-encode template to base64 and update `docx_template_b64.ts`

---

## Completion

Once all checkboxes are complete:
- [ ] RTR feature is live in production
- [ ] All tests passed
- [ ] Monitoring configured
- [ ] Team trained
- [ ] Documentation updated

**Deployed by:** _________________
**Date:** _________________
**Production URL:** _________________
**Edge Function Version:** _________________
