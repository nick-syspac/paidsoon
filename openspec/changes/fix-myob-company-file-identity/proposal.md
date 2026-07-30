## Why

Production logs show the MYOB callback's company-file identification is broken: it treats the callback's `businessId` value as if it were a callable URL (`fetch(`${businessId}/Info`)` throws `ERR_INVALID_URL` because `businessId` is a bare GUID, e.g. `03d16673-d860-426e-a6b7-382ed3cf5cd2`, not a URL), and it falls back to `getOrganisations()` (`GET https://api.myob.com/accountright/`), an endpoint MYOB's own docs mark "Not available online" for cloud/Business company files. This is why connections fail with `org_fetch_failed`/`no_organisations` in production. Separately, production callbacks confirm MYOB already returns both `businessId` and `businessName` directly on the OAuth redirect — so the entire network round-trip this code performs to identify the company file is unnecessary. Fixing this now unblocks real MYOB connections, which is also a prerequisite for the pending sandbox-validation task in `harden-myob-business-go-live`.

## What Changes

- Read `businessId` and `businessName` directly from the MYOB OAuth callback query string as the connection's stable identifier and display name, instead of calling `getOrganisations()`.
- Construct the callable company-file URI (cf_uri) by appending `businessId` to the known online API host (`https://api.myob.com/accountright/{businessId}`), rather than treating `businessId` itself as a usable URL.
- Remove the temporary diagnostic `/Info` probe and the `getOrganisations()`/retry-on-401 call from the callback path for MYOB.
- Define a deterministic fallback display name (derived from `businessId`) for the case where `businessName` is absent from the callback, since it is not documented by MYOB and its presence is only empirically confirmed.
- **BREAKING**: Retire the MYOB multi-company-file selection flow (`app/api/integrations/myob/select-org/route.ts`, `app/dashboard/settings/connections/myob/select-org/page.tsx`, and the `myob_pending_*` cookie handoff) since a single MYOB OAuth grant authorises exactly one `businessId`/company file — there is nothing to pick between.
- **BREAKING**: `AccountingConnection.organisationId` for MYOB changes meaning from a `getOrganisations()`-derived company-file id to the callback-derived cf_uri. Any existing MYOB connections in production (if the flow never succeeded, likely none) will need to reconnect.

## Capabilities

### New Capabilities
- `myob-company-file-identity`: Connect-time resolution of the MYOB company-file identifier and display name directly from the OAuth callback response, without an intermediate company-file-list lookup, including the fallback-naming behavior when `businessName` is absent.

### Modified Capabilities

None. (`harden-myob-business-go-live`'s `myob-business-launch-readiness` capability spec covers related requirements but has not been archived into `openspec/specs/` yet, so there is no canonical spec to modify here. That change's open question and task 1.2 should be reconciled with this change once both land.)

## Impact

- **Affected code**: `app/api/integrations/myob/callback/route.ts` (primary fix), `lib/providers/accounting/myob.ts` (remove/retire `getOrganisations` usage for the connect path, add cf_uri construction helper), `app/api/integrations/myob/select-org/route.ts` and `app/dashboard/settings/connections/myob/select-org/page.tsx` (retire), `prisma/schema.prisma` (update the `organisationId` column comment to reflect the new semantics; no migration needed since it's still a `String`).
- **Affected docs**: `docs/runbooks/myob.md` and `docs/runbooks/myob-sandbox-verification.md` (both currently document the `getOrganisations`/company-file-picker flow and the `org_fetch_failed` triage steps tied to it).
- **Affected tests**: `tests/myob-provider.test.ts` (remove/replace `getOrganisations`-based connect assumptions), plus new coverage for callback parsing of `businessId`/`businessName` and cf_uri construction.
- **Related change**: `openspec/changes/harden-myob-business-go-live` — this change resolves that change's "Open question surfaced during sandbox validation (task 4.1)" and reopens its task 1.2.
- **Operational impact**: Removes the primary cause of MYOB connect failures observed in production; MYOB sandbox validation (task 4.1 of the other change) can proceed once this lands.
