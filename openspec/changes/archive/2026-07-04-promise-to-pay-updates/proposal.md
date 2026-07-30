## Why

The current promise-to-pay flow already records single-invoice client commitments, but it does not enforce the operational rules the product now needs around repeat failures, client limits, or risk-driven escalation. We need to tighten the public promise flow so it stays professional for good clients without giving repeat late-payers an unlimited way to delay reminders.

## What Changes

- Modify the existing promise-to-pay workflow so client-submitted promises are limited to one invoice and always represent a full-payment commitment.
- Add policy controls that cap how many client-originated promises a freelancer will accept for the same client after broken commitments.
- Resume reminder sequences automatically after a promise is broken while preserving the current stage context.
- Track repeated broken promises per client and expose that history in the dashboard as an escalation and prioritisation signal.
- Add configurable follow-up behaviour for repeated broken promises so freelancers can choose whether stage timing or reminder tone should change after a threshold is reached.

## Capabilities

### New Capabilities
- `promise-escalation-policy`: Defines broken-promise thresholds, client retry limits, and optional automated timing or tone escalation rules for repeat offenders.

### Modified Capabilities
- `promise-to-pay`: Restrict the public promise flow to one invoice and full-payment commitments, enforce per-client retry limits, auto-resume reminders after a broken promise, and surface repeated-breach history in the dashboard.

## Impact

- Affected code: public promise page and API, daily reminder cron, dashboard invoice table, reminder scheduling logic, reminder template/tone selection, and payment webhook lifecycle updates.
- Affected data: promise history needs client-level breach counting and policy evaluation inputs tied to the tenant and debtor identity.
- Affected product behaviour: client promise links become more constrained, while freelancers gain explicit escalation controls for repeat broken promises.