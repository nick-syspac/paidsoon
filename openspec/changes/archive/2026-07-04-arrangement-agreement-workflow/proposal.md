## Why

Promise-to-pay is too narrow for negotiated repayment outcomes that a freelancer manages directly, such as partial payments, payment plans, or commitments that cover multiple invoices. We need a separate arrangement workflow so internal staff can record and manage broader payment agreements without overloading the public client promise flow.

## What Changes

- Add a freelancer-managed arrangement workflow for recording full-payment, partial-payment, and payment-plan agreements inside the dashboard.
- Allow arrangements to cover either a single invoice or multiple invoices for the same client when the agreement is created by the freelancer.
- Differentiate public client promises from internal arrangements so only freelancer-created agreements can span multiple invoices or include partial payments.
- Define how active arrangements pause or defer reminder activity for the covered invoices and how reminders resume automatically when an arrangement is breached or expires.
- Surface arrangement status, coverage, breach state, and priority cues in the dashboard so follow-up work is triaged clearly.

## Capabilities

### New Capabilities
- `arrangement-agreements`: Freelancer-managed payment agreements covering one or more invoices, including full-payment arrangements, partial-payment arrangements, and instalment plans.
- `arrangement-lifecycle`: State transitions, reminder suppression rules, breach handling, automatic resume behaviour, and dashboard visibility for active and broken arrangements.

### Modified Capabilities
- `promise-to-pay`: Clarify that client-originated promises remain a single-invoice public workflow and cannot create multi-invoice, partial-payment, or instalment agreements.

## Impact

- Affected code: dashboard invoice actions and views, user-facing APIs for internal agreement creation and updates, reminder cron filtering, payment reconciliation logic, and invoice prioritisation surfaces.
- Affected data: new arrangement records and invoice-to-arrangement associations will be required to model multi-invoice coverage and repayment structure.
- Affected operational workflow: freelancers gain an internal negotiation tool that complements, rather than replaces, the client-facing promise-to-pay experience.