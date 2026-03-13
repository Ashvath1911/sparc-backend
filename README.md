`sparc-backend` — README.md (copy-paste)


# SPARC Backend

Backend services for SPARC (Shared Preference AI for Recommendation & Care) — a clinical AI workflow that generates structured recommendation drafts and stores them for clinician review.

This repo is intended to be a clean backend foundation for:
- API endpoints for recommendation generation
- Request/response logging for auditability
- Database storage of outputs and clinician feedback
- (Planned) retrieval of guideline/source snippets with provenance

## Current status
Early-stage backend scaffold. The goal is a minimal, reliable API that can support iterative front-end prototypes (e.g., Patient Compass) and research workflows (trust-in-AI evaluation).

## Core capabilities (in progress)
- API skeleton and routing
- Structured output schema (recommendation / rationale / confidence / sources)
- Logging and storage hooks

## Tech stack
- Node.js / Express (or Next.js API routes — update if needed)
- JavaScript (update to TypeScript if applicable)
- Database: Postgres/Supabase (planned or in progress)

## Run locally
```bash
npm install
npm run dev
