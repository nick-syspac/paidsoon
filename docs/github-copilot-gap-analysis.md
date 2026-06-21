# GitHub Copilot Gap Analysis — PaidSoon

Assessment date: June 2026

Priority ratings: P0 = critical blocker | P1 = high priority | P2 = medium priority | P3 = low priority

---

## Existing Copilot Config Found

Before this build, the following files existed in `.github/`:

```
.github/prompts/opsx-apply.prompt.md
.github/prompts/opsx-archive.prompt.md
.github/prompts/opsx-explore.prompt.md
.github/prompts/opsx-propose.prompt.md
.github/skills/openspec-apply-change/SKILL.md
.github/skills/openspec-archive-change/SKILL.md
.github/skills/openspec-explore/SKILL.md
.github/skills/openspec-propose/SKILL.md
```

These are OpenSpec workflow prompts and skills — they are preserved and untouched. No `copilot-instructions.md` existed before this build.

---

## Gaps Addressed by This Build

### Instructions
| File | Status |
|---|---|
| `.github/copilot-instructions.md` | ✅ Created |
| `.github/instructions/frontend.instructions.md` | ✅ Created |
| `.github/instructions/backend-api.instructions.md` | ✅ Created |
| `.github/instructions/supabase.instructions.md` | ✅ Created |
| `.github/instructions/vercel.instructions.md` | ✅ Created |
| `.github/instructions/testing.instructions.md` | ✅ Created |
| `.github/instructions/security.instructions.md` | ✅ Created |
| `.github/instructions/email-automation.instructions.md` | ✅ Created |
| `.github/instructions/billing.instructions.md` | ✅ Created |
| `.github/instructions/docs.instructions.md` | ✅ Created |

### Prompts (New — PaidSoon-Specific)
| File | Status |
|---|---|
| `audit-codebase.prompt.md` | ✅ Created |
| `audit-supabase-rls.prompt.md` | ✅ Created |
| `audit-vercel-deployment.prompt.md` | ✅ Created |
| `build-feature.prompt.md` | ✅ Created |
| `build-invoice-import.prompt.md` | ✅ Created |
| `build-invoice-reminder-flow.prompt.md` | ✅ Created |
| `build-promise-to-pay-flow.prompt.md` | ✅ Created |
| `build-dispute-pause-flow.prompt.md` | ✅ Created |
| `build-weekly-debtor-summary.prompt.md` | ✅ Created |
| `build-myob-integration.prompt.md` | ✅ Created |
| `build-csv-import.prompt.md` | ✅ Created |
| `add-api-route.prompt.md` | ✅ Created |
| `add-supabase-table.prompt.md` | ✅ Created |
| `add-rls-policy.prompt.md` | ✅ Created |
| `add-nextjs-page.prompt.md` | ✅ Created |
| `add-dashboard-widget.prompt.md` | ✅ Created |
| `add-email-template.prompt.md` | ✅ Created |
| `add-stripe-billing.prompt.md` | ✅ Created |
| `add-tests.prompt.md` | ✅ Created |
| `fix-frontend-issue.prompt.md` | ✅ Created |
| `fix-api-issue.prompt.md` | ✅ Created |
| `fix-supabase-issue.prompt.md` | ✅ Created |
| `security-review.prompt.md` | ✅ Created |
| `production-readiness-review.prompt.md` | ✅ Created |
| `prepare-release.prompt.md` | ✅ Created |
| `update-docs.prompt.md` | ✅ Created |

### Skills (New — PaidSoon-Specific)
| File | Status |
|---|---|
| `nextjs-app-router.skill.md` | ✅ Created |
| `supabase-auth.skill.md` | ✅ Created |
| `supabase-rls.skill.md` | ✅ Created |
| `supabase-migrations.skill.md` | ✅ Created |
| `vercel-deployment.skill.md` | ✅ Created |
| `invoice-domain.skill.md` | ✅ Created |
| `email-reminders.skill.md` | ✅ Created |
| `csv-import.skill.md` | ✅ Created (planned feature) |
| `myob-integration.skill.md` | ✅ Created (planned feature) |
| `stripe-billing.skill.md` | ✅ Created |
| `testing-strategy.skill.md` | ✅ Created |
| `security-review.skill.md` | ✅ Created |
| `customer-data-protection.skill.md` | ✅ Created |
| `production-readiness.skill.md` | ✅ Created |
| `documentation-maintenance.skill.md` | ✅ Created |

### Scripts
| File | Status |
|---|---|
| `check-copilot-config.sh` | ✅ Created |
| `list-repo-architecture.sh` | ✅ Created |
| `check-supabase-config.sh` | ✅ Created |
| `check-vercel-config.sh` | ✅ Created |
| `check-env-example.sh` | ✅ Created |
| `check-github-workflows.sh` | ✅ Created |
| `check-docs-references.sh` | ✅ Created |

