## Context

See proposal.md for motivation.

Current behavior already supports `paymentUrl` at multiple layers: Stripe normalization maps `hosted_invoice_url` to `paymentUrl`, CSV/XLSX import maps `payment_url` to canonical invoice storage, and reminder rendering interpolates `{{paymentLink}}` and `{{paymentLinkText}}` from template vars.

The risk is reliability drift across boundaries: ingestion can produce null/empty/whitespace variants, canonical-to-reminder flattening can omit fields if query shapes drift, and template rendering can emit malformed CTA output if URL values are not normalized consistently.

## Goals / Non-Goals

**Goals:**
- Guarantee end-to-end preservation of `paymentUrl` from ingestion to reminder send.
- Guarantee reminder templates render a payment CTA only when a usable URL is present.
- Keep behavior deterministic for Stripe and CSV/XLSX invoice sources.
- Add regression tests at boundary points where silent dropping is most likely.

**Non-Goals:**
- Redesign reminder template language or token syntax.
- Introduce new invoice data fields or schema migrations.
- Add provider-specific CTA copy differences.
- Backfill historical invoices that already stored null/empty payment URLs.

## Decisions

1. Normalize payment URL values at ingestion and template-var boundaries.
- Decision: treat `null`, empty string, and whitespace-only values as no URL.
- Rationale: requirement semantics are based on URL usability, not raw string presence.
- Alternatives considered:
  - Normalize only in templates: rejected because malformed values can persist and confuse downstream consumers.
  - Normalize only in ingestion: rejected because existing stored data and future call-site drift could still pass unusable strings into rendering.

2. Preserve canonical pass-through contract in reminder send paths.
- Decision: keep `financialInvoice.paymentUrl -> flattenCanonicalInvoice().paymentUrl -> buildTemplateVars().paymentUrl` as explicit, tested contract.
- Rationale: this is the narrowest shared path used by both cron and per-invoice reminder workers.
- Alternatives considered:
  - Read payment URL directly from provider metadata at send time: rejected because canonical invoice is the source of truth and metadata shape varies by source.

3. Render CTA via existing template tokens with strict conditional output.
- Decision: continue using `paymentLink` for HTML and `paymentLinkText` for plain text, but guard link generation on normalized URL presence.
- Rationale: preserves existing user-authored template compatibility and avoids introducing new tokens.
- Alternatives considered:
  - Add separate boolean token like `hasPaymentLink`: rejected as unnecessary complexity for current requirement.

4. Add focused tests instead of broad refactors.
- Decision: add or adjust tests around email rendering and source mapping boundaries only.
- Rationale: behavior change is narrow; focused tests catch regressions without destabilizing unrelated reminder logic.
- Alternatives considered:
  - End-to-end integration test through cron route: deferred due to high mocking overhead and lower signal for this targeted fix.

## Risks / Trade-offs

- [Risk] Existing rows with malformed non-empty URLs (e.g. whitespace or non-https) may not produce usable CTAs. -> Mitigation: normalize/trim at render boundary and keep import validation warnings for bad URLs.
- [Risk] Custom user templates might not include `{{paymentLink}}`/`{{paymentLinkText}}`. -> Mitigation: this change guarantees token values; template authoring remains user-controlled and documented.
- [Risk] Multiple reminder entry points (cron and per-invoice job) could diverge later. -> Mitigation: keep shared `sendFollowUpEmail` contract as single tested rendering path.

## Migration Plan

- No schema migration required.
- Deploy as standard app release.
- Rollback: revert code changes in normalization/render pass-through and associated tests if unexpected template regressions appear.

## Open Questions

- None.
