## Context

PaidSoon currently enforces Cloudflare Turnstile in email/password auth flows, but the public contact form posts directly to `/api/contact` without bot verification. This endpoint can trigger outbound Resend emails and route to internal inboxes, so abuse on this path directly creates operational noise. The repository already has a shared `verifyTurnstile` helper with fail-closed semantics and generic error copy that can be reused.

## Goals / Non-Goals

**Goals:**
- Require Turnstile completion for contact form submissions.
- Place Turnstile above the contact form submit button.
- Enforce server-side verification before any contact email send logic.
- Fail closed when Turnstile verification fails or is unavailable.
- Reuse the existing generic security error copy for verification failures.
- Preserve existing enquiry routing and send-failure behavior after verification succeeds.

**Non-Goals:**
- Changing auth Turnstile behavior for sign-in/sign-up.
- Rewriting contact enquiry routing logic or recipient mappings.
- Introducing alternative anti-abuse controls (rate limiting, honeypot, WAF rules) in this change.
- Changing copy beyond reusing the existing security-check message.

## Decisions

1. Reuse existing Turnstile verification helper in contact API
- Decision: Use `lib/auth/verifyTurnstile.ts` in `POST /api/contact`.
- Rationale: Keeps one verification contract, one timeout policy, and one message across protected endpoints.
- Alternative considered: Duplicating Cloudflare siteverify fetch in contact route. Rejected due to drift risk and duplicated failure-handling logic.

2. Enforce fail-closed verification for contact submissions
- Decision: If token is missing/invalid, or siteverify is unavailable/times out, return verifier error and do not send contact email.
- Rationale: Public, unauthenticated endpoints are high-abuse surfaces; fail-closed is the safest operational default.
- Alternative considered: Fail-open on verifier outage. Rejected because it creates an abuse bypass exactly during degraded security service periods.

3. Keep Turnstile UX placement above submit button
- Decision: Render Turnstile immediately above the submit button in `ContactForm`.
- Rationale: Predictable placement that mirrors expectation from form friction controls and minimizes accidental missed completion.
- Alternative considered: Inline at top of form or below submit. Rejected for poorer visual association with submission action.

4. Reuse generic security error copy
- Decision: Return existing message `Security check failed. Please try again.` for Turnstile verification failures.
- Rationale: Consistent user messaging and avoids adding attacker-facing signal detail.
- Alternative considered: Differentiated messages for missing token vs verifier outage. Rejected to keep copy consistent and less informative to abuse actors.

## Risks / Trade-offs

- [Turnstile outage blocks legitimate contact submissions] -> Mitigation: Keep explicit fallback support email visible in contact form error area and page copy.
- [False negatives or expired token on slow form completion] -> Mitigation: Reset token on expiry/error and require fresh token before submit.
- [Implementation drift between auth and contact protection] -> Mitigation: Reuse shared verifier helper and add route tests for contact-specific verification behavior.

## Migration Plan

1. Deploy UI + API changes together so clients can send `cfToken` before server enforcement is active.
2. Verify `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set in target environments before release.
3. Rollback path: revert contact route token requirement and UI widget while preserving existing routing/send behavior.

## Open Questions

- None at proposal time. Existing environment variables and shared verification utility already exist in the codebase.
