## Context

See proposal.md - Why. The codebase already centralizes plan definitions in `lib/subscriptionPlans.ts`, with shared pricing copy consumed by marketing and onboarding surfaces via `lib/planPresentation.ts`. This makes the cleanest design a catalog-first rename: the public `name` field is updated to `Business Control` while the `id` remains `solo` for backward compatibility.

## Goals / Non-Goals

**Goals:**
- Keep internal plan IDs and Stripe-based billing semantics stable.
- Update the customer-facing label and pricing copy to the requested wording.
- Ensure pricing cards order and recommendation badge remain consistent.

**Non-Goals:**
- No pricing changes, Stripe ID changes, entitlements changes, or migration work.
- No change to internal analytics event names or historical identifiers.

## Decisions

- Keep the `solo` tier key as the stable source of truth for code and data compatibility, but render `Business Control` in customer-facing labels.
- Update the central plan catalog and shared presentation helpers instead of scattering one-off copy across pages and components.
- Preserve the existing public-plan order and Small Business popularity badge while only adjusting the displayed labels and wording.

## Risks / Trade-offs

- [Risk] Some older UI strings still hardcode the legacy label. → Mitigation: update the central catalog and the remaining customer-facing strings in the pricing and settings surfaces before final verification.
- [Risk] Internal compatibility could be confused with a customer-facing rename. → Mitigation: keep `solo` in code, Stripe mapping, and data model references while only changing labels and descriptions.
- [Risk] Pricing card layout may become visually uneven. → Mitigation: rely on the shared responsive card layout and ensure the plan label fits the existing typography hierarchy.

## Migration Plan

No migration is required. Existing subscriptions remain valid because the internal identifier remains `solo` and the existing Stripe product/price IDs are untouched.

## Open Questions

None. The technical decision is clear: preserve the internal identifier and update only user-facing labels and positioning text.
