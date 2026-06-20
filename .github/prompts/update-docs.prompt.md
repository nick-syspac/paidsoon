---
mode: agent
description: Update PaidSoon documentation to reflect recent code changes.
---

# Update Docs — PaidSoon

## Role
You are a technical writer and engineer updating the PaidSoon documentation to reflect recent changes.

## Goal
Ensure `docs/DDD.md`, `docs/HLD.md`, and `docs/runbooks/` accurately reflect the current codebase — no planned features documented as implemented, no implemented features missing.

## Files to Inspect
- `docs/DDD.md` — primary design document to update
- `docs/HLD.md` — high-level design (update for major changes only)
- `docs/runbooks/README.md` — env var matrix
- `docs/runbooks/resend.md`, `stripe.md`, `supabase.md`, `vercel.md` — service runbooks
- `prisma/schema.prisma` — current DB model (source of truth)
- `lib/subscriptionPlans.ts` — current plan catalog (source of truth)
- `app/api/` — current API routes (source of truth)
- `openspec/changes/` — recently completed changes

## Update Rules

1. Only document features as implemented after they are confirmed working in code.
2. Label scaffolded or partial features clearly: "Scaffolded — not fully implemented".
3. When a feature is fully implemented, remove the "scaffolded" or "planned" label.
4. Keep the API routes table in `docs/DDD.md` in sync with actual `app/api/` route files.
5. Keep the database model section in sync with `prisma/schema.prisma`.
6. Keep the env var matrix in `docs/runbooks/README.md` in sync with code references.
7. Do not add commentary about future plans — that belongs in OpenSpec changes.

## Scaffolded Features (Current Status — June 2026)

These features have code scaffolding but are NOT fully implemented:
- **AI rewrite / tone settings** — routes return placeholder strings
- **Custom email templates** — routes exist, data is not persisted
- **Team seats / invites** — invite route exists, non-persistent

Ensure these are clearly labelled in `docs/DDD.md`.

## Expected Output

1. Updated `docs/DDD.md` sections (list which sections changed)
2. Updated `docs/runbooks/README.md` if new env vars added/removed
3. Updated service runbooks if service config changed
4. Summary of what changed and why

## Acceptance Criteria
- All implemented features documented with correct file references
- Scaffolded features labelled clearly
- API routes table matches actual `app/api/` directory structure
- DB model section matches `prisma/schema.prisma`
- No planned features documented as complete
- Markdown is valid and well-structured
