## Context

See proposal.md for motivation. PaidSoon already has a password-reset helper layer and the product has existing pre-launch auth gating through the `LIVE` flag. The missing design constraint is not whether reset support exists in code; it is whether the full customer journey is safe, observable, and production-validated before the feature is treated as ready for paying users.

## Goals / Non-Goals

**Goals:**
- Provide a safe, self-service recovery path for users who lose access to their account.
- Keep the recovery experience privacy-preserving and consistent with the app's auth safety model.
- Make the reset flow behave predictably before launch and in invalid-token states.
- Ensure the system can be validated with a repeatable customer-facing test.

**Non-Goals:**
- Replacing Supabase Auth with a custom auth implementation.
- Enabling password recovery in pre-launch or non-live environments.
- Adding support tooling or escalation workflows beyond the self-service reset path.

## Decisions

### Use the platform auth system, not custom recovery logic

**Chosen:** The application will rely on the existing Supabase Auth reset flow and guardrails rather than inventing a custom password-reset mechanism.

**Rationale:** This keeps the recovery process aligned with the platform's token validation, expiry handling, and security assumptions. It reduces the maintenance burden and limits the risk of custom auth bugs.

**Alternative considered:** Implement recovery logic directly in the app database or custom session layer. Rejected because it would bypass the product's trusted identity provider and would be harder to audit.

### Treat reset safety as a product requirement, not just a helper feature

**Chosen:** The investigation and validation scope includes the route, the UI, the token handling, and the operator-facing confidence that the flow works without developer intervention.

**Rationale:** A helper function alone does not prove a production customer flow works. The release gate requires end-user behavior, not just API-level support code.

**Alternative considered:** Mark the feature as complete based on helper existence. Rejected because it creates a false release signal and exposes a real access problem for locked-out users.

### Keep privacy guarantees consistent with the app's auth pattern

**Chosen:** The reset request flow will use a generic confirmation response regardless of whether a user exists, while failure states will avoid leaking account status.

**Rationale:** This is the standard safety pattern for self-service auth recovery and protects the product from enumeration attacks.

**Alternative considered:** Emit different messages for known versus unknown addresses. Rejected because it would reveal account existence and is inconsistent with the product's security posture.

## Risks / Trade-offs

- [Risk] Recovery links may be invalid or expired and create support noise.
  - Mitigation: The UI must fail closed and guide the user to request a new link without exposing account state.

- [Risk] The flow may be implemented but not validated in production mode.
  - Mitigation: Treat the route and customer experience as release-gated and verify with a real test flow before launch approval.

- [Risk] Pre-launch gating could drift if the route is added without checking `LIVE` conditions.
  - Mitigation: The route should be protected using the same gate as sign-in and sign-up.

## Migration Plan

1. Validate the reset-request and reset-completion pages against the current auth configuration.
2. Confirm the flow respects the `LIVE` gate and generic success messaging before release.
3. Add a customer-facing regression test for the full recovery flow and one failure path.
4. If the flow fails validation, do not treat it as release-ready; keep the route hidden or gated until corrected.
5. Rollback is operationally straightforward: remove or hide the customer-facing entry point while leaving the underlying auth provider intact.

## Open Questions

- Should the recovery flow include a support-only fallback for users whose reset email is never received, or is the self-service path the only supported route for launch?
- Is there a need for a brief diagnostic signal for operators when a reset email fails to send, without exposing account status to the customer?
