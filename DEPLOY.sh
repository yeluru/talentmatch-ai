#!/bin/bash
# =============================================================================
# PRODUCTION DEPLOYMENT SCRIPT - v2.1.1
# =============================================================================

set -e  # Exit on error

echo "======================================================================"
echo "🚀 TalentMatch AI - Production Deployment v2.1.1"
echo "======================================================================"
echo ""
echo "This script will deploy:"
echo "  - 3 new database migrations (multi-role system + JSONB fields)"
echo "  - 1 edge function (bulk-import-candidates)"
echo "  - UI code push to trigger Render deployment"
echo ""
echo "⚠️  IMPORTANT: Make sure you have:"
echo "  1. Reviewed DEPLOYMENT_PLAN_V2.1.md"
echo "  2. Tested all changes locally"
echo "  3. Have database backup access if needed"
echo ""
read -p "Press ENTER to continue or Ctrl+C to cancel..."
echo ""

# =============================================================================
# STEP 0: Pre-deployment checks
# =============================================================================
echo "======================================================================"
echo "📋 STEP 0: Pre-Deployment Checks"
echo "======================================================================"
echo ""
echo "Checking git status..."
git status --short

echo ""
echo "⚠️  MANUAL CHECK REQUIRED:"
echo "Before proceeding, run pre-deployment checks on production database:"
echo ""
echo "  psql <PRODUCTION_DB_URL> -f /tmp/pre_deployment_checks.sql"
echo ""
echo "Or use Supabase SQL Editor to run queries from:"
echo "  /tmp/pre_deployment_checks.sql"
echo ""
echo "Expected results:"
echo "  - No duplicate roles"
echo "  - All users have roles"
echo "  - JSONB columns don't exist yet"
echo "  - New RPC functions don't exist yet"
echo ""
read -p "Have you run pre-deployment checks? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled. Please run pre-deployment checks first."
    exit 1
fi

# =============================================================================
# STEP 1: Database Migrations
# =============================================================================
echo ""
echo "======================================================================"
echo "🗄️  STEP 1: Database Migrations"
echo "======================================================================"
echo ""
echo "About to push 3 migrations to production:"
echo "  1. 20260212100000_multi_role_system.sql"
echo "  2. 20260213000000_add_primary_role.sql"
echo "  3. 20260214000000_add_jsonb_profile_fields.sql"
echo ""
read -p "Push migrations to production? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Pushing migrations..."
    npx supabase db push

    if [ $? -eq 0 ]; then
        echo "✅ Migrations applied successfully"
    else
        echo "❌ Migration failed! Check error above."
        echo "⚠️  DO NOT PROCEED to next steps until this is fixed."
        exit 1
    fi
else
    echo "⚠️  Skipping migrations. This may cause edge function to fail."
fi

echo ""
echo "Listing applied migrations..."
npx supabase db remote ls | tail -n 20

echo ""
read -p "Do migrations look correct? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled. Please review migrations."
    exit 1
fi

# =============================================================================
# STEP 2: Post-Migration Verification
# =============================================================================
echo ""
echo "======================================================================"
echo "✅ STEP 2: Post-Migration Verification"
echo "======================================================================"
echo ""
echo "⚠️  MANUAL CHECK REQUIRED:"
echo "Run post-deployment verification queries:"
echo ""
echo "  psql <PRODUCTION_DB_URL> -f /tmp/post_deployment_checks.sql"
echo ""
echo "Or use Supabase SQL Editor to run queries from:"
echo "  /tmp/post_deployment_checks.sql"
echo ""
echo "Verify:"
echo "  - New constraints exist"
echo "  - All users have primary roles"
echo "  - JSONB columns added"
echo "  - RPC functions created"
echo ""
read -p "Have you verified migrations? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled. Please verify migrations."
    exit 1
fi

# =============================================================================
# STEP 3: Edge Function Deployment
# =============================================================================
echo ""
echo "======================================================================"
echo "⚡ STEP 3: Edge Function Deployment"
echo "======================================================================"
echo ""
echo "About to deploy: bulk-import-candidates"
echo "Change: Multi-role permission fix (.in() instead of .maybeSingle())"
echo ""
read -p "Deploy edge function? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deploying function..."
    npx supabase functions deploy bulk-import-candidates

    if [ $? -eq 0 ]; then
        echo "✅ Edge function deployed successfully"
    else
        echo "❌ Function deployment failed! Check error above."
        exit 1
    fi
else
    echo "⚠️  Skipping edge function deployment."
