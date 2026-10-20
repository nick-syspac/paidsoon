# CommitGuard shared-development SQL attempt — stopped

Report date: 2026-10-20 (local). Observations below use UTC.
**STOPPED / NO ARTIFACT EXECUTION / NO COMMIT CONFIRMED.**

## Authorization and scope

The user authorized only the existing CommitGuard supplemental CHECK artifact
and targeted CommitGuard policies on the preflight shared-development target
(project reference `rtnjcvjqimnavghmrhlx`). Production, CashPlan policies, digest
remediation, canonical/unrelated SQL, migrations and scheduler activation were
excluded. Connection configuration came from local environment files through
the canonical migration adapter, using its session-mode `DIRECT_URL` on port
5432. No credential or connection URL is included here.

## Completed read-only preflight

At **2026-10-19T23:36:10.625Z**, the read-only transaction passed and was rolled
back normally:

| Check | Actual result |
| --- | --- |
| Adapter target and database/session identity | Matched authorized project/pooler; database and owner session `postgres` |
| Migration ledger | 56 entries; zero unfinished, non-rolled-back migrations |
| Required migration | One successful active entry; checksum matched source |
| Supplemental CHECKs | All 23 expected names absent |
| Target tables | Four owned by `postgres`; RLS and FORCE RLS disabled |
| Existing target policies | Zero, including unknown policies |
| Effective client privileges | Zero table/column privileges for `anon` and `authenticated` |
| Client role safety | Neither role superuser/BYPASSRLS; no effective inherited superuser/BYPASSRLS role |
| Database writes | Zero |

## Atomic attempt and stop

The subsequent attempt was designed to repeat preflight under bounded locks,
capture public catalogs/ACLs and server-side aggregate data hashes, and then
execute both artifacts inside one owner transaction. Only the asserted exact
outer `BEGIN;` and `COMMIT;` lines of the CHECK artifact would be removed in
memory; neither source artifact was edited. Intended bounds were a five-second
lock timeout, 30-second statement timeout and 60-second idle-in-transaction
timeout.

The connection emitted an **unhandled `pg.Client` error, `ETIMEDOUT`**, and the
Node process exited with code 1. No before-evidence checkpoint was emitted.
That checkpoint precedes the artifact execution call, so neither artifact nor
`COMMIT` was sent by this attempt. The exact failing query/phase was not captured
because the client error event terminated the process outside the query catch.
The normal rollback handler therefore did not confirm a server-side rollback.
Connection termination should abort an open transaction, but that outcome and
lock release were **not independently verified**. No retry or workaround was
attempted, consistent with the user's stop-on-any-error instruction.

Stop/source recheck observation: **2026-10-19T23:54:27Z**.

| Requested verification | Actual outcome |
| --- | --- |
| Artifacts executed / commits confirmed | 0 / 0 |
| Database connection errors | 1 (`ETIMEDOUT`); exact attempt query count unavailable |
| Persisted before catalogs/data hashes | Not obtained; no completed checkpoint |
| Post-application 23 validated CHECKs / four RLS tables / ten policies | Not reached; not certified |
| Exact grant allowlists / protected work fields | Not reached; not certified |
| Raw authenticated safe zero-row SELECTs | Not reached |
| Random-identity foreign-row count probes | Not reached |
| Before/after unrelated ACL/schema/data preservation | Not reached; not certified |
| Financial seed rows / mutation canaries | None issued |
| HTTP acceptance | Not performed |

No financial row values were output. The preflight's metadata result is not a
substitute for the incomplete atomic attempt's before/after evidence. Do not
treat this report as successful deployment or assume the last observed state
remains current without a new authorized inspection.

## Source fingerprints

SHA-256 values matched before and after the stopped attempt:

| Artifact | SHA-256 |
| --- | --- |
| [Supplemental CHECKs](../../prisma/commitguard-constraints.sql) | `5b5bdca23ce63a1e25b0c6ffc639c6dab49de5571011d1d0258221954c24b013` |
| [Targeted CommitGuard policies](../../prisma/rls-commitguard-policies.sql) | `79d883a530670dd95de5a69396f9c627f6b9a5687fee76d39fe553f5a6f35d68` |
| [Prerequisite migration](../../prisma/migrations/20261018111014_fix_commitguard_cash_protection_workflows/migration.sql) | `37d9b04ac63a1d53175c246aca7478dec1fe2163b5e908e406ab9ed843ec968e` |

