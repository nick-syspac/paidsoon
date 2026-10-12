## Context

See proposal.md for motivation. The current marketing experience is distributed across `app/(marketing)/**`, shared UI in `components/marketing/**`, and supporting presentation/configuration helpers in `lib/**`. Existing specs already enforce key guardrails around claim accuracy, integration availability signaling, live-mode CTA behavior, and canonical plan tiers. The redesign must preserve those truth constraints while upgrading positioning, information architecture, page clarity, and conversion flow.

The codebase uses Next.js App Router with TypeScript strict mode, server-first rendering, and shared plan/integration helpers (`lib/subscriptionPlans.ts`, `lib/planPresentation.ts`, `lib/integrationsCatalog.ts`) as source-of-truth inputs for marketing surfaces. The solution must avoid unsupported claims and route users only to existing auth/billing/contact flows.

## Goals / Non-Goals

**Goals:**
- Deliver a cohesive marketing information architecture that makes all ten product modules discoverable and explains their distinct roles through four customer outcomes, with Owner's Digest presented as cross-module visibility.
- Raise conversion readiness by introducing consistent CTA language, stronger message hierarchy, and repeated decision-point CTAs across major pages.
- Ensure pricing, integrations, and security/operational claims are implementation-truthful and sourced from canonical configuration/helpers.
- Implement page-level SEO metadata and baseline accessibility/performance improvements without adding heavy runtime dependencies.
- Improve maintainability by centralizing reusable marketing sections/composition patterns instead of duplicating ad hoc page markup.

**Non-Goals:**
- Changing legal meaning of policy or terms content.
- Introducing a new analytics vendor or a new billing model.
- Implementing non-marketing product features that are currently scaffolded/planned.
- Changing authenticated dashboard workflows beyond required CTA destination validation.

## Decisions

### Decision 1: Use a content-driven section composition model for marketing pages
- Decision: Build/expand shared marketing section components (hero, proof/positioning blocks, module cards, comparison strips, FAQ sections, CTA bands) and compose pages from reusable server components.
- Rationale: Reduces copy/design drift across homepage, module pages, and platform pages while still allowing module-specific narratives.
- Alternatives considered:
- Keep each page fully bespoke: rejected due to maintenance burden and inconsistent CTA/messaging risk.
- Drive all page content from external CMS/MDX now: rejected for scope/time; no new content platform required for this change.

### Decision 2: Keep truth-sensitive content wired to canonical helpers
- Decision: Any claims about plans, module inclusion, integrations, and contact-led plan flow are rendered from canonical code sources (`lib/subscriptionPlans.ts`, `lib/planPresentation.ts`, `lib/integrationsCatalog.ts`) or explicit static legal copy.
- Rationale: Prevents recurring mismatch between marketing claims and operational behavior.
- Alternatives considered:
- Static handcrafted pricing/integration copy per page: rejected because it is brittle and previously drifted.

### Decision 3: Implement SEO/metadata per route using Next.js metadata APIs
- Decision: Add/refresh route metadata exports for unique titles/descriptions, canonical URLs, and OG data; verify sitemap/robots/manifest consistency with current route inventory.
- Rationale: Avoids global one-size-fits-all metadata and supports module-specific search intent.
- Alternatives considered:
- Single shared metadata template only: rejected because unique page intent is required for SEO and social sharing.

### Decision 4: Prefer server components and lightweight progressive enhancement
- Decision: Keep major marketing pages server-rendered; use minimal client components only for interactions such as mobile nav or lightweight visual behavior.
- Rationale: Preserves performance and reduces hydration cost while maintaining responsive UX.
- Alternatives considered:
- Client-heavy interactive marketing shell: rejected due to avoidable JS cost and complexity.

