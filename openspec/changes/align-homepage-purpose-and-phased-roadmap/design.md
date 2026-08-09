## Context

Current public messaging is split across pages:

- `/about` positions PaidSoon as a broader financial control platform
- `/` is still heavily framed as invoice-chasing automation
- `/roadmap` includes live/planned/later lists and SpendLeak sections but does not reflect the requested four-phase plan

This change keeps the implementation lightweight and low risk: content and page-structure updates only, with no backend or schema impact.

## Goals / Non-Goals

**Goals**

- Align homepage purpose statement to the About page direction
- Add the requested Xero/MYOB vs PaidSoon action framing verbatim (with formatting polish only)
- Introduce explicit Phase 1-4 roadmap sections with the provided features
- Reflect a concise now/future roadmap preview on homepage that links to `/roadmap`
- Keep existing visual system and component patterns consistent

**Non-Goals**

- Changing billing, feature gates, or entitlement logic
- Implementing any roadmap features in this change
- Adding new API routes or persistence for roadmap content
- Rewriting the entire homepage layout from scratch

## Decisions

### D1 - Use a canonical messaging block shared conceptually across homepage and roadmap

The phrasing should remain consistent with About page intent:

- Accounting systems record what happened
- PaidSoon surfaces what to do next

Implementation may keep text inline in each page for speed, or extract constants if repetition becomes brittle. Either way, copy should be semantically equivalent across pages.

### D2 - Model roadmap phases as explicit arrays in `roadmap/page.tsx`

Replace or augment existing `plannedNext` / `later` groupings with `phase1`, `phase2`, `phase3`, and `phase4` arrays so the requested order is preserved exactly.

This avoids editorial drift and makes future updates easy.

### D3 - Add a homepage "Now / Future" section that summarizes phased delivery

The homepage should not duplicate full roadmap detail. It should include a compact section with:

- immediate focus (Phase 1)
- near-term expansion (Phases 2-4 summary)
- CTA to full roadmap

This preserves scannability while reinforcing direction.

### D4 - Update metadata to reflect the broader proposition

Homepage metadata should no longer describe PaidSoon only as "automated invoice follow-ups". It should include future-facing cashflow control language while remaining accurate about current product value.

### D5 - Keep changes entirely in marketing routes

Only modify files under `app/(marketing)` unless a small shared marketing component refactor is clearly helpful. No middleware, auth, or API changes are required.

## Content Mapping

### Homepage additions

1. Add purpose-alignment section near hero/solution:
   - Lead statement: "Xero and MYOB tell you what happened. PaidSoon tells you..."
2. Add seven bullet outcomes exactly as requested
3. Add phased now/future preview cards:
   - Phase 1: Promise to pay, Disputes, Customer payment scoring
   - Phase 2-4 summarized with link to full roadmap

### Roadmap restructure

1. Preserve existing "available/live" section where accurate
2. Replace existing generic planned/later lists with explicit phase sections:
   - Phase 1
   - Phase 2
   - Phase 3
   - Phase 4
3. Keep a disclaimer that roadmap timing can change

## Risks / Trade-offs

- **Expectation risk**: Strong forward-looking claims could be interpreted as shipped features.
  - Mitigation: Label all phased items clearly as planned/future and preserve a live-now section.
- **Messaging drift risk**: About/homepage/roadmap can diverge again over time.
  - Mitigation: Reuse consistent phrasing and, if useful, centralize copy constants in a follow-up.
- **Homepage density risk**: Added sections can reduce readability.
  - Mitigation: Keep section concise and push full detail to `/roadmap`.

## Validation Plan

- Verify `/`, `/about`, and `/roadmap` present consistent product-purpose messaging
- Verify all Phase 1-4 items appear on `/roadmap` exactly once and in the requested phases
- Verify homepage includes the requested Xero/MYOB comparison and seven outcome bullets
- Run `npm run lint` and spot-check page rendering locally
