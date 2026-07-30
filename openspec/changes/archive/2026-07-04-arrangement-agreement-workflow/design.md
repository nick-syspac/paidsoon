## Context

PaidSoon's existing promise-to-pay flow is a public, token-based commitment tied to one invoice. That is appropriate for a client saying "I will pay this invoice by this date," but it is too limited for freelancer-managed negotiations such as partial payments, instalment plans, or commitments that cover multiple overdue invoices for the same client.

The product needs a separate internal workflow for these negotiated outcomes. That workflow must let the freelancer record and manage agreements inside the dashboard without giving the public client flow those broader powers. It must also integrate with reminder suppression, breach handling, and invoice prioritisation in a way that remains coherent with the current reminder engine.

This change introduces a new domain concept, likely distinct from `PromiseToPay`, and will affect invoice actions, dashboard rendering, reminder cron filtering, and payment-reconciliation behaviour.

## Goals / Non-Goals

**Goals:**
- Introduce a freelancer-managed arrangement workflow distinct from the public client promise flow.
- Support arrangements covering a single invoice or multiple invoices for the same debtor within one tenant.
- Support full-payment commitments, partial-payment commitments, and multi-step payment plans created by the freelancer.
- Define how arrangements suspend or defer reminders for covered invoices and how reminders resume automatically when an arrangement is broken or expires.
- Make arrangement state visible and actionable in the dashboard.

**Non-Goals:**
- Allow clients to create multi-invoice arrangements, partial-payment commitments, or instalment plans through the public promise link.
- Replace the existing promise-to-pay domain for simple client-originated single-invoice commitments.
- Build advanced collections automation beyond reminder suppression, breach signalling, and priority surfacing.
- Solve cross-client or cross-tenant arrangements.

## Decisions

### Create a separate arrangement domain instead of stretching PromiseToPay

Arrangements should be modeled separately from `PromiseToPay` because they have different actors, scope, and repayment structures. A freelancer-managed arrangement may cover many invoices and may include partials or instalments, while the client promise flow must stay limited to one invoice and full payment.

Alternative considered:
- Reuse `PromiseToPay` with additional fields for plan type and invoice grouping. Rejected because it would overload one model with incompatible semantics and make policy enforcement harder.

### Scope multi-invoice arrangements to one debtor within one tenant

An arrangement can cover multiple invoices only when those invoices belong to the same debtor inside the same freelancer account. This keeps the workflow aligned with real negotiations and avoids cross-debtor ambiguity.

Alternative considered:
- Allow arbitrary invoice bundles. Rejected because it would weaken identity boundaries and make repayment allocation harder to reason about.

### Model reminder suppression at the arrangement-coverage level

Invoices covered by an active arrangement should become ineligible for scheduled reminders for as long as the arrangement remains active. Reminder suppression should be derived from arrangement coverage rather than implemented through ad hoc invoice status changes.

Alternative considered:
- Convert covered invoices to `paused` or `snoozed`. Rejected because those states already serve manual workflow meanings and do not express shared arrangement coverage across multiple invoices.

### Support partials and plans explicitly

The arrangement workflow should distinguish between a one-date full-payment arrangement, a partial-payment arrangement, and an instalment plan. This keeps downstream behaviour explicit, especially for payment reconciliation and breach detection.

Alternative considered:
- Represent every arrangement as a free-form note with one due date. Rejected because it would be too weak to drive reminder behaviour or reliable dashboard state.

### Resume reminders automatically after breach using remaining invoice state

When an arrangement is breached or expires without settlement, affected invoices should re-enter reminder eligibility automatically while preserving their existing reminder stage. This matches the current promise suppression model and avoids manual recovery work.

Alternative considered:
- Require manual resume after arrangement breach. Rejected because it creates operational gaps and conflicts with the user's stated preference for automatic resumption.

## Risks / Trade-offs

- [New repayment structures increase data-model complexity] -> Start with a constrained arrangement type system and explicit invoice coverage records rather than a fully generic contract engine.
- [Multi-invoice coverage complicates payment reconciliation] -> Require same-debtor grouping and define clear rules for how payments or manual resolution affect covered invoices.
- [Arrangement and promise signals may overlap in the dashboard] -> Keep actor, scope, and status visible so a user can distinguish a client promise from a freelancer-managed arrangement quickly.
- [Suppression rules could become fragmented] -> Centralise reminder eligibility checks so promises and arrangements are evaluated in one place.

## Migration Plan

1. Introduce the arrangement domain and invoice coverage association without changing existing promise-to-pay behaviour.
2. Add internal dashboard actions and APIs for arrangement creation and maintenance.
3. Update reminder eligibility logic so active arrangements suppress reminders for covered invoices.
4. Add automatic breach and resume handling for arrangements, then surface arrangement indicators in the dashboard.
5. Roll back by disabling arrangement-based suppression and hiding arrangement actions while leaving stored arrangement history intact.

## Open Questions

- Should a payment-plan arrangement require explicit milestone dates for every instalment in the first version?
- How should partial payments be allocated when an arrangement covers multiple invoices?
- Should arrangement breach be based solely on dates, or also on missed milestone amounts?
- Should the dashboard show arrangement priority at the debtor level, invoice level, or both?