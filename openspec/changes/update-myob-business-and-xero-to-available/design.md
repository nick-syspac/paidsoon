## Context

See proposal.md for motivation. The integrations marketing page currently uses static card metadata with status labels and descriptive copy that still present MYOB Business as early access and Xero as planned. The request is to align this surface with current support by marking both integrations as available while preserving existing page structure and navigation behavior.

## Goals / Non-Goals

**Goals:**
- Update the integrations presentation so MYOB Business and Xero are both rendered as available.
- Ensure badge labels and card descriptions are consistent with an available state.
- Keep the change narrowly scoped to user-visible integration availability messaging.

**Non-Goals:**
- No OAuth, sync, token, or provider implementation changes.
- No billing/feature-gate policy changes.
- No redesign of integration card layout or CTA mechanics.

## Decisions

### D1. Update static integration metadata at the source component
Decision: Modify the integrations page data structure that defines provider card content so status values and copy for MYOB Business and Xero both represent available.

Rationale: The current page is content-driven via static metadata. Updating the source card definitions is the smallest and safest approach, minimizing regressions and keeping behavior deterministic for static rendering.

Alternatives considered:
- Introduce a shared availability config in lib: rejected for this change because it increases scope and coupling without immediate functional benefit.
- Add dynamic availability from backend/API: rejected because runtime status computation is unnecessary for the requested copy-level update.

### D2. Preserve other integration states unchanged
Decision: Leave Stripe Connect and QuickBooks Online status/copy untouched.

Rationale: The request explicitly targets MYOB Business and Xero. Isolating edits to those two cards avoids accidental messaging drift for other providers.

Alternatives considered:
- Re-audit and update all integration statuses across marketing docs/pages in the same change: deferred to a broader content consistency change if needed.

## Risks / Trade-offs

- [Risk] Availability wording may become inconsistent across other marketing surfaces (FAQ, docs, release notes). -> Mitigation: scope tasks to include a quick copy-consistency pass for obvious first-order references and log follow-up if broader updates are needed.
- [Risk] Future provider readiness changes could require repeated manual edits. -> Mitigation: keep updates localized and clearly documented in this change so a later centralization effort can build from it.

## Migration Plan

1. Update integration card status and descriptive copy for MYOB Business and Xero on the marketing integrations page.
2. Validate page rendering in local dev and ensure badges read Available for both cards.
3. Run lint/tests targeted to changed files as appropriate.
4. Rollback strategy: revert the content edits if messaging must be withdrawn.