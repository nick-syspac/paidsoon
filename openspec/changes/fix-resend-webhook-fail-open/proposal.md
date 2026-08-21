## Why

The Resend delivery-status webhook route falls back to an empty string
(`process.env.RESEND_WEBHOOK_SECRET ?? ""`) whenever the secret is unset,
which silently turns signature verification into a no-op — any request with
any signature can be crafted to pass. This lets an attacker forge
delivery/bounce/complaint events and overwrite `EmailLog.status` for
arbitrary invoices. Flagged as release blocker B-1 in `docs/go-live-to-do.md`.

## What Changes

- The Resend webhook route fails closed (rejects the request) when
  `RESEND_WEBHOOK_SECRET` is unset or empty, instead of treating an empty
  string as a valid verification key.
- Add tests asserting the route rejects requests when the secret is
  unset/empty, distinct from the existing "bad signature" test.

## Capabilities

### New Capabilities
- `resend-webhook-signature-verification`: defines the required fail-closed
  behavior for verifying signatures on inbound Resend delivery-status
  webhook events.

### Modified Capabilities
(none)

## Impact

- `app/api/webhooks/resend/route.ts`
- `lib/email/resendWebhook.ts` (`verifyResendWebhookSignature`)
- `tests/resend-webhook-route.test.ts`