### Decision 5: Standardize CTA taxonomy and route mapping before copy finalization
- Decision: Define one primary CTA phrase and an allowed set of secondary CTA variants, then map each to existing routes (`/sign-up`, `/pricing`, `/contact`, module pages) based on live-mode and feature availability.
- Rationale: Eliminates inconsistent CTA language and dead-end actions.
- Alternatives considered:
- Let each page choose its own CTA phrase/destination: rejected due to conversion friction and higher audit overhead.

### Decision 6: Treat the homepage as an outcome-led financial-control explanation
- Decision: Use the required central message verbatim in supporting copy, explain FinOps without jargon, and order the page around the visitor's problems and the four outcomes before introducing module names.
- Rationale: The observed homepage already has broad product sections, but currently leads with cash-flow and invoice-reminder wording; this hierarchy makes the platform's wider value immediately legible.
- Alternatives considered:
- Keep invoice reminders as the hero category and explain the platform later: rejected because it misstates the requested product emphasis.

### Decision 7: Use the live signup offer only when live mode is active
- Decision: In live mode, use the consistent primary label “Start your free trial” and route to `/sign-up`; retain a consistent “Request early access” label and `/contact` destination in non-live mode. Use “See how it works” as the secondary CTA to `/how-it-works`.
- Rationale: The public homepage and pricing page reviewed on 2026-10-13 show a 14-day free trial with no credit card required, while the application deliberately changes the signup journey with live mode.
- Alternatives considered:
- Hard-code the trial CTA in all environments: rejected because the pre-launch route does not offer public signup.

## Homepage Copy Draft

This draft is based on the public homepage/pricing pages reviewed on 2026-10-13 and current marketing/product sources. Keep plan-sensitive and mode-sensitive details wired to their sources of truth at implementation. Draft text is not a claim that every listed module is included in every plan.

### SEO

- **Title:** Financial Control Software for Australian Small Businesses
- **Meta description:** Control costs, review recurring spend, follow up overdue invoices and plan cash flow with PaidSoon, financial control software for Australian small businesses.
- **Primary search theme:** financial control software for Australian small businesses.
- **Related language:** small business cash flow, business expense management, cost control software, and FinOps for small business. Use naturally in body copy and internal-link text; do not keyword-stuff.

### 1. Hero

**Eyebrow:** Financial control for Australian small businesses

**H1:** Control spending. Protect cash flow. Make better financial decisions.

**Supporting copy:** PaidSoon helps Australian businesses control spending, protect cash flow and make better financial decisions. Invoice follow-ups are one part of that broader platform. It brings spending, payments and cash-flow information together so you can see what needs attention and decide what to do next.

**Primary CTA (live mode):** Start your free trial → `/sign-up`

**Primary CTA (non-live mode):** Request early access → `/contact`

**Secondary CTA:** See how it works → `/how-it-works`

**Reassurance (live mode):** Try PaidSoon for 14 days. No credit card required. It works alongside supported accounting software; it does not replace it.

### 2. Financial problems PaidSoon helps solve

**H2:** Get a clearer view of the money coming in and going out

**Intro:** FinOps for a small business means bringing spending, payments and cash-flow information together so you can make more informed financial decisions.

- **Recurring costs go unnoticed.** Review recurring spend and potential waste with SpendLeak. → `/spendleak`
- **Costs and commitments are hard to monitor.** Review cost patterns and committed cash with CostGuard and CommitGuard. → `/costguard` and `/commitguard`
- **Invoices become overdue.** Keep follow-ups consistent and see which invoices need attention with InvoiceGuard. → `/invoiceguard`
- **Upcoming cash pressure is hard to judge.** Review runway, obligations and planning information with the available cash-control modules. → `/platform#plan-ahead`

### 3. Four outcomes

**H2:** Four practical ways to take control

