#!/bin/bash
# Upload RTR template DOCX files to Production Supabase Storage

set -e

echo "🚀 Uploading RTR templates to Production Storage..."
echo ""

# Configuration
PROJECT_REF="szmuvnnawnfclcusfxbs"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
BUCKET_NAME="rtr-templates"

# Check for service role key
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable not set"
  echo ""
  echo "Please set it first:"
  echo "  export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'"
  echo ""
  echo "Get your service role key from:"
  echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
  exit 1
fi

echo "✅ Service role key found"
echo ""

# Create bucket if it doesn't exist
echo "📦 Creating storage bucket '${BUCKET_NAME}'..."
curl -X POST "${SUPABASE_URL}/storage/v1/bucket" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"${BUCKET_NAME}\",\"name\":\"${BUCKET_NAME}\",\"public\":true}" \
  2>/dev/null || echo "   (Bucket may already exist)"
echo ""

# Upload each template file
TEMPLATE_DIR="docs/RTR Templates"

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "❌ Error: Template directory not found: $TEMPLATE_DIR"
  exit 1
fi

FILES=(
  "Employer_CompSciPrep_RTR_Styled.docx"
  "Generic_CompSciPrep_RTR_Styled.docx"
  "IBM_CompSciPrep_RTR_Styled.docx"
)

for file in "${FILES[@]}"; do
  filepath="${TEMPLATE_DIR}/${file}"

  if [ ! -f "$filepath" ]; then
    echo "⚠️  Warning: File not found: $filepath"
    continue
  fi

  echo "📤 Uploading ${file}..."

  curl -X POST "${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${file}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document" \
    --data-binary "@${filepath}" \
    -w "\n   Status: %{http_code}\n"

  echo ""
done

echo "✅ Upload complete!"
echo ""
echo "📋 Next step: Run database migration to update URLs"
echo "   supabase db push"
