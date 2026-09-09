## Context

See proposal.md for the motivation and package strategy. The product already has a canonical subscription catalog, pricing presentation layer, and public marketing pages, but the current public packaging does not capture the four-module platform positioning that PaidSoon is now adopting.

The design constraint is to keep a single subscription model while clarifying plan progression and public-facing packaging. The catalog remains the canonical source of truth, and the marketing UI should consume that catalog rather than hand-author pricing details in multiple places.

## Goals / Non-Goals

**Goals:**
- Align the public pricing ladder with the four-module product story.
- Maintain one platform subscription instead of separate module subscriptions.
- Keep founder pricing intact for beta customers while publishing a clear public launch ladder.
- Make the plan comparison table and marketing copy explicitly reflect SpendLeak, CostGuard, and CashPlan.

**Non-Goals:**
- Building a new billing architecture or creating separate Stripe products for each module.
- Introducing a fifth public business tier or exposing Accountant Partner as a standard customer plan.
- Reworking unrelated billing logic beyond the pricing and entitlement story.

## Decisions

### 1. Keep one platform subscription and model access by tier

The design treats PaidSoon as one product with tiered entitlement depth, not as independent module subscriptions. This avoids pricing sprawl and keeps the value proposition coherent: a lower-tier plan still demonstrates the broader platform while a higher-tier plan unlocks deeper operational control.

Alternative considered: separate subscriptions for SpendLeak, CostGuard, and CashPlan. Rejected because it fragments the product story and creates a less coherent buyer decision.

### 2. Keep the canonical catalog as the source of truth

The pricing catalog should remain the single source of truth for plan names, ordering, prices, and feature gates. Presentation code should not re-encode plan values in multiple places, especially for the pricing cards and comparison table.

This reduces the risk of the homepage, pricing page, and UI copy drifting out of sync. It also makes it easier to keep the public pricing and beta founder pricing separated without duplicated logic.

### 3. Use the current public tiers as the launch ladder, with controlled product-depth rules

The design intentionally treats Essentials as a deliberately limited entry tier, Solo as the first full-control tier, Small Business as the recommended value tier, and Business Pro as the advanced governance tier. This avoids confusing the package ladder with a purely invoice-reminder tool and instead presents a staged financial-control platform.

Alternative considered: expanding the lower-tier product scope too aggressively. Rejected because it would dilute the premium value of the higher tiers and weaken the commercial story.

### 4. Keep Accountant Partner out of public plan selection

Accountant Partner remains a channel-only plan, not an ordinary customer plan. That retains the strategy of a later partner program without creating an unsustainable fifth public tier.

This keeps the marketing flow clean and avoids customer confusion in the pricing layout while preserving a route for partner-specific usage later.

## Risks / Trade-offs

- [Pricing drift between marketing pages and the catalog] → Mitigation: keep plan metadata centralized and enforce tests for ordering, pricing text, and public-plan visibility.
- [Confusing public and beta pricing] → Mitigation: maintain separate pricing entry points and prevent founder pricing from being used as the public-default ladder.
- [Feature claims overstating product maturity] → Mitigation: gate any not-yet-implemented functionality behind stated limitations and ensure comparison copy accurately reflects access rules.
- [Over-broad plan scope in lower tiers] → Mitigation: keep Essentials intentionally limited and make the progression to Solo / Small Business / Business Pro clear.

## Migration Plan

1. Update the canonical plan catalog to the new tier ordering and pricing set.
2. Reconcile product access rules for PaidSoon, SpendLeak, CostGuard, and CashPlan against the four-tier bundle model.
3. Update public pricing cards and comparison-table content to reflect the new packaging and wording.
4. Fix homepage and marketing copy inconsistencies, including invoice-volume phrasing and price formatting.
5. Verify plan ordering, visibility, and feature rules with automated tests and a manual pricing-page review.
6. Keep Accountant Partner hidden from public customer-facing plan selection.

Rollback: revert the canonical pricing catalog and presentation updates together. No product migration is required beyond the pricing metadata and public copy, so rollback is low-risk as long as the public pricing copy is reverted in the same change.
