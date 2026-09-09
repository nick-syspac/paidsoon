## Why

The current marketing site still presents PaidSoon as a four-module platform, while the product surface and entitlement model now include newer FinOps modules such as CommitGuard, Owner's Digest, Tax Buffer, MarginGuard, and RunwayGuard. That mismatch makes the public site incomplete, weakens positioning, and risks forcing prospects to infer module coverage from scattered pages instead of seeing a coherent portfolio.

## What Changes

- Redesign the core marketing funnel so homepage, navigation, platform overview, pricing, and product pages present PaidSoon as the full current module portfolio rather than only PaidSoon, SpendLeak, CostGuard, and CashPlan.
- Introduce a shared public module catalog and page model that defines which modules are public, how they are ordered, what positioning copy each uses, and how module pages cross-link without duplicating hand-written lists across the site.
- Add or rewrite dedicated marketing coverage for the newer implemented modules: CommitGuard, Owner's Digest, Tax Buffer, MarginGuard, and RunwayGuard, while preserving truthful status treatment for any still-planned capabilities.
- Update supporting marketing surfaces such as navigation menus, platform comparison sections, product index routes, homepage module sections, and footer/product-link groupings to include the expanded module set.
- Refresh pricing and plan-comparison messaging so public module and feature inclusion claims are sourced from the canonical plan catalog and current entitlement behavior, not stale copy.
- Preserve existing live-mode CTA behavior, legal page meaning, and integration/status truthfulness while improving marketing structure, SEO metadata, and internal linking for the expanded module portfolio.

## Capabilities

### New Capabilities
- `marketing-module-portfolio-pages`: Define the shared public module catalog, required marketing routes/sections for the full module portfolio, cross-linking behavior, and truthful treatment of live versus planned modules across the marketing site.

### Modified Capabilities
- `marketing-feature-claim-accuracy`: Extend marketing truthfulness requirements so public module indexes, module cards, and portfolio comparisons include implemented modules accurately and do not omit or overstate newer FinOps modules.
- `subscription-plan-tiers`: Extend public pricing and plan-comparison requirements so marketing surfaces can describe module availability and plan fit using the canonical plan catalog and entitlement model.

## Impact

- Affected routes in `app/(marketing)/**`, especially the homepage, `/platform`, `/pricing`, `/product`, and module-specific marketing pages.
- Affected shared marketing components and content definitions in `components/marketing/**` and any supporting presentation helpers in `lib/**`.
- Affected metadata/internal-linking surfaces such as navigation, footer links, sitemap-visible pages, and per-page SEO copy.
- Affected OpenSpec baselines for marketing truthfulness and pricing presentation so future marketing edits stay anchored to the actual module and entitlement inventory.
