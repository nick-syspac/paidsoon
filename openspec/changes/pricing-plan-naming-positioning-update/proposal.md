## Why

The public pricing story still presents the middle paid tier under the legacy `Solo` label even though the product positioning has evolved to a broader owner-operated business narrative. This creates a mismatch between the plan catalog, pricing cards, and the broader financial-control platform story, while also risking confusion around the stable internal plan identifier that existing subscriptions depend on.

## What Changes

- Rename the customer-facing label for the stable internal `solo` plan from `Solo` to `Business Control`.
- Update the public pricing narrative for Essentials, Business Control, Small Business, and Business Pro to the required positioning and order.
- Preserve the internal `solo` identifier, Stripe price IDs, billing entitlements, and subscription records without migration.
- Update the shared pricing/presentation layer so customer-facing copy is sourced from the canonical plan catalog instead of duplicated ad hoc labels.

## Capabilities

### New Capabilities
- `subscription-plan-branding`: Defines the public-facing plan naming and positioning rules for the four self-serve pricing tiers while preserving the stable internal `solo` identifier and all billing behavior.

### Modified Capabilities
- `subscription-plan-tiers`: Public plan naming and pricing copy are updated without changing tier keys, Stripe mappings, or entitlement rules.

## Impact

- Canonical plan catalog: `lib/subscriptionPlans.ts`
- Shared presentation helpers: `lib/planPresentation.ts`
- Public pricing page and pricing intent selector: `app/(marketing)/pricing/page.tsx`, `components/pricing/PricingIntentSelector.tsx`
- Customer account and billing UI surfaces: `components/dashboard/UserMenu.tsx`, `components/dashboard/UpgradeBanner.tsx`, `components/settings/*`
- Webhook and checkout logic remain unchanged for Stripe mappings and plan resolution
- Documentation and tests updated to describe the customer-facing label while retaining `solo` as the stable internal ID
