---
mode: agent
description: Prepare PaidSoon for a release — final checks and release notes.
---

# Prepare Release — PaidSoon

## Role
You are a senior engineer preparing a PaidSoon release.

## Goal
Verify the codebase is in a releasable state, generate release notes from recent changes, and confirm all deployment prerequisites are met.

## PaidSoon Context
Hosted on Vercel. Deployed via git push. Build command: `prisma generate && next build`. No formal CI pipeline currently.

## Files to Inspect
- `package.json` — version number
- `vercel.json` — cron and build config
- `prisma/schema.prisma` — schema version
- `prisma/migrations/` — pending migrations
- `docs/DDD.md` — documented features
- `docs/runbooks/README.md` — env var matrix
- `openspec/changes/` — recently completed changes

## Pre-Release Checklist

### Code Quality
- [ ] `npm run build` passes (includes `prisma generate`)
- [ ] `npm run test` passes
- [ ] `npm run lint` passes
- [ ] No TypeScript errors

### Database
- [ ] All migrations ready: `npx prisma migrate status`
- [ ] RLS policies up to date: `prisma/rls-policies.sql`
- [ ] `npm run verify-rls` passes (if DB changed)

### Documentation
- [ ] `docs/DDD.md` reflects all implemented features
- [ ] No planned features documented as implemented
- [ ] All new env vars in `docs/runbooks/README.md`
- [ ] Scaffolded features clearly labelled

### Security
- [ ] No hardcoded secrets introduced
- [ ] All webhook endpoints retain signature verification
- [ ] RLS not weakened

### OpenSpec
- [ ] All completed changes in `openspec/changes/` are implemented
- [ ] Planned changes clearly marked as not yet implemented

## Release Notes Generation

Review:
- Recent commits
- `openspec/changes/` completed items
- `docs/DDD.md` changes

Format release notes as:

```markdown
## Release vX.Y.Z — <date>

### New Features
- <feature> — implemented in <file>

### Improvements
- <improvement>

### Bug Fixes
- <fix>

### Infrastructure
- <infra change>

### Breaking Changes
- <if any>
```

## Expected Output
1. Pre-release checklist results (pass/fail per item)
2. Formatted release notes
3. List of any blockers to resolve before release

## Acceptance Criteria
- All checklist items pass
- Release notes cover all meaningful changes since last release
- No scaffolded features documented as implemented
