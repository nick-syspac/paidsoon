## Context

See proposal.md for motivation. The current marketing experience is distributed across `app/(marketing)/**`, shared UI in `components/marketing/**`, and supporting presentation/configuration helpers in `lib/**`. Existing specs already enforce key guardrails around claim accuracy, integration availability signaling, live-mode CTA behavior, and canonical plan tiers. The redesign must preserve those truth constraints while upgrading positioning, information architecture, page clarity, and conversion flow.

The codebase uses Next.js App Router with TypeScript strict mode, server-first rendering, and shared plan/integration helpers (`lib/subscriptionPlans.ts`, `lib/planPresentation.ts`, `lib/integrationsCatalog.ts`) as source-of-truth inputs for marketing surfaces. The solution must avoid unsupported claims and route users only to existing auth/billing/contact flows.

## Goals / Non-Goals

**Goals:**
- Deliver a cohesive marketing information architecture that clearly explains the four-module platform and each module's distinct role.
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

## Risks / Trade-offs

- [Risk] Large copy and layout changes can introduce claim inaccuracies or stale assumptions. -> Mitigation: enforce source-of-truth mapping for pricing/integrations/feature-state claims and run explicit content verification pass before merge.
- [Risk] Broad navigation and IA changes can break internal links. -> Mitigation: build-time route checks, manual click-through of primary nav/footer links, and page-level QA checklist.
- [Risk] SEO updates can accidentally duplicate titles/descriptions or canonical targets. -> Mitigation: route-by-route metadata checklist and final crawl snapshot review.
- [Risk] Accessibility regressions in custom navigation interactions. -> Mitigation: keyboard walkthrough, visible focus verification, semantic landmarks/headings audit, and reduced-motion support checks.
- [Risk] Reusable component abstraction may over-constrain module-specific storytelling. -> Mitigation: design components with flexible slots and module-specific copy blocks rather than rigid one-template rendering.

## Migration Plan

1. Inventory existing marketing routes/components/content and map old-to-new IA.
2. Introduce/upgrade shared marketing layout primitives and navigation/footer structures.
3. Rewrite homepage and platform overview around the four-module control narrative.
4. Implement or rewrite module pages (`/paidsoon`, `/spendleak`, `/costguard`, `/cashplan`) with distinct messaging and cross-links.
5. Rewrite pricing page using canonical plan/inclusion sources and verified CTA routing.
6. Update supporting pages (about/contact/integrations/security/faq/legal presentation where allowed).
7. Add per-route metadata, structured data where applicable, and verify sitemap/robots/manifest behavior.
8. Add analytics event hooks through existing abstraction for key conversion actions.
9. Run lint, typecheck, tests, and production build; fix regressions introduced by the change.
10. Perform manual responsive and keyboard QA on core marketing pages before merge.

Rollback strategy: Revert the change as one feature branch unit if severe conversion, routing, or build regressions occur.

## Open Questions

None.
