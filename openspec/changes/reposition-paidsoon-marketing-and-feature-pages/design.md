# Design

## Context

See proposal.md for motivation and scope. Public marketing copy and module definitions are code-defined. `components/marketing/marketingContent.ts` currently centralises ten modules, with `paidsoon` retained as the invoice capability's internal ID and InvoiceGuard as its display name. `ModulePage` reuses those definitions for dedicated pages; metadata is built by `lib/marketing/seo.ts`, and `app/sitemap.ts` enumerates public routes. Current module destinations include `/invoiceguard`, `/spendleak`, `/costguard`, `/cashplan`, `/deposit-guard`, `/tax-buffer`, `/commitguard`, `/margin-guard`, `/runway-guard`, and `/owners-digest`; `/paidsoon` permanently redirects to `/invoiceguard`. Accountant/bookkeeper information currently lives at `/accountants`, and correctly identifies multi-client tooling as planned. Homepage structured data and route metadata are generated in code. The existing production origin is `https://www.paidsoon.com.au`.

## Goals / Non-Goals

**Goals:**
- Make one catalog the source for display names, canonical paths, module availability, related links, and legacy marketing paths.
- Reuse the existing server-rendered marketing page design for canonical module pages, with unique metadata and verified capability descriptions.
- Route all former module URLs directly to their corresponding canonical destination, including the former `/paidsoon` alias, without altering platform, legal, or authenticated routes.
- Align the homepage, portfolio, nav, pricing, supporting copy, metadata, structured data, and sitemap to the same platform/module distinction.
- Keep the Client Manager offer limited to verified single-client workflows and retain the existing contact enquiry path.

**Non-Goals:**
- Rename internal identifiers, product code, APIs, database fields, permissions, Stripe configuration, or subscription plans.
- Implement multi-client accountant dashboards or other planned capabilities, change billing/trial behavior, or alter platform-wide legal meaning.
- Add an external CMS, new dependency, database migration, or integrations.

## Decisions

