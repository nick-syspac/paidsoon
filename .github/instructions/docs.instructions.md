---
applyTo: "**/docs/**,**/*.md"
---

# Documentation Instructions — PaidSoon

## Source-of-Truth Hierarchy

1. `prisma/schema.prisma` — canonical data model
2. `prisma/rls-policies.sql` — canonical RLS rules
3. `lib/subscriptionPlans.ts` — canonical plan catalog
4. `docs/DDD.md` and `docs/HLD.md` — architecture narrative
5. `docs/runbooks/README.md` — canonical env var matrix

When documentation conflicts with the codebase, the codebase wins. Update the docs.

## How to Update Docs

- Keep `docs/DDD.md` in sync with actual implementation — not aspirational features.
- Keep `docs/HLD.md` for high-level context and architecture rationale.
- Only document features as implemented after they are merged and working.
- Label scaffolded or planned features clearly: "Scaffolded — not fully implemented" or "Planned".

## How to Document New Features

1. Update `docs/DDD.md`:
   - Add a section or subsection describing the feature.
   - Document any new DB models or fields.
   - Document any new API routes.
   - Update the API route table.
2. If the feature introduces new API routes, add them to the route table in `docs/DDD.md`.
3. If the feature introduces UI pages, document the URL and access requirements.
4. Do not document planned features as implemented.

## How to Document New Environment Variables

1. Add the variable to `docs/runbooks/README.md` in the env matrix table.
2. Include: variable name, scope (public/server), purpose, and per-environment value guidance.
3. Do not include actual secret values in documentation.
4. Add to the relevant service runbook if applicable (`docs/runbooks/resend.md`, `docs/runbooks/stripe.md`, etc.).

## How to Document Supabase Changes

1. Schema changes → update `docs/DDD.md` (database model section).
2. RLS changes → update `prisma/rls-policies.sql` (canonical) and note in `docs/DDD.md`.
3. New tables → document purpose, fields, and access control in `docs/DDD.md`.
4. Migration history → let `prisma/migrations/` speak for itself; no duplication needed.

## How to Document Vercel/Deployment Changes

1. New env vars → `docs/runbooks/README.md`.
2. Cron schedule changes → update `docs/DDD.md` and `vercel.json`.
3. New Vercel configuration → add to `docs/runbooks/vercel.md`.
4. Build command changes → document in `docs/runbooks/README.md`.

## Architecture Decision Records

- Record significant architecture decisions in `docs/` with an `ADR-NNN-` prefix or inline in `docs/DDD.md`.
- Include: context, decision, consequences, alternatives considered.
- Date the decision.
- Example: `docs/ADR-001-prisma-rls-approach.md`

## Runbooks

- `docs/runbooks/README.md` — env matrix, setup order, quick reference
- `docs/runbooks/resend.md` — Resend setup and domain verification
- `docs/runbooks/supabase.md` — Supabase project setup, auth, migrations
- `docs/runbooks/stripe.md` — Stripe billing + Connect setup
- `docs/runbooks/vercel.md` — Vercel deployment setup

Update the relevant runbook when the corresponding service configuration changes.

## Writing Standards

- Use plain Markdown. No custom HTML unless necessary.
- Use tables for structured data (API routes, env vars, plan features).
- Use code blocks with language identifiers (` ```ts `, ` ```sql `).
- Section headings should be descriptive, not generic.
- Keep sentences concise. One idea per sentence.
- Do not document internal implementation details that belong in code comments.
