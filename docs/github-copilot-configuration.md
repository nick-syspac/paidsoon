# GitHub Copilot Configuration — PaidSoon

This document explains how the GitHub Copilot configuration for PaidSoon is structured and how to use each component effectively.

---

## File Structure

```
.github/
  copilot-instructions.md           ← Global instructions (always active)
  instructions/
    frontend.instructions.md        ← Next.js, React, UI patterns
    backend-api.instructions.md     ← API routes, auth, validation
    supabase.instructions.md        ← DB, RLS, migrations
    vercel.instructions.md          ← Deployment, env vars, cron
    testing.instructions.md         ← Test patterns, Node test runner
    security.instructions.md        ← Security guardrails
    email-automation.instructions.md← Email system rules
    billing.instructions.md         ← Stripe billing rules
    docs.instructions.md            ← Documentation standards
  prompts/
    audit-*.prompt.md               ← Code and config audits
    build-*.prompt.md               ← Feature building prompts
    add-*.prompt.md                 ← Adding routes, tables, pages, templates
    fix-*.prompt.md                 ← Debugging prompts
    security-review.prompt.md       ← Security review
    production-readiness-review.prompt.md
    prepare-release.prompt.md
    update-docs.prompt.md
  skills/
    nextjs-app-router/
      SKILL.md                      ← App Router patterns
    supabase-auth/
      SKILL.md                      ← Supabase Auth
    supabase-migration/
      SKILL.md                      ← Supabase Migration
    supabase-rls/
      SKILL.md                    ← Supabase RLS
    vercel-deployment/
      SKILL.md                    ← Deployment knowledge
    invoice-domain/
      SKILL.md                    ← Invoice tracking logic
    email-reminders/
      SKILL.md                    ← Email automation rules
    stripe-billing/
      SKILL.md                    ← Billing integration
    csv-import/
      SKILL.md                    ← CSV import (planned)
    myob-integration/
      SKILL.md                    ← MYOB integration (planned)
    testing-strategy/
      SKILL.md                    ← Testing patterns
    security-review/
      SKILL.md                    ← Security checklist
    customer-data-protection/
      SKILL.md
    production-readiness/
      SKILL.md
    documentation-maintenance/
      SKILL.md
  scripts/
    check-copilot-config.sh         ← Verify all config files present
    list-repo-architecture.sh       ← Print repo structure summary
    check-supabase-config.sh        ← Supabase config check
    check-vercel-config.sh          ← Vercel config check
    check-env-example.sh            ← Env var documentation check
    check-github-workflows.sh       ← GitHub Actions check
    check-docs-references.sh        ← Docs vs codebase check

.copilotignore                      ← Files Copilot should not read
```

---

## How to Use Each Component

### Global Instructions (`copilot-instructions.md`)

The global instructions file is automatically loaded by GitHub Copilot for all interactions in this repository. It contains:
- What PaidSoon does
- Confirmed architecture summary
- Coding standards and conventions
- Security rules
- Never-do list

No action needed — it applies automatically.

### Instruction Files (`.github/instructions/`)

These files are scoped by `applyTo` frontmatter patterns and apply automatically when working with matching files:

| File | Applies to |
|---|---|
| `frontend.instructions.md` | `*.tsx`, `*.ts`, `app/**`, `components/**` |
| `backend-api.instructions.md` | `app/api/**`, `lib/**` |
| `supabase.instructions.md` | `prisma/**`, `lib/db/**`, `lib/supabase/**` |
| `vercel.instructions.md` | `vercel.json`, `next.config*`, `app/api/cron/**` |
| `testing.instructions.md` | `tests/**`, `scripts/**` |
| `security.instructions.md` | `**/*.ts`, `**/*.tsx` |
| `email-automation.instructions.md` | `lib/email/**`, `app/api/cron/**` |
| `billing.instructions.md` | `lib/billing*`, `app/api/billing/**`, `app/api/webhooks/stripe-billing/**` |
| `docs.instructions.md` | `docs/**`, `**/*.md` |

### Prompt Files (`.github/prompts/`)

Prompt files are reusable starting points for GitHub Copilot Chat or Agent mode.

**To use a prompt:**
1. Open GitHub Copilot Chat
2. Type `#` and select the prompt file, or reference it with `@workspace /path/to/prompt.md`
3. Provide any additional context the prompt asks for

**Audit prompts** (read-only analysis):
- `audit-codebase.prompt.md` — full codebase review
- `audit-supabase-rls.prompt.md` — RLS policy audit
- `audit-vercel-deployment.prompt.md` — deployment config audit