- **Control costs.** Review category-level cost movement, known commitments and margin pressure with CostGuard, CommitGuard and MarginGuard. → `/costguard`, `/commitguard`, `/margin-guard`
- **Stop waste.** Review recurring spend and potential waste with SpendLeak, then use Owner's Digest to see important signals alongside the rest of the business. → `/spendleak`, `/owners-digest`
- **Get paid.** Keep overdue invoice follow-ups moving and track deposit requests with InvoiceGuard and DepositGuard. → `/invoiceguard`, `/deposit-guard`
- **Plan ahead.** Review expected cash movement, tax reserves and runway with CashPlan, Tax Buffer and RunwayGuard. → `/cashplan`, `/tax-buffer`, `/runway-guard`

### 4. How it works

**H2:** Start with the financial information you have

1. **Connect or import supported data.** Connect a supported provider or use the import options available for your workflow. Xero, MYOB Business and Stripe Connect are currently listed as available; QuickBooks Online is planned.
2. **Review what needs attention.** Use the modules available to your plan to review invoices, recurring spend, costs, commitments and cash indicators.
3. **Take the next practical step.** Follow up an overdue invoice, review a recurring cost, or use the available planning information to prepare for a cash commitment.

**Link:** See how it works → `/how-it-works`

### 5. Product in action

**H2:** See your financial-control work in context

**Copy:** Bring the issues that need attention into a clearer working view, then open the relevant area to review the detail.

**Visual direction / alt text:** Use a genuine, current PaidSoon dashboard screenshot that visibly demonstrates financial-control context. Use only real, approved or safely anonymised values; do not create sample metrics or imply that a screenshot is a live customer result. Example alt text after confirming the depicted screen: “PaidSoon dashboard showing invoice follow-ups, spend review and cash-control areas.”

### 6. Trust and fit

**H2:** Built to work alongside your accounting software

**Copy:** PaidSoon is for Australian small-business owners who want a practical way to review spending, payments and cash-flow information without replacing their accounting system. Xero, MYOB Business and Stripe Connect are listed as available integrations; check the integrations page for current connection details. QuickBooks Online is planned, not available yet.

**Links:** Integrations → `/integrations`; platform overview → `/platform`; security information → `/security`.

### 7. Pricing pathway

**H2:** Choose a plan for the way you work

**Copy:** Compare current plan prices, invoice limits and module availability before you choose.

**Link:** Compare PaidSoon plans → `/pricing`

### 8. FAQs

- **What is FinOps for a small business?** FinOps is a practical way to bring spending, payments and cash-flow information together, so business owners can see what needs attention and make better-informed decisions.
- **How does PaidSoon help with financial control?** PaidSoon brings together tools for invoice follow-up, recurring-spend review, cost and commitment monitoring, and cash-planning information. The modules available depend on your plan.
- **How does PaidSoon work with accounting software?** It works alongside supported providers rather than replacing them. Xero, MYOB Business and Stripe Connect are currently listed as available; QuickBooks Online is planned. See the integrations page for current details.
- **Does PaidSoon include invoice follow-ups?** Yes. InvoiceGuard is PaidSoon's invoice follow-up capability, with plan-specific limits and features shown on the pricing page.
- **What is involved in getting started?** Create an account during public signup, choose a plan, then connect a supported provider or use an available import option for your workflow. In live mode the trial is 14 days with no credit card required.

### 9. Final CTA

**H2:** Make your next financial decision with a clearer view.

**Copy:** Bring spending, payments and cash-flow information into a more practical routine for your business.

**Primary CTA:** Use the same live-mode-aware wording and destination as the hero.

### Design guidance

- Use a clean, modern visual system with generous whitespace, strong readable type, and one restrained accent colour. Make the financial-control promise the visual focal point, not a dense feature grid.
- Keep the hero concise: text and the two CTAs first, with a genuine product image or dashboard visual beside it on desktop and below it on mobile.
- Present the four outcomes as short, scannable cards with distinct headings, one-sentence benefits, and descriptive links. Follow with a simple numbered three-step workflow and clear section spacing.
- Use high-contrast text, visible keyboard focus, semantic headings, descriptive link labels, and comfortably tappable controls. Stack cards and CTAs cleanly on mobile; avoid horizontal overflow.
- Do not add a sticky mobile CTA unless usability testing confirms it does not cover content, controls, or browser safe areas. Optimise any real screenshot and defer non-critical media to protect page speed and layout stability.

