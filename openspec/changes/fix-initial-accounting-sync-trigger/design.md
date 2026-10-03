# Design

## Context

See [proposal.md](proposal.md) for motivation. The current code already has one shared accounting sync orchestrator in `lib/providers/accounting/sync.ts`, one shared manual-trigger abstraction in `lib/providers/accounting/triggerSyncNow.ts`, and multiple connection-finalization routes. MYOB callback finalization and Xero organisation-selection finalization already trigger an initial sync, but the single-organisation Xero callback finalizes a connection without doing so. The result is inconsistent freshness and inconsistent first-sync status handling across otherwise equivalent connection flows.

Observed constraints from the implementation:

- MYOB authorizes one company file per grant and supplies `businessId` plus optional `businessName` directly to its callback. Company-file discovery and the MYOB picker were retired; `tests/myob-callback-route.test.ts` explicitly guards against a picker redirect.
- `triggerSyncNow(connectionId, userId)` delegates only when both `RAILWAY_WORKER_URL` and `WORKER_TRIGGER_SECRET` are configured. Otherwise it runs inline. A configured-worker fetch or response failure currently throws before a sync-history row exists; there is no automatic inline fallback on dispatch failure.
- `syncConnection` and the Vercel cron already accept `active`, `pending_first_sync`, and `error`; Xero manual sync currently accepts only `active`, unlike MYOB. Provider `unauthorized` errors revoke connections. Successful or partial syncs promote pending/error connections to active.
- Railway's scheduled dispatcher currently selects only active connections. Changing that schedule or eligibility is outside this change; immediate worker triggers and Vercel cron retries are separate paths.
- Canonical financial records and existing `AccountingSyncRun` fields are sufficient. Historical main-spec references to provider-mapping tables must not cause those retired tables to be restored.

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
- No MYOB picker, company-file discovery request, entitlement changes, new mapping tables, or automatic fallback after a configured-worker failure.

## Decisions

### Use one shared immediate-sync trigger for connection finalization

The Xero single-organisation callback, Xero organisation-selection route, and direct MYOB callback will call `triggerSyncNow(connectionId, user.id)` after their connection transaction commits. Manual Sync now continues to use that same abstraction. Use worker delegation when both worker settings are configured; otherwise run inline. This is configuration-based mode selection, not a fallback on worker failure. Preserve duration caps for inline work and give the Xero single-organisation callback the same inline duration allowance as Xero selection.

Alternative considered: keep calling `syncConnection` directly from callback routes. Rejected because it duplicates execution-mode policy and leaves first-sync behavior easier to drift between providers and callback variants.

### Treat connection finalization as distinct from sync completion

OAuth callback success means credentials and organisation selection succeeded, not that invoice import is already complete. Finalization routes should therefore leave sync outcome reporting to the sync subsystem, which already owns `lastSyncedAt`, sync-run history, and promotion from first-sync state to active or error.

All three finalization paths upsert `status = pending_first_sync` and clear `lastSyncedAt` on reconnection before invoking the shared trigger. Worker acceptance alone does not activate a connection or populate its last-sync timestamp. Keep the existing successful/partial-sync promotion and idempotent invoice ingestion; this change does not add exactly-once queue delivery or redesign the existing running-sync guard.

Alternative considered: continue marking single-step connect flows active immediately on callback success. Rejected because it hides the difference between “connected” and “first import completed,” which is the root inconsistency this change is addressing.

### Preserve MYOB's direct company-file and scope contract

Finalize MYOB from the callback's `businessId`, construct the existing company-file URI, and preserve optional `businessName` fallback, encrypted tokens, granted scopes, and `scope_upgrade_required` redirect behavior. Only the first-sync trigger abstraction changes. There is no MYOB selection route to implement.

Alternative considered: follow the older multi-company-file picker wording. Rejected because it contradicts the current provider contract, the main MYOB identity capability, and existing route tests.

### Record dispatch failures without automatically running inline

Handle worker dispatch failures inside the shared trigger so finalization and manual Sync now follow one policy. A network failure, non-success HTTP response, or invalid acknowledgement is a dispatch failure, not evidence that provider credentials were revoked. A valid acknowledgement has `queued: true` and a non-empty `claimId`.

For a dispatch failure, use `withUserContext(userId, ...)` to verify the connection owner and write one completed `AccountingSyncRun` for that failed dispatch attempt: provider and user from the owned connection, start time from before dispatch, completion time at failure, `status = failed`, zero invoice counters, and a fixed sanitized `worker_dispatch_failed` message. Do not store raw response bodies, tokens, secrets, or arbitrary exception text. Preserve `lastSyncedAt`. Conditionally move a still-pending, never-synced connection to `error`; do not downgrade an active connection or overwrite a concurrent successful sync, revocation, or disconnect. Return the existing failed `SyncResult` shape with sanitized messaging; successful worker and inline result shapes remain unchanged.

