#!/usr/bin/env python3
"""
One-time setup script to create a reusable DocuSeal template for RTR documents
Run: python3 scripts/setup-docuseal-template.py
"""

import os
import sys
import base64
import json
import requests
from pathlib import Path

def create_rtr_template():
    # Read API key from environment or .env file
    api_key = os.environ.get("DOCUSEAL_API_KEY")

    if not api_key:
        # Try reading from supabase/functions/.env
        env_file = Path("supabase/functions/.env")
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    if line.startswith("DOCUSEAL_API_KEY="):
                        api_key = line.split("=", 1)[1].strip()
                        break

    if not api_key:
        print("❌ DOCUSEAL_API_KEY not found")
        print("Make sure it's set in supabase/functions/.env")
        sys.exit(1)

    base_url = "https://api.docuseal.com"

    print("🔧 Creating DocuSeal RTR template...")
    print()

    # Create a simple HTML-based template
    # DocuSeal will render this as a PDF and allow field placement
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { text-align: center; }
            .section { margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>Right to Represent Agreement</h1>

        <div class="section">
            <p><strong>This document will be replaced with your actual RTR template.</strong></p>
            <p>After creating this template, you'll need to:</p>
            <ol>
                <li>Go to DocuSeal dashboard</li>
                <li>Find this template</li>
                <li>Upload your actual RTR PDF document</li>
                <li>Add signature and form fields</li>
            </ol>
        </div>

        <div class="section">
            <p>Candidate Signature: _____________________</p>
            <p>Date: _____________________</p>
        </div>
    </body>
    </html>
    """

    payload = {
        "name": "RTR Document Template (CompSciPrep)",
        "html": html_content
    }

    response = requests.post(
        f"{base_url}/templates/html",
        headers={
            "X-Auth-Token": api_key,
            "Content-Type": "application/json"
        },
        json=payload
    )

    if not response.ok:
        print(f"❌ Failed to create template ({response.status_code}):")
        print(response.text)
        sys.exit(1)

    template = response.json()
    template_id = str(template.get("id") or template.get("slug"))

    print()
    print("✅ Template created successfully!")
    print()
    print(f"📋 Template ID: {template_id}")
    print()
    print("🔗 Next steps:")
    print(f"   1. Go to: https://www.docuseal.com/templates/{template_id}")
    print(f"   2. Replace the HTML with your actual RTR PDF (upload document)")
    print(f"   3. Add signature and form fields using the visual editor")
    print(f"   4. Set role as 'Candidate' for all fields")
    print()
    print("⚙️  Add this to your supabase/functions/.env file:")
    print()
    print(f"DOCUSEAL_RTR_TEMPLATE_ID={template_id}")
    print()
    print("Then restart your edge functions server")
    print()

if __name__ == "__main__":
    try:
        create_rtr_template()
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
