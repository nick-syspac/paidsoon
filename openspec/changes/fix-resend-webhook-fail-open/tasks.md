## 1. Fail-closed guard

- [x] 1.1 Add an explicit check in `app/api/webhooks/resend/route.ts` that
      returns a non-2xx response immediately when
      `process.env.RESEND_WEBHOOK_SECRET` is unset or empty, before calling
      `verifyResendWebhookSignature`
- [x] 1.2 Remove the `?? ""` fallback when passing the secret to
      `verifyResendWebhookSignature`

## 2. Tests

- [x] 2.1 Add a test to `tests/resend-webhook-route.test.ts` asserting a
      non-2xx response and no `EmailLog` update when `RESEND_WEBHOOK_SECRET`
      is unset
- [x] 2.2 Add a test asserting a non-2xx response when
      `RESEND_WEBHOOK_SECRET` is set to an empty string
- [x] 2.3 Run `npm run test` and confirm the full suite passes

## 3. Verification

- [x] 3.1 Run `npm run lint` and `npx tsc --noEmit` and confirm no new
      errors are introduced
