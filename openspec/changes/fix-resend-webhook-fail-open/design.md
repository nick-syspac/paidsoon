## Context

`app/api/webhooks/resend/route.ts` calls
`verifyResendWebhookSignature(payload, headers, process.env.RESEND_WEBHOOK_SECRET ?? "")`.
See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Make the missing/empty-secret case fail closed.
- Keep the existing verified-signature and bad-signature behavior unchanged.

**Non-Goals:**
- Rotating or changing the secret value itself.
- Changes to how `resolveEmailLogStatus` derives an `EmailLog.status` value.

## Decisions

- Reject before calling `verifyResendWebhookSignature` at all when the env
  var is unset/empty, rather than pushing the fail-closed check into the
  verifier itself. This keeps the "misconfigured environment" condition
  explicit and localized at the route boundary, matching how other
  config/validation checks in this codebase live at the route boundary
  rather than being buried inside a shared helper.
  Alternative considered: special-case an empty secret inside
  `verifyResendWebhookSignature` — rejected because it spreads the
  fail-closed condition across two files for no benefit, since this
  function has no other caller today.
- Return HTTP 500 for the unset/empty-secret case (server misconfiguration)
  rather than 400 (bad request), since the failure is not caused by the
  caller. Resend retries on any non-2xx response regardless, so this does
  not change delivery/retry semantics — it only makes the cause
  distinguishable if the response status is logged or alerted on.

## Risks / Trade-offs

- [Risk] If `RESEND_WEBHOOK_SECRET` is accidentally unset in a real
  environment, all delivery-status webhooks will be rejected (a visible
  failure) instead of silently accepted (an invisible security bypass) →
  Mitigation: this is the intended trade-off. Failing loudly and safely is
  strictly better than an invisible bypass, and the env var is already
  documented as required in `docs/runbooks/README.md`.
