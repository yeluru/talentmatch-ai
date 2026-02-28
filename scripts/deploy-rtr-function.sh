#!/bin/bash
# Deploy send-rtr-email function with all RTR template files

set -e

echo "Deploying send-rtr-email edge function..."

# Ensure templates are copied to function directory
echo "Copying RTR templates..."
cp -f "docs/RTR Templates/"*.docx supabase/functions/send-rtr-email/

# Deploy to Supabase
echo "Deploying to Supabase..."
supabase functions deploy send-rtr-email

echo "✅ Deployment complete!"
echo ""
echo "The following templates are bundled:"
ls -1 supabase/functions/send-rtr-email/*.docx | xargs -n 1 basename
