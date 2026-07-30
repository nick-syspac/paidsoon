## Why

The public contact form currently accepts unauthenticated submissions without bot verification, which increases spam and abuse risk in support and sales inboxes. We already use Cloudflare Turnstile for auth flows, so extending the same control to contact submissions closes a clear security gap now.

## What Changes

- Add Cloudflare Turnstile to the marketing contact form UI and require a token before submit.
- Place the Turnstile widget directly above the submit button on the contact form.
- Extend contact form payload validation to require a Turnstile token.
- Verify Turnstile token server-side in the contact API before attempting Resend delivery.
- Enforce fail-closed behavior for contact submissions when token verification fails, times out, or Turnstile is unavailable.
- Reuse existing generic security error copy ("Security check failed. Please try again.") for contact verification failures.
- Preserve existing enquiry routing and delivery-failure behavior after successful verification.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `turnstile-bot-protection`: Expand Turnstile requirements to include public contact submissions with fail-closed verification, widget placement above submit, and reused generic security error copy.

## Impact

- Affected code:
  - Contact form component in `components/marketing/ContactForm.tsx`
  - Contact API handler in `app/api/contact/route.ts`
  - Shared Turnstile verifier usage from `lib/auth/verifyTurnstile.ts`
  - Contact route tests in `tests/contact-enquiry-routing.test.ts`
- API behavior:
  - `POST /api/contact` requires `cfToken` and may return Turnstile-related 400/503 failure responses before email send.
- Dependencies/systems:
  - Relies on existing Cloudflare Turnstile setup (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) and Cloudflare Siteverify availability.