Only this audit report was added. SQL artifacts, task checkboxes and the
user-owned event implementation were not edited. No Git commit was made.
CashPlan policies remain unapplied by this operation; digest and scheduler
remain outside scope. The dashboard is **not certified fixed**. A new approved
attempt must first re-establish target state and transaction/lock cleanup, then
complete atomic application and verification; HTTP acceptance remains separate.

## Separately authorized single bounded retry — TLS blocked

The user subsequently authorized **one retry**, restricted to the same
shared-development project and pooler. This section appends that outcome; it
does not replace or reinterpret the earlier `ETIMEDOUT` attempt.

Retry started at **2026-10-19T23:58:09.265Z** and ended at
**2026-10-19T23:58:09.367Z** (102 ms). The sole connection attempt failed in
the `connect` phase with **`SELF_SIGNED_CERT_IN_CHAIN`**. Certificate
verification was enabled (`rejectUnauthorized: true`). No insecure TLS
fallback, reconnect, second retry, or session termination was attempted.

### Local checks and configured bounds

- Loaded local environment files through the existing environment-file loader and resolved the canonical migration adapter in `migration` mode.
- Asserted project `rtnjcvjqimnavghmrhlx`, pooler `aws-1-ap-southeast-2.pooler.supabase.com`, session port `5432`, the expected project-qualified owner connection identity, database name, and empty URL query. These are **local configuration assertions**, not a verified server identity; the TLS handshake did not complete.
- Re-read all three source artifacts and matched their full SHA-256 values against the fingerprints above, including the prerequisite migration.
- Asserted exactly 23 unique supplemental constraint names and exactly one standalone outer `BEGIN;` / `COMMIT;` pair. Removal of that pair was in memory only; no SQL source was edited or sent.
- Configured connection timeout **10 seconds**, statement timeout **15 seconds**, lock timeout **5 seconds**, idle-in-transaction timeout **30 seconds**, and an overall **90-second** hard deadline. Server session settings were not verified because connection establishment failed.
- Attached a client error-event handler before connecting and provided bounded rollback/connection cleanup in `finally`. No transaction began, so rollback was not applicable and no server rollback is claimed.
- Prepared catalog-only baseline comparison, excluding the four authorized RLS/ACL tables and 23 added CHECKs. No full-table data hashing or whole-database content aggregates were issued.

### Actual retry results

| Check or action | Observed result |
| --- | --- |
| Local source hashes and target configuration | Passed |
| Verified TLS connection / server identity | Blocked by certificate-chain verification |
| Prior connection/open-lock inspection | Not reached; previous session cleanup remains unverified |
| Current ledger count/checksum and absent-constraint preflight | Not reached; earlier preflight is historical only |
| Four-table RLS/policy/privilege preflight | Not reached |
| Public catalog/ACL baseline and comparison | Not reached |
| Owner transaction / table locks / artifact execution | None sent |
| `COMMIT` sent / confirmed | 0 / 0 |
| 23 validated CHECKs / four RLS tables / ten policies | Not verified |
| Exact client grant allowlists / protected work-column denial | Not reached |
| Post-commit authenticated `LIMIT 0` / nonexistent-identity visibility probes | Not reached |
| Customer data queries / seeds / mutation canaries | None issued |
| HTTP/dashboard acceptance | Not performed; dashboard is not certified fixed |

Only this audit report was changed by the retry operation. Existing unrelated
working-tree changes were left untouched. No CashPlan/digest/canonical policy
SQL, unrelated migration, event implementation, task checkbox, or scheduler
setting was changed. No Git commit was made. **STOPPED — no database change or
commit confirmed.** Further connection or deployment attempts require separate
authorization and a correctly trusted certificate chain, not disabled TLS
verification.
