## Why

PaidSoon already contains a substantial MYOB Business integration surface, but the current state is not yet strong enough to treat MYOB as a supported production invoice source. The remaining gap is launch readiness: the MYOB connection path needs clearer first-sync behavior and operator visibility, and the go-live documentation needs explicit pass/fail gates so release decisions are auditable rather than implicit.

## What Changes

- Harden the MYOB Business connection lifecycle from OAuth initiation through callback, company-file identification, and first successful invoice sync.
- Make MYOB connection health and first-sync outcome explicit in user-facing and admin-facing surfaces so a connected account is distinguishable from a merely authorised one.
- Tighten the MYOB launch contract around connection metadata, sync readiness, and failure handling so support and operations can triage issues without inspecting raw tokens or provider payloads.
- Update environment-variable documentation for MYOB-related setup and validation so production, preview, and local environments have an unambiguous source of truth.
- Add a MYOB go-live checklist with explicit pass/fail criteria for each gate, including sandbox validation, first-sync validation, observability, documentation completeness, and rollout messaging alignment.

## Capabilities

### New Capabilities
- `myob-business-launch-readiness`: Production-ready MYOB Business connection, first-sync, status visibility, and supportability requirements.
- `myob-go-live-runbook`: Operator-facing MYOB launch gates, pass/fail criteria, and environment-variable guidance.

### Modified Capabilities

None.

## Impact

- **Affected code**: `app/api/integrations/myob/**` (including the callback's company-file identification logic and the `select-org` route at `app/api/integrations/myob/select-org/route.ts` and its UI page at `app/dashboard/settings/connections/myob/select-org/page.tsx`), `lib/providers/accounting/myob.ts`, `lib/providers/accounting/sync.ts`, admin resync/visibility routes, and integrations settings UI.
- **Affected docs**: `docs/runbooks/README.md`, go-live runbook material, and any documentation that currently describes MYOB as planned or launch-ready without explicit qualification.
- **Operational impact**: MYOB rollout becomes gated by documented launch criteria instead of inferred readiness.
- **Testing impact**: Requires real MYOB sandbox validation in addition to existing mocked unit coverage.

**Open question surfaced during sandbox validation (task 4.1):** the current callback/`select-org` design assumes a single OAuth grant can reach multiple MYOB company files (mirroring Xero's multi-tenant model) and discovers them via `GET https://api.myob.com/accountright/`. MYOB's granular-scope docs suggest this may not hold — `businessId` is returned directly on the callback query string and MYOB's re-consent flow is described as approving "a single ledger" per authorization. If confirmed, the `select-org` picker may need to be re-scoped or retired rather than merely hardened. Needs sandbox confirmation before design changes are finalized.