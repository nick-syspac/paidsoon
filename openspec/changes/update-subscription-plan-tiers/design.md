## Context

PaidSoon needs a clear, enforceable plan model that maps pricing, limits, and features to distinct customer segments. The current subscription structure does not clearly differentiate invoice volume, collaboration, branding, and AI-related value, which increases confusion in sales and weakens upgrade incentives.

This change introduces three explicit tiers (Starter, Solo, Small Business) and requires consistent behavior across billing, subscription UI, and entitlement checks.

## Goals / Non-Goals

**Goals:**
- Define a canonical plan catalog with three tiers and fixed monthly prices.
- Define strict per-tier limits for chased invoices, users, and connected Stripe accounts.
- Define strict per-tier feature access for reminders, templates, dashboards, branding, sender identity, tone settings, and AI rewrite.
- Ensure product surfaces and billing configuration consume the same source of truth for plan details.

**Non-Goals:**
- Building annual pricing or usage-based overage billing in this change.
- Introducing enterprise or custom contract plans.
- Redesigning unrelated dashboard experiences outside subscription-related surfaces.

## Decisions

1. Canonical server-owned plan configuration
- Decision: Store the full tier matrix in one canonical configuration consumed by both backend entitlement checks and UI presentation.
- Why: Prevents drift between marketing text, checkout products, and runtime feature gates.
- Alternatives considered:
  - Split config by UI and backend modules: rejected due to high drift risk.
  - Hardcoded checks scattered across components: rejected due to maintenance complexity.

2. Hard limits enforced at capability boundaries
- Decision: Enforce invoice/user/Stripe-account limits at write or connect actions, not only in the UI.
- Why: UI-only checks can be bypassed; server-side enforcement guarantees policy correctness.
- Alternatives considered:
  - UI-only warning banners: rejected because limits could still be exceeded.
  - Post-fact reconciliation jobs: rejected because it allows temporary policy violations.

3. Tier features represented as explicit entitlement flags
- Decision: Model optional capabilities (AI rewrite, custom templates, tone settings, sender identity) as explicit booleans/enum allowances per tier.
- Why: Keeps entitlement checks deterministic and easy to test.
- Alternatives considered:
  - Derive features implicitly from plan names in code: rejected as brittle and error-prone.

4. Stripe mapping remains plan-aligned
- Decision: Ensure each tier maps to a dedicated Stripe product/price pair and internal plan identifier.
- Why: Reduces billing mismatches and supports clean upgrades/downgrades.
- Alternatives considered:
  - One Stripe product with metadata switches: rejected due to higher operational risk.

## Risks / Trade-offs

- [Entitlement drift between billing and product behavior] -> Centralize plan config and add integration checks for plan-to-feature mapping.
- [Existing subscribers may be on legacy plans] -> Define migration mapping and temporary compatibility handling for unknown plan IDs.
- [Copy inconsistencies across UI locations] -> Render plan attributes from shared config where possible instead of duplicated strings.
- [Limit enforcement impacts existing workflows] -> Provide clear upgrade messaging when limits are reached.

## Migration Plan

1. Introduce canonical tier definitions and feature matrix.
2. Update checkout and subscription management mappings to the new tier identifiers/prices.
3. Update plan display UI in subscription settings and upgrade surfaces.
4. Implement/verify server-side entitlement checks for limits and tier-gated features.
5. Validate upgrade/downgrade behavior and existing-subscriber mapping in staging.
6. Roll out to production with monitoring for checkout and webhook plan synchronization.

Rollback strategy:
- Revert to previous plan config and Stripe mapping release if entitlement checks or checkout mapping fail.
- Preserve user access by falling back to conservative defaults during rollback (no accidental over-entitlement).

## Open Questions

- Should Small Business user limit be set to exactly 3 users or configurable between 2 and 3 with a default cap?
- Should Starter and Solo be strictly limited to one connected Stripe account even if future multi-account support exists?
- Do legacy subscribers get grandfathered access to features not present in the new catalog?
