## Why

PaidSoon is already structured as a single platform with four module layers, but the public pricing currently understates that value and still leaves the plan story in a partially old configuration. The site presents a lower-cost bundle than the platform is now positioned to deliver, and it also mixes naming, feature boundaries, and comparison claims that do not align with the real product story. This change re-aligns the public package structure to the four-module platform while retaining one subscription model and separating beta founder pricing from the public launch pricing.

## What Changes

- Establish a single PaidSoon subscription with four public plans: Essentials, Solo, Small Business, and Business Pro.
- Keep SpendLeak, CostGuard, and CashPlan under the same platform subscription rather than creating separate paid add-ons.
- Set public launch pricing at $15 / $29 / $69 / $149 per month, GST-inclusive, while preserving beta founder pricing for existing customers.
- Rescope the plans so Essentials is intentionally limited, Solo is the first full-control tier, Small Business is the recommended value plan, and Business Pro is the governance-focused plan.
- Fix pricing-page inconsistencies: naming drift, inconsistent invoice-volume wording, pricing text rendering, plan comparison gaps, and the mismatch between homepage claims and pricing-card claims.
- Keep Accountant Partner as a separate channel-only offering rather than turning it into a fifth public business plan.

## Capabilities

### New Capabilities

- None. This change refines an existing product package, not a brand-new platform feature set.

### Modified Capabilities

- `subscription-plan-tiers`: public package ordering, plan names, price points, inclusion of SpendLeak/CostGuard/CashPlan under the same subscription, feature bands, and public-vs-contact-only visibility rules.

## Impact

**Pricing and feature catalog**
- `lib/subscriptionPlans.ts` — canonical tier ordering, public plan list, feature gates, and pricing metadata.
- `lib/planPresentation.ts` — plan copy, comparison rows, and usage/performance summaries exposed to marketing surfaces.

**Customer-facing pages**
- `app/(marketing)/pricing/page.tsx` — public plan cards and comparison table.
- `app/(marketing)/page.tsx` and related marketing/home content — homepage pricing and module claims.
- `components/marketing/MarketingNav.tsx` — product navigation where plan names or product-group labels are surfaced.

**Billing and entitlements**
- Stripe price mappings and env variables for the public tier set.
- Any gate logic that checks module access or plan caps for SpendLeak, CostGuard, and CashPlan.

**Documentation and tests**
- `docs/DDD.md`, `docs/HLD.md`, and pricing/runbook docs.
- plan regression tests for public plan ordering, feature access, and upgrade recommendations.