**Build prompts** (implementation):
- `build-feature.prompt.md` — general feature implementation
- `build-invoice-reminder-flow.prompt.md` — email reminder work
- `build-promise-to-pay-flow.prompt.md` — promise tracking (not yet implemented)
- `build-dispute-pause-flow.prompt.md` — dispute handling (not yet implemented)
- `build-weekly-debtor-summary.prompt.md` — weekly digest (not yet implemented)
- `build-myob-integration.prompt.md` — MYOB provider (not yet implemented)
- `build-csv-import.prompt.md` — CSV import (not yet implemented)

**Add prompts** (incremental additions):
- `add-api-route.prompt.md`, `add-supabase-table.prompt.md`, `add-rls-policy.prompt.md`
- `add-nextjs-page.prompt.md`, `add-dashboard-widget.prompt.md`
- `add-email-template.prompt.md`, `add-stripe-billing.prompt.md`, `add-tests.prompt.md`

**Fix prompts** (debugging):
- `fix-frontend-issue.prompt.md`, `fix-api-issue.prompt.md`, `fix-supabase-issue.prompt.md`

**Review prompts**:
- `security-review.prompt.md`, `production-readiness-review.prompt.md`
- `prepare-release.prompt.md`, `update-docs.prompt.md`

### Skill Files (`.github/skills/`)

Skills provide deep domain knowledge for specific areas. They are referenced by prompts or can be loaded directly in Copilot Chat.

**Confirmed implemented skills:**
- `nextjs-app-router.skill.md` — App Router patterns and rules
- `supabase-auth.skill.md` — Auth flows and session management
- `supabase-rls.skill.md` — RLS policy patterns
- `supabase-migrations.skill.md` — Schema migration workflow
- `vercel-deployment.skill.md` — Deployment configuration
- `invoice-domain.skill.md` — Invoice tracking state machine
- `email-reminders.skill.md` — Email automation rules
- `stripe-billing.skill.md` — Billing integration patterns
- `testing-strategy.skill.md` — Test patterns and rules
- `security-review.skill.md` — Security review checklist
- `customer-data-protection.skill.md` — PII handling rules
- `production-readiness.skill.md` — Launch checklist
- `documentation-maintenance.skill.md` — Doc update rules

**Planned/optional skills (not yet implemented):**
- `csv-import.skill.md` — CSV import (status: planned)
- `myob-integration.skill.md` — MYOB integration (status: planned)

### Helper Scripts (`.github/scripts/`)

Run from the repository root:

```bash
# Check all Copilot config files are present
bash .github/scripts/check-copilot-config.sh

# Print repo architecture summary
bash .github/scripts/list-repo-architecture.sh

# Check Supabase configuration
bash .github/scripts/check-supabase-config.sh

# Check Vercel configuration
bash .github/scripts/check-vercel-config.sh

# Check env var documentation
bash .github/scripts/check-env-example.sh

# Check GitHub Actions workflows
bash .github/scripts/check-github-workflows.sh

# Check docs match codebase
bash .github/scripts/check-docs-references.sh
```

---

## Recommended Development Workflow

### Starting a new feature
1. Run `audit-codebase.prompt.md` to understand the current state
2. Use `build-feature.prompt.md` as your implementation guide
3. Reference `invoice-domain.skill.md`, `supabase-rls.skill.md`, or other relevant skills

### Adding a new API route
1. Use `add-api-route.prompt.md`
2. Follow patterns from `backend-api.instructions.md`

### Adding a new database table
1. Use `add-supabase-table.prompt.md`
2. Follow `supabase-migrations.skill.md`
3. Run `npm run verify-rls` after

### Debugging an issue
1. Use the appropriate fix prompt (`fix-frontend-issue`, `fix-api-issue`, `fix-supabase-issue`)
2. Reference the relevant skill for the area

### Before deploying
1. Run `production-readiness-review.prompt.md`
2. Run `bash .github/scripts/check-vercel-config.sh`
3. Run `npm run build && npm run test`

### Updating documentation
1. Use `update-docs.prompt.md`
2. Follow `documentation-maintenance.skill.md`

---

## Recommended Copilot Agent Workflow

In GitHub Copilot Agent mode, use prompts as starting points:

1. Open Agent mode in VS Code (`Ctrl+Shift+P` → "GitHub Copilot: Open Chat")
2. Switch to Agent mode
3. Reference the appropriate prompt file with `/` or `#`
4. Provide the specific feature or issue context
5. Review the agent's plan before it executes
6. Validate: `npm run build`, `npm run test`, `npm run verify-rls` (if schema changed)
