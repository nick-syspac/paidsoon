---
mode: agent
description: Add a new email template to PaidSoon's three-stage reminder sequence.
---

# Add Email Template — PaidSoon

## Role
You are a full-stack engineer adding or modifying an email template in PaidSoon.

## Goal
Create or update an email template for the PaidSoon reminder sequence, following all template safety, formatting, and idempotency rules.

## PaidSoon Context
PaidSoon sends 3-stage follow-up emails via Resend. Templates live in `lib/email/templates.ts`. Each stage has a fixed subject and HTML/text body. Custom templates are a scaffolded feature (Business+ tier with `custom_reminder_templates` feature flag).

## Files to Inspect
- `lib/email/templates.ts` — all existing templates (pattern to follow)
- `lib/email/send.ts` — how templates are rendered and dispatched
- `prisma/schema.prisma` — `TrackedInvoice` fields available for templates
- `lib/subscriptionPlans.ts` — `custom_reminder_templates` feature flag
- `app/api/settings/templates/route.ts` — custom template routes (scaffolded)

## Template Variable Reference

Available variables for templates:
| Variable | Source | Notes |
|---|---|---|
| `clientName` | `TrackedInvoice.clientName` | Sanitize before use |
| `amountDue` | `TrackedInvoice.amountDue` / 100 | Format with Intl.NumberFormat |
| `dueDate` | `TrackedInvoice.dueDate` | Format as readable date |
| `invoiceNumber` | `TrackedInvoice.externalId` | Display identifier |
| `daysOverdue` | Computed | Days since `dueDate` |
| `firmDeadline` | Computed (stage 3 only) | 7 days from send date |
| `paymentUrl` | `TrackedInvoice.paymentUrl` | Optional; omit if null |

## Stage Tone Guide

| Stage | Tone | Goal |
|---|---|---|
| 1 | Friendly, polite | Gentle nudge; assume oversight |
| 2 | Firmer, requesting timeline | Establish accountability |
| 3 | Final notice, urgent | Clear deadline; legal implication possible |

## Implementation Rules

### Template Safety
- **Sanitize** all string variables before inserting into HTML — never trust DB content directly
- Escape HTML special characters: `&`, `<`, `>`, `"`, `'`
- Do not include `clientEmail` in the template body — it is the recipient, not a display value
- Never include internal IDs (TrackedInvoice.id) in email content

### Format
```ts
export function buildStage1Email(vars: TemplateVars): { subject: string; html: string; text: string } {
  const { clientName, amountDue, dueDate, invoiceNumber } = vars
  // ... build subject, html, text
  return { subject, html, text }
}
```

### Both HTML and Text versions required
- `html` — for email clients that support HTML
- `text` — plain text fallback (required by Resend)

### Amount Formatting
```ts
const formatted = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: invoice.currency ?? "GBP",
}).format(amountDue / 100)
```

### Custom Templates (scaffolded feature)
- `custom_reminder_templates` flag is `business`+ tier only (`accountant_partner` also has it, but that tier is planned/not yet implemented)
- Routes exist at `/api/settings/templates` but are not yet persistent
- When implementing fully: validate and sanitize user-provided template strings
- Never allow template strings to execute arbitrary code

## Expected Output
1. Updated `lib/email/templates.ts` with new/modified template(s)
2. Tests for template output with mock data
3. If custom templates: implementation in `/api/settings/templates` with persistence

## Acceptance Criteria
- Template renders correctly with all variables
- HTML and text versions both present
- Amount formatted as currency
- Sanitized template variables (no XSS risk)
- Tests pass
