## Why

Marketing pages disagree with each other and with the product about integration and plan-feature status. The archived change `update-myob-business-and-xero-to-available` already decided MYOB Business and Xero are both "Available" — but only updated `/integrations`; its own design.md flagged the FAQ/docs/homepage as a follow-up risk that was never picked up. Separately, `/features` and the homepage FAQ reference a retired "Business" pricing tier and claim a customer-facing audit trail that doesn't exist, and the marketing `/faq` page still describes the free trial and subscription cancellation as future capabilities even though both have shipped. Prospects and partners are reading inconsistent, sometimes false, claims depending on which page they land on.

## What Changes

- Introduce a single, catalog-style source of truth for integration availability (status: `available` / `early_access` / `planned` per provider) and have every marketing surface read from it instead of hand-written per-page strings.
- Update homepage, `/roadmap`, `/faq`, and marketing `/docs` so MYOB and Xero both show "Available" (matching the already-decided `/integrations` state) and QuickBooks continues to show "Planned" (still 0/23 tasks on `quickbooks-integration`).
- Correct `/features` and the homepage FAQ to name the actual gating tier (Solo for custom sender name, Small Business for verified custom domain/AI rewrite where applicable) instead of the retired "Business" tier name, driven from `lib/subscriptionPlans.ts` (`hasPlanFeature`/`isFeatureImplemented`) rather than hardcoded prose.
- Remove or reword the "Security and Audit Trail" claim on `/features` so it does not promise a customer-facing audit trail UI that does not exist (only internal `EmailLog`/`AdminAuditEvent` logging exists today).
- Rewrite the marketing `/faq` answers for "Is there a free trial?" and "Can I cancel at any time?" to reflect that both already ship (14-day trial, in-account downgrade/cancel flows).

## Capabilities

### New Capabilities
- `marketing-feature-claim-accuracy`: Marketing pages that reference tier-gated features (custom branding, AI rewrite, audit logging) or shipped billing capabilities (trial, cancellation) must name the correct tier and current implementation status, sourced from the plan catalog rather than hand-written copy.

### Modified Capabilities
- `integration-availability-signaling`: Extend the existing availability-state and copy-consistency requirements (currently scoped only to the marketing `/integrations` page) to cover the homepage, `/roadmap`, `/faq`, and marketing `/docs` pages, and require all of these surfaces to derive their status from one shared source instead of independent per-page copy.

## Impact

- **Affected code**: new shared config (e.g. `lib/integrationsCatalog.ts` or similar, following the `lib/planPresentation.ts` pattern); `app/(marketing)/page.tsx`, `app/(marketing)/roadmap/page.tsx`, `app/(marketing)/faq/page.tsx`, `app/(marketing)/docs/page.tsx`, `app/(marketing)/integrations/page.tsx`, `app/(marketing)/features/page.tsx`.
- **No API changes, no schema changes, no billing/auth/RLS changes.**
- **No environment variable changes.**
- Purely presentation/copy plus one new shared lib module; no behavior change to actual integrations, billing, or email logic.
