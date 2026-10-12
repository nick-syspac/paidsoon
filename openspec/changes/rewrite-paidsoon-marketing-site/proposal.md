## Why

The current homepage discusses a broad financial-control platform, but its opening still leads with cash flow and invoice reminders and spreads the wider value across a long page. Visitors should understand immediately that PaidSoon helps Australian businesses control spending, protect cash flow, and make better financial decisions; invoice follow-ups are one supporting capability, not the whole product. A focused, evidence-based homepage story is needed to make that position clear and give visitors an accurate next step.

## What Changes

- Rewrite and redesign the full marketing website to position PaidSoon as a financial control platform for Australian small businesses, centered on the distinction: accounting software reports what happened, PaidSoon helps control what happens next.
- Make the homepage the clearest expression of the position: “PaidSoon helps Australian businesses control spending, protect cash flow and make better financial decisions. Invoice follow-ups are one part of that broader platform.” Explain FinOps in plain English and lead with broader financial control rather than invoice reminders.
- Treat all ten product modules as part of the platform: InvoiceGuard (`/invoiceguard`), DepositGuard (`/deposit-guard`), SpendLeak (`/spendleak`), Owner's Digest (`/owners-digest`), CostGuard (`/costguard`), CommitGuard (`/commitguard`), MarginGuard (`/margin-guard`), CashPlan (`/cashplan`), Tax Buffer (`/tax-buffer`), and RunwayGuard (`/runway-guard`). Organize the homepage around the four customer outcomes, while making the relevant modules discoverable and explaining Owner's Digest as cross-module visibility.
- Deliver concise, publish-ready homepage copy in a scannable order: hero, customer problems, four outcomes, three-step workflow, genuine product visual, trust and fit, pricing route, FAQs, and final CTA. Include search metadata, internal-link destinations for the relevant modules, design guidance, and a short list of facts to recheck before publication.
- Use one primary CTA label and destination for the active signup mode, with “See how it works” as the secondary CTA. In the currently observed live signup mode, the primary action is “Start your free trial” to `/sign-up`; preserve the existing early-access fallback when live mode is disabled.
- Keep pricing, integration, security, and feature availability statements tied to canonical configuration or verified implementation; do not invent testimonials, savings, guarantees, ratings, or unsupported product metrics.
- Create or rewrite dedicated marketing pages for all ten product modules, each with accurate module-specific problem/outcome narratives, practical workflow explanation, availability/plan qualification where needed, and cross-module linking.
- Create or improve a platform overview page that explains how the ten modules support four visitor outcomes (get paid, stop waste, control costs, plan ahead) and how Owner's Digest summarizes signals across modules.
- Rewrite pricing presentation to align exactly with active billing configuration and plan entitlements, with clear customer-fit framing and CTA destinations that match existing signup/billing flows.
- Improve supporting marketing pages (about, contact, integrations, security, FAQ, privacy, terms) for clarity, navigation, and conversion support without altering legal meaning.
- Implement cohesive desktop/mobile navigation that surfaces all ten product modules and consistent primary/secondary CTA language based on verified product behavior.
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

- Affected routes/pages in `app/(marketing)/**` including homepage, module pages, platform overview, pricing, and supporting content pages; homepage copy and layout are the immediate focus of this refinement.
- Affected shared components in `components/marketing/**` and related layout/navigation/footer sections.
- Affected marketing content/data sources in `content/**` and shared presentation utilities in `lib/**` (including pricing/integrations presentation helpers as needed).
- Affected metadata and technical SEO wiring for marketing routes (titles, descriptions, canonical, OG, structured data, sitemap/robots/manifest verification).
- Potential analytics touchpoints for CTA and pricing interactions via existing instrumentation paths.
