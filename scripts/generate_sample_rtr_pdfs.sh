#!/bin/bash
# Generate sample filled RTR PDFs for DocuSeal template creation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/docs/RTR Templates/samples"

mkdir -p "$OUTPUT_DIR"

echo "🔄 Generating sample filled RTR PDFs..."
echo "📁 Output directory: $OUTPUT_DIR"

# Sample data for Employer template
EMPLOYER_DATA='{
  "toEmail": "candidate@example.com",
  "subject": "RTR Document - Please Sign",
  "body": "Please review and sign the attached RTR document.",
  "rate": "$95 per hour",
  "rtrFields": {
    "sign_date": "6th day of February 2026",
    "vendor_name": "TechStaff Solutions LLC",
    "subcontractor": "IBM-VRN",
    "client": "IBM",
    "client_partner": "Apollo Global Management",
    "client_location": "New York City, NY",
    "rate": "$95 per hour",
    "duration": "W2, 6 months",
    "candidate_name": "John Doe",
    "position_title": "Senior Software Engineer"
  },
  "templateName": "Employer",
  "generateSampleOnly": true
}'

# Sample data for Generic template
GENERIC_DATA='{
  "toEmail": "candidate@example.com",
  "subject": "RTR Document - Please Sign",
  "body": "Please review and sign the attached RTR document.",
  "rate": "$90 per hour",
  "rtrFields": {
    "sign_date": "6th day of February 2026",
    "candidate_name": "Jane Smith",
    "subcontractor": "IBM-VRN",
    "client": "IBM",
    "client_partner": "Apollo Global Management",
    "client_location": "Bryant Park, NYC",
    "rate": "$90 per hour",
    "duration": "Corp-to-Corp",
    "position_title": "Cloud Infrastructure Architect"
  },
  "templateName": "Generic",
  "generateSampleOnly": true
}'

# Sample data for IBM template
IBM_DATA='{
  "toEmail": "candidate@example.com",
  "subject": "RTR Document - Please Sign",
  "body": "Please review and sign the attached RTR document.",
  "rate": "$95 per hour",
  "rtrFields": {
    "sign_date": "6th day of February 2026",
    "candidate_name": "Robert Johnson",
    "rate": "$95 per hour",
    "duration": "W2",
    "position_title": "Middle Office Credit Technology Analyst"
  },
  "templateName": "IBM",
  "generateSampleOnly": true
}'

echo ""
echo "⚠️  NOTE: This script requires the edge function to be modified temporarily"
echo "    to support sample PDF generation without sending emails."
echo ""
echo "Instead, let's use LibreOffice directly to convert the DOCX files to PDF."
echo ""

# Check if LibreOffice is installed
if ! command -v soffice &> /dev/null && ! command -v libreoffice &> /dev/null; then
    echo "❌ LibreOffice is not installed."
    echo ""
    echo "Please install it first:"
    echo "  macOS:   brew install --cask libreoffice"
    echo "  Linux:   sudo apt-get install libreoffice"
    echo ""
    echo "Alternatively, you can:"
    echo "  1. Open each DOCX file in Word/Google Docs"
    echo "  2. Fill with sample data (any values)"
    echo "  3. Export as PDF"
    echo "  4. Upload to DocuSeal"
    echo ""
    exit 1
fi

# Find LibreOffice command
if command -v soffice &> /dev/null; then
    LIBREOFFICE_CMD="soffice"
elif command -v libreoffice &> /dev/null; then
    LIBREOFFICE_CMD="libreoffice"
fi

# Convert each DOCX to PDF (without filling - just direct conversion)
echo "📄 Converting DOCX templates to PDF..."
echo ""

for template in "Employer_CompSciPrep_RTR_Styled" "Generic_CompSciPrep_RTR_Styled" "IBM_CompSciPrep_RTR_Styled"; do
    INPUT="$PROJECT_ROOT/docs/RTR Templates/${template}.docx"
    OUTPUT="$OUTPUT_DIR/${template}_sample.pdf"

    if [ ! -f "$INPUT" ]; then
        echo "⚠️  Template not found: $INPUT"
        continue
    fi

    echo "Converting: $template.docx → ${template}_sample.pdf"

    # Convert DOCX to PDF using LibreOffice
    $LIBREOFFICE_CMD --headless --convert-to pdf --outdir "$OUTPUT_DIR" "$INPUT" > /dev/null 2>&1

    # Rename to include "_sample" suffix
    if [ -f "$OUTPUT_DIR/${template}.pdf" ]; then
        mv "$OUTPUT_DIR/${template}.pdf" "$OUTPUT"
        echo "✅ Created: $OUTPUT"
    else
        echo "❌ Failed to convert $template"
    fi
done

echo ""
echo "✅ Done! Sample PDFs created in:"
echo "   $OUTPUT_DIR"
echo ""
echo "📋 Next Steps:"
echo "   1. Open each PDF and fill with sample data (or use as-is with placeholders)"
echo "   2. Upload to DocuSeal UI"
echo "   3. Drag signature/text fields for candidate-fillable fields"
echo "   4. Save each template and copy the template IDs"
echo ""
