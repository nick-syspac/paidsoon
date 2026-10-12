## 1. Discovery and Source-of-Truth Audit

- [x] 1.1 Inventory all current marketing routes, shared marketing components, and navigation/footer entry points under `app/(marketing)/**` and `components/marketing/**`.
- [x] 1.2 Confirm authoritative product claims for modules, integrations, security statements, and CTA flows from code and docs (`lib/subscriptionPlans.ts`, `lib/planPresentation.ts`, `lib/integrationsCatalog.ts`, `docs/DDD.md`, `docs/HLD.md`).
- [x] 1.3 Document any claim mismatches (pricing, trial wording, integration status, feature availability) and define exact replacements before implementation.

## 2. Information Architecture and Conversion Framework

- [x] 2.1 Define final marketing IA and navigation model (Product submenu with all ten product modules, platform overview, pricing, integrations; plus resources, login, primary CTA).
- [x] 2.2 Define consistent CTA taxonomy and map each CTA to verified existing destinations (`/sign-up`, `/pricing`, `/contact`, billing entry points) including live-mode behavior.
- [x] 2.3 Define reusable section patterns for hero, comparison, module narrative, workflow, outcomes, FAQ, and closing CTA to avoid per-page duplication.

## 3. Shared Marketing UI Refactor

- [x] 3.1 Implement/upgrade shared marketing layout primitives and section components in `components/marketing/**` to support consistent storytelling and module accents.
- [x] 3.2 Implement desktop and mobile navigation behavior with keyboard-accessible controls, visible focus states, and coherent discovery of all ten product modules.
- [x] 3.3 Implement updated marketing footer with product/company/support/legal navigation and verified internal links.

## 4. Homepage Rewrite

- [x] 4.1 Rewrite homepage hero with clear platform promise, concise supporting copy, primary CTA, and secondary CTA.
- [x] 4.2 Implement homepage sections covering four-outcome summary, accounting-vs-control comparison, daily-problem framing, module deep dives, and platform flow narrative.
- [x] 4.3 Implement homepage sections for outcomes, integrations status, trust/security statements, pricing preview from canonical plan data, FAQ, and strong closing CTA.

## 5. Module and Platform Pages

- [x] 5.1 Create or rewrite the canonical InvoiceGuard `/invoiceguard` page with module-specific problem framing, workflow, outcomes, cross-module links, and module FAQ/disclaimer.
- [x] 5.2 Create or rewrite `/spendleak` page with recurring-spend review narrative, workflow, outcomes, cross-module links, and module FAQ/disclaimer.
- [x] 5.3 Create or rewrite `/costguard` page with active cost-monitoring narrative, workflow, outcomes, SpendLeak differentiation, and module FAQ/disclaimer.
- [x] 5.4 Create or rewrite `/cashplan` page with forward cash planning narrative, scenario support framing, outcomes, and module FAQ/disclaimer.
- [x] 5.5 Create or rewrite platform overview page describing data/action flow across all ten modules and the “get paid, stop waste, control costs, plan ahead” cycle.
- [x] 5.6 Review and update the existing DepositGuard, Owner's Digest, CommitGuard, MarginGuard, Tax Buffer, and RunwayGuard marketing pages so module-specific claims, plan availability, and cross-module links are accurate and consistent with the platform narrative.

## 6. Pricing and Supporting Page Refresh

- [x] 6.1 Rewrite `/pricing` so plan cards and inclusion comparisons are sourced from canonical plan configuration and accurately reflect checkout/contact paths.
- [x] 6.2 Refresh supporting pages (`/about`, `/contact`, `/integrations`, `/security`, `/faq`) for clarity, conversion support, and consistent platform positioning while preserving factual accuracy.
- [x] 6.3 Improve legal-page presentation and navigability (`/privacy`, `/terms`) without changing legal meaning.

## 7. SEO and Structured Data

- [x] 7.1 Add unique per-page metadata (title, description, canonical, Open Graph) for homepage, module pages, platform page, pricing, and key supporting pages.
- [x] 7.2 Add structured data where applicable (Organization, SoftwareApplication, FAQPage, BreadcrumbList) only when supported by visible page content.
- [x] 7.3 Verify and update technical SEO assets/routes (`robots.txt`, sitemap generation, manifest/social image metadata base URL) to match current routes.

## 8. Analytics, Accessibility, and Performance

- [x] 8.1 Wire conversion-event tracking through existing analytics abstraction for key actions (hero CTA, module page view, pricing view, plan select, signup start, integration click, contact/demo intent).
- [ ] 8.2 Complete accessibility pass for keyboard navigation, semantic landmarks, heading hierarchy, form labeling, focus visibility, contrast, and reduced-motion behavior.
- [ ] 8.3 Complete performance pass (server-first rendering, minimal client JS, image optimization, lazy-loading of non-critical visuals, CLS checks).

## 9. Validation, QA, and Documentation

- [x] 9.1 Run lint, type-check, automated tests, and production build; resolve regressions introduced by this change.
- [x] 9.2 Manually validate desktop and mobile rendering for homepage, each module page, platform page, pricing, and supporting pages. Browser QA covered 40 sitemap routes for response status and horizontal overflow at 390px and 1440px, plus unique metadata/heading checks on 21 core and supporting pages.
- [x] 9.3 Verify all primary and secondary CTA destinations, nav/footer links, and cross-module links resolve correctly. Smoke-tested 38 unique internal routes linked from the homepage and module pages; corrected the homepage plan-ahead link to the platform section's actual anchor.
- [x] 9.4 Update relevant documentation to reflect new marketing architecture and verified messaging/source-of-truth assumptions.

## 10. Homepage Positioning Refresh

- [x] 10.1 Apply the publish-ready homepage draft in `design.md`, leading with broader financial control and the required central message rather than invoice reminders.
- [x] 10.2 Validate every capability, integration, plan-availability and trial statement against current product sources; retain mode-aware primary CTA wording and destinations.
- [x] 10.3 Update homepage title, description, visible FAQs, internal links, image alt text and structured data to match the approved copy and visible page content.
- [x] 10.4 Use a genuine current dashboard visual with approved/anonymised data, or omit it until one is verified; do not fabricate metrics or customer proof. No genuine current dashboard screenshot was available, so none is shown.
- [x] 10.5 Validate the final homepage at mobile and desktop sizes, including keyboard/screen-reader operation, CTA tap targets, sticky CTA overlap, canonical URL and indexability. Verified one H1, main/footer landmarks, keyboard-visible menu focus, mobile module navigation, 48px hero CTA height, no sticky CTA, production canonical, and sitemap inclusion.
- [x] 10.6 Ensure homepage and platform overview link to all ten modules, group InvoiceGuard/DepositGuard under getting paid, SpendLeak under waste review, CostGuard/CommitGuard/MarginGuard under cost control, CashPlan/Tax Buffer/RunwayGuard under planning ahead, and Owner's Digest as cross-module visibility.
- [x] 10.7 Review module navigation and existing marketing pages for all ten routes; verify each page's capability, integration, and plan-availability copy against current implementation rather than implying identical availability.
