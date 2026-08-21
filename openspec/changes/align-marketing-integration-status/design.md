## Context

See proposal.md for motivation. `lib/subscriptionPlans.ts` + `lib/planPresentation.ts` already solved this exact class of drift for plan/feature copy on `/pricing` by centralizing catalog data and having the page read from it (`getPublicPlans`, `hasPlanFeature`, `isFeatureImplemented`, `planHighlights`). No equivalent exists for integration/provider status — `app/(marketing)/page.tsx`, `/integrations`, `/roadmap`, `/faq`, and marketing `/docs` each hard-code their own per-provider status strings, which is exactly how they drifted independently after the archived `update-myob-business-and-xero-to-available` change updated only `/integrations`.

## Goals / Non-Goals

**Goals:**
- One shared, typed source of truth for per-provider integration availability (`available` / `early_access` / `planned`), consumed by every marketing surface that mentions integration status.
- Tier-gated feature prose on `/features` and the homepage FAQ sourced from `lib/subscriptionPlans.ts` (`hasPlanFeature`, `isFeatureImplemented`) rather than literal tier-name strings, so a future plan/catalog change can't silently re-introduce this bug.
- Corrected, one-time copy fixes for the `/faq` trial/cancellation answers and the audit-trail claim (these are static facts, not tier-driven, so no shared config needed).

**Non-Goals:**
- No change to actual integration behavior, OAuth flows, or sync logic (`lib/providers/accounting/*` is untouched).
- No change to `lib/subscriptionPlans.ts` catalog data itself — this change only makes marketing copy read the existing catalog correctly.
- No new API routes or database changes.
- Not attempting full data-driven prose generation for every marketing sentence — only the specific claims identified in the proposal (integration status, AI rewrite/custom branding tier, audit trail, trial, cancellation).

## Decisions

### D1. New `lib/integrationsCatalog.ts` module, modeled on `lib/planPresentation.ts`
Decision: Add a small catalog file exporting a `Record<ProviderId, { name, status, description }>` for `stripe`, `xero`, `myob`, `quickbooks`, plus a shared `STATUS_BADGE_STYLES`/label helper. Marketing pages import from it instead of declaring their own arrays.

Rationale: This mirrors the exact pattern that already prevents drift for plan features (`lib/subscriptionPlans.ts` + `lib/planPresentation.ts` consumed by `/pricing`). The archived `update-myob-business-and-xero-to-available` change explicitly considered and deferred this ("Introduce a shared availability config in lib: rejected for this change because it increases scope... without immediate functional benefit") and flagged it as the natural follow-up — this change is that follow-up.

Alternatives considered:
- Leave each page's static array in place and manually sync copy across five files: rejected — this is the exact failure mode being fixed, and has already drifted twice.
- Compute availability dynamically from `AccountingProvider` implementations or DB state at request time: rejected — availability here is a marketing/business decision (as shown by the archived change explicitly deciding MYOB is "Available" as a product-messaging call, not a mechanical readiness check), not something to infer from code structure at runtime.

### D2. `/features` and homepage FAQ read tier gates from `lib/subscriptionPlans.ts` directly
Decision: Replace hardcoded "Business plan" strings with logic that reads `hasPlanFeature(tier, feature)` for `ai_rewrite`, `custom_sender_name`, `verified_from_domain` and renders the lowest tier name where each is `true`, reusing `PLAN_ORDER` to find it.

Rationale: Directly closes the drift risk the retired "Business" tier name demonstrates — if a future change moves `ai_rewrite` to a different tier, this prose updates automatically instead of requiring a follow-up marketing edit that may be missed (as happened here).

Alternatives considered:
- Just fix the literal string to "Solo" / "Small Business" once: simpler, but reintroduces the same drift risk if tiers change again — rejected given this is precisely the second time tier-name drift has been found on this page.

### D3. Audit trail, free trial, and cancellation answers are corrected as static copy, not catalog-driven
Decision: These are one-off factual corrections (an existing feature vs. not, a shipped date vs. not) rather than tier-gated feature flags, so they're fixed as plain copy edits referencing the actual shipped behavior (14-day trial, in-app downgrade/cancel, internal-only event logging).

Rationale: There's no catalog entry to drive these from — introducing one for a handful of static facts would be over-engineering for this change's scope.

## Risks / Trade-offs

- [Risk] `quickbooks-integration` (currently 0/23 tasks) ships before this change's QuickBooks "Planned" copy is revisited. -> Mitigation: the shared catalog makes flipping QuickBooks to `available` a one-line change instead of a repeat of this audit.
- [Risk] Introducing `hasPlanFeature`-driven prose on `/features` could produce awkward sentences if a feature is enabled on a non-contiguous set of tiers. -> Mitigation: keep the helper scoped to "name the lowest tier with this feature true," which matches how every current feature is actually gated (monotonic by tier).

## Migration Plan

1. Add `lib/integrationsCatalog.ts` with the four providers' status/copy.
2. Update `/integrations` to read from it (verifying no visual/copy regression from the already-decided Available states).
3. Update homepage, `/roadmap`, `/faq`, marketing `/docs` to read from the same catalog.
4. Update `/features` and homepage FAQ tier-gated claims to derive from `lib/subscriptionPlans.ts`.
5. Correct the `/features` audit-trail claim and the `/faq` trial/cancellation answers as static copy.
6. Run lint/typecheck; no test suite changes expected since these are marketing pages with no existing tests.
7. Rollback: revert the copy/config commits; no data or schema migration involved.
