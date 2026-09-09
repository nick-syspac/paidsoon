## 1. Shared module catalog

- [x] 1.1 Audit the current public marketing module inventory against the implemented module inventory and confirm which modules are publicly marketable in this change.
- [x] 1.2 Expand the shared marketing content model to represent the full public module portfolio, including route, order, status/copy fields, and related-module metadata.
- [x] 1.3 Add any lightweight presentation helpers needed to derive public module and plan-summary copy from canonical product data instead of page-local hard-coded lists.

## 2. Shared marketing discovery surfaces

- [x] 2.1 Refactor marketing navigation, footer, and any shared product-link groups to render from the shared public module catalog.
- [x] 2.2 Update the homepage module/platform sections so they present the expanded module portfolio and keep live-mode CTA behavior unchanged.
- [x] 2.3 Update the platform and product-discovery pages to present the full public module set with truthful live-versus-planned messaging.

## 3. Module destination pages

- [x] 3.1 Identify which existing module pages can be reused versus which new dedicated module routes must be added for CommitGuard, Owner's Digest, Tax Buffer, MarginGuard, and RunwayGuard.
- [x] 3.2 Implement or refactor a shared module-page composition pattern that supports module-specific positioning, workflow, outcomes, and related-module links.
- [x] 3.3 Create or rewrite the required module destination pages so each public module has dedicated marketing coverage and cross-links back into the portfolio.

## 4. Pricing and claim accuracy

- [x] 4.1 Update pricing and plan-comparison surfaces to describe module availability and plan fit from the canonical subscription plan catalog and entitlement logic.
- [x] 4.2 Review expanded marketing copy for accuracy against implemented customer-facing behavior, especially for partially implemented or contact-only capabilities adjacent to the new modules.
- [x] 4.3 Align metadata, structured copy, and internal links so the expanded portfolio does not introduce stale tier names, broken routes, or contradictory module claims.

## 5. Validation

- [x] 5.1 Run focused lint or typecheck validation for the touched marketing files.
- [x] 5.2 Verify key marketing routes and cross-links for the expanded module portfolio, including homepage, platform overview, pricing, and each public module destination.
- [x] 5.3 Confirm OpenSpec artifacts validate cleanly for the change before implementation handoff.
