---
mode: agent
description: Build a weekly debtor summary email for PaidSoon users.
---

# Build Weekly Debtor Summary — PaidSoon

## Role
You are a senior full-stack engineer implementing a weekly debtor summary digest email for PaidSoon.

## Goal
Send each PaidSoon user a weekly summary of their outstanding debtors — total overdue amount, number of active invoices, invoices approaching next email stage.

> **Important:** This feature is **not currently implemented**. Build it from scratch following PaidSoon conventions.

## PaidSoon Context
PaidSoon sends 3-stage follow-up emails to debtors. The weekly summary is a **digest to the PaidSoon user** (the freelancer/business), not to their clients. The existing cron job at `app/api/cron/send-emails` runs daily — a separate weekly trigger would be needed.

## Files to Inspect
- `app/api/cron/send-emails/route.ts` — existing cron handler pattern
- `vercel.json` — cron schedule configuration
- `lib/email/send.ts` — `sendFollowUpEmail` (use Resend but create a separate summary sender)
- `lib/email/templates.ts` — template pattern to follow
- `prisma/schema.prisma` — `TrackedInvoice`, `UserProfile`, `EmailSettings`
- `lib/db/admin.ts` — `prismaAdmin` for cross-user cron work
- `lib/subscriptionPlans.ts` — decide which tiers get this feature

## Implementation Rules

### New Cron Route
Create: `GET /api/cron/weekly-summary`
- Verify `Authorization: Bearer CRON_SECRET`
- Use `prismaAdmin` (processes all users — RLS bypass is intentional, document it)
- For each active user with pending/active invoices: generate and send summary

### Summary Content
- Total outstanding amount (sum of `amountDue` for `status = "pending"`)
- Number of active invoices being chased
- Invoices in stage 1, 2, 3 respectively
- Next email dates for upcoming sends
- Link to dashboard

### Email Template
- Create `buildWeeklySummaryEmail(userId, invoices)` in `lib/email/templates.ts`
- Send to freelancer's account email (from Supabase Auth user, not `clientEmail`)
- Subject: `Your PaidSoon weekly summary — £X.XX outstanding`

### Vercel Cron
Add to `vercel.json`:
```json
{ "path": "/api/cron/weekly-summary", "schedule": "0 8 * * 1" }
```
(Monday at 08:00 UTC)

### Feature Gating
- Decide which tiers receive the summary (suggest: Business+ gets it)
- Add feature flag to `lib/subscriptionPlans.ts` if needed

### Tests
- Test summary email content generation with mock invoice data
- Test that users with no active invoices are skipped or receive an empty-state message
- Never send real emails from tests

## Expected Output

1. `GET /api/cron/weekly-summary` route handler
2. `vercel.json` updated with new cron entry
3. Weekly summary email template
4. Feature flag in `lib/subscriptionPlans.ts` (if applicable)
5. Tests in `tests/`
6. `docs/DDD.md` update

## Acceptance Criteria
- Summary contains correct outstanding amounts
- Only active invoices included
- Cron authentication verified
- `npm run test` passes
- No TypeScript errors