### Internal linking and structured data

- Link descriptive phrases to all ten product areas: `/invoiceguard`, `/deposit-guard`, `/spendleak`, `/owners-digest`, `/costguard`, `/commitguard`, `/margin-guard`, `/cashplan`, `/tax-buffer`, and `/runway-guard`. Also link to `/platform`, `/integrations`, `/pricing`, `/how-it-works`, and `/security` where relevant.
- Keep all meaningful page copy in crawlable HTML. Give the selected real product screenshot accurate alternative text.
- Retain accurate Organization, WebSite and SoftwareApplication structured data where applicable. FAQPage markup may describe visible FAQs but must not be represented as guaranteeing a rich result. Do not add review/rating schema without genuine qualifying evidence.

### Facts to recheck immediately before publication

1. Confirm live-mode state, free-trial duration, card requirement and `/sign-up` behavior; use the early-access copy and `/contact` while public signup is disabled.
2. Confirm the supported connection/import workflow for each data type and the public availability/plan eligibility of each named module; keep QuickBooks labelled planned until shipped.
3. Select and verify a genuine, current dashboard screenshot and confirm that its values are approved or safely anonymised; otherwise omit the visual rather than fabricate it.
4. Recheck plan prices, invoice limits, integration statuses and security statements against current product sources before publishing any detail beyond the linked pages.
5. Verify that all destinations, canonical metadata, indexability, mobile layout, accessibility and page performance remain correct at implementation time.

## Risks / Trade-offs

- [Risk] Large copy and layout changes can introduce claim inaccuracies or stale assumptions. -> Mitigation: enforce source-of-truth mapping for pricing/integrations/feature-state claims and run explicit content verification pass before merge.
- [Risk] Broad navigation and IA changes can break internal links. -> Mitigation: build-time route checks, manual click-through of primary nav/footer links, and page-level QA checklist.
- [Risk] SEO updates can accidentally duplicate titles/descriptions or canonical targets. -> Mitigation: route-by-route metadata checklist and final crawl snapshot review.
- [Risk] Accessibility regressions in custom navigation interactions. -> Mitigation: keyboard walkthrough, visible focus verification, semantic landmarks/headings audit, and reduced-motion support checks.
- [Risk] Reusable component abstraction may over-constrain module-specific storytelling. -> Mitigation: design components with flexible slots and module-specific copy blocks rather than rigid one-template rendering.

## Migration Plan

1. Inventory existing marketing routes/components/content and map old-to-new IA.
2. Introduce/upgrade shared marketing layout primitives and navigation/footer structures.
3. Rewrite homepage and platform overview around the ten modules and four customer outcomes; explain Owner's Digest as a cross-module summary.
4. Implement or rewrite all ten module pages (`/invoiceguard`, `/deposit-guard`, `/spendleak`, `/owners-digest`, `/costguard`, `/commitguard`, `/margin-guard`, `/cashplan`, `/tax-buffer`, `/runway-guard`) with distinct messaging, accurate availability, and cross-links.
5. Rewrite pricing page using canonical plan/inclusion sources and verified CTA routing.
6. Update supporting pages (about/contact/integrations/security/faq/legal presentation where allowed).
7. Add per-route metadata, structured data where applicable, and verify sitemap/robots/manifest behavior.
8. Add analytics event hooks through existing abstraction for key conversion actions.
9. Run lint, typecheck, tests, and production build; fix regressions introduced by the change.
10. Perform manual responsive and keyboard QA on core marketing pages before merge.

Rollback strategy: Revert the change as one feature branch unit if severe conversion, routing, or build regressions occur.

## Open Questions

None.
