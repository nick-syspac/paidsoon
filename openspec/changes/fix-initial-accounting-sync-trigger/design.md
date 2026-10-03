# Design

## Context

See [proposal.md](proposal.md) for motivation. The current code already has one shared accounting sync orchestrator in `lib/providers/accounting/sync.ts`, one shared manual-trigger abstraction in `lib/providers/accounting/triggerSyncNow.ts`, and multiple connection-finalization routes. MYOB callback finalization and Xero organisation-selection finalization already trigger an initial sync, but the single-organisation Xero callback finalizes a connection without doing so. The result is inconsistent freshness and inconsistent first-sync status handling across otherwise equivalent connection flows.

## Goals / Non-Goals

**Goals:**

- Make every finalized accounting connection flow trigger the first sync consistently.
- Keep the first-sync behavior aligned with the existing shared sync orchestration and worker delegation path.
- Preserve current retry surfaces: daily cron for automated follow-up and Sync now for explicit user-triggered retry.
- Keep status transitions and last-sync timestamps driven by the sync subsystem rather than by OAuth callback assumptions.

**Non-Goals:**

- No new provider integrations.
- No schema or RLS changes.
- No redesign of cron cadence, worker infrastructure, or sync payload mapping.
- No changes to the user-facing settings route structure beyond clarifying first-sync state.

## Decisions

### Use one shared immediate-sync trigger for connection finalization

Finalized connection flows should delegate to the same trigger abstraction used by manual Sync now, rather than having each callback route choose between direct `syncConnection` calls and alternative behavior. This keeps execution-mode decisions in one place, including the current worker-vs-inline fallback.

Alternative considered: keep calling `syncConnection` directly from callback routes. Rejected because it duplicates execution-mode policy and leaves first-sync behavior easier to drift between providers and callback variants.

### Treat connection finalization as distinct from sync completion

OAuth callback success means credentials and organisation selection succeeded, not that invoice import is already complete. Finalization routes should therefore leave sync outcome reporting to the sync subsystem, which already owns `lastSyncedAt`, sync-run history, and promotion from first-sync state to active or error.

Alternative considered: continue marking single-step connect flows active immediately on callback success. Rejected because it hides the difference between “connected” and “first import completed,” which is the root inconsistency this change is addressing.

### Keep first-sync triggering best-effort at redirect boundaries

Connection finalization still needs to return the user to `/dashboard/settings/connections` even if the first sync cannot complete inline. The design keeps redirect reliability separate from sync success while requiring the sync attempt to be initiated and recorded.

Alternative considered: block callback completion on a guaranteed successful first sync. Rejected because provider latency, worker delegation, and retryable external failures would make the OAuth return path brittle.

## Risks / Trade-offs

- [Risk] Finalized connect flows perform or trigger provider work sooner, which may expose first-sync failures more often during onboarding. -> Mitigation: rely on existing sync-run history, retry eligibility, and first-sync status messaging rather than silently treating the connection as fully active.
- [Risk] Callback paths and manual sync paths could diverge again if they call different abstractions. -> Mitigation: route all immediate first-sync initiation through the shared trigger abstraction.
- [Risk] Worker-backed and inline-backed environments could present slightly different timing in the settings UI. -> Mitigation: specify observable behavior in terms of “first sync is triggered immediately” and “status reflects completion state,” not a specific transport.

## Migration Plan

1. Update the finalized Xero single-organisation callback path to trigger the first sync through the shared immediate-sync abstraction.
2. Align finalized connection status handling so new or reconnected accounting connections are not treated as fully synced before the first attempt completes.
3. Keep cron and manual Sync now behavior unchanged except for consuming the same retryable states already used by the sync subsystem.
4. Validate with focused route and sync-behavior tests covering single-org Xero, Xero organisation selection, and MYOB callback finalization.

## Open Questions

None.
