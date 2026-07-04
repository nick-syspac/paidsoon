## 1. Contact Form UI

- [ ] 1.1 Add Turnstile widget to the contact form component and bind token state updates for success, expiry, and widget error events
- [ ] 1.2 Place the Turnstile widget immediately above the submit button and keep existing fallback support email messaging unchanged
- [ ] 1.3 Send `cfToken` in the contact form POST payload and disable submit while no valid token is available

## 2. Contact API Verification

- [ ] 2.1 Extend contact request schema to require `cfToken` and reject malformed payloads before processing
- [ ] 2.2 Verify `cfToken` using shared `verifyTurnstile` before calling contact email send logic
- [ ] 2.3 Enforce fail-closed behavior: return verifier 400/503 responses with reused message and skip email delivery on verification failure

## 3. Tests

- [ ] 3.1 Update contact route tests to cover missing token, invalid token, and Siteverify unavailable/time-out failures
- [ ] 3.2 Add/adjust test coverage to assert no email send attempt occurs when Turnstile verification fails
- [ ] 3.3 Verify successful contact submission still routes and returns success when token verification passes

## 4. Verification and Documentation

- [ ] 4.1 Run relevant test suite (`tests/contact-enquiry-routing.test.ts` and Turnstile-related tests) and confirm pass
- [ ] 4.2 Confirm required environment variables for Turnstile are documented and unchanged for deployment environments
- [ ] 4.3 Validate OpenSpec change artifacts and ensure change is ready for `/opsx:apply`
