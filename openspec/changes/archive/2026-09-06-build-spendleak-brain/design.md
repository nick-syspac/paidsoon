## Context

PaidSoon already has canonical financial read models and a SpendLeak dashboard shell, but the spend-side brain itself is missing. The existing code can display persisted findings, yet it does not reliably ingest spend data, detect opportunities, or generate grounded summaries. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- Build a deterministic spend-side processing pipeline on top of the existing financial data model
- Keep provider systems read-only and preserve source provenance end to end
- Produce explainable findings with stable identity so repeated syncs do not create duplicates
- Generate owner-facing summaries only from persisted findings and evidence

**Non-Goals:**
- Replacing accounting systems or becoming a bookkeeping source of truth
- Introducing a separate service, queue, or microservice boundary for SpendLeak
- Designing new user-facing dashboard layouts beyond the existing SpendLeak and overview consumers
- Adding a general event bus or `financial_opportunity` aggregate in this change

## Decisions

1. Use the existing accounting sync cadence as the trigger for spend-side refresh instead of introducing a second scheduler.
   - Rationale: it keeps the operational model simple and reuses the already-hardened connection lifecycle.
   - Alternative considered: a separate spend-only job. Rejected because it adds coordination overhead without a product gain at this stage.

2. Make detectors deterministic and mostly pure over persisted data.
   - Rationale: SpendLeak needs explainability, stable regression tests, and predictable updates.
   - Alternative considered: LLM-led detection. Rejected because it would be harder to debug, harder to bound, and more likely to invent unsupported findings.

3. Persist findings with stable tenant/type/subject identity and update them in place.
   - Rationale: the UI, summaries, and lifecycle controls all expect a current view of each opportunity rather than an append-only event stream.
   - Alternative considered: append-only findings history as the primary store. Rejected because it would require a separate aggregation layer for every consumer.

4. Generate AI summaries from persisted findings and evidence bundles only.
   - Rationale: the summary layer should narrate what the deterministic engine already proved, not re-derive or hallucinate it from raw provider data.
   - Alternative considered: prompt the model with live provider records. Rejected because it would weaken grounding and create a second source of truth.

5. Keep the change inside the existing modular monolith.
   - Rationale: the current app and deployment model already support the necessary refresh and read paths; a new service boundary would not reduce complexity here.
   - Alternative considered: split SpendLeak into a separate backend. Rejected as premature.

## Risks / Trade-offs

- [Provider API shape variance] → Use provider-specific mapping adapters and fixture-backed tests before enabling broad rollout.
- [False positives from deterministic heuristics] → Keep findings explainable, add thresholded rules, and allow lifecycle suppression of noisy items.
- [Stale summaries] → Surface freshness metadata and treat stale or partial syncs as a first-class state instead of pretending data is current.
- [AI summary drift] → Restrict the model to persisted findings plus evidence, and fail back to a plain deterministic summary when grounding is weak.
- [More sync work per connection] → Keep the refresh incremental and idempotent so repeated runs are cheap and safe.

## Migration Plan

1. Extend provider sync handling so spend-side data can be ingested without changing provider systems.
2. Add deterministic detectors and persist findings with stable keys.
3. Introduce the grounded summary layer on top of persisted findings.
4. Verify the change with focused tests, then enable the new SpendLeak brain paths for supported connections.
5. If rollout needs to be reversed, disable the spend-side refresh phase and summary consumers while leaving persisted data intact.