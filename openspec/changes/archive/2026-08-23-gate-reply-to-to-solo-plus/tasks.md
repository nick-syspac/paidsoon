## 1. Plan Entitlement Boundary

- [x] 1.1 Update `lib/subscriptionPlans.ts` so Starter sets `custom_reply_to` to false while Solo+ remains true.
- [x] 1.2 Update any helper copy or plan-presentation surfaces that currently imply Starter includes custom Reply-to.

## 2. Email Settings UX and API Enforcement

- [x] 2.1 Update `app/dashboard/settings/email/page.tsx` and `components/settings/EmailSettingsClient.tsx` to render Reply-to as disabled/greyed for Starter with explicit Solo+ upgrade messaging.
- [x] 2.2 Ensure `app/api/settings/email/route.ts` returns forbidden for Starter attempts to persist `replyTo` and keeps existing behavior for Solo+.
- [x] 2.3 Verify outbound sender resolution in `lib/email/send.ts` remains aligned with updated `custom_reply_to` entitlement.

## 3. Tests and Validation

- [x] 3.1 Update `tests/subscription-plans.test.ts` assertions for the new Reply-to entitlement boundary.
- [x] 3.2 Add or update route/component tests to cover Starter disabled Reply-to UI and API rejection semantics.
- [x] 3.3 Run lint, typecheck, and relevant tests for subscription-plan and email settings changes.

## 4. Documentation and OpenSpec Integrity

- [x] 4.1 Update docs/instructions that currently claim custom Reply-to is available on every paid tier.
- [x] 4.2 Confirm `openspec validate gate-reply-to-to-solo-plus --type change --strict` passes.