1. **Use the shared marketing catalog as the route/name authority.** Add canonical `/features/` paths for existing module definitions and retain old marketing paths only as redirect sources. Keep existing IDs (including `paidsoon`) and plan/feature identifiers stable. Represent Client Manager in public discovery using only the currently verified accountant/bookkeeper workflow; prominently qualify multi-client management and partner-dashboard features as planned. This avoids renaming product internals or inventing availability.

   | Customer-facing name | Canonical path |
   | --- | --- |
   | InvoiceGuard | `/features/invoiceguard` |
   | Unnecessary Spending (SpendLeak) | `/features/unnecessary-spending` |
   | Spending Controls (CostGuard) | `/features/spending-controls` |
   | Cash Flow Planner (CashPlan) | `/features/cash-flow-planner` |
   | Deposits & Upfront Payments (DepositGuard) | `/features/deposits-upfront-payments` |
   | Tax Set-Aside (Tax Buffer) | `/features/tax-set-aside` |
   | Upcoming Bills & Commitments (CommitGuard) | `/features/upcoming-bills-commitments` |
   | Profit Monitor (MarginGuard) | `/features/profit-monitor` |
   | Cash Runway (RunwayGuard) | `/features/cash-runway` |
   | Your Business Snapshot (Owner's Digest) | `/features/business-snapshot` |
   | Client Manager | `/features/client-manager` |

2. **Keep a single rendered page per canonical module URL.** Use the existing shared module-page presentation and metadata helper for catalog-backed modules. Add static route parameters or equivalent static routes for the descriptive slugs so each canonical page has meaningful initial HTML and unique metadata. Render Client Manager from its verified accountant content and shared page conventions, rather than forcing planned multi-client behavior into existing product logic. Keep `/features` as the portfolio overview and `/platform` as the platform overview.

3. **Implement permanent redirects from the discovered old public paths directly to their final canonical routes.** Use Next.js server-side permanent redirects (308) and avoid intermediate destinations. Redirect `/paidsoon` and `/invoiceguard` directly to `/features/invoiceguard`; redirect `/spendleak`, `/costguard`, `/cashplan`, `/deposit-guard`, `/tax-buffer`, `/commitguard`, `/margin-guard`, `/runway-guard`, `/owners-digest`, and `/accountants` directly to their matching canonical paths in the table. Preserve query strings as supported by Next.js and test representative query-bearing requests. Do not add catch-all redirects that could capture `/`, `/platform`, legal, pricing, or authenticated application paths.

4. **Centralise metadata and sitemap route generation on canonical paths.** Continue using `buildMarketingMetadata` with unique descriptive titles and descriptions; resolve relative metadata paths against the verified production origin so canonical and Open Graph URLs are absolute. Keep redirects out of `PUBLIC_MARKETING_ROUTES` and include every canonical module route once in the sitemap. Update visible FAQs, JSON-LD, image descriptions, and social image references only where the displayed content changes; preserve the existing PaidSoon Organization, WebSite, and SoftwareApplication identity. Keep FAQ structured data matched to visible answers and do not add unsubstantiated offers or claims.

5. **Update public copy through a contextual review, not a global brand substitution.** Replace PaidSoon only when it names the invoice-follow-up module, and replace the old “Invoice Chasing” label with InvoiceGuard. Preserve PaidSoon for the platform, company, plan names, billing, and legal content. Explain FinOps in plain English; use the four requested pillars; keep the hero focused on the platform and use “Explore the features” for its secondary destination. Show a trial CTA only when the existing live-mode configuration makes the trial available; otherwise preserve the current early-access/contact conversion path.

6. **Constrain public claims to observed product behavior.** InvoiceGuard may describe automated reminders, promise-to-pay tracking, and pausing follow-ups during disputes, with no payment guarantee. Existing module definitions, plan catalog, access helpers, and route content remain the authority for other module claims and availability. For Client Manager, describe only per-client invoice workflows as available; keep unified multi-client management, debtor dashboard, and client onboarding tooling marked as planned. Do not add testimonials, savings figures, or new integration/security claims.

## Risks / Trade-offs

- [Stale link or incomplete redirect inventory] → Search source, content, shared navigation and tests for every discovered former path; directly redirect only the exact routes verified during discovery and smoke-test each source/destination pair.
- [Redirect chains, loops, or query loss] → Route every legacy source to its final canonical path, never to another legacy path; test status, `Location`, and query behavior.
- [PaidSoon brand accidentally replaced or internal behavior changed] → Restrict copy changes to public marketing surfaces, preserve internal IDs, and review `PaidSoon` matches in context; inspect the application and billing diff for unintended changes.
- [SEO metadata and sitemap disagree] → Generate canonical module URLs and sitemap entries from the same canonical route data, use the production origin, and assert that redirect sources are absent from the sitemap.
- [Client Manager appears more complete than it is] → Keep per-client availability separate from planned multi-client capabilities and preserve contact-only action.
- [Marketing content is external to the repository] → Discovery found code-native marketing sources and no external CMS integration; confirm deployment does not separately publish a managed copy before release.

## Migration Plan

1. Update the shared marketing route/name data and render the canonical descriptive feature pages, including Client Manager's bounded, truthful content.
2. Add direct permanent redirects for every discovered prior route and update internal references before release; preserve unrelated routes.
3. Refresh metadata, canonical/social URLs, structured data, and sitemap entries together with visible copy.
4. Run focused route/redirect tests, lint, type-check, automated tests, and production build. Smoke-test every canonical route and redirect source, verify metadata and sitemap host/path agreement, and review mobile/desktop rendering.
5. Deploy atomically so redirects and canonical pages are available together. If rollback is required, restore the previous routes/catalog and remove the new redirects in the same release; no data migration or billing rollback is needed.

## Open Questions

None. Repository discovery found the production origin and the existing accountant enquiry destination; the external CMS check is limited to deployment confirmation because no CMS source is present in this repository.