Because sync history currently permits authenticated SELECT only, add the minimum RLS write surface needed for this user-initiated failure record: grant `INSERT` on `accounting_sync_runs` to `authenticated` and add an INSERT policy requiring `auth.uid()::text = "userId"`. Do not grant UPDATE or DELETE, and do not permit inserting history owned by another user. This narrowly scoped permission allows the user-context transaction to persist dispatch failures without bypassing RLS.

OAuth and selection routes still return their normal connection-success redirects because authorization and storage succeeded. The settings history exposes dispatch failure and offers retry. If failure-history persistence itself throws, retain best-effort redirect behavior with safe server-side logging; a database outage cannot guarantee durable history and is not grounds to run inline or fabricate a recorded success.

Alternative considered: automatically run inline after dispatch failure. Rejected because the worker may have accepted the job before its acknowledgement was lost, so fallback risks duplicate work and changes the configured execution policy. A failed dispatch record describes acknowledgement failure, not proof that remote execution never started.

### Preserve revoked-credential boundaries and align manual retry eligibility

For non-authentication first-sync failures, preserve the existing `error` transition, unset first-sync timestamp, and Vercel cron retry eligibility. Accept `active`, `pending_first_sync`, and `error` in both provider manual-sync routes after session, ownership, and provider checks. Reject `revoked` and `disconnected` for manual sync and exclude them from cron.

Provider `unauthorized` errors keep the existing `revoked` transition and require a new OAuth grant; they are not automatically retryable. Worker transport/authentication failures never revoke provider credentials. Successful or partial retries retain the existing promotion to active.

Alternative considered: retry every failure indiscriminately. Rejected because revoked credentials need user reauthorization and disconnected connections must remain terminal.

### Present pending, failed, and revoked states accurately

Update `AccountingConnectionsClient` and sync-health diagnostics to distinguish awaiting the first sync from a confirmed running import. A pending connection may be queued or awaiting retry; avoid unconditionally claiming an import is in progress. Translate `worker_dispatch_failed` into safe retry guidance, retain provider/company identity and last successful timestamp, and preserve reconnect guidance for revoked access and incomplete MYOB spend scopes.

### Keep first-sync triggering best-effort at redirect boundaries

Connection finalization still needs to return the user to `/dashboard/settings/connections` even if the first sync cannot complete inline. The design keeps redirect reliability separate from sync success while requiring the sync attempt to be initiated and recorded.

Alternative considered: block callback completion on a guaranteed successful first sync. Rejected because provider latency, worker delegation, and retryable external failures would make the OAuth return path brittle.

## Risks / Trade-offs

- [Risk] Finalized connect flows perform or trigger provider work sooner, which may expose first-sync failures more often during onboarding. -> Mitigation: rely on existing sync-run history, retry eligibility, and first-sync status messaging rather than silently treating the connection as fully active.
- [Risk] Callback paths and manual sync paths could diverge again if they call different abstractions. -> Mitigation: route all immediate first-sync initiation through the shared trigger abstraction.
- [Risk] Worker-backed and inline-backed environments could present slightly different timing in the settings UI. -> Mitigation: specify observable behavior in terms of “first sync is triggered immediately” and “status reflects completion state,” not a specific transport.
- [Risk] A lost acknowledgement can leave both a failed dispatch-history entry and a subsequently successful worker sync. -> Mitigation: identify dispatch errors separately, do not auto-fallback inline, and preserve concurrent sync outcomes when recording the error.
- [Risk] Database failure prevents durable dispatch-failure history. -> Mitigation: log safely and preserve OAuth redirects; no claim of durable recording is made when persistence fails.

## Migration Plan

1. Implement and test the shared trigger's configuration policy, acknowledgement validation, tenant-scoped dispatch-failure recording, and concurrency-safe status update.
2. Route all three finalization paths through that abstraction, using pending-first-sync status for new and reconnected connections; preserve MYOB's direct callback and scope behavior.
3. Align Xero manual retry eligibility with MYOB and test non-authentication retry versus revoked/disconnected rejection. Keep Vercel cron cadence and Railway infrastructure unchanged.
4. Update pending/dispatch-error presentation and diagnostics alongside their regression tests and relevant architecture/runbook documentation. Describe deployment state accurately; do not label unmerged work as shipped.
5. Verify focused route, shared-trigger, actual sync-lifecycle, and presentation tests with mocked external services, TypeScript, lint, strict OpenSpec validation, and RLS isolation for the new sync-history INSERT policy. Do not rely on the existing tests' copied implementations as proof of production behavior.
6. Deploy without a Prisma schema migration. Apply and verify the narrowly scoped RLS grant/policy change in each environment. Rollback is a code and policy revert; already recorded failed dispatch entries remain valid history. Existing worker configuration still selects execution mode.

## Open Questions

None. The user approved preserving direct MYOB finalization, recording retryable worker dispatch failures without inline fallback, and requiring reconnection for revoked provider credentials on 2026-10-03.
