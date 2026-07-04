## Context

PaidSoon already supports a client-facing promise-to-pay flow for a single invoice. A follow-up email can include a tokenised promise link, the client can submit a promised payment date, the system records a `PromiseToPay`, suppresses scheduled reminder emails while the promise is active, marks the promise `kept` when payment arrives, and marks it `broken` when the promised date passes without payment.

The current flow is intentionally lightweight, but it does not yet model the operating rules the product now needs. The public client flow should remain narrow and safe: one invoice, full-payment commitment, no ability to negotiate across multiple invoices, and no indefinite cycle of repeated broken promises. At the same time, freelancers need better visibility into repeat offenders and better control over how reminder cadence and tone adapt after repeated missed commitments.

This is a cross-cutting change because it touches the public promise route, reminder cron behaviour, dashboard state, and follow-up policy logic.

## Goals / Non-Goals

**Goals:**
- Preserve the current single-invoice public promise flow while tightening it with explicit policy rules.
- Enforce that a client-originated promise always applies to one invoice and implies full payment of the outstanding amount.
- Track broken client-originated promises at the debtor level within a tenant and use that history to enforce a retry limit.
- Resume reminders automatically after a promise breaks without requiring manual user intervention.
- Introduce configurable escalation policy inputs so repeated broken promises can affect dashboard priority and optionally affect timing or tone.

**Non-Goals:**
- Adding multi-invoice commitments, partial payments, or instalment plans to the public promise flow.
- Building the internal freelancer-managed arrangement workflow in this change.
- Replacing the existing invoice status machine with a new persisted invoice status for promises.
- Automatically changing email content for all users without an explicit configurable policy.

## Decisions

### Keep promise state separate from invoice status

Active promises will continue to suppress reminder sending without changing `TrackedInvoice.status` from `pending`. This preserves the current scheduler model and avoids expanding the invoice status machine with a `promised` or `commitment_paused` state.

Alternative considered:
- Add a dedicated invoice status for promise-backed pauses. Rejected because it would complicate state transitions, overlap with existing `paused` and `snoozed` semantics, and make automatic resume logic more brittle.

### Distinguish client-originated promises from future freelancer-originated commitments

The promise domain should capture the origin of a commitment, with this change explicitly governing client-originated promises. This preserves a clean line between the public promise flow and the future internal arrangement workflow.

Alternative considered:
- Continue using an undifferentiated promise model. Rejected because retry caps, allowed fields, and invoice coverage differ by actor.

### Enforce retry limits at the debtor-within-tenant level

The retry limit will be evaluated against broken client-originated promises grouped by tenant and debtor identity, using the same debtor grouping concept already implied by client email. This makes the limit consistent across multiple overdue invoices for the same client under one freelancer.

Alternative considered:
- Enforce retry limits per invoice. Rejected because it would let the same late-paying debtor reset their promise count simply by moving to another invoice.

### Model escalation as policy, not hard-coded automation

Repeated broken promises will always raise dashboard priority, but changes to reminder timing or tone should be driven by an explicit freelancer policy rather than a fixed system rule. This keeps the default workflow conservative while allowing more assertive follow-up strategies where desired.

Alternative considered:
- Automatically accelerate reminders or hard-switch to firmer wording after a broken-promise threshold. Rejected because tone and cadence are commercially sensitive and should remain user-controlled.

### Resume reminders by restoring send eligibility, not by resetting sequence state

When a promise breaks, the system should make the invoice eligible for its next scheduled reminder without rewinding the reminder stage. This matches the current suppression model, avoids duplicate early-stage reminders, and keeps the follow-up history consistent.

Alternative considered:
- Reset the sequence to stage one after a broken promise. Rejected because it would weaken escalation for already-late debtors and conflict with the existing stage progression model.

## Risks / Trade-offs

- [Debtor identity is currently email-based] -> Use tenant-scoped debtor grouping now, and keep the model open for stronger debtor identity later if customer records become more canonical.
- [Policy complexity may outpace current settings UX] -> Limit the first version to threshold-based options and dashboard priority before introducing highly granular policy builders.
- [Automatic resume may surprise users expecting manual review] -> Keep the dashboard breach signal prominent and make the resumed state visible in invoice history.
- [Public retry-limit rejection may frustrate some clients] -> Return clear copy directing the client to contact the freelancer directly once promise attempts are exhausted.

## Migration Plan

1. Extend the promise domain so client-originated promises can be identified and breach counts can be evaluated per tenant and debtor.
2. Introduce default escalation policy values that preserve current behaviour for users who do not opt into more aggressive timing or tone changes.
3. Update the public promise flow to reject partial commitments and promises that exceed the configured retry limit.
4. Update the dashboard to show broken-promise history and risk priority without requiring manual data backfill to be perfect on day one.
5. Roll back by disabling the new policy checks and dashboard signals while leaving historical promise records intact.

## Open Questions

- Should the retry cap be a fixed product default, a per-plan setting, or a per-user setting?
- Should the retry cap count only broken promises, or also count superseded promises that were later replaced?
- Should timing escalation affect only the next reminder after a broken promise, or all remaining reminders for that debtor?
- Should dashboard priority be purely visual, or also affect sort order and default filtering?