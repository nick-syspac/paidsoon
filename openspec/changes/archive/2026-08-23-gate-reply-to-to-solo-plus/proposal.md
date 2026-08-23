## Why

Starter currently allows custom Reply-to, which conflicts with the intended sender-identity ladder you just chose (Reply-to should require Solo or Small Business). This mismatch creates pricing confusion and a UI state that appears to over-deliver Starter capabilities.

## What Changes

- **BREAKING** Change plan entitlement for `custom_reply_to` so Starter no longer includes Reply-to customization.
- Update Email Settings UI so Starter users can see the Reply-to control in a disabled/greyed state with clear upgrade messaging rather than an editable input.
- Keep server-side enforcement authoritative: Starter requests to set `replyTo` are rejected by entitlement checks.
- Align send-time behavior so Starter outbound reminders do not use custom Reply-to values.
- Update tests and product/docs copy that currently describe Reply-to as available on every paid tier.

## Capabilities

### New Capabilities
- `email-settings-restricted-reply-to`: Defines the read-only/disabled Starter UX and API denial behavior when Reply-to is unavailable by plan.

### Modified Capabilities
- `subscription-plan-tiers`: Updates sender-identity entitlement boundaries so Reply-to requires Solo or higher.

## Impact

- Affected plan catalog and feature checks:
  - `lib/subscriptionPlans.ts`
  - `lib/billing.ts` (behavior via existing `requireFeature` checks)
- Affected settings UI/API:
  - `app/dashboard/settings/email/page.tsx`
  - `components/settings/EmailSettingsClient.tsx`
  - `app/api/settings/email/route.ts`
- Affected send-time identity resolution:
  - `lib/email/send.ts`
- Affected tests:
  - `tests/subscription-plans.test.ts`
  - Add/adjust tests for email settings UI and API entitlement rejection
- Affected docs/copy:
  - `docs/DDD.md`
  - `.github/instructions/billing.instructions.md`
  - `.github/copilot-instructions.md`