### Other
| File | Status |
|---|---|
| `.copilotignore` | ✅ Created |
| `docs/github-copilot-configuration.md` | ✅ Created |
| `docs/github-copilot-readiness.md` | ✅ Created |
| `docs/github-copilot-gap-analysis.md` | ✅ Created (this file) |

---

## Resolved Gaps

| Gap | Resolution |
|---|---|
| No `.env.example` file | `.env.example` created at repo root with all 19 vars from the env matrix, safe placeholder values only |
| No GitHub Actions CI | `.github/workflows/test.yml` added — runs `npm ci`, `prisma generate`, `npm run lint`, `npm run test` on every push/PR (Node 22 LTS) |
| Limited test coverage | Added `tests/email-schedule.test.ts` (7 cases), `tests/invoice-state-machine.test.ts` (11 cases), `tests/invoice-routes.test.ts` (16 cases via `mock.module()`); total test count raised from 14 to 64 |

---

## Remaining Gaps

### P1 — High Priority

_All P1 items resolved. See Resolved Gaps above._

### P2 — Medium Priority

| Gap | Risk | Recommended Action |
|---|---|---|
| No rate limiting explicitly documented | Auth abuse possible if Vercel WAF not configured | Confirm and document Vercel WAF settings in `docs/runbooks/vercel.md` |
| Scaffolded features accessible in settings UI | User confusion when features appear to work but return placeholders | Add "Coming soon" UI labels to AI rewrite, custom templates, team invite pages |
| No error monitoring | Production runtime errors only visible in Vercel function logs | Add Sentry or Vercel monitoring before public launch |
| `ci-runbook-envvar-drift-check` OpenSpec change planned but not implemented | Env var drift between code and docs goes undetected | Implement the CI check |

### P3 — Low Priority

| Gap | Risk | Recommended Action |
|---|---|---|
| No `CHANGELOG.md` | Release history not tracked in a standard format | Add `CHANGELOG.md`, updated via `prepare-release.prompt.md` |
| No Supabase project metadata documented (project ref, region) | Runbooks reference the project URL but not the CLI reference | Add to `docs/runbooks/supabase.md` |
| No Vercel project name/team documented | Deployment cannot be replicated without this | Add to `docs/runbooks/vercel.md` |

---

## Missing Supabase/RLS Guidance (Before This Build)

Before this build, there was no Copilot-specific documentation for:
- How `withUserContext` activates RLS (`set_config` + `SET LOCAL ROLE authenticated`)
- Which tables require RLS
- How `prismaAdmin` bypasses RLS and when it is permitted
- How to test RLS isolation

All of this is now covered in:
- `.github/instructions/supabase.instructions.md`
- `.github/skills/supabase-rls.skill.md`
- `.github/skills/supabase-migrations.skill.md`
- `.github/prompts/audit-supabase-rls.prompt.md`

---

## Missing Vercel Guidance (Before This Build)

Before this build, there was no Copilot-specific documentation for:
- Why `prisma generate` must be in the build command
- Why `serverExternalPackages` is required
- Why `DIRECT_URL` must never be used as `DATABASE_URL` at runtime
- Cron authentication pattern

All of this is now covered in:
- `.github/instructions/vercel.instructions.md`
- `.github/skills/vercel-deployment.skill.md`
- `.github/prompts/audit-vercel-deployment.prompt.md`

---

## Missing Product Domain Guidance (Before This Build)

Before this build, there was no Copilot-specific documentation for:
- The invoice status state machine
- The three-stage email sequence timing
- The `(externalId, provider, userId)` idempotency key
- The `InvoiceProvider` abstraction
- The `amountDue` cents convention
- PII fields in invoice data

All of this is now covered in:
- `.github/skills/invoice-domain/skill.md`
- `.github/skills/email-reminders/skill.md`
- `.github/skills/customer-data-protection/skill.md`
- `.github/instructions/email-automation.instructions.md`

---

## Stale References

No stale references found in this initial build — all files were created from the current codebase state. Future audits should run `check-docs-references.sh` to detect drift.

---

## Source-of-Truth Conflicts Found

None found during this audit. The following sources are consistent:
- `prisma/schema.prisma` matches `docs/DDD.md` database model section
- `lib/subscriptionPlans.ts` matches plan descriptions in `docs/DDD.md`
- `vercel.json` cron matches `docs/DDD.md` cron section
- API route files in `app/api/` match the routes table in `docs/DDD.md`

---

## Risks Summary

| Risk | Priority | Mitigation |
|---|---|---|
| No `.env.example` — Copilot may hallucinate env var names | ✅ Resolved | `.env.example` created |
| No CI — security regressions not automatically caught | ✅ Resolved | `.github/workflows/test.yml` added |
| Scaffolded features create false expectations | P2 | Label them in the UI |
| No error monitoring | P2 | Add before public launch |
| Env var drift not automatically detected | P2 | Implement CI check from OpenSpec |
