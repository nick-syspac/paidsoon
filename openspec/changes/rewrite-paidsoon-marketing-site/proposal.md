## Why

The current marketing site does not clearly explain PaidSoon as a complete financial control platform across PaidSoon, SpendLeak, CostGuard, and CashPlan. This creates avoidable conversion friction because visitors cannot quickly understand what each module does, how they work together, or why they should start now.

## What Changes

- Rewrite and redesign the full marketing website to position PaidSoon as a financial control platform for Australian small businesses, centered on the distinction: accounting software reports what happened, PaidSoon helps control what happens next.
- Deliver a conversion-focused homepage that can stand alone, with clear module positioning, accounting-vs-control comparison, practical problem framing, pricing preview, verified integrations/security signals, FAQ, and strong CTA flow.
- Create or rewrite dedicated module pages for `/paidsoon`, `/spendleak`, `/costguard`, and `/cashplan`, each with unique problem/outcome narratives, practical workflow explanation, and cross-module linking.
- Create or improve a platform overview page that explains end-to-end flow across the four modules (get paid, stop waste, control costs, plan ahead).
- Rewrite pricing presentation to align exactly with active billing configuration and plan entitlements, with clear customer-fit framing and CTA destinations that match existing signup/billing flows.
- Improve supporting marketing pages (about, contact, integrations, security, FAQ, privacy, terms) for clarity, navigation, and conversion support without altering legal meaning.
- Implement cohesive desktop/mobile navigation that surfaces all four modules and consistent primary/secondary CTA language based on verified product behavior.
- Add complete per-page SEO metadata, technical SEO hygiene (canonical, OG, sitemap/robots/manifest verification), and appropriate structured data where supported by visible content.
- Improve accessibility fundamentals (semantic structure, focus visibility, contrast, mobile menu accessibility, reduced motion handling, alt text) and preserve or improve performance.
- Add analytics events for key conversion actions only through existing analytics abstractions, without introducing a new vendor.

## Capabilities

### New Capabilities
- `marketing-financial-control-platform-site`: Defines requirements for full-funnel marketing information architecture, module positioning pages, conversion pathways, SEO/accessibility baselines, and cohesive navigation/CTA behavior across all major marketing surfaces.

### Modified Capabilities
- `marketing-feature-claim-accuracy`: Expand claim-accuracy requirements from selected pages to the full marketing funnel so module, integration, security, and CTA claims remain implementation-truthful site-wide.
- `subscription-plan-tiers`: Extend pricing-page requirements to enforce plan comparison presentation and module/feature inclusion visibility sourced from the canonical billing configuration.

## Impact

- Affected routes/pages in `app/(marketing)/**` including homepage, module pages, platform overview, pricing, and supporting content pages.
- Affected shared components in `components/marketing/**` and related layout/navigation/footer sections.
- Affected marketing content/data sources in `content/**` and shared presentation utilities in `lib/**` (including pricing/integrations presentation helpers as needed).
- Affected metadata and technical SEO wiring for marketing routes (titles, descriptions, canonical, OG, structured data, sitemap/robots/manifest verification).
- Potential analytics touchpoints for CTA and pricing interactions via existing instrumentation paths.
