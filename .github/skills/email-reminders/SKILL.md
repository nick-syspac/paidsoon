# Skill: Email Reminders — PaidSoon

## When to Use This Skill
Use when working with the email reminder flow, email templates, the cron dispatcher, email settings, or custom sender configuration.

## Status
Confirmed implemented in this codebase (Resend, 3-stage sequence, daily cron).

## Inputs Required
- Which part of the email system to work on (templates, dispatcher, cron, settings, custom sender)

## Files to Inspect
- `lib/email/send.ts` — `sendFollowUpEmail()` entry point
- `lib/email/templates.ts` — per-stage email templates
- `lib/email/schedule.ts` — `computeNextEmailAt()` timing logic
- `lib/email/catchup.ts` — `runCatchUpScan()` for detecting new invoices
- `app/api/cron/send-emails/route.ts` — daily cron orchestrator
- `app/api/settings/email/route.ts` — email settings + Resend domain verification
- `prisma/schema.prisma` — `EmailSettings`, `EmailLog`, `Schedule` models

## Email Sending Flow

```
Cron (09:00 UTC daily)
  → runCatchUpScan() — detect new overdue invoices
  → resume snoozed invoices (snoozedUntil <= now)
  → query pending invoices (status=pending, nextEmailAt<=now, currentStage<3)
  → for each invoice:
      check EmailLog(trackedInvoiceId, stage) — skip if exists
      resolve From address (custom vs system)
      sendFollowUpEmail(invoice, stage, freelancerEmail, freelancerName)
      write EmailLog entry
      advance currentStage + compute nextEmailAt
      if stage 3: status = sequence_complete
```

## Template Variables

```ts
interface TemplateVars {
  clientName: string        // Sanitize before use
  amountDue: number         // In cents — format with Intl.NumberFormat
  dueDate: Date             // Format as readable date
  invoiceNumber?: string    // Display ID
  daysOverdue: number       // Computed
  firmDeadline?: Date       // Stage 3 only (7 days from send)
  paymentUrl?: string       // Optional Stripe payment link
}
```

## Custom From Address Logic

```ts
const canUseCustomFrom = 
  hasPlanFeature(tier, "verified_from_domain") && 
  emailSettings?.resendVerified === true

const fromAddress = canUseCustomFrom 
  ? emailSettings.fromEmail 
  : process.env.RESEND_FROM_EMAIL
```

## Idempotency

Before any send:
```ts
const existing = await prismaAdmin.emailLog.findFirst({
  where: { trackedInvoiceId: invoice.id, stage }
})
if (existing) continue  // already sent, skip
```

## Rules to Follow
- All sending through `sendFollowUpEmail()` — never call Resend directly from routes
- Check `EmailLog` for duplicates before every send
- Sanitize template variables before inserting into HTML
- Only send to `status = "pending"` invoices with `nextEmailAt <= now`
- Log every send to `email_logs` via `prismaAdmin`
- Never send real emails from tests — stub `sendFollowUpEmail`

## Common Mistakes to Avoid
- Calling `resend.emails.send()` directly (bypass of send.ts)
- Not checking EmailLog for duplicates
- Using unsanitized user data in email templates (XSS risk)
- Sending to paused, snoozed, or resolved invoices
- Forgetting to advance `currentStage` after send
- Using `amountDue` in cents without dividing by 100 for display

## Output Format
- Updated `lib/email/` files with changes
- Tests that stub Resend
- No real emails sent in tests

## Acceptance Checklist
- [ ] `sendFollowUpEmail` called through `lib/email/send.ts`
- [ ] EmailLog idempotency check present
- [ ] Template variables sanitized
- [ ] Custom From address only with tier + verification check
- [ ] `prismaAdmin` used for EmailLog write (intentional)
- [ ] Tests pass without real email sends