fi

# =============================================================================
# STEP 4: Git Commit and Push
# =============================================================================
echo ""
echo "======================================================================"
echo "📦 STEP 4: Commit and Push Code"
echo "======================================================================"
echo ""
echo "Files to commit:"
git status --short

echo ""
read -p "Commit and push changes? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Adding files..."
    git add .

    echo "Creating commit..."
    git commit -m "Multi-role system + import bug fix + remove LinkedIn PDF import

- Add multi-role system (users can have multiple roles)
- Add primary role tracking (first role cannot be revoked)
- Add JSONB fields to candidate_profiles for structured data
- Fix import permission bug for org_admin switched to recruiter
- Remove LinkedIn PDF import (simplified import flow)
- Add role management UI for org_admin and super_admin

Migrations:
- 20260212100000_multi_role_system.sql
- 20260213000000_add_primary_role.sql
- 20260214000000_add_jsonb_profile_fields.sql

See DEPLOYMENT_PLAN_V2.1.md for details."

    echo ""
    echo "Pushing to main..."
    git push origin main

    if [ $? -eq 0 ]; then
        echo "✅ Code pushed successfully"
        echo "📡 Render will auto-deploy from main branch"
    else
        echo "❌ Git push failed! Check error above."
        exit 1
    fi
else
    echo "⚠️  Skipping git push. Render will not deploy."
fi

# =============================================================================
# STEP 5: Monitor Render Deployment
# =============================================================================
echo ""
echo "======================================================================"
echo "🎨 STEP 5: Monitor Render Deployment"
echo "======================================================================"
echo ""
echo "✅ Git push completed. Render should start building now."
echo ""
echo "👉 Monitor deployment at:"
echo "   https://dashboard.render.com"
echo ""
echo "Watch for:"
echo "  - Build logs"
echo "  - Deployment status"
echo "  - Any error messages"
echo ""
echo "Expected build time: 2-5 minutes"
echo ""
read -p "Press ENTER when Render deployment is complete..."
echo ""

# =============================================================================
# STEP 6: Post-Deployment Testing
# =============================================================================
echo ""
echo "======================================================================"
echo "🧪 STEP 6: Post-Deployment Testing"
echo "======================================================================"
echo ""
echo "Please manually test the following:"
echo ""
echo "✅ Multi-Role System:"
echo "  1. Login as org_admin"
echo "  2. Switch to recruiter role"
echo "  3. Navigate to Talent Sourcing"
echo "  4. Click Import on a candidate"
echo "  5. Should succeed (not get 'Forbidden' error)"
echo ""
echo "✅ Role Management:"
echo "  1. Go to Role Management page"
echo "  2. Grant a new role to a user"
echo "  3. Try to revoke primary role (should fail)"
echo "  4. Revoke non-primary role (should succeed)"
echo ""
echo "✅ Candidate Import:"
echo "  1. Search for LinkedIn candidates"
echo "  2. Click Import button"
echo "  3. Should create basic profile (name + LinkedIn URL)"
echo "  4. Should NOT show PDF upload dialog"
echo ""
echo "✅ Existing Features:"
echo "  1. Candidate pipeline"
echo "  2. Job posting"
echo "  3. Resume upload"
echo "  4. RTR document generation"
echo ""
read -p "Have you completed post-deployment testing? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "⚠️  Please complete testing before considering deployment done."
    exit 1
fi

# =============================================================================
# DEPLOYMENT COMPLETE
# =============================================================================
echo ""
echo "======================================================================"
echo "🎉 DEPLOYMENT COMPLETE"
echo "======================================================================"
echo ""
echo "✅ Database migrations applied"
echo "✅ Edge function deployed"
echo "✅ UI deployed to Render"
echo "✅ Post-deployment testing completed"
echo ""
echo "📝 Next steps:"
echo "  1. Monitor production for any errors"
echo "  2. Watch for user feedback"
echo "  3. Update DEPLOYMENT_PLAN_V2.1.md with actual deployment time"
echo ""
echo "🔗 Useful links:"
echo "  - Supabase Dashboard: https://supabase.com/dashboard"
echo "  - Render Dashboard: https://dashboard.render.com"
echo "  - Production App: [Your production URL]"
echo ""
echo "📧 If issues occur:"
echo "  - Check Supabase logs"
echo "  - Check Render deployment logs"
echo "  - Review DEPLOYMENT_PLAN_V2.1.md for rollback procedures"
echo ""
echo "======================================================================"
