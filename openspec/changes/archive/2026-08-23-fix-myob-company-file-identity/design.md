## Context

`app/api/integrations/myob/callback/route.ts` currently identifies the connected MYOB company file by calling `provider.getOrganisations(accessToken)`, which hits `GET https://api.myob.com/accountright/` — MYOB's own docs mark this endpoint "Not available online" (it enumerates local/network AccountRight desktop files, not MYOB Business cloud company files). A temporary diagnostic added alongside it probes `GET {businessId}/Info`, which crashes with `ERR_INVALID_URL` because `businessId` (confirmed in production logs, e.g. `03d16673-d860-426e-a6b7-382ed3cf5cd2`) is a bare GUID, not a URL.

Production callback logs also confirm the query string already includes `businessId` **and** `businessName` directly (`[code, scope, state, businessId, businessName]`) — MYOB's authentication docs state the user authorises "a single ledger" per grant and that `businessId` is meant to be used as the cf_uri for subsequent API calls. Empirically it's a bare id, not a full URI, so the real cf_uri must be constructed by combining it with the known online API host that `lib/providers/accounting/myob.ts` already defines (`MYOB_COMPANY_FILE_LIST_URL = "https://api.myob.com/accountright/"`).

Downstream, `getInvoices`/`getContacts` in `lib/providers/accounting/myob.ts` already assume `params.organisationId` is a full callable cf_uri (they do `new URL(`${params.organisationId}/Contact/Customer`)` etc.) — so the fix must produce a value in that exact shape, not a bare id.

This is a focused fix to the MYOB connect path only. It does not change Xero (which has a genuine multi-tenant model where `getOrganisations()` is the correct and only way to discover reachable organisations) or the sync orchestrator's contract with providers.

## Goals / Non-Goals

**Goals:**
- Make MYOB connect actually succeed by identifying the company file from data MYOB already provides on the callback, with no extra network round-trip.
- Store `organisationId` as a callable cf_uri consistent with what `getInvoices`/`getContacts` already expect.
- Store a readable `organisationName`, with a deterministic fallback when `businessName` is absent.
- Remove the now-provably-wrong `getOrganisations()`/`/Info`-based identification path and the multi-file selection UI it fed, since MYOB Business issues exactly one `businessId` per OAuth grant.

**Non-Goals:**
- Changing the Xero callback/select-org flow (genuinely multi-tenant, unaffected by this).
- Changing the `AccountingProvider` interface's `getOrganisations` method signature (Xero still needs and uses it) — MYOB's implementation stays for interface compliance but is no longer called from the connect path.
- Reworking `lib/providers/accounting/sync.ts`'s refresh/retry behavior (the existing `withTokenPropagationRetry` logic for post-refresh 401s is unrelated and untouched).
- Backfilling/migrating any existing MYOB `AccountingConnection` rows — production evidence suggests the flow has not produced a working connection to date, so there is nothing to migrate.

## Decisions

### D1. Read `businessId`/`businessName` directly from the callback query string; stop calling `getOrganisations()` in the connect path
The callback SHALL treat `businessId` and `businessName` as authoritative, already-provided identification data and SHALL NOT call `provider.getOrganisations()` or any other network endpoint to discover the company file.

**Why:** MYOB Business issues one `businessId` per grant and returns it (plus a name) directly on the callback — there is nothing left to discover. The endpoint the old code called for discovery is documented as unavailable for online company files, which is why it always failed.

**Alternative considered:** Keep `getOrganisations()` as a fallback when `businessId` is absent. Rejected — the endpoint doesn't work for cloud files at all, so falling back to it would just reproduce the current failure mode; better to fail closed with a clear `missing_params`-style redirect if `businessId` is ever absent.

### D2. Construct the cf_uri as `${MYOB_COMPANY_FILE_LIST_URL}${businessId}`, not `businessId` itself
`organisationId` SHALL be stored as `https://api.myob.com/accountright/{businessId}` (reusing the existing `MYOB_COMPANY_FILE_LIST_URL` constant as the prefix), matching the shape `getInvoices`/`getContacts` already require (`${cfUri}/Sale/Invoice/...`, `${organisationId}/Contact/Customer`).

**Why:** MYOB's docs call `businessId` "the cf_uri" loosely, but production evidence shows it's a bare GUID. The online API is single-host (`api.myob.com`), unlike desktop AccountRight's per-file regional hosts (`ar1.api.myob.com`, etc.), so simple concatenation is safe here specifically because this is the online/Business path, not the desktop path.

