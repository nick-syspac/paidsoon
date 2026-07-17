## 1. Callback Route Fix

- [x] 1.1 Remove the temporary diagnostic `/Info` probe and the `getOrganisationsWithRetry`/`getOrganisations()` call from `app/api/integrations/myob/callback/route.ts`.
- [x] 1.2 Read `businessId` and `businessName` directly from the callback `searchParams`; redirect with a diagnostic error code (e.g. `missing_params`) if `businessId` is absent.
- [x] 1.3 Construct `organisationId` as `${MYOB_COMPANY_FILE_LIST_URL}${businessId}` (export/import the existing constant from `lib/providers/accounting/myob.ts` rather than duplicating the host string).
- [x] 1.4 Resolve `organisationName` from `businessName` when present/non-blank, otherwise use a deterministic fallback label derived from `businessId`.
- [x] 1.5 Collapse the callback to always take the single-connection upsert path (no multi-file branch, no pending cookie) and keep the existing inline first-sync call (`syncConnection`) after upsert.

## 2. Retire Multi-File Selection Flow

- [x] 2.1 Delete `app/api/integrations/myob/select-org/route.ts`.
- [x] 2.2 Delete `app/dashboard/settings/connections/myob/select-org/page.tsx` (and its directory if now empty).
- [x] 2.3 Remove any links/references to the MYOB select-org page from the connections settings UI, if present.

## 3. Provider Code and Schema Comments

- [x] 3.1 Export `MYOB_COMPANY_FILE_LIST_URL` (or an equivalent helper) from `lib/providers/accounting/myob.ts` for use by the callback route.
- [x] 3.2 Update the `getOrganisations()` doc comment in `lib/providers/accounting/myob.ts` to note it is retained for `AccountingProvider` interface compliance but is no longer called from the MYOB connect path.
- [x] 3.3 Update the `organisationId` column comment in `prisma/schema.prisma` to describe the new MYOB semantics (constructed cf_uri from `businessId`, not a `getOrganisations()`-derived value).

## 4. Tests

- [x] 4.1 Update `tests/myob-provider.test.ts` to remove any connect-flow assumptions that depended on `getOrganisations()` being called during connect (keep its own direct unit tests for the method itself, since it remains part of the interface).
- [x] 4.2 Add tests covering the callback's `businessId`/`businessName` parsing, `organisationId` construction, and the `businessName`-absent fallback-name behavior.
- [x] 4.3 Add/update a test confirming the callback no longer redirects to a select-org page under any circumstance.
- [x] 4.4 Run `npm run test` and confirm all MYOB-related tests pass.

## 5. Documentation

- [x] 5.1 Update `docs/runbooks/myob.md` to remove the `org_fetch_failed`/company-file-picker triage guidance and describe the new `businessId`/`businessName` based connect flow.
- [x] 5.2 Update `docs/runbooks/myob-sandbox-verification.md` to reflect the new connect flow and drop references to `getOrganisations` during connect.
- [x] 5.3 Update `docs/DDD.md`'s MYOB callback API route entry if its described behavior has changed.

## 6. Validation

- [x] 6.1 Cross-reference this change with `openspec/changes/harden-myob-business-go-live` (resolves its open question; reopen/close its task 1.2 as appropriate once this lands).
- [ ] 6.2 Re-run real MYOB sandbox validation against the fixed callback flow (feeds into `harden-myob-business-go-live` task 4.1).
