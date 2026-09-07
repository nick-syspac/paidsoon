## 1. Discovery and Source-of-Truth Audit

- [ ] 1.1 Inventory all current marketing routes, shared marketing components, and navigation/footer entry points under `app/(marketing)/**` and `components/marketing/**`.
- [ ] 1.2 Confirm authoritative product claims for modules, integrations, security statements, and CTA flows from code and docs (`lib/subscriptionPlans.ts`, `lib/planPresentation.ts`, `lib/integrationsCatalog.ts`, `docs/DDD.md`, `docs/HLD.md`).
- [ ] 1.3 Document any claim mismatches (pricing, trial wording, integration status, feature availability) and define exact replacements before implementation.

## 2. Information Architecture and Conversion Framework

- [ ] 2.1 Define final marketing IA and navigation model (Product submenu with PaidSoon, SpendLeak, CostGuard, CashPlan, platform overview, pricing, integrations; plus resources, login, primary CTA).
- [ ] 2.2 Define consistent CTA taxonomy and map each CTA to verified existing destinations (`/sign-up`, `/pricing`, `/contact`, billing entry points) including live-mode behavior.
- [ ] 2.3 Define reusable section patterns for hero, comparison, module narrative, workflow, outcomes, FAQ, and closing CTA to avoid per-page duplication.

## 3. Shared Marketing UI Refactor

- [ ] 3.1 Implement/upgrade shared marketing layout primitives and section components in `components/marketing/**` to support consistent storytelling and module accents.
- [ ] 3.2 Implement desktop and mobile navigation behavior with keyboard-accessible controls, visible focus states, and coherent module discovery.
- [ ] 3.3 Implement updated marketing footer with product/company/support/legal navigation and verified internal links.

## 4. Homepage Rewrite

- [ ] 4.1 Rewrite homepage hero with clear platform promise, concise supporting copy, primary CTA, and secondary CTA.
- [ ] 4.2 Implement homepage sections covering four-module summary, accounting-vs-control comparison, daily-problem framing, module deep dives, and platform flow narrative.
- [ ] 4.3 Implement homepage sections for outcomes, integrations status, trust/security statements, pricing preview from canonical plan data, FAQ, and strong closing CTA.

## 5. Module and Platform Pages

- [ ] 5.1 Create or rewrite `/paidsoon` page with module-specific problem framing, workflow, outcomes, cross-module links, and module FAQ/disclaimer.
- [ ] 5.2 Create or rewrite `/spendleak` page with recurring-spend review narrative, workflow, outcomes, cross-module links, and module FAQ/disclaimer.
- [ ] 5.3 Create or rewrite `/costguard` page with active cost-monitoring narrative, workflow, outcomes, SpendLeak differentiation, and module FAQ/disclaimer.
- [ ] 5.4 Create or rewrite `/cashplan` page with forward cash planning narrative, scenario support framing, outcomes, and module FAQ/disclaimer.
- [ ] 5.5 Create or rewrite platform overview page describing data/action flow across all modules and the “get paid, stop waste, control costs, plan ahead” cycle.

## 6. Pricing and Supporting Page Refresh

- [ ] 6.1 Rewrite `/pricing` so plan cards and inclusion comparisons are sourced from canonical plan configuration and accurately reflect checkout/contact paths.
- [ ] 6.2 Refresh supporting pages (`/about`, `/contact`, `/integrations`, `/security`, `/faq`) for clarity, conversion support, and consistent platform positioning while preserving factual accuracy.
- [ ] 6.3 Improve legal-page presentation and navigability (`/privacy`, `/terms`) without changing legal meaning.

## 7. SEO and Structured Data

- [ ] 7.1 Add unique per-page metadata (title, description, canonical, Open Graph) for homepage, module pages, platform page, pricing, and key supporting pages.
- [ ] 7.2 Add structured data where applicable (Organization, SoftwareApplication, FAQPage, BreadcrumbList) only when supported by visible page content.
- [ ] 7.3 Verify and update technical SEO assets/routes (`robots.txt`, sitemap generation, manifest/social image metadata base URL) to match current routes.

## 8. Analytics, Accessibility, and Performance

- [ ] 8.1 Wire conversion-event tracking through existing analytics abstraction for key actions (hero CTA, module page view, pricing view, plan select, signup start, integration click, contact/demo intent).
- [ ] 8.2 Complete accessibility pass for keyboard navigation, semantic landmarks, heading hierarchy, form labeling, focus visibility, contrast, and reduced-motion behavior.
- [ ] 8.3 Complete performance pass (server-first rendering, minimal client JS, image optimization, lazy-loading of non-critical visuals, CLS checks).

## 9. Validation, QA, and Documentation

- [ ] 9.1 Run lint, type-check, automated tests, and production build; resolve regressions introduced by this change.
- [ ] 9.2 Manually validate desktop and mobile rendering for homepage, each module page, platform page, pricing, and supporting pages.
- [ ] 9.3 Verify all primary and secondary CTA destinations, nav/footer links, and cross-module links resolve correctly.
- [ ] 9.4 Update relevant documentation to reflect new marketing architecture and verified messaging/source-of-truth assumptions.
