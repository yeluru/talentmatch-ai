# Release Notes - Query Builder & Client Management Enhancements

**Release Date:** February 12, 2026
**Version:** 2.1.0
**Risk Level:** MEDIUM

---

## 🎯 Overview

This release introduces major improvements to the Talent Search query builder with AI-powered job description parsing, enhanced client management with secondary contacts, and comprehensive help documentation updates.

---

## ✨ New Features

### 1. AI-Powered Query Builder (Talent Search)
- **Smart Job Description Parsing**: Automatically extracts and categorizes skills from job descriptions
  - Core Skills (required)
  - Secondary Skills (nice-to-have)
  - Methods & Tools
  - Certifications
- **Individual Skill Management**: Add/remove skills in each category with dedicated input fields
- **Query Builder Cache**: Parsed queries saved to database for instant reload
- **Skill Tag Interface**: Visual skill tags with toggle selection and remove buttons
- **Editable Query Output**: Direct query text editing with regenerate option

### 2. Secondary Contact Support (Client Management)
- Account managers can now add optional secondary contact information when creating/editing clients
- Fields include: Name, Email, Phone (all optional)
- Primary contact fields remain required

### 3. Enhanced Form Persistence
- **Auto-save to localStorage**: Client form data automatically saved as you type
- **Dialog persistence**: Add Client dialog stays open when switching browser tabs
- **Draft restoration**: Form data restored with notification when reopening dialog

### 4. Comprehensive Help Documentation
- Added 10+ new detailed sections covering:
  - Match score calculation breakdown
  - Query builder best practices
  - Search modes comparison (Web/Basic/Deep)
  - Bulk operations guide
  - Saved searches workflow
  - Pagination explained
  - Profile data captured
  - And more...

---

## 🔧 Improvements

### Talent Search
- **Broader Query Generation**: Queries now aim for 50-200 results instead of 0-10
- **Smart Phrase Filtering**: Removes overly generic phrases (principles, understanding of, etc.)
- **Certification Abbreviations**: Extracts "CISSP" instead of full certification names
- **No Term Limits**: All selected skills included in query (was limited to 15)
- **Better Pagination**: SerpAPI Deep mode continues until truly exhausted (up to 450 results)

### Client Management
- **Required Field Validation**: Industry, Website, and Primary Contact fields now mandatory
- **Compact Form Layout**: Reduced spacing and input heights for better UX
- **Visible Close Button**: Dialog optimized to keep X button visible
- **Persistent Dialogs**: Dialog doesn't close on outside click or Escape key