**Alternative considered:** Store `businessId` as-is and have each provider method prefix it at call time. Rejected — `organisationId` is meant to be an opaque, directly-usable identifier per the existing `AccountingProvider` contract (Xero already stores the tenant id verbatim, itself already a directly-usable header value); constructing the full cf_uri once at connect time keeps `sync.ts`/`myob.ts` call sites unchanged.

### D3. Retire the MYOB multi-company-file selection flow
`app/api/integrations/myob/select-org/route.ts`, `app/dashboard/settings/connections/myob/select-org/page.tsx`, and the `myob_pending_*` cookie handoff SHALL be removed. The callback SHALL always resolve directly to a single `AccountingConnection` upsert (mirroring the existing "exactly one company file" branch already in the callback), with no cookie/redirect-to-picker branch.

**Why:** A MYOB Business OAuth grant maps to exactly one `businessId` — there is no list to pick from. Keeping the picker as dead/unreachable code would misrepresent MYOB's actual model to future readers and continue to reference the wrong endpoint in its own code path if ever exercised.

**Alternative considered:** Leave the picker in place but unreachable, in case MYOB later supports multi-file grants. Rejected — no such multi-file grant model is documented today; if MYOB adds one, it should be designed against that real model rather than kept as speculative dead code (which also still target's the "not available online" endpoint internally).

### D4. Deterministic fallback name when `businessName` is absent
If `businessName` is missing or blank on the callback, `organisationName` SHALL fall back to a fixed, recognizable label derived from `businessId` (e.g. `MYOB Company File {businessId}`), not a blocking follow-up API call.

**Why:** `businessName` is not documented by MYOB (only empirically observed), so it must be treated as optional. A synchronous, network-free fallback keeps the connect path fast and simple; a follow-up "resolve a nicer name" call can be added later if `businessName` turns out to be frequently absent in practice, without blocking this fix.

**Alternative considered:** Call a follow-up MYOB endpoint to resolve a name when `businessName` is missing. Rejected for now — reintroduces the exact class of network/timing complexity this change removes, for a display-only field; revisit only if real-world absence turns out to be common.

## Risks / Trade-offs

- **`businessName` presence is unverified against MYOB's docs** → Mitigate with D4's deterministic fallback; log (without PII beyond the already-non-sensitive `businessId`) when the fallback path is taken, so we can see how often it triggers.
- **Removing `select-org` is a breaking change for any in-flight pending-selection cookies** → Low risk in practice: those cookies are short-lived (30 min) and no evidence of a working MYOB connection exists in production yet; acceptable to drop.
- **`organisationId` semantics change** → Any pre-existing MYOB `AccountingConnection` rows (if the old broken flow ever wrote one) would have a stale/incorrect `organisationId`. Since sync already fails for such rows (per D2's analysis, the old value from `getOrganisations()` should actually have been a correct full `Uri`, but that endpoint never succeeds online), affected users will see the connection in an error state and can simply reconnect.
- **Single-host cf_uri assumption (D2) is specific to the online/Business API** → Explicitly non-goal to touch desktop AccountRight; if PaidSoon ever supports desktop AccountRight files, this assumption would need revisiting (out of scope here).

## Migration Plan

1. Update the callback route to use `businessId`/`businessName` directly (D1, D2, D4); remove the diagnostic `/Info` probe and the `getOrganisations()` call from the connect path.
2. Remove the `select-org` route/page and cookie handoff (D3); update `docs/runbooks/myob.md` and `docs/runbooks/myob-sandbox-verification.md` to drop references to the company-file picker and the `org_fetch_failed`/`getOrganisations` triage steps, replacing them with triage guidance for the new flow.
3. Update `tests/myob-provider.test.ts` and add callback-level tests for the new identification logic (see tasks.md).
4. Update the `organisationId` column comment in `prisma/schema.prisma` to describe the new MYOB semantics (no migration needed — still a `String` column).
5. Re-run real MYOB sandbox validation (the pending task 4.1 in `harden-myob-business-go-live`) against the fixed flow.
6. Rollback: revert the callback route change; no data migration to undo since no working MYOB connections are expected to exist yet.

## Open Questions

- How often is `businessName` actually absent in practice? Not answerable without more production connect attempts — tracked via the D4 fallback-path logging.
- Should `harden-myob-business-go-live`'s task 1.2 and open question be explicitly closed out with a cross-reference once this change lands, or left for that change's own follow-up pass?
